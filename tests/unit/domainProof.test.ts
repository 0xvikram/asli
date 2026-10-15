import { describe, expect, it } from "vitest"
import {
  checkDnsTxt,
  checkWellKnown,
  cleanDomain,
  parseTxtRecords,
  parseWellKnown,
  proveDomain,
} from "@/lib/domainProof"

const ADDR = "0x2043DB00a32bd8C4804227B72b97438af39a7De6"
const OTHER = "0x94a9C31a9dcdd7EBD44b9c4d7511a27149ec6F81"

function fakeFetch(routes: Record<string, unknown>) {
  return async (url: string) => {
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix))
    if (!hit) return new Response("nope", { status: 404 })
    return new Response(JSON.stringify(hit[1]), { status: 200 })
  }
}

describe("cleanDomain", () => {
  it("accepts hostnames and rejects URLs or paths", () => {
    expect(cleanDomain("Board.Example.IN.")).toBe("board.example.in")
    expect(cleanDomain("localhost:3000")).toBe("localhost:3000")
    expect(cleanDomain("https://evil.com")).toBeNull()
    expect(cleanDomain("evil.com/x")).toBeNull()
    expect(cleanDomain("a b.com")).toBeNull()
  })
})

describe("parsers", () => {
  it("parses the well-known document and ignores junk", () => {
    expect(parseWellKnown({ asli: 1, issuers: [{ address: ADDR.toLowerCase() }, { address: "nope" }] })).toEqual([ADDR])
    expect(parseWellKnown({ asli: 2, issuers: [{ address: ADDR }] })).toEqual([])
    expect(parseWellKnown(null)).toEqual([])
  })

  it("parses quoted and split TXT data", () => {
    expect(parseTxtRecords([`"asli-issuer=${ADDR}"`])).toEqual([ADDR])
    expect(parseTxtRecords([`"asli-issuer=${ADDR.slice(0, 20)}" "${ADDR.slice(20)}"`])).toEqual([ADDR])
    expect(parseTxtRecords([`"v=spf1 -all"`])).toEqual([])
  })
})

describe("checks", () => {
  it("well-known: listed wallet passes, other wallet fails", async () => {
    const f = fakeFetch({ "https://board.example/.well-known/asli-issuer.json": { asli: 1, issuers: [{ address: ADDR }] } })
    expect(await checkWellKnown("board.example", ADDR, f)).toMatchObject({ ok: true, method: "well-known" })
    expect(await checkWellKnown("board.example", OTHER, f)).toMatchObject({ ok: false })
  })

  it("well-known: uses http for localhost", async () => {
    const f = fakeFetch({ "http://localhost:3000/.well-known": { asli: 1, issuers: [{ address: ADDR }] } })
    expect(await checkWellKnown("localhost:3000", ADDR, f)).toMatchObject({ ok: true })
  })

  it("dns: TXT record on _asli subdomain", async () => {
    const f = fakeFetch({
      "https://cloudflare-dns.com/dns-query?name=_asli.board.example": { Answer: [{ data: `"asli-issuer=${ADDR}"` }] },
    })
    expect(await checkDnsTxt("board.example", ADDR, f)).toMatchObject({ ok: true, method: "dns-txt" })
  })

  it("proveDomain falls back to DNS and reports both reasons on failure", async () => {
    const f = fakeFetch({
      "https://cloudflare-dns.com/dns-query?name=_asli.board.example": { Answer: [{ data: `"asli-issuer=${ADDR}"` }] },
    })
    expect(await proveDomain("board.example", ADDR, f)).toMatchObject({ ok: true, method: "dns-txt" })
    const fail = await proveDomain("board.example", OTHER, f)
    expect(fail.ok).toBe(false)
    if (!fail.ok) expect(fail.reason).toContain(";")
  })

  it("network errors fail closed", async () => {
    const boom = async () => {
      throw new Error("offline")
    }
    expect(await proveDomain("board.example", ADDR, boom)).toMatchObject({ ok: false })
  })
})
