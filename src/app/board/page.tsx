"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import type { Hex } from "viem"
import { browserReader } from "@/components/arkivBrowser"
import { InstLogo } from "@/components/Brand"
import { useIssuers } from "@/components/useTrustedIssuers"
import { publicWatcher } from "@/lib/arkiv/client"
import { noticeByKey, noticesOfIssuer, type NoticeRecord } from "@/lib/arkiv/read"
import { formatDay, timeLeft } from "@/lib/ui"

type Row = NoticeRecord & { issuerName: string; domain: string; flash?: "new" | "extended"; gone?: "revoked" }

/**
 * Every live notice from domain-verified issuers. New notices, postponements and withdrawals
 * arrive over a WebSocket subscription to Arkiv entity events: no refresh, no polling loop.
 */
export default function BoardPage() {
  const { issuers, error } = useIssuers()
  const trusted = useMemo(() => (issuers ?? []).filter((i) => i.proof.ok), [issuers])
  const [rows, setRows] = useState<Row[] | null>(null)
  const [live, setLive] = useState(false)
  const [category, setCategory] = useState("all")
  const [now, setNow] = useState(() => Date.now())
  const trustedRef = useRef(trusted)
  trustedRef.current = trusted

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!issuers) return
    let cancelled = false
    ;(async () => {
      const lists = await Promise.all(
        trusted.map(async (i) =>
          (await noticesOfIssuer(browserReader(), i.creator)).map((n) => ({ ...n, issuerName: i.name, domain: i.domain })),
        ),
      )
      if (!cancelled) setRows(lists.flat().sort((a, b) => b.issuedAt - a.issuedAt))
    })()
    return () => {
      cancelled = true
    }
  }, [issuers, trusted])

  useEffect(() => {
    if (!issuers) return
    const watcher = publicWatcher()
    const issuerOf = (owner: string) => trustedRef.current.find((i) => i.creator.toLowerCase() === owner.toLowerCase())
    const unwatch = watcher.watchEntityEvents({
      onEntityCreated: async (e) => {
        const issuer = issuerOf(e.owner)
        if (!issuer) return
        const n = await noticeByKey(browserReader(), e.entityKey as Hex)
        if (!n) return // an amendment, revocation or offer, not a notice
        setRows((prev) => [
          { ...n, issuerName: issuer.name, domain: issuer.domain, flash: "new" },
          ...(prev ?? []).filter((r) => r.key !== n.key),
        ])
      },
      onExpiryExtended: async (e) => {
        if (!issuerOf(e.owner)) return
        const n = await noticeByKey(browserReader(), e.entityKey as Hex)
        if (!n) return
        setRows((prev) => (prev ?? []).map((r) => (r.key === n.key ? { ...r, ...n, flash: "extended" } : r)))
      },
      onEntityDeleted: (e) => {
        setRows((prev) => (prev ?? []).map((r) => (r.key === e.entityKey ? { ...r, gone: "revoked" } : r)))
      },
      onError: () => setLive(false),
    })
    setLive(true)
    return () => {
      unwatch()
      setLive(false)
    }
  }, [issuers])

  const shown = (rows ?? []).filter((r) => category === "all" || r.category === category)
  const categories = Array.from(new Set((rows ?? []).map((r) => r.category)))

  return (
    <div className="stack">
      <div>
        <span className="eyebrow">Live from Arkiv</span>
        <h1>Every notice in force right now.</h1>
        <p className="lede">
          From every institution whose website vouches for its wallet. New notices, postponements and withdrawals appear
          here the moment they happen, and a notice drops off by itself when its validity ends.
        </p>
        <p className="meta">
          {live ? (
            <>
              <span className="live-dot" />
              Live: listening to Arkiv entity events over WebSocket
            </>
          ) : (
            "Connecting…"
          )}
          {" · "}
          {trusted.length} verified issuer{trusted.length === 1 ? "" : "s"}
          {issuers && issuers.length > trusted.length && <> · {issuers.length - trusted.length} unverified ignored</>}
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      {categories.length > 1 && (
        <div className="tabs" role="tablist">
          {["all", ...categories].map((c) => (
            <button key={c} className="tab" role="tab" aria-selected={category === c} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      <div>
        {rows === null ? (
          <p className="meta">Loading notices from Arkiv…</p>
        ) : shown.length === 0 ? (
          <p className="meta">No live notices right now.</p>
        ) : (
          shown.map((r) => (
            <div key={r.key} className={`notice-card${r.flash ? " flash" : ""}`} style={r.gone ? { opacity: 0.55 } : undefined}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "nowrap" }}>
                <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start", minWidth: 0 }}>
                  <InstLogo name={r.issuerName} address={r.creator} />
                  <div style={{ minWidth: 0 }}>
                    <h3>{r.title}</h3>
                    <p className="meta" style={{ margin: "2px 0 0" }}>
                      <Link href={`/issuer/${r.creator}`}>{r.issuerName}</Link> · <span className="tick">✓ {r.domain}</span>
                    </p>
                  </div>
                </div>
                <span className={`badge ${r.gone ? "bad" : r.flash === "extended" ? "warn" : r.flash === "new" ? "good" : "good"}`} style={{ whiteSpace: "nowrap" }}>
                  {r.gone ? "Withdrawn just now" : r.flash === "extended" ? "Postponed just now" : r.flash === "new" ? "New" : timeLeft(r.validUntil, now)}
                </span>
              </div>
              <p className="meta" style={{ margin: "8px 0 0" }}>
                <code>{r.code}</code> · {r.category} · valid until {formatDay(r.validUntil)} ·{" "}
                <Link href={`/?code=${r.code}`}>Verify</Link>
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
