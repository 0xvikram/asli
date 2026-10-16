import { describe, expect, it } from "vitest"
import { FakeArkiv } from "../helpers/fakeArkiv"
import { BOARD, BOARD_DOMAIN, EMPLOYER, EXAM_NOTICE, IMPOSTER, fakeProver, seedBoard } from "../helpers/fixtures"
import { issueNotice, postponeNotice, registerIssuer, registerOffer, revokeNotice } from "@/lib/arkiv/write"
import { verify, verifyOffer } from "@/lib/verify"

const prove = fakeProver({ [BOARD_DOMAIN]: BOARD, "acme.example": EMPLOYER })

async function world() {
  const fake = new FakeArkiv()
  const w = await seedBoard(fake)
  const issued = await issueNotice(w, {
    codePrefix: "DBSE",
    title: "Class X Mathematics exam date",
    body: EXAM_NOTICE,
    category: "exam",
    lang: "en",
    validUntil: fake.inDays(20),
    fileHash: `0x${"22".repeat(32)}`,
    now: fake.now(),
  })
  return { fake, w, issued, r: fake.reader() }
}

describe("verify", () => {
  it("empty input", async () => {
    const { r } = await world()
    expect(await verify(r, { text: "  🙏  " }, prove)).toEqual({ status: "empty" })
  })

  it("real: a WhatsApp copy of the notice", async () => {
    const { r } = await world()
    const v = await verify(r, { text: `Forwarded\n*${EXAM_NOTICE}* 🙏🙏` }, prove)
    expect(v.status).toBe("real")
    if (v.status === "real") {
      expect(v.issuer.domain).toBe(BOARD_DOMAIN)
      expect(v.amendments).toEqual([])
    }
  })

  it("real: by retyped code", async () => {
    const { r, issued } = await world()
    const v = await verify(r, { code: issued.code.toLowerCase().replace(/-/g, " ") }, prove)
    expect(v.status).toBe("real")
  })

  it("real: by PDF file hash", async () => {
    const { r } = await world()
    const v = await verify(r, { fileHash: `0x${"22".repeat(32)}` }, prove)
    expect(v.status).toBe("real")
  })

  it("altered: a changed date is named", async () => {
    const { r } = await world()
    const fake = EXAM_NOTICE.replace("12 March 2026", "19 March 2026")
    const v = await verify(r, { text: fake }, prove)
    expect(v.status).toBe("altered")
    if (v.status === "altered") expect(v.changes).toEqual([{ original: "12", forwarded: "19" }])
  })

  it("altered: right code, doctored text", async () => {
    const { r, issued } = await world()
    const fake = EXAM_NOTICE + "\nThe exam stands CANCELLED due to paper leak."
    const v = await verify(r, { code: issued.code, text: fake }, prove)
    expect(v.status).toBe("altered")
  })

  it("real with amendment after postponement", async () => {
    const { fake, w, issued, r } = await world()
    await postponeNotice(w, { noticeKey: issued.entityKey, newValidUntil: fake.inDays(35), reason: "Moved", now: fake.now() })
    const v = await verify(r, { text: EXAM_NOTICE }, prove)
    expect(v.status).toBe("real")
    if (v.status === "real") expect(v.amendments[0].reason).toBe("Moved")
  })

  it("revoked beats everything", async () => {
    const { fake, w, issued, r } = await world()
    await revokeNotice(w, {
      noticeKey: issued.entityKey,
      textHash: issued.textHash,
      code: issued.code,
      title: "Class X Mathematics exam date",
      reason: "Issued in error",
      now: fake.now(),
    })
    const v = await verify(r, { text: EXAM_NOTICE }, prove)
    expect(v.status).toBe("revoked")
    if (v.status === "revoked") expect(v.revocation.reason).toBe("Issued in error")
  })

  it("a revocation written by an imposter is ignored", async () => {
    const { fake, issued, r } = await world()
    // The imposter writes a revocation-shaped entity for the real notice.
    const { revocationEntity } = await import("@/lib/schema")
    await fake.writer(IMPOSTER).createEntity(
      revocationEntity({
        noticeKey: issued.entityKey,
        textHash: issued.textHash,
        code: issued.code,
        title: "t",
        reason: "fake revoke",
        revokedAt: fake.now(),
      }),
    )
    const v = await verify(r, { text: EXAM_NOTICE }, prove)
    expect(v.status).toBe("real")
  })

  it("expired: real in the recent past, gone now", async () => {
    const { fake, r } = await world()
    fake.advanceDays(21)
    const v = await verify(r, { text: EXAM_NOTICE }, prove)
    expect(v.status).toBe("expired")
  })

  it("unverified issuer: same text published by a wallet no domain vouches for", async () => {
    const fake = new FakeArkiv()
    const imp = fake.writer(IMPOSTER)
    await registerIssuer(imp, { name: "Demo Board (official)", domain: BOARD_DOMAIN, category: "board", about: "" })
    await issueNotice(imp, {
      codePrefix: "DBSE",
      title: "Exam cancelled",
      body: "All board exams are cancelled. Fees will be refunded.",
      category: "exam",
      lang: "en",
      validUntil: fake.inDays(10),
      now: fake.now(),
    })
    const v = await verify(fake.reader(), { text: "All board exams are cancelled. Fees will be refunded." }, prove)
    expect(v.status).toBe("unverified-issuer")
    if (v.status === "unverified-issuer") expect(v.claimedDomain).toBe(BOARD_DOMAIN)
  })

  it("unknown: nothing like it from any trusted issuer", async () => {
    const { r } = await world()
    const v = await verify(r, { text: "Government gives free laptops to all students, register now" }, prove)
    expect(v).toEqual({ status: "unknown", checkedIssuers: 1 })
  })
})

describe("verifyOffer", () => {
  it("real offer from a vouched employer; unknown file otherwise", async () => {
    const fake = new FakeArkiv()
    const w = fake.writer(EMPLOYER)
    await registerIssuer(w, { name: "Acme Infotech", domain: "acme.example", category: "employer", about: "" })
    const fileHash = `0x${"33".repeat(32)}` as const
    await registerOffer(w, {
      fileHash,
      roleCode: "ACME-SE-26",
      roleTitle: "Software Engineer",
      location: "Pune",
      validUntil: fake.inDays(30),
      now: fake.now(),
    })
    const r = fake.reader()
    expect((await verifyOffer(r, fileHash, prove)).status).toBe("real")
    expect((await verifyOffer(r, `0x${"44".repeat(32)}`, prove)).status).toBe("unknown")
  })
})
