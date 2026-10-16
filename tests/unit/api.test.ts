import { describe, expect, it } from "vitest"
import { FakeArkiv } from "../helpers/fakeArkiv"
import { BOARD, EMPLOYER, EXAM_NOTICE, UNIV } from "../helpers/fixtures"
import { handleIssuerAction, type ApiDeps } from "@/lib/api"
import { RateLimiter } from "@/lib/ratelimit"
import { noticesOfIssuer, revocationsByCode } from "@/lib/arkiv/read"

function deps(fake: FakeArkiv, limiter = new RateLimiter(10, 60_000, 100)): ApiDeps {
  return {
    reader: fake.reader(),
    writerFor: (issuer) => fake.writer(issuer.address),
    limiter,
    now: () => fake.now(),
  }
}

const issueBody = (fake: FakeArkiv, extra: Record<string, unknown> = {}) => ({
  issuer: "board",
  title: "Class X Maths exam",
  body: EXAM_NOTICE,
  category: "exam",
  lang: "en",
  validUntil: fake.inDays(3).toISOString(),
  ...extra,
})

describe("POST /api/issuer/issue", () => {
  it("publishes as the board's own wallet", async () => {
    const fake = new FakeArkiv()
    const res = await handleIssuerAction("issue", issueBody(fake), "1.1.1.1", deps(fake))
    expect(res.status).toBe(200)
    expect(res.body.code).toMatch(/^DBSE-/)
    expect(res.body.explorer).toContain("/tx/")
    const mine = await noticesOfIssuer(fake.reader(), BOARD)
    expect(mine).toHaveLength(1)
    expect(mine[0].creator).toBe(BOARD)
  })

  it.each([
    [{ issuer: "cbse" }, /issuer must be/],
    [{ title: "" }, /title is required/],
    [{ body: "too short" }, /body is required/],
    [{ category: "bribe" }, /unknown category/],
    [{ validUntil: "not a date" }, /must be a date/],
  ])("rejects bad input %o", async (patch, msg) => {
    const fake = new FakeArkiv()
    const res = await handleIssuerAction("issue", issueBody(fake, patch), "1.1.1.1", deps(fake))
    expect(res.status).toBe(400)
    expect(String(res.body.error)).toMatch(msg)
  })

  it("caps playground validity at 7 days and refuses the past", async () => {
    const fake = new FakeArkiv()
    const far = await handleIssuerAction("issue", issueBody(fake, { validUntil: fake.inDays(30).toISOString() }), "1", deps(fake))
    expect(far.status).toBe(400)
    const past = await handleIssuerAction("issue", issueBody(fake, { validUntil: fake.inDays(-1).toISOString() }), "1", deps(fake))
    expect(past.status).toBe(400)
  })

  it("employers cannot issue notices; only employers issue offers", async () => {
    const fake = new FakeArkiv()
    expect((await handleIssuerAction("issue", issueBody(fake, { issuer: "employer" }), "1", deps(fake))).status).toBe(400)
    const offer = {
      issuer: "univ",
      fileHash: `0x${"11".repeat(32)}`,
      roleCode: "X",
      roleTitle: "Y",
      location: "Z",
      validUntil: fake.inDays(3).toISOString(),
    }
    expect((await handleIssuerAction("offer", offer, "1", deps(fake))).status).toBe(400)
    const ok = await handleIssuerAction("offer", { ...offer, issuer: "employer" }, "1", deps(fake))
    expect(ok.status).toBe(200)
    expect(fake.entities.at(-1)?.creator).toBe(EMPLOYER)
  })

  it("unknown action is 404", async () => {
    const fake = new FakeArkiv()
    expect((await handleIssuerAction("mint", {}, "1", deps(fake))).status).toBe(404)
  })

  it("503 when the issuer has no key", async () => {
    const fake = new FakeArkiv()
    const res = await handleIssuerAction("issue", issueBody(fake), "1", { ...deps(fake), writerFor: () => undefined })
    expect(res.status).toBe(503)
  })

  it("rate limits per visitor, and invalid requests do not use a slot", async () => {
    const fake = new FakeArkiv()
    const d = deps(fake, new RateLimiter(2, 60_000, 100, () => 0))
    expect((await handleIssuerAction("issue", issueBody(fake, { title: "" }), "9.9.9.9", d)).status).toBe(400)
    expect((await handleIssuerAction("issue", issueBody(fake), "9.9.9.9", d)).status).toBe(200)
    expect((await handleIssuerAction("issue", issueBody(fake), "9.9.9.9", d)).status).toBe(200)
    const third = await handleIssuerAction("issue", issueBody(fake), "9.9.9.9", d)
    expect(third.status).toBe(429)
    expect(third.body.retryAfterSeconds).toBeGreaterThan(0)
    expect((await handleIssuerAction("issue", issueBody(fake), "8.8.8.8", d)).status).toBe(200)
  })

  it("reports chain failures as 502 with a one-line message", async () => {
    const fake = new FakeArkiv()
    const broken = deps(fake)
    broken.writerFor = (issuer) => ({
      ...fake.writer(issuer.address),
      createEntity: async () => {
        throw new Error("Transaction failed: out of gas\nhuge hex dump")
      },
    })
    const res = await handleIssuerAction("issue", issueBody(fake), "1", broken)
    expect(res.status).toBe(502)
    expect(res.body.error).toBe("Arkiv write failed: Transaction failed: out of gas")
  })
})

describe("postpone and revoke", () => {
  async function issued() {
    const fake = new FakeArkiv()
    const d = deps(fake)
    const res = await handleIssuerAction("issue", issueBody(fake), "1", d)
    return { fake, d, key: res.body.entityKey as string, code: res.body.code as string }
  }

  it("postpones an own notice", async () => {
    const { fake, d, key } = await issued()
    const res = await handleIssuerAction(
      "postpone",
      { issuer: "board", noticeKey: key, newValidUntil: fake.inDays(6).toISOString(), reason: "Moved" },
      "1",
      d,
    )
    expect(res.status).toBe(200)
    expect(res.body.amendmentKey).toMatch(/^0x/)
  })

  it("refuses to postpone to an earlier date", async () => {
    const { fake, d, key } = await issued()
    const res = await handleIssuerAction(
      "postpone",
      { issuer: "board", noticeKey: key, newValidUntil: fake.inDays(1).toISOString(), reason: "x" },
      "1",
      d,
    )
    expect(res.status).toBe(400)
  })

  it("another issuer cannot touch the notice", async () => {
    const { fake, d, key } = await issued()
    const res = await handleIssuerAction("revoke", { issuer: "univ", noticeKey: key, reason: "x" }, "1", d)
    expect(res.status).toBe(400)
    expect(String(res.body.error)).toMatch(/another issuer/)
    expect(fake.entities.some((e) => e.creator === UNIV)).toBe(false)
  })

  it("revokes an own notice", async () => {
    const { fake, d, key, code } = await issued()
    const res = await handleIssuerAction("revoke", { issuer: "board", noticeKey: key, reason: "Error" }, "1", d)
    expect(res.status).toBe(200)
    expect(await revocationsByCode(fake.reader(), code)).toHaveLength(1)
  })

  it("unknown notice key is a 400", async () => {
    const { d } = await issued()
    const res = await handleIssuerAction("revoke", { issuer: "board", noticeKey: `0x${"00".repeat(32)}`, reason: "x" }, "1", d)
    expect(res.status).toBe(400)
  })
})
