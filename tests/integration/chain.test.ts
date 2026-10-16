import "dotenv/config"
import { config } from "dotenv"
import { describe, expect, it } from "vitest"
import type { Hex } from "viem"
import { issuerWallet, publicReader } from "@/lib/arkiv/client"
import { amendmentsOf, noticesByCode, noticesOfIssuer, revocationsByCode } from "@/lib/arkiv/read"
import { issueNotice, postponeNotice, revokeNotice } from "@/lib/arkiv/write"
import { verify } from "@/lib/verify"
import { proveDomain } from "@/lib/domainProof"

config({ path: ".env.local" })

const ON = process.env.ARKIV_INTEGRATION === "1"
const KEY = process.env.ISSUER_BOARD_KEY as Hex | undefined

/**
 * Real Tiramisu. Run with `ARKIV_INTEGRATION=1 npm test`. Write tests also need a funded
 * ISSUER_BOARD_KEY in .env.local. Everything written is synthetic and expires within a day.
 */
describe.skipIf(!ON)("Tiramisu: reads", () => {
  it("answers an Asli query at the head", async () => {
    const r = publicReader()
    const timing = await r.getBlockTiming()
    expect(timing.blockDuration).toBe(2)
    const res = await noticesByCode(r, "NOPE-00-0000")
    expect(Array.isArray(res)).toBe(true)
  })
})

describe.skipIf(!ON || !KEY)("Tiramisu: issue → postpone → revoke", () => {
  it("round-trips a notice through every state", async (ctx) => {
    const r = publicReader()
    const w = issuerWallet(KEY as Hex)
    const balance = await r.getBalance({ address: w.account.address })
    if (balance === 0n) {
      console.warn(`skipped: ${w.account.address} has no GLM yet (fund it at hub.arkiv.network/faucet)`)
      ctx.skip()
    }
    const body = `ASLI INTEGRATION TEST ${Date.now()}\nSynthetic notice, safe to ignore.`
    const issued = await issueNotice(w, {
      codePrefix: "TEST",
      title: "Integration test",
      body,
      category: "general",
      lang: "en",
      validUntil: new Date(Date.now() + 6 * 3600_000),
    })
    const mine = await noticesOfIssuer(r, w.account.address)
    expect(mine.some((n) => n.key === issued.entityKey)).toBe(true)

    await postponeNotice(w, {
      noticeKey: issued.entityKey,
      newValidUntil: new Date(Date.now() + 12 * 3600_000),
      reason: "integration test",
    })
    expect((await amendmentsOf(r, issued.entityKey)).length).toBe(1)

    await revokeNotice(w, {
      noticeKey: issued.entityKey,
      textHash: issued.textHash,
      code: issued.code,
      title: "Integration test",
      reason: "integration test",
    })
    expect(await noticesByCode(r, issued.code)).toHaveLength(0)
    expect((await revocationsByCode(r, issued.code)).length).toBe(1)
  })

  it("verifies seeded demo data against the deployed domain proof", async () => {
    const base = process.env.ASLI_BASE_DOMAIN
    if (!base) return
    const v = await verify(publicReader(), { text: "nothing like this exists anywhere 42" }, proveDomain, {
      historical: false,
    })
    expect(v.status).toBe("unknown")
  })
})
