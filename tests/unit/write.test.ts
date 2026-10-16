import { describe, expect, it } from "vitest"
import { FakeArkiv } from "../helpers/fakeArkiv"
import { BOARD, EXAM_NOTICE, IMPOSTER, seedBoard } from "../helpers/fixtures"
import { amendmentsOf, listIssuers, noticesByCode, noticesOfIssuer, revocationsByCode } from "@/lib/arkiv/read"
import { issueNotice, keepRevocationAlive, postponeNotice, registerOffer, revokeNotice } from "@/lib/arkiv/write"
import { hashNoticeText } from "@/lib/normalize"

async function setup() {
  const fake = new FakeArkiv()
  const w = await seedBoard(fake)
  const issued = await issueNotice(w, {
    codePrefix: "DBSE",
    title: "Class X Mathematics exam date",
    body: EXAM_NOTICE,
    category: "exam",
    lang: "en",
    validUntil: fake.inDays(20),
    now: fake.now(),
  })
  return { fake, w, issued, r: fake.reader() }
}

describe("issue", () => {
  it("publishes a readonly notice the issuer's $creator query returns", async () => {
    const { fake, issued, r } = await setup()
    expect(issued.code).toMatch(/^DBSE-\d{2}-[A-Z2-9]{4}$/)
    expect(issued.textHash).toBe(hashNoticeText(EXAM_NOTICE))
    const mine = await noticesOfIssuer(r, BOARD)
    expect(mine).toHaveLength(1)
    expect(mine[0].title).toBe("Class X Mathematics exam date")
    expect(mine[0].creator).toBe(BOARD)
    expect(await noticesOfIssuer(r, IMPOSTER)).toHaveLength(0)
    expect(fake.entities.find((e) => e.key === issued.entityKey)?.flags.readonly).toBe(true)
  })

  it("lists the registered issuer", async () => {
    const { r } = await setup()
    const issuers = await listIssuers(r)
    expect(issuers).toHaveLength(1)
    expect(issuers[0]).toMatchObject({ domain: "board.asli.example", creator: BOARD, category: "board" })
  })

  it("the notice disappears from queries when its validity ends (Entity Expiration)", async () => {
    const { fake, issued, r } = await setup()
    fake.advanceDays(19)
    expect(await noticesByCode(r, issued.code)).toHaveLength(1)
    fake.advanceDays(2)
    expect(await noticesByCode(r, issued.code)).toHaveLength(0)
  })
})

describe("postpone", () => {
  it("extends the notice and records the amendment in one batch", async () => {
    const { fake, w, issued, r } = await setup()
    const res = await postponeNotice(w, {
      noticeKey: issued.entityKey,
      newValidUntil: fake.inDays(40),
      reason: "Exam moved due to elections",
      now: fake.now(),
    })
    expect(fake.log.filter((l) => l.op === "batch")).toHaveLength(1)
    const amendments = await amendmentsOf(r, issued.entityKey)
    expect(amendments).toHaveLength(1)
    expect(amendments[0].key).toBe(res.amendmentKey)
    expect(amendments[0].reason).toBe("Exam moved due to elections")
    fake.advanceDays(30)
    expect(await noticesByCode(r, issued.code)).toHaveLength(1)
  })

  it("is all-or-nothing: an invalid extension creates no amendment", async () => {
    const { fake, w, issued, r } = await setup()
    await expect(
      postponeNotice(w, { noticeKey: issued.entityKey, newValidUntil: fake.inDays(5), reason: "x", now: fake.now() }),
    ).rejects.toThrow()
    expect(await amendmentsOf(r, issued.entityKey)).toHaveLength(0)
  })

  it("only the issuer can postpone", async () => {
    const { fake, issued } = await setup()
    await expect(
      postponeNotice(fake.writer(IMPOSTER), {
        noticeKey: issued.entityKey,
        newValidUntil: fake.inDays(60),
        reason: "fake",
        now: fake.now(),
      }),
    ).rejects.toThrow()
  })
})

describe("revoke", () => {
  it("deletes the notice and publishes the revocation together", async () => {
    const { fake, w, issued, r } = await setup()
    await revokeNotice(w, {
      noticeKey: issued.entityKey,
      textHash: issued.textHash,
      code: issued.code,
      title: "Class X Mathematics exam date",
      reason: "Issued in error",
      now: fake.now(),
    })
    expect(await noticesByCode(r, issued.code)).toHaveLength(0)
    const revs = await revocationsByCode(r, issued.code)
    expect(revs).toHaveLength(1)
    expect(revs[0]).toMatchObject({ reason: "Issued in error", creator: BOARD })
  })

  it("an imposter cannot revoke someone else's notice, and nothing changes", async () => {
    const { fake, issued, r } = await setup()
    await expect(
      revokeNotice(fake.writer(IMPOSTER), {
        noticeKey: issued.entityKey,
        textHash: issued.textHash,
        code: issued.code,
        title: "t",
        reason: "r",
        now: fake.now(),
      }),
    ).rejects.toThrow()
    expect(await noticesByCode(r, issued.code)).toHaveLength(1)
    expect(await revocationsByCode(r, issued.code)).toHaveLength(0)
  })

  it("anyone can keep a revocation alive (permissionless extension)", async () => {
    const { fake, w, issued, r } = await setup()
    const { revocationKey } = await revokeNotice(w, {
      noticeKey: issued.entityKey,
      textHash: issued.textHash,
      code: issued.code,
      title: "t",
      reason: "r",
      now: fake.now(),
    })
    fake.advanceDays(170)
    await keepRevocationAlive(fake.writer(IMPOSTER), revocationKey)
    fake.advanceDays(20)
    expect(await revocationsByCode(r, issued.code)).toHaveLength(1)
  })
})

describe("offer", () => {
  it("registers a hash-only offer", async () => {
    const fake = new FakeArkiv()
    const w = fake.writer(BOARD)
    const res = await registerOffer(w, {
      fileHash: `0x${"11".repeat(32)}`,
      roleCode: "ACME-SE-26",
      roleTitle: "Software Engineer",
      location: "Pune",
      validUntil: fake.inDays(30),
      now: fake.now(),
    })
    expect(res.entityKey).toMatch(/^0x/)
  })
})

describe("effective validity", () => {
  it("validUntil follows the entity's expiry after a postponement; the original stays", async () => {
    const { fake, w, issued, r } = await setup()
    const [before] = await noticesByCode(r, issued.code)
    expect(Math.abs(before.validUntil - fake.inDays(20).getTime())).toBeLessThan(5_000)
    await postponeNotice(w, { noticeKey: issued.entityKey, newValidUntil: fake.inDays(35), reason: "Moved", now: fake.now() })
    const [after] = await noticesByCode(r, issued.code)
    expect(Math.abs(after.validUntil - fake.inDays(35).getTime())).toBeLessThan(5_000)
    expect(after.originalValidUntil).toBe(before.originalValidUntil)
  })
})
