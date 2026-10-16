"use client"

import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { custom, http } from "viem"
import { RPC_HTTP } from "@/lib/arkiv/client"
import { proveDomain, type ProofResult } from "@/lib/domainProof"

/** After Arkiv says the anonymous budget is used up, stay on the relay this long. */
const RELAY_STICKY_MS = 10 * 60_000
let relayUntil = 0
let relayed = 0

/** How many reads have gone through Asli's relay in this tab. A check compares before and after. */
export const relayedCount = () => relayed

/** Arkiv's 429 for the anonymous budget (friction.md #8), wherever viem wrapped it. */
function isBudgetLimited(e: unknown): boolean {
  for (let x = e as { status?: number; cause?: unknown } | undefined, i = 0; x && i < 6; x = x.cause as typeof x, i++) {
    if (x.status === 429) return true
  }
  return false
}

function makeReader() {
  const direct = http(RPC_HTTP, { retryCount: 0 })({ chain: tiramisu })
  const relay = http(`${window.location.origin}/api/arkiv`, { retryCount: 1 })({ chain: tiramisu })
  const viaRelay = (args: Parameters<typeof direct.request>[0]) => {
    relayed++
    return relay.request(args)
  }
  return createPublicClient({
    chain: tiramisu,
    transport: custom(
      {
        async request(args) {
          if (Date.now() < relayUntil) return viaRelay(args)
          try {
            return await direct.request(args)
          } catch (e) {
            if (!isBudgetLimited(e)) throw e
            relayUntil = Date.now() + RELAY_STICKY_MS
            return viaRelay(args)
          }
        },
      },
      { retryCount: 0 },
    ),
  })
}

let reader: ReturnType<typeof makeReader> | undefined

/**
 * One shared client for the browser. It reads Arkiv's public RPC directly, with no credentials,
 * so Asli's server is not in the path. Only if Arkiv refuses because the anonymous query budget
 * for this network is used up does it fall back to Asli's read relay, and the page says so.
 */
export function browserReader() {
  reader ??= makeReader()
  return reader
}

const proofCache = new Map<string, Promise<ProofResult>>()

/** Domain proofs are fetched by the browser itself, straight from each issuer's domain. */
export function cachedProve(domain: string, address: string) {
  const k = `${domain}|${address.toLowerCase()}`
  let p = proofCache.get(k)
  if (!p) {
    p = proveDomain(domain, address)
    proofCache.set(k, p)
  }
  return p
}
