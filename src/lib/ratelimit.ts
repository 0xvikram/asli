/**
 * A sliding-window limiter for the public playground. Every write costs the demo issuers real
 * testnet GLM, so one visitor gets a few writes and the whole site gets a daily cap.
 *
 * In memory, per server instance. That is enough to stop casual draining of the demo wallets;
 * it is not a security boundary, and the README says so.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>()
  private global: number[] = []

  constructor(
    readonly perKey: number,
    readonly windowMs: number,
    readonly globalPerDay: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit if allowed. Returns how long to wait otherwise. */
  take(key: string): { ok: true } | { ok: false; retryAfterMs: number; scope: "you" | "site" } {
    const t = this.now()
    this.global = this.global.filter((x) => t - x < 86_400_000)
    if (this.global.length >= this.globalPerDay) {
      return { ok: false, retryAfterMs: 86_400_000 - (t - this.global[0]), scope: "site" }
    }
    const mine = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs)
    if (mine.length >= this.perKey) {
      this.hits.set(key, mine)
      return { ok: false, retryAfterMs: this.windowMs - (t - mine[0]), scope: "you" }
    }
    mine.push(t)
    this.hits.set(key, mine)
    this.global.push(t)
    return { ok: true }
  }
}

/** 6 writes per visitor per 10 minutes, 300 per day for the whole site. */
export const playgroundLimiter = new RateLimiter(6, 10 * 60_000, 300)

/** First address in x-forwarded-for (set by Vercel), else a fallback bucket. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown"
}
