import { describe, expect, it } from "vitest"
import {
  APP,
  KINDS,
  LIFETIMES,
  QUERIES,
  amendmentEntity,
  issuerEntity,
  makeNoticeCode,
  noticeEntity,
  offerEntity,
  revocationEntity,
} from "@/lib/schema"

const HASH = `0x${"ab".repeat(32)}` as const
const KEY = `0x${"cd".repeat(32)}` as const
const issuedAt = new Date("2026-10-16T00:00:00Z")
const validUntil = new Date("2026-11-30T00:00:00Z")

function attrs(params: { attributes?: unknown }) {
  return params.attributes as Record<string, unknown>
}

describe("entity builders", () => {
  it("notice: readonly, typed attributes, lifetime = validity", () => {
    const p = noticeEntity({
      code: "dbse 26 7k3q",
      title: "Exam schedule",
      body: "text",
      category: "exam",
      lang: "en",
      textHash: HASH,
      issuedAt,
      validUntil,
    })
    const a = attrs(p)
    expect(a.app).toBe(APP)
    expect(a.kind).toBe("notice")
    expect(a.code).toMatchObject({ type: "str", value: "DBSE-26-7K3Q" })
    expect(a.text_hash).toMatchObject({ type: "bytes32" })
    expect(a.valid_until).toMatchObject({ type: "u64", value: BigInt(validUntil.getTime()) })
    expect(a.issued_at).toMatchObject({ type: "u64" })
    expect(a).not.toHaveProperty("file_hash")
    expect(a).not.toHaveProperty("issuer")
    expect(p.flags).toEqual({ readonly: true })
    expect(p.expires).toBeDefined()
  })

  it("notice: rejects a validity before issue time", () => {
    expect(() =>
      noticeEntity({
        code: "X-26-AAAA",
        title: "t",
        body: "b",
        category: "general",
        lang: "en",
        textHash: HASH,
        issuedAt: validUntil,
        validUntil: issuedAt,
      }),
    ).toThrow()
  })

  it("revocation: readonly and permissionless extension", () => {
    const p = revocationEntity({
      noticeKey: KEY,
      textHash: HASH,
      code: "X-26-AAAA",
      title: "t",
      reason: "r",
      revokedAt: issuedAt,
    })
    expect(p.flags).toEqual({ readonly: true, permissionlessExtension: true })
    expect(attrs(p).notice).toMatchObject({ type: "key", value: KEY })
  })

  it("amendment links to its notice by key", () => {
    const p = amendmentEntity({ noticeKey: KEY, newValidUntil: validUntil, reason: "moved", issuedAt })
    expect(attrs(p).notice).toMatchObject({ type: "key" })
    expect(attrs(p).new_valid_until).toMatchObject({ type: "u64" })
  })

  it("offer: no candidate data in payload or attributes", () => {
    const p = offerEntity({
      fileHash: HASH,
      roleCode: "acme-se-2026",
      roleTitle: "Software Engineer",
      location: "Pune",
      issuedAt,
      validUntil,
    })
    const payload = new TextDecoder().decode(p.payload)
    expect(JSON.parse(payload)).toEqual({ roleTitle: "Software Engineer", location: "Pune" })
    expect(Object.keys(attrs(p)).sort()).toEqual(
      ["app", "file_hash", "issued_at", "kind", "role_code", "valid_until"].sort(),
    )
  })

  it("issuer: domain lowercased, not readonly", () => {
    const p = issuerEntity({ name: "Demo Board", domain: "Demo.Example", category: "board", about: "x" })
    expect(attrs(p).domain).toMatchObject({ value: "demo.example" })
    expect(p.flags).toBeUndefined()
  })

  it("refuses attribute strings over 128 bytes", () => {
    expect(() =>
      issuerEntity({ name: "x".repeat(129), domain: "a.b", category: "board", about: "" }),
    ).toThrow(/128 bytes/)
  })
})

describe("schema metadata", () => {
  it("documents a lifetime for every kind", () => {
    for (const k of KINDS) expect(LIFETIMES[k].rule.length).toBeGreaterThan(0)
  })

  it("every query is namespaced to the app", () => {
    for (const q of Object.values(QUERIES)) expect(q).toContain("app = str('asli_v1')")
  })

  it("makes retypeable codes without look-alike characters", () => {
    let i = 0
    const seq = [0, 0.99, 0.5, 0.25]
    const code = makeNoticeCode("dbse", issuedAt, () => seq[i++ % seq.length])
    expect(code).toMatch(/^DBSE-26-[2-9A-HJ-NP-Z]{4}$/)
  })
})
