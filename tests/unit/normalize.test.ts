import { describe, expect, it } from "vitest"
import { hashFileBytes, hashNoticeText, normalizeCode, normalizeNotice, noticeWords } from "@/lib/normalize"

const ORIGINAL = `DEMO BOARD OF SECONDARY EDUCATION
Notice No. DBSE/EXAM/2026/41
The Class X Mathematics exam will be held on 12 March 2026 as scheduled.`

describe("normalizeNotice", () => {
  it("ignores case, punctuation and spacing", () => {
    const messy = `demo board   of secondary education!!
notice no dbse exam 2026 41
the class x  mathematics exam will be held on 12 march 2026, as scheduled...`
    expect(normalizeNotice(messy)).toBe(normalizeNotice(ORIGINAL))
  })

  it("drops WhatsApp formatting, emoji and forward banners", () => {
    const forwarded = `Forwarded many times
*DEMO BOARD OF SECONDARY EDUCATION* 🚨🚨
_Notice No. DBSE/EXAM/2026/41_
The Class X Mathematics exam will be held on 12 March 2026 as scheduled. 🙏
Please share with all parents`
    expect(normalizeNotice(forwarded)).toBe(normalizeNotice(ORIGINAL))
  })

  it("treats Devanagari digits as ASCII digits", () => {
    expect(normalizeNotice("परीक्षा १२ मार्च २०२६ को होगी")).toBe(normalizeNotice("परीक्षा 12 मार्च 2026 को होगी"))
  })

  it("keeps Hindi matras so different words stay different", () => {
    expect(normalizeNotice("परीक्षा रद्द")).not.toBe(normalizeNotice("परिक्षा रद"))
    expect(normalizeNotice("परीक्षा")).toBe("परीक्षा")
  })

  it("removes zero-width characters used to dodge copy matching", () => {
    expect(normalizeNotice("ex​am")).toBe("exam")
  })

  it("folds full-width and compatibility characters (NFKC)", () => {
    expect(normalizeNotice("ＥＸＡＭ １２")).toBe("exam 12")
  })

  it("returns no words for empty or symbol-only input", () => {
    expect(noticeWords("")).toEqual([])
    expect(noticeWords("🚨 !!! ...")).toEqual([])
  })
})

describe("hashNoticeText", () => {
  it("is a stable bytes32 for equivalent copies", () => {
    const h = hashNoticeText(ORIGINAL)
    expect(h).toMatch(/^0x[0-9a-f]{64}$/)
    expect(hashNoticeText(ORIGINAL.toUpperCase() + "  ")).toBe(h)
  })

  it("changes when one fact changes", () => {
    expect(hashNoticeText(ORIGINAL.replace("12 March", "15 March"))).not.toBe(hashNoticeText(ORIGINAL))
  })
})

describe("hashFileBytes", () => {
  it("hashes exact bytes", () => {
    const a = hashFileBytes(new Uint8Array([1, 2, 3]))
    expect(a).toMatch(/^0x[0-9a-f]{64}$/)
    expect(hashFileBytes(new Uint8Array([1, 2, 4]))).not.toBe(a)
  })
})

describe("normalizeCode", () => {
  it("accepts retyped codes", () => {
    expect(normalizeCode(" dbse 26 7k3q ")).toBe("DBSE-26-7K3Q")
    expect(normalizeCode("DBSE—26—7K3Q")).toBe("DBSE-26-7K3Q")
    expect(normalizeCode("dbse--26_7k3q!")).toBe("DBSE-26-7K3Q")
  })
})
