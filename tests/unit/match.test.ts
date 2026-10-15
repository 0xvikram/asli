import { describe, expect, it } from "vitest"
import { ALTERED_THRESHOLD, describeChanges, diffWords, matchAgainst, similarity } from "@/lib/match"

const REAL = `Demo Board of Secondary Education. Notice DBSE/EXAM/2026/41.
The Class X Mathematics exam will be held on 12 March 2026 from 10:30 am. Admit cards are available on the board website.`

const HOLIDAY = `Pune Demo University. The campus will remain closed on 2 October 2026 for Gandhi Jayanti.`

describe("diffWords", () => {
  it("marks a replaced word", () => {
    const ops = diffWords(["exam", "on", "12", "march"], ["exam", "on", "15", "march"])
    expect(ops).toEqual([
      { type: "same", words: ["exam", "on"] },
      { type: "removed", words: ["12"] },
      { type: "added", words: ["15"] },
      { type: "same", words: ["march"] },
    ])
  })

  it("handles empty sides", () => {
    expect(diffWords([], ["a"])).toEqual([{ type: "added", words: ["a"] }])
    expect(diffWords(["a"], [])).toEqual([{ type: "removed", words: ["a"] }])
  })
})

describe("similarity", () => {
  it("is 1 for identical and 0 for disjoint", () => {
    expect(similarity(["a", "b"], ["a", "b"])).toBe(1)
    expect(similarity(["a", "b"], ["c", "d"])).toBe(0)
  })
})

describe("describeChanges", () => {
  it("pairs removals with additions", () => {
    const changes = describeChanges(diffWords("held on 12 march".split(" "), "postponed to 15 march".split(" ")))
    expect(changes).toEqual([{ original: "held on 12", forwarded: "postponed to 15" }])
  })
})

describe("matchAgainst", () => {
  it("finds an exact copy even with WhatsApp noise", () => {
    const forward = `Forwarded many times\n*${REAL}* 🙏`
    const r = matchAgainst(forward, [HOLIDAY, REAL])
    expect(r).toMatchObject({ kind: "exact", candidateIndex: 1 })
  })

  it("catches a doctored date and says exactly what changed", () => {
    const fake = REAL.replace("12 March 2026", "19 March 2026")
    const r = matchAgainst(fake, [HOLIDAY, REAL])
    expect(r.kind).toBe("altered")
    if (r.kind !== "altered") throw new Error("expected altered")
    expect(r.candidateIndex).toBe(1)
    expect(r.similarity).toBeGreaterThanOrEqual(ALTERED_THRESHOLD)
    expect(r.changes).toEqual([{ original: "12", forwarded: "19" }])
  })

  it("catches an inserted cancellation line", () => {
    const fake = REAL + " Due to unavoidable reasons the exam stands cancelled."
    const r = matchAgainst(fake, [REAL])
    expect(r.kind).toBe("altered")
    if (r.kind !== "altered") throw new Error("expected altered")
    expect(r.changes[0].forwarded).toContain("cancelled")
  })

  it("calls an unrelated text unrelated", () => {
    const r = matchAgainst("Free laptop scheme for all students, register at this link today", [REAL, HOLIDAY])
    expect(r.kind).toBe("unrelated")
  })

  it("returns unrelated when there are no candidates", () => {
    expect(matchAgainst(REAL, [])).toEqual({ kind: "unrelated", similarity: 0 })
  })
})
