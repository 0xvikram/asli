"use client"

import { publicReader } from "@/lib/arkiv/client"
import { proveDomain, type ProofResult } from "@/lib/domainProof"

let reader: ReturnType<typeof publicReader> | undefined

/** One shared, credential-free client for the browser. */
export function browserReader() {
  reader ??= publicReader()
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
