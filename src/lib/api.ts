import type { Hex } from "viem"
import type { Reader, Writer } from "./arkiv/client"
import { explorerTx } from "./arkiv/client"
import { noticeByKey } from "./arkiv/read"
import { issueNotice, postponeNotice, registerOffer, revokeNotice } from "./arkiv/write"
import { demoIssuer, type DemoIssuer } from "./issuers"
import type { RateLimiter } from "./ratelimit"
import { NOTICE_CATEGORIES, type NoticeCategory } from "./schema"

/**
 * The public playground: lets anyone (judges included) act as one of the demo issuers without a
 * wallet. The server signs with THAT issuer's own key, so `$creator` is still the issuer and the
 * trust model is the same as for a real institution signing for itself.
 */
export const ACTIONS = ["issue", "postpone", "revoke", "offer"] as const
export type Action = (typeof ACTIONS)[number]

/** Playground writes are short-lived so the demo issuers never vouch for visitor text for long. */
export const MAX_PLAYGROUND_DAYS = 7
export const MIN_VALIDITY_MINUTES = 10
export const LIMITS = { title: 120, body: 2000, reason: 200, role: 80, location: 60, roleCode: 24 }

export type ApiDeps = {
  reader: Reader
  writerFor: (issuer: DemoIssuer) => Writer | undefined
  limiter: RateLimiter
  now?: () => Date
}

export type ApiResult = { status: number; body: Record<string, unknown> }

class BadRequest extends Error {}

function text(v: unknown, field: string, max: number, min = 1): string {
  if (typeof v !== "string") throw new BadRequest(`${field} is required`)
  const t = v.trim()
  if (t.length < min) throw new BadRequest(`${field} is required`)
  if (t.length > max) throw new BadRequest(`${field} is longer than ${max} characters`)
  return t
}

function hex32(v: unknown, field: string): Hex {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(v)) throw new BadRequest(`${field} must be a 32-byte hex value`)
  return v as Hex
}

function futureDate(v: unknown, field: string, now: Date): Date {
  const d = typeof v === "string" || typeof v === "number" ? new Date(v) : null
  if (!d || Number.isNaN(d.getTime())) throw new BadRequest(`${field} must be a date`)
  if (d.getTime() < now.getTime() + MIN_VALIDITY_MINUTES * 60_000) {
    throw new BadRequest(`${field} must be at least ${MIN_VALIDITY_MINUTES} minutes from now`)
  }
  if (d.getTime() > now.getTime() + MAX_PLAYGROUND_DAYS * 86_400_000) {
    throw new BadRequest(`${field} can be at most ${MAX_PLAYGROUND_DAYS} days away in the playground`)
  }
  return d
}

export async function handleIssuerAction(
  action: string,
  raw: unknown,
  ip: string,
  deps: ApiDeps,
): Promise<ApiResult> {
  const now = deps.now?.() ?? new Date()
  try {
    if (!(ACTIONS as readonly string[]).includes(action)) return { status: 404, body: { error: "unknown action" } }
    const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    const issuer = demoIssuer(String(body.issuer ?? ""))
    if (!issuer) throw new BadRequest("issuer must be one of: board, univ, employer")
    if (action === "offer" && issuer.category !== "employer") throw new BadRequest("only an employer issues offer letters")
    if (action !== "offer" && issuer.category === "employer" && action === "issue") {
      throw new BadRequest("employers register offer letters, not notices")
    }

    // Validate everything before spending a rate-limit slot.
    let run: (w: Writer) => Promise<Record<string, unknown>>
    if (action === "issue") {
      const title = text(body.title, "title", LIMITS.title)
      const noticeText = text(body.body, "body", LIMITS.body, 20)
      const category = String(body.category ?? "general") as NoticeCategory
      if (!NOTICE_CATEGORIES.includes(category)) throw new BadRequest("unknown category")
      const lang = body.lang === "hi" || body.lang === "mixed" ? body.lang : "en"
      const validUntil = futureDate(body.validUntil, "validUntil", now)
      const fileHash = body.fileHash ? hex32(body.fileHash, "fileHash") : undefined
      run = async (w) => {
        const r = await issueNotice(w, {
          codePrefix: issuer.codePrefix,
          title,
          body: noticeText,
          category,
          lang,
          validUntil,
          fileHash,
          now,
        })
        return { ...r }
      }
    } else if (action === "postpone") {
      const noticeKey = hex32(body.noticeKey, "noticeKey")
      const newValidUntil = futureDate(body.newValidUntil, "newValidUntil", now)
      const reason = text(body.reason, "reason", LIMITS.reason)
      const notice = await noticeByKey(deps.reader, noticeKey)
      if (!notice) throw new BadRequest("no live notice with that key")
      if (notice.creator.toLowerCase() !== issuer.address.toLowerCase()) throw new BadRequest("that notice belongs to another issuer")
      if (newValidUntil.getTime() <= notice.validUntil) throw new BadRequest("the new date must be later than the current one")
      run = async (w) => ({ ...(await postponeNotice(w, { noticeKey, newValidUntil, reason, now })) })
    } else if (action === "revoke") {
      const noticeKey = hex32(body.noticeKey, "noticeKey")
      const reason = text(body.reason, "reason", LIMITS.reason)
      const notice = await noticeByKey(deps.reader, noticeKey)
      if (!notice) throw new BadRequest("no live notice with that key")
      if (notice.creator.toLowerCase() !== issuer.address.toLowerCase()) throw new BadRequest("that notice belongs to another issuer")
      run = async (w) => ({
        ...(await revokeNotice(w, {
          noticeKey,
          textHash: notice.textHash,
          code: notice.code,
          title: notice.title,
          reason,
          now,
        })),
      })
    } else {
      const fileHash = hex32(body.fileHash, "fileHash")
      const roleCode = text(body.roleCode, "roleCode", LIMITS.roleCode)
      const roleTitle = text(body.roleTitle, "roleTitle", LIMITS.role)
      const location = text(body.location, "location", LIMITS.location)
      const validUntil = futureDate(body.validUntil, "validUntil", now)
      run = async (w) => ({ ...(await registerOffer(w, { fileHash, roleCode, roleTitle, location, validUntil, now })) })
    }

    const writer = deps.writerFor(issuer)
    if (!writer) return { status: 503, body: { error: "this demo issuer has no signing key configured" } }

    const slot = deps.limiter.take(ip)
    if (!slot.ok) {
      return {
        status: 429,
        body: {
          error: slot.scope === "site" ? "the playground hit its daily limit" : "too many writes, try again soon",
          retryAfterSeconds: Math.ceil(slot.retryAfterMs / 1000),
        },
      }
    }

    const result = await run(writer)
    const tx = typeof result.txHash === "string" ? result.txHash : undefined
    return { status: 200, body: { ok: true, issuer: issuer.id, ...result, explorer: tx ? explorerTx(tx) : undefined } }
  } catch (err) {
    if (err instanceof BadRequest) return { status: 400, body: { error: err.message } }
    const message = err instanceof Error ? err.message.split("\n")[0] : "write failed"
    return { status: 502, body: { error: `Arkiv write failed: ${message}` } }
  }
}
