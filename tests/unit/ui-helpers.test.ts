import { describe, expect, it } from "vitest"
import { FakeArkiv } from "../helpers/fakeArkiv"
import { BOARD, BOARD_DOMAIN, EXAM_NOTICE, fakeProver, seedBoard } from "../helpers/fixtures"
import { issueNotice } from "@/lib/arkiv/write"
import { formatDay, shortAddress, timeLeft, toLocalInput, verdictCopy } from "@/lib/ui"
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
