import { describe, expect, it } from "vitest"
import { FakeArkiv } from "../helpers/fakeArkiv"
import { BOARD, BOARD_DOMAIN, EXAM_NOTICE, fakeProver, seedBoard } from "../helpers/fixtures"
import { issueNotice } from "@/lib/arkiv/write"
import { checkSteps, formatDay, shareText, shortAddress, timeLeft, toLocalInput, verdictCopy } from "@/lib/ui"
import { verify, type Verdict } from "@/lib/verify"

describe("formatting", () => {
  it("short address", () => {
    expect(shortAddress("0x2043DB00a32bd8C4804227B72b97438af39a7De6")).toBe("0x2043…7De6")
  })

  it("dates in IST", () => {
    // 18:30 UTC on 11 Mar is 00:00 IST on 12 Mar.
    expect(formatDay(Date.UTC(2026, 2, 11, 18, 30))).toMatch(/12 Mar 2026/)
  })

  it("time left", () => {
    expect(timeLeft(0, 1)).toBe("expired")
    expect(timeLeft(30 * 60_000, 0)).toBe("30 min left")
    expect(timeLeft(5 * 3600_000, 0)).toBe("5 hours left")
    expect(timeLeft(1 * 3600_000, 0)).toBe("1 hour left")
    expect(timeLeft(5 * 86_400_000, 0)).toBe("5 days left")
  })

  it("datetime-local value", () => {
    expect(toLocalInput(new Date(2026, 9, 18, 9, 5))).toBe("2026-10-18T09:05")
  })
})

describe("verdictCopy", () => {
  async function verdicts() {
    const fake = new FakeArkiv()
    const w = await seedBoard(fake)
    await issueNotice(w, {
      codePrefix: "DBSE",
      title: "Maths exam",
      body: EXAM_NOTICE,
      category: "exam",
      lang: "en",
      validUntil: fake.inDays(10),
      now: fake.now(),
    })
    const prove = fakeProver({ [BOARD_DOMAIN]: BOARD })
    const r = fake.reader()
    return {
      real: await verify(r, { text: EXAM_NOTICE }, prove),
      altered: await verify(r, { text: EXAM_NOTICE.replace("12 March", "19 March") }, prove),
      unknown: await verify(r, { text: "free laptops for everyone register now on this link" }, prove),
    }
  }

  it("every verdict has a tone, an English and a Hindi headline", async () => {
    const v = await verdicts()
    const all: Verdict[] = [v.real, v.altered, v.unknown, { status: "empty" }]
    for (const x of all) {
      const c = verdictCopy(x)
      expect(c.headline.length).toBeGreaterThan(5)
      expect(c.hindi).toMatch(/[ऀ-ॿ]/)
    }
    expect(verdictCopy(v.real).tone).toBe("good")
    expect(verdictCopy(v.altered).tone).toBe("bad")
    expect(verdictCopy(v.unknown).tone).toBe("neutral")
  })

  it("names the issuer domain in the headline", async () => {
    const v = await verdicts()
    expect(verdictCopy(v.real).headline).toContain(BOARD_DOMAIN)
    expect(verdictCopy(v.altered).headline).toContain(BOARD_DOMAIN)
  })

  it("softens 'altered' for OCR input, since screenshots get misread", async () => {
    const v = await verdicts()
    expect(verdictCopy(v.altered, { fromOcr: true }).tone).toBe("warn")
    expect(verdictCopy(v.altered, { fromOcr: true }).headline).not.toMatch(/fake/i)
  })
})

describe("postponed copy", () => {
  it("has no doubled full stop when the reason ends with one", async () => {
    const { verdictCopy: copy } = await import("@/lib/ui")
    const c = copy({
      status: "real",
      notice: { validUntil: 0 } as never,
      issuer: { domain: "x", name: "X" } as never,
      amendments: [{ reason: "Moved.", newValidUntil: Date.UTC(2026, 10, 9), issuedAt: 0 } as never],
    })
    expect(c.detail).not.toContain("..")
    expect(c.detail).toContain("Now in force until")
  })
})

describe("checkSteps and shareText", () => {
  async function world() {
    const fake = new FakeArkiv()
    const w = await seedBoard(fake)
    const issued = await issueNotice(w, {
      codePrefix: "DBSE",
      title: "Maths exam",
      body: EXAM_NOTICE,
      category: "exam",
      lang: "en",
      validUntil: fake.inDays(10),
      now: fake.now(),
    })
    const prove = fakeProver({ [BOARD_DOMAIN]: BOARD })
    return { fake, issued, prove, r: fake.reader() }
  }
  const SITE = "https://asli.example"

  it("real: every step passes and names the wallet and domain", async () => {
    const { r, prove } = await world()
    const v = await verify(r, { text: EXAM_NOTICE }, prove)
    const steps = checkSteps(v)
    expect(steps.length).toBeGreaterThanOrEqual(4)
    expect(steps.every((s) => s.state === "pass")).toBe(true)
    expect(steps.map((s) => s.label).join(" ")).toContain(BOARD_DOMAIN)
    expect(steps.map((s) => s.detail).join(" ")).toContain(shortAddress(BOARD))
  })

  it("altered: the word-for-word step fails, the authorship steps pass", async () => {
    const { r, prove } = await world()
    const v = await verify(r, { text: EXAM_NOTICE.replace("12 March", "19 March") }, prove)
    const steps = checkSteps(v)
    expect(steps.filter((s) => s.state === "fail").map((s) => s.label)).toEqual(["Matches word for word"])
  })

  it("unknown: says nothing matched; empty has no steps", async () => {
    const { r, prove } = await world()
    const v = await verify(r, { text: "free laptops for everyone register now on this link" }, prove)
    expect(checkSteps(v).some((s) => s.state === "fail")).toBe(true)
    expect(checkSteps({ status: "empty" })).toEqual([])
  })

  it("the reply names the change and links to the real notice by code", async () => {
    const { r, prove, issued } = await world()
    const v = await verify(r, { text: EXAM_NOTICE.replace("12 March", "19 March") }, prove)
    const t = shareText(v, SITE)
    expect(t).toMatch(/^❌ Fake/)
    expect(t).toContain('"12" was changed to "19"')
    expect(t).toContain(`${SITE}/?code=${issued.code}`)
    expect(t).toMatch(/[ऀ-ॿ]/)
  })

  it("the reply for a real notice is a green tick with a link", async () => {
    const { r, prove, issued } = await world()
    const t = shareText(await verify(r, { text: EXAM_NOTICE }, prove), SITE)
    expect(t.startsWith("✅")).toBe(true)
    expect(t).toContain(`?code=${issued.code}`)
    expect(shareText({ status: "empty" }, SITE)).toBe("")
  })

  it("the reply for unknown text links to the site, not to a code", async () => {
    const { r, prove } = await world()
    const t = shareText(await verify(r, { text: "free laptops for everyone register now" }, prove), SITE)
    expect(t).toContain(SITE)
    expect(t).not.toContain("?code=")
  })
})
