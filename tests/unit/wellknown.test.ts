import { describe, expect, it } from "vitest"
import { GET, wellKnownBody } from "@/app/api/well-known/route"
import { parseWellKnown } from "@/lib/domainProof"
import { demoIssuers } from "@/lib/issuers"
import { privateKeyToAccount } from "viem/accounts"
import { readFileSync, existsSync } from "node:fs"

describe("/.well-known/asli-issuer.json", () => {
  it("each issuer host lists only its own wallet", () => {
    for (const issuer of demoIssuers()) {
      const listed = parseWellKnown(wellKnownBody(issuer.domain))
      expect(listed).toEqual([issuer.address])
    }
  })

  it("unknown hosts list nobody (404)", async () => {
    expect(wellKnownBody("evil.example").issuers).toEqual([])
    const res = await GET(new Request("https://evil.example/api/well-known", { headers: { host: "evil.example" } }))
    expect(res.status).toBe(404)
  })

  it("serves open CORS so browsers can verify", async () => {
    const host = demoIssuers()[0].domain
    const res = await GET(new Request(`https://${host}/api/well-known`, { headers: { host } }))
    expect(res.status).toBe(200)
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
    expect(parseWellKnown(await res.json())).toEqual([demoIssuers()[0].address])
  })

  it("every demo issuer has a distinct domain", () => {
    const domains = demoIssuers().map((i) => i.domain)
    expect(new Set(domains).size).toBe(domains.length)
  })

  it("registry addresses match the local signing keys when present", () => {
    if (!existsSync(".env.local")) return
    const env = Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
    )
    for (const issuer of demoIssuers()) {
      const key = env[issuer.envKey]
      if (key) expect(privateKeyToAccount(key as `0x${string}`).address).toBe(issuer.address)
    }
  })
})
