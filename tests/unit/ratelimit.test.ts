import { describe, expect, it } from "vitest"
import { RateLimiter, clientIp } from "@/lib/ratelimit"

describe("RateLimiter", () => {
  it("allows up to the limit per key in the window, then frees up", () => {
    let t = 0
    const rl = new RateLimiter(2, 1000, 100, () => t)
    expect(rl.take("a").ok).toBe(true)
    expect(rl.take("a").ok).toBe(true)
    const blocked = rl.take("a")
    expect(blocked).toMatchObject({ ok: false, scope: "you" })
    expect(rl.take("b").ok).toBe(true)
    t = 1001
    expect(rl.take("a").ok).toBe(true)
  })

  it("enforces a site-wide daily cap", () => {
    let t = 0
    const rl = new RateLimiter(10, 1000, 3, () => t)
    expect(rl.take("a").ok).toBe(true)
    expect(rl.take("b").ok).toBe(true)
    expect(rl.take("c").ok).toBe(true)
    expect(rl.take("d")).toMatchObject({ ok: false, scope: "site" })
    t = 86_400_001
    expect(rl.take("d").ok).toBe(true)
  })
})

describe("clientIp", () => {
  it("takes the first forwarded address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4")
    expect(clientIp(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8")
    expect(clientIp(new Headers())).toBe("unknown")
  })
})
