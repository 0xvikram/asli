"use client"

import { useState } from "react"
import type { Hex } from "viem"
import { browserReader, cachedProve } from "@/components/arkivBrowser"
import { VerdictCard } from "@/components/VerdictCard"
import { hashFileBytes } from "@/lib/normalize"
import { fileToBytes } from "@/lib/ui"
import { verify, type Verdict } from "@/lib/verify"
import { verifyExamples } from "@/lib/demoData"

type Mode = "text" | "code" | "pdf" | "image"

export default function VerifyPage() {
  const [mode, setMode] = useState<Mode>("text")
  const [text, setText] = useState("")
  const [code, setCode] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [fromOcr, setFromOcr] = useState(false)
  const [ocrText, setOcrText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setError(null)
    setVerdict(null)
    setOcrText(null)
    try {
      if (mode === "text") {
        setBusy("Checking Arkiv…")
        setFromOcr(false)
        setVerdict(await verify(browserReader(), { text }, cachedProve))
      } else if (mode === "code") {
        setBusy("Looking up the code…")
        setFromOcr(false)
        setVerdict(await verify(browserReader(), { code }, cachedProve))
      } else if (mode === "pdf") {
        if (!file) throw new Error("Choose a PDF first")
        setBusy("Hashing the file in your browser…")
        const fileHash = hashFileBytes(await fileToBytes(file)) as Hex
        setBusy("Checking Arkiv…")
        setFromOcr(false)
        setVerdict(await verify(browserReader(), { fileHash }, cachedProve))
      } else {
        if (!file) throw new Error("Choose a screenshot first")
        setBusy("Reading the screenshot (first time downloads the reader, ~10 MB)…")
        const { recognize } = await import("@/components/ocr")
        const read = await recognize(file, (p) => setBusy(`Reading the screenshot… ${Math.round(p * 100)}%`))
        setOcrText(read)
        setBusy("Checking Arkiv…")
        setFromOcr(true)
        setVerdict(await verify(browserReader(), { text: read }, cachedProve))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(null)
    }
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: "text", label: "Paste text" },
    { id: "image", label: "Screenshot" },
    { id: "pdf", label: "PDF" },
    { id: "code", label: "Notice code" },
  ]

  return (
    <div className="stack">
      <div>
        <h1>Is this notice real?</h1>
        <p className="lede">
          Paste a forwarded school, board, university or exam notice. Asli checks it against what the institution
          itself published on Arkiv, and shows exactly what was changed if it was doctored.
          <br />
          <span className="hi">व्हाट्सऐप पर आई सूचना पेस्ट करें, हम बताएँगे कि यह असली है या नकली।</span>
        </p>
      </div>

      <div className="card">
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
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {mode === "text" && (
          <div className="field">
            <label htmlFor="t">The notice, exactly as you received it (emoji and *stars* are fine)</label>
            <textarea id="t" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste here…" />
            <div style={{ marginTop: 10 }}>
              <span className="meta">Try the demo data: </span>
              <div className="row" style={{ marginTop: 6, gap: 8 }}>
                {verifyExamples().map((ex) => (
                  <button
                    key={ex.label}
                    className="btn ghost small"
                    title={`Expected: ${ex.expect}`}
                    onClick={() => {
                      setText(ex.text)
                      setVerdict(null)
                    }}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {mode === "code" && (
          <div className="field">
            <label htmlFor="c">The Asli code printed on the notice, e.g. DBSE-26-7K3Q</label>
            <input id="c" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
          </div>
        )}
        {(mode === "pdf" || mode === "image") && (
          <div className="field">
            <label htmlFor="f">
              {mode === "pdf"
                ? "The PDF. It is hashed in your browser and never uploaded."
                : "A screenshot of the notice (English works best; Hindi is best effort). Read in your browser, never uploaded."}
            </label>
            <input
              id="f"
              type="file"
              accept={mode === "pdf" ? "application/pdf" : "image/*"}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={run} disabled={busy !== null}>
            {busy ? "Checking…" : "Check notice"}
          </button>
          {busy && <span className="meta">{busy}</span>}
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      {verdict && <VerdictCard verdict={verdict} fromOcr={fromOcr} />}
      {ocrText && (
        <details className="card">
          <summary>Text read from the screenshot</summary>
          <p className="notice-body">{ocrText}</p>
        </details>
      )}

      <div className="grid2">
        <div className="card">
          <h3>Why you can trust the answer</h3>
          <p className="meta" style={{ fontSize: 14 }}>
            Your browser reads Arkiv directly and checks the institution&apos;s own website for the wallet it publishes
            from. Asli&apos;s server is not involved, so Asli could not fake a &quot;real&quot; even if it wanted to.
          </p>
        </div>
        <div className="card">
          <h3>Why expired notices fail</h3>
          <p className="meta" style={{ fontSize: 14 }}>
            Each notice lives on Arkiv only until its own valid-until date. A postponement extends it on the record; a
            withdrawal deletes it and leaves a public revocation in the same transaction.
          </p>
        </div>
      </div>
    </div>
  )
}
