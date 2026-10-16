import { describe, expect, it } from "vitest"
import { STATS } from "@/lib/stats"

describe("home page stats", () => {
  it("every number has a source link and a publication date", () => {
    expect(STATS.length).toBeGreaterThanOrEqual(3)
    for (const s of STATS) {
      expect(s.url).toMatch(/^https:\/\//)
      expect(s.source.length).toBeGreaterThan(2)
      expect(Number.isNaN(Date.parse(s.published))).toBe(false)
    }
  })

  it("the rupee figure is labelled as all cyber fraud, not fake notices", () => {
    const rupee = STATS.find((s) => s.value.startsWith("₹"))!
    expect(rupee.label).toMatch(/cyber fraud/)
    expect(rupee.label).not.toMatch(/notice/i)
  })
})
