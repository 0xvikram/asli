import { ExpirationTime } from "@arkiv-network/sdk/utils"
import type { Hex } from "viem"
import { hashNoticeText } from "../normalize"
import {
  ISSUER_DAYS,
  REVOCATION_DAYS,
  amendmentEntity,
  issuerEntity,
  makeNoticeCode,
  noticeEntity,
  offerEntity,
  revocationEntity,
  type IssuerProfile,
  type NoticeCategory,
} from "../schema"
import type { Writer } from "./client"

export type Published = { entityKey: Hex; txHash: Hex }

export async function registerIssuer(w: Writer, profile: IssuerProfile): Promise<Published> {
  const { entityKey, txHash } = await w.createEntity(issuerEntity(profile))
  return { entityKey, txHash }
}

/** An issuer stays on the verified list only while it keeps renewing (Lifetime Extension). */
export async function renewIssuer(w: Writer, issuerKey: Hex) {
  return w.extendEntity({ entityKey: issuerKey, expires: ExpirationTime.fromDays(ISSUER_DAYS) })
}

export type IssueNoticeInput = {
  codePrefix: string
  title: string
  body: string
  category: NoticeCategory
  lang: "en" | "hi" | "mixed"
  validUntil: Date
  fileHash?: Hex
  refNo?: string
  now?: Date
}

export async function issueNotice(
  w: Writer,
  input: IssueNoticeInput,
): Promise<Published & { code: string; textHash: Hex }> {
  const issuedAt = input.now ?? new Date()
  const code = makeNoticeCode(input.codePrefix, issuedAt)
  // `body` is the full notice text as people forward it (header lines included); `title` is a
  // display label only, so the hash covers the body alone.
  const textHash = hashNoticeText(input.body)
  const { entityKey, txHash } = await w.createEntity(
    noticeEntity({
      code,
      title: input.title,
      body: input.body,
      category: input.category,
      lang: input.lang,
      textHash,
      fileHash: input.fileHash,
      issuedAt,
      validUntil: input.validUntil,
      refNo: input.refNo,
    }),
  )
  return { entityKey, txHash, code, textHash }
}

/**
 * Postponement in one atomic batch: extend the notice's lifetime to the new date AND publish the
 * amendment that explains why. If either failed alone, a reader would see a notice that lives
 * longer with no reason given, or a reason for an extension that never happened.
 */
export async function postponeNotice(
  w: Writer,
  input: { noticeKey: Hex; newValidUntil: Date; reason: string; now?: Date },
) {
  const res = await w.executeBatch({
    extensions: [{ entityKey: input.noticeKey, expires: ExpirationTime.atDate(input.newValidUntil) }],
    creates: [
      amendmentEntity({
        noticeKey: input.noticeKey,
        newValidUntil: input.newValidUntil,
        reason: input.reason,
        issuedAt: input.now ?? new Date(),
      }),
    ],
  })
  return { txHash: res.txHash, amendmentKey: res.createdEntities[0] }
}

/**
 * Revocation in one atomic batch: publish the revocation record AND delete the notice. A reader
 * can never see the notice gone without the record saying why, or both at once.
 */
export async function revokeNotice(
  w: Writer,
  input: { noticeKey: Hex; textHash: Hex; code: string; title: string; reason: string; now?: Date },
) {
  const res = await w.executeBatch({
    creates: [
      revocationEntity({
        noticeKey: input.noticeKey,
        textHash: input.textHash,
        code: input.code,
        title: input.title,
        reason: input.reason,
        revokedAt: input.now ?? new Date(),
      }),
    ],
    deletes: [{ entityKey: input.noticeKey }],
  })
  return { txHash: res.txHash, revocationKey: res.createdEntities[0] }
}

/** Anyone may call this on a revocation (permissionless extension): keep the warning alive. */
export async function keepRevocationAlive(w: Writer, revocationKey: Hex) {
  return w.extendEntity({ entityKey: revocationKey, expires: ExpirationTime.fromDays(REVOCATION_DAYS) })
}

export async function registerOffer(
  w: Writer,
  input: { fileHash: Hex; roleCode: string; roleTitle: string; location: string; validUntil: Date; now?: Date },
): Promise<Published> {
  const { entityKey, txHash } = await w.createEntity(
    offerEntity({ ...input, issuedAt: input.now ?? new Date() }),
  )
  return { entityKey, txHash }
}
