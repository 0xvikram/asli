"use client"

import Link from "next/link"
import { explorerAddress } from "@/lib/arkiv/client"
import type { DiffOp } from "@/lib/match"
import { formatDate, formatDay, shortAddress, verdictCopy } from "@/lib/ui"
import type { Verdict } from "@/lib/verify"

const ICON = { good: "✓", bad: "✕", warn: "!", neutral: "?" } as const

export function DiffView({ ops }: { ops: DiffOp[] }) {
  return (
    <div className="diff" aria-label="Differences from the real notice">
      {ops.map((op, i) => {
        const words = op.words.join(" ")
        if (op.type === "same") return <span key={i}>{words} </span>
        if (op.type === "removed")
          return (
            <span key={i}>
              <del title="In the real notice">{words}</del>{" "}
            </span>
          )
        return (
          <span key={i}>
            <ins title="Added in the forward">{words}</ins>{" "}
          </span>
        )
      })}
    </div>
  )
}

export function VerdictCard({ verdict, fromOcr }: { verdict: Verdict; fromOcr?: boolean }) {
  const copy = verdictCopy(verdict, { fromOcr })
  const issuer = "issuer" in verdict ? verdict.issuer : undefined
  const notice = "notice" in verdict ? verdict.notice : undefined

  return (
    <section className={`verdict ${copy.tone}`} aria-live="polite">
      <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <div className="icon" aria-hidden>
          {ICON[copy.tone]}
        </div>
        <div className="stack" style={{ flex: 1, minWidth: 0 }}>
          <div>
            <div className="headline">{copy.headline}</div>
            <div className="hi">{copy.hindi}</div>
          </div>
          {copy.detail && <p style={{ margin: 0 }}>{copy.detail}</p>}

          {verdict.status === "altered" && verdict.changes.length > 0 && (
            <div>
              <strong>What was changed</strong>
              <ul className="changes">
                {verdict.changes.slice(0, 6).map((c, i) => (
                  <li key={i}>
                    {c.original ? (
                      <>
                        Real notice says <del>{c.original}</del>
                      </>
                    ) : (
                      "Nothing here in the real notice"
                    )}
                    {" → "}
                    {c.forwarded ? (
                      <>
                        forward says <ins>{c.forwarded}</ins>
                      </>
                    ) : (
                      "removed in the forward"
                    )}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 12 }}>
                <DiffView ops={verdict.ops} />
              </div>
            </div>
          )}

          {notice && verdict.status !== "unverified-issuer" && (
            <details>
              <summary>Read the real notice ({notice.code})</summary>
              <p className="notice-body">{notice.body}</p>
            </details>
          )}

          {verdict.status === "real" && verdict.amendments.length > 0 && (
            <p className="meta" style={{ margin: 0 }}>
              Postponed on {formatDate(verdict.amendments[0].issuedAt)} by the issuer. The notice&apos;s lifetime on
              Arkiv was extended in the same transaction as this explanation.
            </p>
          )}

          {issuer && (
            <p className="meta" style={{ margin: 0 }}>
              Issuer: <Link href={`/issuer/${issuer.creator}`}>{issuer.name}</Link> · domain{" "}
              <strong>{issuer.domain}</strong> vouches for wallet{" "}
              <a href={explorerAddress(issuer.creator)} target="_blank" rel="noreferrer">
                {shortAddress(issuer.creator)}
              </a>{" "}
              via {issuer.proof.method === "dns-txt" ? "DNS TXT" : "/.well-known/asli-issuer.json"}
              {notice && <> · issued {formatDay(notice.issuedAt)}</>}
            </p>
          )}
          {verdict.status === "unverified-issuer" && (
            <p className="meta" style={{ margin: 0 }}>
              Published by wallet{" "}
              <a href={explorerAddress(verdict.notice.creator)} target="_blank" rel="noreferrer">
                {shortAddress(verdict.notice.creator)}
              </a>
              . Anyone can write to Arkiv; only a domain&apos;s own proof makes a wallet an issuer.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
