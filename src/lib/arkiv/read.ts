import { addr, bytes32, key, type Attributes } from "@arkiv-network/sdk/attr"
import { and, eq, type Expression } from "@arkiv-network/sdk/query"
import type { Hex } from "viem"
import { normalizeCode } from "../normalize"
import { APP, type IssuerProfile, type Kind } from "../schema"
import type { Reader } from "./client"

/** Asli entities as the app uses them, decoded from attributes + payload. */
export type BaseRecord = {
  key: Hex
  creator: Hex
  /** Block at which the entity expires. */
  expiresAtBlock: bigint
  createdAtBlock: bigint
}

export type IssuerRecord = BaseRecord & IssuerProfile

export type NoticeRecord = BaseRecord & {
  code: string
  textHash: Hex
  fileHash?: Hex
  category: string
  lang: string
  issuedAt: number
  validUntil: number
  title: string
  body: string
  refNo: string | null
}

export type AmendmentRecord = BaseRecord & {
  notice: Hex
  newValidUntil: number
  issuedAt: number
  reason: string
}

export type RevocationRecord = BaseRecord & {
  notice: Hex
  textHash: Hex
  code: string
  revokedAt: number
  title: string
  reason: string
}

export type OfferRecord = BaseRecord & {
  fileHash: Hex
  roleCode: string
  issuedAt: number
  validUntil: number
  roleTitle: string
  location: string
}

const SELECT = {
  key: true,
  creator: true,
  expiresAt: true,
  createdAt: true,
  attributes: true,
  payload: true,
} as const

/** Page size for scans. The node maximum is 200. */
export const PAGE = 200
/** Upper bound on pages for a fuzzy scan, so one verify never walks the whole database. */
export const MAX_SCAN_PAGES = 5

type RawEntity = {
  key?: Hex
  creator?: Hex
  expiresAt?: bigint
  createdAt?: bigint
  attributes?: Attributes
  payload?: Uint8Array
}

const kindIs = (kind: Kind) => and(eq("app", APP), eq("kind", kind))

function attrValue(attributes: Attributes | undefined, name: string): unknown {
  const v = attributes?.[name] as { value?: unknown } | undefined
  return v?.value
}

function payloadJson(payload: Uint8Array | undefined): Record<string, unknown> {
  if (!payload || payload.length === 0) return {}
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>
  } catch {
    return {}
  }
}

function base(e: RawEntity): BaseRecord {
  return {
    key: e.key as Hex,
    creator: e.creator as Hex,
    expiresAtBlock: e.expiresAt ?? 0n,
    createdAtBlock: e.createdAt ?? 0n,
  }
}

const num = (v: unknown) => (typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : 0)
const s = (v: unknown) => (typeof v === "string" ? v : "")

export function toIssuer(e: RawEntity): IssuerRecord {
  const p = payloadJson(e.payload)
  return {
    ...base(e),
    name: s(attrValue(e.attributes, "name")) || s(p.name),
    domain: s(attrValue(e.attributes, "domain")),
    category: s(attrValue(e.attributes, "category")) as IssuerProfile["category"],
    about: s(p.about),
  }
}

export function toNotice(e: RawEntity): NoticeRecord {
  const a = e.attributes
  const p = payloadJson(e.payload)
  const fileHash = attrValue(a, "file_hash")
  return {
    ...base(e),
    code: s(attrValue(a, "code")),
    textHash: attrValue(a, "text_hash") as Hex,
    ...(fileHash ? { fileHash: fileHash as Hex } : {}),
    category: s(attrValue(a, "category")),
    lang: s(attrValue(a, "lang")),
    issuedAt: num(attrValue(a, "issued_at")),
    validUntil: num(attrValue(a, "valid_until")),
    title: s(p.title),
    body: s(p.body),
    refNo: typeof p.refNo === "string" ? p.refNo : null,
  }
}

export function toAmendment(e: RawEntity): AmendmentRecord {
  const p = payloadJson(e.payload)
  return {
    ...base(e),
    notice: attrValue(e.attributes, "notice") as Hex,
    newValidUntil: num(attrValue(e.attributes, "new_valid_until")),
    issuedAt: num(attrValue(e.attributes, "issued_at")),
    reason: s(p.reason),
  }
}

export function toRevocation(e: RawEntity): RevocationRecord {
  const p = payloadJson(e.payload)
  return {
    ...base(e),
    notice: attrValue(e.attributes, "notice") as Hex,
    textHash: attrValue(e.attributes, "text_hash") as Hex,
    code: s(attrValue(e.attributes, "code")),
    revokedAt: num(attrValue(e.attributes, "revoked_at")),
    title: s(p.title),
    reason: s(p.reason),
  }
}

