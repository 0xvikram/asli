import { bytes32, key, str, u64 } from "@arkiv-network/sdk/attr"
import type { CreateEntityParameters } from "@arkiv-network/sdk/types"
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils"
import type { Hex } from "viem"
import { normalizeCode } from "./normalize"

/**
 * Every Asli entity carries `app = "asli_v1"`, so Asli queries never pick up other projects'
 * entities on the shared Tiramisu database.
 *
 * Who issued something is never an attribute: it is the entity's `$creator`, which nobody can
 * set or forge. An attribute named "issuer" would be a field anyone could write.
 */
export const APP = "asli_v1"

export const KINDS = ["issuer", "notice", "amendment", "revocation", "offer"] as const
export type Kind = (typeof KINDS)[number]

export const NOTICE_CATEGORIES = [
  "exam",
  "result",
  "admission",
  "holiday",
  "recruitment",
  "fees",
  "general",
] as const
export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number]

export const ISSUER_CATEGORIES = ["board", "university", "employer", "government"] as const
export type IssuerCategory = (typeof ISSUER_CATEGORIES)[number]

/**
 * How long each kind lives, and why. The lifetime is product logic, not housekeeping: when a
 * notice stops being valid it stops being returned, with no date comparison to get wrong.
 */
export const LIFETIMES: Record<Kind, { rule: string; why: string }> = {
  issuer: {
    rule: "365 days, renewed yearly by the issuer (Lifetime Extension)",
    why: "An issuer that stops renewing drops off the verified list instead of vouching forever.",
  },
  notice: {
    rule: "until the notice's own valid-until date (ExpirationTime.atDate)",
    why: "An expired circular stops verifying as current. Postponement extends it.",
  },
  amendment: {
    rule: "until the new valid-until date + 30 days",
    why: "The postponement record outlives the notice briefly so late forwards still explain.",
  },
  revocation: {
    rule: "180 days, permissionless extension",
    why: "Anyone can keep a revocation alive while the fake still circulates; nobody but the issuer can change it.",
  },
  offer: {
    rule: "until the offer's acceptance deadline",
    why: "A job offer past its deadline is no longer an offer; a scammer cannot reuse it.",
  },
}

export const AMENDMENT_GRACE_DAYS = 30
export const REVOCATION_DAYS = 180
export const ISSUER_DAYS = 365

export type IssuerProfile = {
  name: string
  domain: string
  category: IssuerCategory
  about: string
}

export type NoticeInput = {
  code: string
  title: string
  body: string
  category: NoticeCategory
  lang: "en" | "hi" | "mixed"
  textHash: Hex
  fileHash?: Hex
  issuedAt: Date
  validUntil: Date
  refNo?: string
}

export type AmendmentInput = {
  noticeKey: Hex
  newValidUntil: Date
  reason: string
  issuedAt: Date
}

export type RevocationInput = {
  noticeKey: Hex
  textHash: Hex
  code: string
  title: string
  reason: string
  revokedAt: Date
}

export type OfferInput = {
  fileHash: Hex
  roleCode: string
  roleTitle: string
  location: string
  issuedAt: Date
  validUntil: Date
}

const JSON_TYPE = "application/json"

/** Attribute values are capped at 128 bytes; refuse early with a clear message. */
function shortStr(name: string, value: string) {
  if (new TextEncoder().encode(value).length > 128) {
    throw new Error(`${name} is longer than 128 bytes`)
  }
  return str(value)
}

const ms = (d: Date) => u64(BigInt(d.getTime()))

export function issuerEntity(profile: IssuerProfile): CreateEntityParameters {
  return {
    payload: jsonToPayload(profile),
    contentType: JSON_TYPE,
    attributes: {
      app: APP,
      kind: "issuer",
      domain: shortStr("domain", profile.domain.toLowerCase()),
      category: profile.category,
      name: shortStr("name", profile.name),
    },
    expires: ExpirationTime.fromDays(ISSUER_DAYS),
  }
}

