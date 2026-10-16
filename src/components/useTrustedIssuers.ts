"use client"

import { useEffect, useState } from "react"
import { browserReader, cachedProve } from "./arkivBrowser"
import { listIssuers, type IssuerRecord } from "@/lib/arkiv/read"
import type { ProofResult } from "@/lib/domainProof"

export type IssuerWithProof = IssuerRecord & { proof: ProofResult }

/** Every issuer entity on Arkiv, each with the browser's own domain check. */
export function useIssuers() {
  const [issuers, setIssuers] = useState<IssuerWithProof[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const list = await listIssuers(browserReader())
        const withProof = await Promise.all(list.map(async (i) => ({ ...i, proof: await cachedProve(i.domain, i.creator) })))
        if (live) setIssuers(withProof)
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "could not reach Arkiv")
      }
    })()
    return () => {
      live = false
    }
  }, [])
  return { issuers, error }
}