export function toOffer(e: RawEntity): OfferRecord {
  const p = payloadJson(e.payload)
  return {
    ...base(e),
    fileHash: attrValue(e.attributes, "file_hash") as Hex,
    roleCode: s(attrValue(e.attributes, "role_code")),
    issuedAt: num(attrValue(e.attributes, "issued_at")),
    validUntil: num(attrValue(e.attributes, "valid_until")),
    roleTitle: s(p.roleTitle),
    location: s(p.location),
  }
}

async function all<T>(
  client: Reader,
  expr: Expression,
  map: (e: RawEntity) => T,
  maxPages = MAX_SCAN_PAGES,
  atBlock?: bigint,
): Promise<T[]> {
  const out: T[] = []
  let cursor: string | undefined
  for (let page = 0; page < maxPages; page++) {
    const res = await client.query(expr, { select: SELECT, limit: PAGE, cursor, atBlock })
    out.push(...res.entities.map((e) => map(e as RawEntity)))
    cursor = res.cursor
    if (!cursor) break
  }
  return out
}

export function listIssuers(client: Reader) {
  return all(client, kindIs("issuer"), toIssuer)
}

export function noticesByTextHash(client: Reader, textHash: Hex) {
  return all(client, and(kindIs("notice"), eq("text_hash", bytes32(textHash))), toNotice, 1)
}

export function noticesByCode(client: Reader, code: string) {
  return all(client, and(kindIs("notice"), eq("code", normalizeCode(code))), toNotice, 1)
}

export function noticesByFileHash(client: Reader, fileHash: Hex) {
  return all(client, and(kindIs("notice"), eq("file_hash", bytes32(fileHash))), toNotice, 1)
}

/** Live notices of one issuer. `$creator` is the filter: an attribute could be forged. */
export function noticesOfIssuer(client: Reader, issuer: Hex, maxPages = MAX_SCAN_PAGES) {
  return all(client, and(kindIs("notice"), eq("$creator", addr(issuer))), toNotice, maxPages)
}

export async function noticeByKey(client: Reader, noticeKey: Hex): Promise<NoticeRecord | undefined> {
  const res = await all(client, and(kindIs("notice"), eq("$key", key(noticeKey))), toNotice, 1)
  return res[0]
}

export function amendmentsOf(client: Reader, noticeKey: Hex) {
  return all(client, and(kindIs("amendment"), eq("notice", key(noticeKey))), toAmendment, 1)
}

export function revocationsByTextHash(client: Reader, textHash: Hex) {
  return all(client, and(kindIs("revocation"), eq("text_hash", bytes32(textHash))), toRevocation, 1)
}

export function revocationsByCode(client: Reader, code: string) {
  return all(client, and(kindIs("revocation"), eq("code", normalizeCode(code))), toRevocation, 1)
}

export function offersByFileHash(client: Reader, fileHash: Hex) {
  return all(client, and(kindIs("offer"), eq("file_hash", bytes32(fileHash))), toOffer, 1)
}

/** Look-backs for "did this notice exist before it expired?", newest first. */
export const LOOKBACK_DAYS = [1, 3, 7, 13]

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([p, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms))])
}

/**
 * A notice that has expired is no longer returned at the head. Reading the same narrow query at
 * earlier blocks tells "this was real but has expired" apart from "this never existed".
 * Best effort: a slow historical read returns `undefined` (unknown), never a false "fake".
 */
export async function findExpiredNotice(
  client: Reader,
  where: { textHash?: Hex; code?: string },
  timeoutMs = 8000,
): Promise<{ notice: NoticeRecord; seenAtBlock: bigint } | undefined> {
  if (!where.textHash && !where.code) return undefined
  const expr = where.textHash
    ? and(kindIs("notice"), eq("text_hash", bytes32(where.textHash)))
    : and(kindIs("notice"), eq("code", normalizeCode(where.code as string)))
  const timing = await client.getBlockTiming()
  for (const days of LOOKBACK_DAYS) {
    const back = BigInt(Math.floor((days * 86_400) / timing.blockDuration))
    if (back >= timing.currentBlock) break
    const atBlock = timing.currentBlock - back
    try {
      const res = await withTimeout(all(client, expr, toNotice, 1, atBlock), timeoutMs)
      if (res !== "timeout" && res.length > 0) return { notice: res[0], seenAtBlock: atBlock }
    } catch {
      // Historical reads are best effort.
    }
  }
  return undefined
}

/** Converts an expiry block into wall-clock time using the node's own block timing. */
export function blockToDate(block: bigint, timing: { currentBlock: bigint; currentBlockTime: number; blockDuration: number }) {
  const seconds = timing.currentBlockTime + Number(block - timing.currentBlock) * timing.blockDuration
  return new Date(seconds * 1000)
}
