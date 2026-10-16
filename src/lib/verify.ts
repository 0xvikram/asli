import type { Hex } from "viem"
import type { ProofResult } from "./domainProof"
import { matchAgainst, type Change, type DiffOp } from "./match"
import { hashNoticeText, normalizeNotice } from "./normalize"
import {
  amendmentsOf,
  findExpiredNotice,
  listIssuers,
  noticesByCode,
  noticesByFileHash,
  noticesByTextHash,
  noticesOfIssuers,
  offersByFileHash,
  revocationsByCode,
  revocationsByTextHash,
  type AmendmentRecord,
  type IssuerRecord,
  type NoticeRecord,
  type OfferRecord,
  type RevocationRecord,
} from "./arkiv/read"
import type { Reader } from "./arkiv/client"

export type VerifyInput = { text?: string; code?: string; fileHash?: Hex }

export type TrustedIssuer = IssuerRecord & { proof: ProofResult & { ok: true } }

export type Verdict =
  | { status: "real"; notice: NoticeRecord; issuer: TrustedIssuer; amendments: AmendmentRecord[] }
  | {
      status: "altered"
      notice: NoticeRecord
      issuer: TrustedIssuer
      similarity: number
      changes: Change[]
      ops: DiffOp[]
    }
  | { status: "revoked"; revocation: RevocationRecord; issuer: TrustedIssuer }
  | { status: "expired"; notice: NoticeRecord; issuer: TrustedIssuer; seenAtBlock: bigint }
  | { status: "unverified-issuer"; notice: NoticeRecord; claimedDomain: string | null; reason: string }
  | { status: "unknown"; checkedIssuers: number }
  | { status: "empty" }

export type OfferVerdict =
  | { status: "real"; offer: OfferRecord; issuer: TrustedIssuer }
  | { status: "unverified-issuer"; offer: OfferRecord; reason: string }
  | { status: "unknown" }

export type Prover = (domain: string, address: string) => Promise<ProofResult>

/**
 * Issuers whose domain vouches for their wallet. Many entities may claim the same domain;
 * only the wallet the domain itself lists is trusted. Results are keyed by wallet.
 */
export async function trustedIssuers(client: Reader, prove: Prover): Promise<Map<string, TrustedIssuer>> {
  const issuers = await listIssuers(client)
  const proofs = await Promise.all(issuers.map((i) => prove(i.domain, i.creator)))
  const trusted = new Map<string, TrustedIssuer>()
  issuers.forEach((issuer, idx) => {
    const proof = proofs[idx]
    if (proof.ok) trusted.set(issuer.creator.toLowerCase(), { ...issuer, proof })
  })
  return trusted
}

function claimedDomain(issuers: IssuerRecord[], creator: Hex) {
  return issuers.find((i) => i.creator.toLowerCase() === creator.toLowerCase())?.domain ?? null
}

/**
 * The verdict engine. Order matters:
 *  1. revoked beats everything (an issuer withdrew it on purpose)
 *  2. an exact live match from a trusted issuer is real
 *  3. a near match against a trusted issuer's live notices is altered, with the changes
 *  4. a match only in the recent past is expired
 *  5. otherwise unknown: no trusted issuer published anything like it
 */
export async function verify(
  client: Reader,
  input: VerifyInput,
  prove: Prover,
  options: { historical?: boolean } = {},
): Promise<Verdict> {
  const text = input.text && normalizeNotice(input.text).length > 0 ? input.text : undefined
  const code = input.code?.trim() || undefined
  if (!text && !code && !input.fileHash) return { status: "empty" }

  const textHash = text ? hashNoticeText(text) : undefined
  const trusted = await trustedIssuers(client, prove)
  const isTrusted = (creator: Hex) => trusted.get(creator.toLowerCase())

  // 1. Revocations: only count one written by a trusted issuer.
  const revocations = [
    ...(textHash ? await revocationsByTextHash(client, textHash) : []),
    ...(code ? await revocationsByCode(client, code) : []),
  ]
  for (const r of revocations) {
    const issuer = isTrusted(r.creator)
    if (issuer) return { status: "revoked", revocation: r, issuer }
  }

  // 2. Exact matches.
  const exact = [
    ...(textHash ? await noticesByTextHash(client, textHash) : []),
    ...(code ? await noticesByCode(client, code) : []),
    ...(input.fileHash ? await noticesByFileHash(client, input.fileHash) : []),
  ]
  for (const notice of exact) {
    const issuer = isTrusted(notice.creator)
    if (issuer) {
      // Newest postponement first: a notice can be postponed more than once.
      const amendments = (await amendmentsOf(client, notice.key)).sort((a, b) => b.issuedAt - a.issuedAt)
      // A code match is only "real" for the text if the text (when given) also matches.
      if (text && notice.textHash !== textHash) {
        const m = matchAgainst(text, [notice.body])
        if (m.kind === "altered" || m.kind === "unrelated") {
          return {
            status: "altered",
            notice,
            issuer,
            similarity: m.similarity,
            changes: m.kind === "altered" ? m.changes : [],
            ops: m.kind === "altered" ? m.ops : [],
          }
        }
      }
      return { status: "real", notice, issuer, amendments }
    }
  }
  if (exact.length > 0) {
    const notice = exact[0]
    const issuers = await listIssuers(client)
    return {
      status: "unverified-issuer",
      notice,
      claimedDomain: claimedDomain(issuers, notice.creator),
      reason: "Published on Arkiv, but no domain vouches for the wallet that published it.",
    }
  }

  // 3. Near matches against every trusted issuer's live notices.
  if (text) {
    const live = await noticesOfIssuers(
      client,
      [...trusted.values()].map((i) => i.creator),
    )
    const candidates = live.flatMap((notice) => {
      const issuer = isTrusted(notice.creator)
      return issuer ? [{ notice, issuer }] : []
    })
    const m = matchAgainst(
      text,
      candidates.map((c) => c.notice.body),
    )
    if (m.kind === "altered") {
      const { notice, issuer } = candidates[m.candidateIndex]
      return { status: "altered", notice, issuer, similarity: m.similarity, changes: m.changes, ops: m.ops }
    }
    if (m.kind === "exact") {
      // Same words as a live notice but a different hash cannot happen; kept for safety.
      const { notice, issuer } = candidates[m.candidateIndex]
      return { status: "real", notice, issuer, amendments: await amendmentsOf(client, notice.key) }
    }
  }

  // 4. Recently expired.
  if (options.historical !== false && (textHash || code)) {
    const past = await findExpiredNotice(client, { textHash, code })
    if (past) {
      const issuer = isTrusted(past.notice.creator)
      if (issuer) return { status: "expired", notice: past.notice, issuer, seenAtBlock: past.seenAtBlock }
    }
  }

  return { status: "unknown", checkedIssuers: trusted.size }
}

/** Offer letters: exact file hash only. Nothing about the candidate is ever looked up. */
export async function verifyOffer(client: Reader, fileHash: Hex, prove: Prover): Promise<OfferVerdict> {
  const offers = await offersByFileHash(client, fileHash)
  if (offers.length === 0) return { status: "unknown" }
  const trusted = await trustedIssuers(client, prove)
  for (const offer of offers) {
    const issuer = trusted.get(offer.creator.toLowerCase())
    if (issuer) return { status: "real", offer, issuer }
  }
  return {
    status: "unverified-issuer",
    offer: offers[0],
    reason: "This file was registered, but not by a wallet any employer domain vouches for.",
  }
}
