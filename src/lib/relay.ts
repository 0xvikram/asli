import { RateLimiter } from "./ratelimit"

/**
 * Asli's read relay. The browser reads Arkiv directly; only when Arkiv answers that the
 * anonymous query budget is used up (friction.md #8) does it retry through here, where the
 * server adds Asli's access key. Read methods only: the relay can never write, and it never
 * holds a signing key.
 */
export const RELAY_METHODS = ["arkiv_query", "arkiv_getBlockTiming", "eth_chainId", "eth_blockNumber"] as const
export const RELAY_MAX_BODY = 16_384

/** 60 relayed calls a minute per visitor, 5,000 a day for the whole site. */
export const relayLimiter = new RateLimiter(60, 60_000, 5_000)

export type RelayDeps = {
  limiter: RateLimiter
  forward: (body: string) => Promise<{ status: number; text: string }>
}

type RpcCall = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }

function rpcError(id: unknown, status: number, message: string) {
  return { status, body: JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code: -32600, message } }) }
}

export async function handleRelay(raw: string, ip: string, deps: RelayDeps): Promise<{ status: number; body: string }> {
  if (raw.length > RELAY_MAX_BODY) return rpcError(null, 413, "request too large")
  let call: RpcCall
  try {
    call = JSON.parse(raw) as RpcCall
  } catch {
    return rpcError(null, 400, "invalid JSON")
  }
  if (Array.isArray(call) || typeof call !== "object" || call === null)
    return rpcError(null, 400, "one call per request")
  if (typeof call.method !== "string" || !(RELAY_METHODS as readonly string[]).includes(call.method)) {
    return rpcError(call.id, 403, "method not allowed through the relay")
  }
  const allowed = deps.limiter.take(ip)
  if (!allowed.ok) return rpcError(call.id, 429, "relay limit reached, try again shortly")
  const res = await deps.forward(
    JSON.stringify({ jsonrpc: "2.0", id: call.id ?? 1, method: call.method, params: call.params ?? [] }),
  )
  return { status: res.status, body: res.text }
}
