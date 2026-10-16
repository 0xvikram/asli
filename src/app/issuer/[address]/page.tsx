"use client"

import { use, useEffect, useState } from "react"
import { isAddress, type Hex } from "viem"
import { browserReader } from "@/components/arkivBrowser"
import { useIssuers } from "@/components/useTrustedIssuers"
import { explorerAddress } from "@/lib/arkiv/client"
import { noticesOfIssuer, type NoticeRecord } from "@/lib/arkiv/read"
import { WELL_KNOWN_PATH } from "@/lib/domainProof"
import { formatDay, timeLeft } from "@/lib/ui"

export default function IssuerPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params)
  const { issuers } = useIssuers()
  const [notices, setNotices] = useState<NoticeRecord[] | null>(null)
  const valid = isAddress(address)
  const claims = (issuers ?? []).filter((i) => i.creator.toLowerCase() === address.toLowerCase())
  const verified = claims.find((c) => c.proof.ok)

  useEffect(() => {
    if (!valid) return
    noticesOfIssuer(browserReader(), address as Hex).then(setNotices, () => setNotices([]))
  }, [address, valid])

  if (!valid) return <p className="error">That is not a wallet address.</p>

  return (
    <div className="stack narrow">
      <div>
        <h1>{verified?.name ?? claims[0]?.name ?? "Unknown publisher"}</h1>
        <p className="meta">
          Wallet{" "}
          <a href={explorerAddress(address)} target="_blank" rel="noreferrer" className="mono">
            {address}
          </a>
        </p>
      </div>

      <div className="card">
        <h3>Domain proof</h3>
        {issuers === null ? (
          <p className="meta">Checking…</p>
        ) : claims.length === 0 ? (
          <p className="meta">This wallet has not registered as an issuer on Asli.</p>
        ) : (
          <ul className="list">
            {claims.map((c) => (
              <li key={c.key}>
                <span className={`badge ${c.proof.ok ? "good" : "bad"}`}>{c.proof.ok ? "verified" : "not verified"}</span>{" "}
                claims <strong>{c.domain}</strong>
                <div className="meta">
                  {c.proof.ok ? (
                    <>
                      {c.domain} lists this wallet in{" "}
                      {c.proof.method === "dns-txt" ? (
                        "a DNS TXT record"
                      ) : (
                        <a href={`https://${c.domain}${WELL_KNOWN_PATH}`} target="_blank" rel="noreferrer">
                          {WELL_KNOWN_PATH}
                        </a>
                      )}
                      . Checked by your browser just now.
                    </>
                  ) : (
                    <>Not listed: {c.proof.reason}</>
                  )}
                </div>
                {c.about && <p style={{ margin: "6px 0 0" }}>{c.about}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Notices in force</h3>
        <p className="meta">
          Query: <code>{`app = str('asli_v1') AND kind = str('notice') AND $creator = addr(${address.slice(0, 8)}…)`}</code>
        </p>
        {notices === null ? (
          <p className="meta">Loading…</p>
        ) : notices.length === 0 ? (
          <p className="meta">None right now.</p>
        ) : (
          <ul className="list">
            {notices.map((n) => (
              <li key={n.key}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{n.title}</strong>
                  <span className="badge good">{timeLeft(n.validUntil)}</span>
                </div>
                <div className="meta">
                  <code>{n.code}</code> · {n.category} · issued {formatDay(n.issuedAt)} · valid till {formatDay(n.validUntil)}
                </div>
                <details>
                  <summary className="meta">Full text</summary>
                  <p className="notice-body">{n.body}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
