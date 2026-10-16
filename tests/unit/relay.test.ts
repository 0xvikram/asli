import { describe, expect, it } from "vitest"
import { RateLimiter } from "@/lib/ratelimit"
import { handleRelay, RELAY_MAX_BODY } from "@/lib/relay"

function deps(limit = 5) {
  const sent: string[] = []
  return {
    sent,
    deps: {
      limiter: new RateLimiter(limit, 60_000, 1000),
      forward: async (body: string) => {
        sent.push(body)
        return { status: 200, text: '{"jsonrpc":"2.0","id":1,"result":"0x1"}' }
      },
    },
  }
}
const call = (method: string, extra: Record<string, unknown> = {}) => JSON.stringify({ jsonrpc: "2.0", id: 7, method, params: [], ...extra })

describe("read relay", () => {
  it("forwards allowed read methods and returns Arkiv's answer", async () => {
    const { sent, deps: d } = deps()
    const res = await handleRelay(call("arkiv_query"), "1.1.1.1", d)
    expect(res.status).toBe(200)
    expect(JSON.parse(sent[0])).toMatchObject({ method: "arkiv_query", id: 7 })
  })

  it("refuses anything that writes or signs", async () => {
    const { sent, deps: d } = deps()
    for (const m of ["eth_sendRawTransaction", "eth_sendTransaction", "eth_sign", "arkiv_anything"]) {
      expect((await handleRelay(call(m), "1.1.1.1", d)).status).toBe(403)
    }
    expect(sent).toHaveLength(0)
  })

  it("refuses batches, bad JSON and oversized bodies", async () => {
    const { sent, deps: d } = deps()
    expect((await handleRelay(JSON.stringify([JSON.parse(call("eth_chainId"))]), "ip", d)).status).toBe(400)
    expect((await handleRelay("{not json", "ip", d)).status).toBe(400)
    expect((await handleRelay("x".repeat(RELAY_MAX_BODY + 1), "ip", d)).status).toBe(413)
    expect(sent).toHaveLength(0)
  })

  it("limits each visitor", async () => {
    const { deps: d } = deps(2)
    expect((await handleRelay(call("eth_chainId"), "9.9.9.9", d)).status).toBe(200)
    expect((await handleRelay(call("eth_chainId"), "9.9.9.9", d)).status).toBe(200)
    expect((await handleRelay(call("eth_chainId"), "9.9.9.9", d)).status).toBe(429)
    expect((await handleRelay(call("eth_chainId"), "8.8.8.8", d)).status).toBe(200)
  })

  it("rebuilds the call, so extra fields never reach Arkiv", async () => {
    const { sent, deps: d } = deps()
    await handleRelay(call("eth_chainId", { evil: "x" }), "ip", d)
    expect(sent[0]).not.toContain("evil")
  })
})
