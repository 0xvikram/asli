import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { demoIssuers } from "@/lib/issuers"
import { KINDS, LIFETIMES, QUERIES } from "@/lib/schema"

const read = (p: string) => readFileSync(p, "utf8")

describe("submission gates", () => {
  it("required files exist", () => {
    for (const f of ["README.md", "LICENSE", "arkiv/schema.md", "arkiv/friction.md", ".env.example"]) {
      expect(existsSync(f), f).toBe(true)
    }
    expect(read("LICENSE")).toMatch(/^MIT License/)
  })

  it("schema.md documents every entity kind and its lifetime", () => {
    const schema = read("arkiv/schema.md")
    for (const k of KINDS) {
      expect(schema, k).toContain(`### \`${k}\``)
      expect(schema, `${k} lifetime`).toContain(LIFETIMES[k].rule)
    }
  })

  it("schema.md lists every query the code runs", () => {
    const schema = read("arkiv/schema.md")
    for (const [name, q] of Object.entries(QUERIES)) {
      expect(schema, name).toContain(name)
      expect(schema, name).toContain(q)
    }
  })

  it("schema.md lists every issuer wallet", () => {
    const schema = read("arkiv/schema.md")
    for (const i of demoIssuers()) expect(schema).toContain(i.address)
  })

  it("friction.md entries carry expected/actual and a fix", () => {
    const friction = read("arkiv/friction.md")
    const entries = friction.split(/\n## \d+\./).slice(1)
    expect(entries.length).toBeGreaterThanOrEqual(4)
    for (const e of entries) {
      expect(e).toMatch(/\*\*Surface:\*\*/)
      expect(e).toMatch(/\*\*(Expected|Tested):\*\*/)
      expect(e).toMatch(/\*\*Actual:\*\*/)
    }
  })

  it("no secrets are committed in docs", () => {
    for (const f of ["README.md", "arkiv/schema.md", "arkiv/friction.md", ".env.example", "CLAUDE.md"]) {
      expect(read(f), f).not.toMatch(/0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/)
      expect(read(f), f).not.toMatch(/ark_live_[A-Za-z0-9]/)
    }
  })
})
