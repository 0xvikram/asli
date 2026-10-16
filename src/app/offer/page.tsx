"use client"

import Link from "next/link"
import { useState } from "react"
import { browserReader, cachedProve } from "@/components/arkivBrowser"
import { hashFileBytes } from "@/lib/normalize"
import { fileToBytes, formatDay, shortAddress } from "@/lib/ui"
import { verifyOffer, type OfferVerdict } from "@/lib/verify"

export default function OfferPage() {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<OfferVerdict | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (!file) return
    setBusy(true)
    setError(null)
    setVerdict(null)
    try {
      const h = hashFileBytes(await fileToBytes(file))
      setHash(h)
      setVerdict(await verifyOffer(browserReader(), h, cachedProve))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack narrow">
      <div>
        <span className="eyebrow">For job seekers</span>
        <h1>Got an offer letter? Check it before you pay anything.</h1>
        <p className="lede">
          Fake offer letters are how most job scams in India start: a real company&apos;s logo, then a &quot;training
          fee&quot;. Check the PDF against what the employer itself registered.
          <br />
          <span className="hi">नौकरी का ऑफ़र लेटर असली है या नहीं, यहाँ जाँचें।</span>
        </p>
      </div>

      <div className="card">
        <div className="field">
          <div className="dropzone">
            <label htmlFor="f" style={{ marginBottom: 0 }}>
              Choose your offer letter PDF. Only its fingerprint is checked; the file and your name never leave your device.
            </label>
            <input id="f" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <p className="hint">
            No letter handy? Download Acme&apos;s{" "}
            <a href="/samples/acme-offer-letter.pdf" download>
              real offer letter
            </a>{" "}
            or a{" "}
            <a href="/samples/acme-offer-letter-edited.pdf" download>
              doctored copy
            </a>{" "}
            and check each.
          </p>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn big" disabled={!file || busy} onClick={run}>
            {busy ? "Checking…" : "Check offer letter"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      {verdict?.status === "real" && (
        <section className="verdict good">
          <div className="headline">Issued by {verdict.issuer.domain}</div>
          <div className="hi">यह ऑफ़र लेटर असली है</div>
          <p>
            {verdict.offer.roleTitle}, {verdict.offer.location}. The offer is open until{" "}
            {formatDay(verdict.offer.validUntil)}. A genuine employer never asks you to pay to join.
          </p>
          <p className="meta">
            Registered by <Link href={`/issuer/${verdict.issuer.creator}`}>{verdict.issuer.name}</Link> (
            {shortAddress(verdict.issuer.creator)}), which {verdict.issuer.domain} vouches for.
          </p>
        </section>
      )}
      {verdict?.status === "unverified-issuer" && (
        <section className="verdict bad">
          <div className="headline">Registered, but not by the employer</div>
          <div className="hi">यह किसी अनधिकृत स्रोत से है</div>
          <p>{verdict.reason}</p>
        </section>
      )}
      {verdict?.status === "unknown" && (
        <section className="verdict neutral">
          <div className="headline">No employer on Asli registered this exact file</div>
          <div className="hi">किसी कंपनी ने यह फ़ाइल दर्ज नहीं की</div>
          <p>
            Either the employer does not use Asli, the file was edited, or it expired (offers drop off Arkiv after their
            acceptance deadline). Confirm with the company&apos;s official HR email before paying or sharing documents.
          </p>
        </section>
      )}
      {hash && (
        <p className="meta">
          File fingerprint (keccak256): <code>{hash}</code>
        </p>
      )}

      <div className="card">
        <h3>What Arkiv stores for an offer</h3>
        <p className="meta" style={{ fontSize: 14 }}>
          The file&apos;s fingerprint, a role code, the role title and city, and the acceptance deadline as the
          entity&apos;s lifetime. Never the candidate&apos;s name, phone or email, not even hashed: hashes of phone numbers
          can be reversed.
        </p>
      </div>
    </div>
  )
}
