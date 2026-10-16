import { describe, expect, it } from "vitest"
import { FakeArkiv } from "../helpers/fakeArkiv"
import { fakeProver, IMPOSTER } from "../helpers/fixtures"
import { issueNotice, postponeNotice, registerIssuer, revokeNotice } from "@/lib/arkiv/write"
import { IMPOSTOR_NOTICE, SEED_NOTICES, verifyExamples } from "@/lib/demoData"
import { demoIssuers } from "@/lib/issuers"
import { verify } from "@/lib/verify"

/** Mirrors scripts/seed.ts on the in-memory chain. */
async function seededWorld() {
  const fake = new FakeArkiv()
  const issuers = demoIssuers()
  for (const i of issuers) {
    await registerIssuer(fake.writer(i.address), { name: i.name, domain: i.domain, category: i.category, about: i.about })
  }
  const imp = fake.writer(IMPOSTER)
  await registerIssuer(imp, { name: issuers[0].name, domain: issuers[0].domain, category: "board", about: "" })

  for (const n of SEED_NOTICES) {
    const issuer = issuers.find((i) => i.id === n.issuer)!
    const w = fake.writer(issuer.address)
    const issued = await issueNotice(w, {
      codePrefix: issuer.codePrefix,
      title: n.title,
      body: n.body,
      category: n.category,
      lang: n.lang,
      validUntil: fake.inDays(n.validDays),
      now: fake.now(),
    })
    if (n.then && "postponeDays" in n.then) {
      await postponeNotice(w, { noticeKey: issued.entityKey, newValidUntil: fake.inDays(n.then.postponeDays), reason: n.then.reason, now: fake.now() })
    } else if (n.then && "revoke" in n.then) {
      await revokeNotice(w, {
        noticeKey: issued.entityKey,
        textHash: issued.textHash,
        code: issued.code,
        title: n.title,
        reason: n.then.revoke,
        now: fake.now(),
      })
    }
  }
  await issueNotice(imp, {
    codePrefix: "DBSE",
    title: IMPOSTOR_NOTICE.title,
    body: IMPOSTOR_NOTICE.body,
    category: "exam",
    lang: "en",
    validUntil: fake.inDays(14),
    now: fake.now(),
  })
  const prove = fakeProver(Object.fromEntries(issuers.map((i) => [i.domain, i.address])))
  return { fake, prove }
}

const EXPECTED: Record<string, string> = {
  "Doctored forward": "altered",
  "Real (WhatsApp copy)": "real",
  Postponed: "real",
  Withdrawn: "revoked",
  "Hindi + English": "real",
  Impostor: "unverified-issuer",
  Expired: "real",
}

describe("demo data", () => {
  it("every Verify-page example gives the verdict it promises", async () => {
    const { fake, prove } = await seededWorld()
    for (const ex of verifyExamples()) {
      const v = await verify(fake.reader(), { text: ex.text }, prove)
      expect(v.status, ex.label).toBe(EXPECTED[ex.label])
    }
  })

  it("the doctored forward names the moved date and the added fee", async () => {
    const { fake, prove } = await seededWorld()
    const v = await verify(fake.reader(), { text: verifyExamples()[0].text }, prove)
    if (v.status !== "altered") throw new Error(v.status)
    const changed = v.changes.map((c) => `${c.original}→${c.forwarded}`).join(" | ")
    expect(changed).toContain("12→19")
    expect(changed).toContain("200")
  })

  it("the postponed example carries its amendment", async () => {
    const { fake, prove } = await seededWorld()
    const v = await verify(fake.reader(), { text: verifyExamples()[2].text }, prove)
    if (v.status !== "real") throw new Error(v.status)
    expect(v.amendments).toHaveLength(1)
  })

  it("the short-lived orientation notice turns into 'expired' after it lapses", async () => {
    const { fake, prove } = await seededWorld()
    fake.advanceDays(2)
    const v = await verify(fake.reader(), { text: verifyExamples()[6].text }, prove)
    expect(v.status).toBe("expired")
  })

  it("expired is still found days later", async () => {
    const { fake, prove } = await seededWorld()
    fake.advanceDays(6)
    const v = await verify(fake.reader(), { text: verifyExamples()[6].text }, prove)
    expect(v.status).toBe("expired")
  })
})