export function noticeEntity(input: NoticeInput): CreateEntityParameters {
  if (input.validUntil.getTime() <= input.issuedAt.getTime()) {
    throw new Error("validUntil must be after issuedAt")
  }
  return {
    payload: jsonToPayload({ title: input.title, body: input.body, refNo: input.refNo ?? null }),
    contentType: JSON_TYPE,
    attributes: {
      app: APP,
      kind: "notice",
      code: shortStr("code", normalizeCode(input.code)),
      text_hash: bytes32(input.textHash),
      ...(input.fileHash ? { file_hash: bytes32(input.fileHash) } : {}),
      category: input.category,
      lang: input.lang,
      issued_at: ms(input.issuedAt),
      valid_until: ms(input.validUntil),
    },
    expires: ExpirationTime.atDate(input.validUntil),
    // Nobody, not even the issuer, can quietly reword a published notice. It can only be
    // extended (postponed) or deleted (revoked), and both leave a public record.
    flags: { readonly: true },
  }
}

export function amendmentEntity(input: AmendmentInput): CreateEntityParameters {
  const until = new Date(input.newValidUntil.getTime() + AMENDMENT_GRACE_DAYS * 86_400_000)
  return {
    payload: jsonToPayload({ reason: input.reason }),
    contentType: JSON_TYPE,
    attributes: {
      app: APP,
      kind: "amendment",
      notice: key(input.noticeKey),
      new_valid_until: ms(input.newValidUntil),
      issued_at: ms(input.issuedAt),
    },
    expires: ExpirationTime.atDate(until),
    flags: { readonly: true },
  }
}

export function revocationEntity(input: RevocationInput): CreateEntityParameters {
  return {
    payload: jsonToPayload({ title: input.title, reason: input.reason }),
    contentType: JSON_TYPE,
    attributes: {
      app: APP,
      kind: "revocation",
      notice: key(input.noticeKey),
      text_hash: bytes32(input.textHash),
      code: shortStr("code", normalizeCode(input.code)),
      revoked_at: ms(input.revokedAt),
    },
    expires: ExpirationTime.fromDays(REVOCATION_DAYS),
    flags: { readonly: true, permissionlessExtension: true },
  }
}

export function offerEntity(input: OfferInput): CreateEntityParameters {
  if (input.validUntil.getTime() <= input.issuedAt.getTime()) {
    throw new Error("validUntil must be after issuedAt")
  }
  return {
    // Role and city only. The candidate's name never touches Arkiv, not even hashed.
    payload: jsonToPayload({ roleTitle: input.roleTitle, location: input.location }),
    contentType: JSON_TYPE,
    attributes: {
      app: APP,
      kind: "offer",
      file_hash: bytes32(input.fileHash),
      role_code: shortStr("role_code", normalizeCode(input.roleCode)),
      issued_at: ms(input.issuedAt),
      valid_until: ms(input.validUntil),
    },
    expires: ExpirationTime.atDate(input.validUntil),
    flags: { readonly: true },
  }
}

/** Short, retypeable notice code: PREFIX-YY-XXXX without look-alike characters (0/O, 1/I). */
export function makeNoticeCode(prefix: string, issuedAt: Date, random: () => number = Math.random) {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
  let tail = ""
  for (let i = 0; i < 4; i++) tail += alphabet[Math.floor(random() * alphabet.length)]
  const yy = String(issuedAt.getUTCFullYear()).slice(-2)
  return normalizeCode(`${prefix}-${yy}-${tail}`)
}

/**
 * The queries the app runs, written in Arkiv's query language. Kept here so schema.md and the
 * code cannot drift apart (a test checks every one is documented).
 */
export const QUERIES = {
  noticeByTextHash: `app = str('asli_v1') AND kind = str('notice') AND text_hash = bytes32(<hash>)`,
  noticeByCode: `app = str('asli_v1') AND kind = str('notice') AND code = str(<CODE>)`,
  noticeByFileHash: `app = str('asli_v1') AND kind = str('notice') AND file_hash = bytes32(<hash>)`,
  activeNoticesOfIssuer: `app = str('asli_v1') AND kind = str('notice') AND $creator = addr(<issuer>)`,
  noticesValidBetween: `app = str('asli_v1') AND kind = str('notice') AND valid_until >= u64(<from>) AND valid_until <= u64(<to>)`,
  issuers: `app = str('asli_v1') AND kind = str('issuer')`,
  amendmentsOfNotice: `app = str('asli_v1') AND kind = str('amendment') AND notice = key(<noticeKey>)`,
  revocationByTextHash: `app = str('asli_v1') AND kind = str('revocation') AND text_hash = bytes32(<hash>)`,
  revocationByCode: `app = str('asli_v1') AND kind = str('revocation') AND code = str(<CODE>)`,
  offerByFileHash: `app = str('asli_v1') AND kind = str('offer') AND file_hash = bytes32(<hash>)`,
} as const
