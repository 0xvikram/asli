"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { explorerAddress } from "@/lib/arkiv/client"
import type { DiffOp } from "@/lib/match"
import { checkSteps, formatDate, shareText, shortAddress, stampText, verdictCopy, type CheckStep } from "@/lib/ui"
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

export function CheckSteps({ steps }: { steps: CheckStep[] }) {
  return (
    <ol className="steps" aria-label="What Asli checked">
      {steps.map((st, i) => (
        <li key={i} className={st.state} style={{ animationDelay: `${i * 160}ms` }}>
          <span className="mark" aria-label={st.state === "pass" ? "passed" : st.state === "fail" ? "failed" : "note"}>
            {st.state === "pass" ? "✓" : st.state === "fail" ? "✕" : "i"}
          </span>
          <span>
            <span className="lbl">{st.label}</span>
            <br />
            <span className="dt">{st.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function CopyReply({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="btn small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 2500)
        } catch {
          setCopied(false)
        }
      }}
    >
      {copied ? "Copied. Paste it in the group" : "Copy a reply for the group"}
    </button>
  )
}

export function VerdictCard({ verdict, fromOcr }: { verdict: Verdict; fromOcr?: boolean }) {
  const copy = verdictCopy(verdict, { fromOcr })
  const issuer = "issuer" in verdict ? verdict.issuer : undefined
  const notice = "notice" in verdict ? verdict.notice : undefined
  const [site, setSite] = useState("https://asli-verify.vercel.app")
  useEffect(() => setSite(window.location.origin), [])
  const stamp = stampText(verdict, { fromOcr })

  return (
    <section className={`verdict ${copy.tone}`} aria-live="polite">
      {stamp && (
        <div className="stamp" aria-hidden>
          {stamp.en}
          <small>{stamp.hi}</small>
        </div>
      )}
      <div className="stack">
        <div className="verdict-head">
          <div className="seal" aria-hidden>
            {ICON[copy.tone]}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="headline">{copy.headline}</div>
            {copy.detail && <p style={{ margin: "8px 0 0" }}>{copy.detail}</p>}
          </div>
        </div>

        {verdict.status === "altered" && verdict.changes.length > 0 && (
          <div className="panel">
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

        <div className="panel">
          <p className="section-title" style={{ marginBottom: 4 }}>
            What we checked
          </p>
          <CheckSteps steps={checkSteps(verdict)} />
        </div>

        {notice && verdict.status !== "unverified-issuer" && (
          <details className="panel">
            <summary>Read the real notice ({notice.code})</summary>
            <p className="notice-body">{notice.body}</p>
          </details>
        )}

        <div className="actions">
          <CopyReply text={shareText(verdict, site, { fromOcr })} />
          {issuer && (
            <Link className="btn ghost small" href={`/issuer/${issuer.creator}`}>
              {issuer.name}
            </Link>
          )}
          {(issuer || notice) && (
            <a
              className="btn ghost small"
              href={explorerAddress(issuer?.creator ?? notice!.creator)}
              target="_blank"
              rel="noreferrer"
            >
              See the author on the block explorer
            </a>
          )}
        </div>
        {issuer && notice && (
          <p className="meta" style={{ margin: 0 }}>
            Wallet {shortAddress(issuer.creator)} · proof via{" "}
            {issuer.proof.method === "dns-txt" ? "DNS TXT" : "/.well-known/asli-issuer.json"} · issued{" "}
            {formatDate(notice.issuedAt)}
          </p>
        )}
      </div>
    </section>
  )
}
