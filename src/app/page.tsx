"use client"

import Link from "next/link"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import type { Hex } from "viem"
import { browserReader, cachedProve, relayedCount } from "@/components/arkivBrowser"
import { InstLogo } from "@/components/Brand"
import { useIssuers } from "@/components/useTrustedIssuers"
import { VerdictCard } from "@/components/VerdictCard"
import { hashFileBytes } from "@/lib/normalize"
import { ARKIV_BUSY, CHECK_TIMEOUT_MS, fileToBytes, withTimeout } from "@/lib/ui"
import { verify, type Verdict, type VerifyInput } from "@/lib/verify"
import { verifyExamples } from "@/lib/demoData"
import { STATS } from "@/lib/stats"

type Mode = "text" | "code" | "pdf" | "image"

export default function VerifyPage() {
  const [mode, setMode] = useState<Mode>("text")
  const [text, setText] = useState("")
  const [code, setCode] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [fromOcr, setFromOcr] = useState(false)
  const [viaRelay, setViaRelay] = useState(false)
  const [ocrText, setOcrText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const examples = useMemo(verifyExamples, [])

  async function check(input: VerifyInput, label: string, ocr = false) {
    setBusy(label)
    setFromOcr(ocr)
    const before = relayedCount()
    const v = await withTimeout(verify(browserReader(), input, cachedProve), CHECK_TIMEOUT_MS, ARKIV_BUSY)
    setViaRelay(relayedCount() > before)
    setVerdict(v)
  }

  async function run(override?: { mode: Mode; value: string }) {
    setError(null)
    setVerdict(null)
    setOcrText(null)
    const m = override?.mode ?? mode
    try {
      if (m === "text") {
        await check({ text: override?.value ?? text }, "Searching Arkiv for this notice…")
      } else if (m === "code") {
        await check({ code: override?.value ?? code }, "Looking up the code on Arkiv…")
      } else if (m === "pdf") {
        if (!file) throw new Error("Choose a PDF first")
        setBusy("Fingerprinting the file in your browser…")
        const fileHash = hashFileBytes(await fileToBytes(file)) as Hex
        await check({ fileHash }, "Searching Arkiv for this file…")
      } else {
        if (!file) throw new Error("Choose a screenshot first")
        setBusy("Reading the screenshot (the first time downloads the reader, about 10 MB)…")
        const { recognize } = await import("@/components/ocr")
        const read = await recognize(file, (p) => setBusy(`Reading the screenshot… ${Math.round(p * 100)}%`))
        setOcrText(read)
        await check({ text: read }, "Searching Arkiv for this notice…", true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  // Bring the answer into view once it has rendered.
  useEffect(() => {
    if (verdict) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [verdict])

  // A shared link like /?code=DBSE-26-2H96 opens straight to the answer.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("code")
    if (c) {
      setMode("code")
      setCode(c)
      void run({ mode: "code", value: c })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tabs: { id: Mode; label: string; short: string }[] = [
    { id: "text", label: "Paste text", short: "Text" },
    { id: "image", label: "Screenshot", short: "Screenshot" },
    { id: "pdf", label: "PDF", short: "PDF" },
    { id: "code", label: "Notice code", short: "Code" },
  ]

  return (
    <div className="home">
      <section className="blue-hero">
        <div className="hero-tiles" aria-hidden>
          <span>Asli असली Asli असली Asli असली</span>
          <span>Nakli नकली Nakli नकली Nakli नकली</span>
          <span>Asli असली Asli असली Asli असली</span>
          <span>Nakli नकली Nakli नकली Nakli नकली</span>
        </div>
        <div className="wrap">
          <h1 className="hero-title">
            {["Check", "a", "notice", "before", "you"].map((w, i) => (
              <Fragment key={w}>
                <span className="w" style={{ animationDelay: `${i * 70}ms` }}>
                  {w}
                </span>{" "}
              </Fragment>
            ))}
            <span className="w o" style={{ animationDelay: "380ms" }}>
              forward
            </span>{" "}
            <span className="w o" style={{ animationDelay: "450ms" }}>
              it.
            </span>
          </h1>
          <p className="hero-sub">Paste a WhatsApp forward. See if it&apos;s real in seconds.</p>

          <div className="stickers">
            {STATS.map((st, i) => (
              <a
                key={st.value}
                className="sticker"
                href={st.url}
                target="_blank"
                rel="noreferrer"
                style={{ animationDelay: `${600 + i * 110}ms` }}
              >
                <span className="big">{st.value}</span>
                <span className="what">{st.label}</span>
                <span className="src">Source: {st.source} ↗</span>
              </a>
            ))}
          </div>

          <div className="hero">
            <div className="stack">
              <div className="card verify-card">
                <div className="tabs" role="tablist">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      className="tab"
                      role="tab"
                      aria-selected={mode === t.id}
                      onClick={() => {
                        setMode(t.id)
                        setFile(null)
                        setVerdict(null)
                        setError(null)
                      }}
                    >
                      <span className="long">{t.label}</span>
                      <span className="short">{t.short}</span>
                    </button>
                  ))}
                </div>

                {mode === "text" && (
                  <div className="field">
                    <label htmlFor="t">The notice, exactly as you received it. Emoji and *stars* are fine.</label>
                    <textarea
                      id="t"
                      value={text}
                      onChange={(e) => {
                        setText(e.target.value)
                        setPicked(null)
                      }}
                      placeholder="Paste the forwarded message here…"
                    />
                  </div>
                )}
                {mode === "code" && (
                  <div className="field">
                    <label htmlFor="c">The Asli code printed at the bottom of the notice</label>
                    <input
                      id="c"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      autoCapitalize="characters"
                      placeholder="e.g. DBSE-26-2H96"
                    />
                    <p className="hint">
                      Try{" "}
                      <button className="linkish" onClick={() => setCode("DBSE-26-2H96")}>
                        DBSE-26-2H96
                      </button>
                      . Spaces and lowercase are fine.
                    </p>
                  </div>
                )}
                {(mode === "pdf" || mode === "image") && (
                  <div className="field">
                    <div className="dropzone">
                      <label htmlFor="f" style={{ marginBottom: 0 }}>
                        {mode === "pdf"
                          ? "Choose the PDF. Only its fingerprint is checked; the file never leaves your device."
                          : "Choose a screenshot of the notice. It is read on your device and never uploaded."}
                      </label>
                      <input
                        id="f"
                        type="file"
                        accept={mode === "pdf" ? "application/pdf" : "image/*"}
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                    <p className="hint">
                      {mode === "pdf" ? (
                        <>
                          No PDF handy? Download the board&apos;s{" "}
                          <a href="/samples/dbse-notice-41.pdf" download>
                            sample notice
                          </a>{" "}
                          and check it.
                        </>
                      ) : (
                        "English reads best. Hindi is best effort, so a screenshot that is close but not identical shows as a warning, not a fake."
                      )}
                    </p>
                  </div>
                )}

                <div className="row" style={{ marginTop: 16 }}>
                  <button className="btn big" onClick={() => run()} disabled={busy !== null}>
                    {busy ? (
                      <>
                        <span className="spinner" /> Checking
                      </>
                    ) : (
                      "Check notice"
                    )}
                  </button>
                  {busy && <span className="meta">{busy}</span>}
                </div>
                {error && <p className="error">{error}</p>}
              </div>

              <div ref={resultRef} className="stack" style={{ scrollMarginTop: 130 }}>
                {verdict && <VerdictCard verdict={verdict} fromOcr={fromOcr} viaRelay={viaRelay} />}
                {ocrText && (
                  <details className="card">
                    <summary>Text read from the screenshot</summary>
                    <p className="notice-body">{ocrText}</p>
                  </details>
                )}
              </div>
            </div>

            <aside className="chat" aria-label="Sample forwards">
              <div className="chat-head">
                <span className="avatar" aria-hidden>
                  💬
                </span>
                <div>
                  <div className="title">Forwards from your groups</div>
                  <div className="sub">Tap a message to check it</div>
                </div>
              </div>
              <div className="chat-body">
                <span className="chat-note">Sample messages from the Asli demo institutions</span>
                {examples.map((ex) => (
                  <button
                    key={ex.label}
                    className="bubble"
                    aria-pressed={picked === ex.label}
                    title={`Expected: ${ex.expect}`}
                    disabled={busy !== null}
                    onClick={() => {
                      setMode("text")
                      setText(ex.text)
                      setPicked(ex.label)
                      void run({ mode: "text", value: ex.text })
                    }}
                  >
                    <span className="who">
                      <span>{ex.from}</span>
                      <span style={{ fontWeight: 400, color: "var(--muted)" }}>{ex.group}</span>
                    </span>
                    <span className="fwd">↪ Forwarded</span>
                    <span className="txt">{ex.text.replace(/^Forwarded many times\n/, "")}</span>
                    <span className="foot">
                      <span className="check">Check this →</span>
                      <span>{ex.time}</span>
                    </span>
                  </button>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <div className="ticker" aria-hidden>
        <div className="ticker-track">
          {[0, 1].map((k) => (
            <span key={k}>
              <span>Real ✓</span>
              <span>Fake ✕</span>
              <span>Postponed</span>
              <span>Withdrawn</span>
              <span>Expired</span>
              <span>Impostor</span>
              <span>असली</span>
              <span>नकली</span>
            </span>
          ))}
        </div>
      </div>

      <Institutions />

      <section>
        <p className="section-title">How Asli decides</p>
        <div className="how">
          <div className="card">
            <div className="n">1</div>
            <h3>Institutions sign what they publish</h3>
            <p className="meta" style={{ fontSize: 14 }}>
              Each notice is written to Arkiv from the institution&apos;s own wallet, and its website lists that wallet.
              An impostor can copy the name, not the wallet.
            </p>
          </div>
          <div className="card">
            <div className="n">2</div>
            <h3>Your browser checks it, not us</h3>
            <p className="meta" style={{ fontSize: 14 }}>
              The check reads Arkiv and the institution&apos;s website directly from your device. Asli&apos;s server is
              not involved, so Asli could not fake a &quot;real&quot; even if it wanted to.
            </p>
          </div>
          <div className="card">
            <div className="n">3</div>
            <h3>Notices end when they should</h3>
            <p className="meta" style={{ fontSize: 14 }}>
              A notice lives on Arkiv only until its valid-until date. Postponing extends it; withdrawing removes it and
              leaves a public withdrawal. Old forwards stop passing on their own.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function Institutions() {
  const { issuers } = useIssuers()
  const trusted = (issuers ?? []).filter((i) => i.proof.ok)
  return (
    <section>
      <p className="section-title">Institutions publishing on Asli</p>
      <div className="strip">
        {issuers === null ? (
          <span className="meta">Checking each institution&apos;s website…</span>
        ) : (
          trusted.map((i) => (
            <Link key={i.key} href={`/issuer/${i.creator}`} className="chip-inst">
              <InstLogo name={i.name} address={i.creator} />
              {i.name}
              <span className="tick">✓ {i.domain}</span>
            </Link>
          ))
        )}
        <Link href="/publish" className="chip-inst" style={{ paddingLeft: 12 }}>
          + Publish as your institution
        </Link>
      </div>
    </section>
  )
}
