"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import type { Hex } from "viem"
import { browserReader } from "@/components/arkivBrowser"
import { browserWallet, connectWallet } from "@/components/metamask"
import { explorerAddress, explorerTx, type Writer } from "@/lib/arkiv/client"
import { noticesOfIssuer, type NoticeRecord } from "@/lib/arkiv/read"
import { issueNotice, registerIssuer } from "@/lib/arkiv/write"
import { WELL_KNOWN_PATH } from "@/lib/domainProof"
import { hashFileBytes } from "@/lib/normalize"
import { NOTICE_CATEGORIES } from "@/lib/schema"
import { fileToBytes, formatDay, shortAddress, timeLeft, toLocalInput } from "@/lib/ui"

const ISSUERS = [
  { id: "board", name: "Demo Board of Secondary Education", address: "0x2043DB00a32bd8C4804227B72b97438af39a7De6" },
  { id: "univ", name: "Pune Demo University", address: "0x94a9C31a9dcdd7EBD44b9c4d7511a27149ec6F81" },
  { id: "employer", name: "Acme Infotech (offer letters)", address: "0x51Ad2Cf42bc81C254bcdd078e15c75890532905f" },
] as const

type Result = { ok: boolean; message: string; tx?: string; code?: string }

async function call(action: string, body: Record<string, unknown>): Promise<Result & Record<string, unknown>> {
  const res = await fetch(`/api/issuer/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) return { ok: false, message: String(json.error ?? `HTTP ${res.status}`) }
  return { ok: true, message: "Done", tx: json.txHash as string | undefined, code: json.code as string | undefined, ...json }
}

const days = (n: number) => new Date(Date.now() + n * 86_400_000)

export default function PublishPage() {
  const [issuer, setIssuer] = useState<(typeof ISSUERS)[number]["id"]>("board")
  const active = ISSUERS.find((i) => i.id === issuer)!
  const [mine, setMine] = useState<NoticeRecord[] | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    setMine(null)
    noticesOfIssuer(browserReader(), active.address as Hex).then(setMine, () => setMine([]))
  }, [active.address])
  useEffect(refresh, [refresh])

  async function act(action: string, body: Record<string, unknown>) {
    setBusy(true)
    setResult(null)
    const r = await call(action, { issuer, ...body })
    setResult(r)
    setBusy(false)
    if (r.ok) setTimeout(refresh, 2500)
  }

  return (
    <div className="stack">
      <div>
        <h1>Publish as an institution</h1>
        <p className="lede">
          The playground lets you act as one of three fictional issuers without a wallet. The server signs with that
          issuer&apos;s own key, so everything you publish is authored on Arkiv by the issuer&apos;s wallet, exactly as if
          the institution signed it. Playground notices last at most 7 days.
        </p>
      </div>

      <div className="card">
        <label htmlFor="iss">Act as</label>
        <select id="iss" value={issuer} onChange={(e) => setIssuer(e.target.value as typeof issuer)}>
          {ISSUERS.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <p className="meta">
          Wallet{" "}
          <a href={explorerAddress(active.address)} target="_blank" rel="noreferrer">
            {shortAddress(active.address)}
          </a>{" "}
          · <Link href={`/issuer/${active.address}`}>issuer page</Link>
        </p>
      </div>

      {issuer === "employer" ? <OfferForm busy={busy} onSubmit={(b) => act("offer", b)} /> : <NoticeForm busy={busy} onSubmit={(b) => act("issue", b)} />}

      {result && (
        <p className={result.ok ? "ok" : "error"}>
          {result.ok ? (
            <>
              Published{result.code && <> with code <code>{result.code}</code></>}.{" "}
              {result.tx && (
                <a href={explorerTx(result.tx)} target="_blank" rel="noreferrer">
                  View transaction
                </a>
              )}
            </>
          ) : (
            result.message
          )}
        </p>
      )}

      {issuer !== "employer" && (
        <div className="card">
          <h3>Notices in force from {active.name}</h3>
          {mine === null ? (
            <p className="meta">Loading…</p>
          ) : mine.length === 0 ? (
            <p className="meta">None yet.</p>
          ) : (
            <ul className="list">
              {mine.map((n) => (
                <li key={n.key}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{n.title}</strong>
                    <span className="badge good">{timeLeft(n.validUntil)}</span>
                  </div>
                  <div className="meta">
                    <code>{n.code}</code> · valid till {formatDay(n.validUntil)}
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button
                      className="btn ghost small"
                      disabled={busy}
                      onClick={() =>
                        act("postpone", {
                          noticeKey: n.key,
                          newValidUntil: new Date(Math.min(n.validUntil + 2 * 86_400_000, days(7).getTime() - 60_000)).toISOString(),
                          reason: "Postponed by the issuer (playground)",
                        })
                      }
                    >
                      Postpone 2 days
                    </button>
                    <button
                      className="btn ghost small"
                      disabled={busy}
                      onClick={() => act("revoke", { noticeKey: n.key, reason: "Withdrawn by the issuer (playground)" })}
                    >
                      Withdraw
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <OwnWallet />
    </div>
  )
}

function NoticeForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [title, setTitle] = useState("Holiday on account of local elections")
  const [body, setBody] = useState(
    "The institution will remain closed on the day of local body elections. Classes will resume the next working day. Students must carry their ID cards on return.",
  )
  const [category, setCategory] = useState("holiday")
  const [until, setUntil] = useState(() => toLocalInput(days(3)))
  return (
    <div className="card">
      <h3>Issue a notice</h3>
      <div className="field">
        <label htmlFor="ti">Title (display only)</label>
        <input id="ti" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor="bo">Full notice text, as people will forward it</label>
        <textarea id="bo" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="ca">Category</label>
          <select id="ca" value={category} onChange={(e) => setCategory(e.target.value)}>
            {NOTICE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="un">Valid until (becomes its lifetime on Arkiv)</label>
          <input id="un" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button
          className="btn"
          disabled={busy}
          onClick={() => onSubmit({ title, body, category, lang: "en", validUntil: new Date(until).toISOString() })}
        >
          {busy ? "Publishing…" : "Publish notice"}
        </button>
      </div>
    </div>
  )
}

function OfferForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [fileHash, setFileHash] = useState<string | null>(null)
  const [roleTitle, setRoleTitle] = useState("Graduate Software Engineer")
  const [roleCode, setRoleCode] = useState("ACME-GSE-26")
  const [location, setLocation] = useState("Pune")
  const [until, setUntil] = useState(() => toLocalInput(days(6)))
  return (
    <div className="card">
      <h3>Register an offer letter</h3>
      <div className="field">
        <label htmlFor="pdf">The offer letter PDF (only its fingerprint is sent)</label>
        <input
          id="pdf"
          type="file"
          accept="application/pdf"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            setFileHash(f ? hashFileBytes(await fileToBytes(f)) : null)
          }}
        />
        {fileHash && <p className="meta mono">{fileHash}</p>}
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="rt">Role</label>
          <input id="rt" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rc">Role code</label>
          <input id="rc" value={roleCode} onChange={(e) => setRoleCode(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="lo">City</label>
          <input id="lo" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ou">Accept by</label>
          <input id="ou" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button
          className="btn"
          disabled={busy || !fileHash}
          onClick={() => onSubmit({ fileHash, roleTitle, roleCode, location, validUntil: new Date(until).toISOString() })}
        >
          {busy ? "Registering…" : "Register offer"}
        </button>
      </div>
    </div>
  )
}

/** The real path for an institution: sign with its own wallet in the browser. */
function OwnWallet() {
  const [address, setAddress] = useState<Hex | null>(null)
  const [domain, setDomain] = useState("")
  const [name, setName] = useState("")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [msg, setMsg] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: (w: Writer) => Promise<Result>) {
    if (!address) return
    setBusy(true)
    setMsg(null)
    try {
      setMsg(await fn(browserWallet(address) as unknown as Writer))
    } catch (e) {
      setMsg({ ok: false, message: e instanceof Error ? e.message.split("\n")[0] : "failed" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card stack">
      <div>
        <h3>Use your own wallet (MetaMask)</h3>
        <p className="meta" style={{ fontSize: 14 }}>
          This is how a real institution would publish: its own wallet signs, so its address is the permanent author.
          Anyone can register a name here, but it only shows as verified once the domain lists the wallet in{" "}
          <code>{WELL_KNOWN_PATH}</code> or a DNS TXT record <code>_asli.yourdomain → asli-issuer=0x…</code>. You need
          test GLM from the <a href="https://hub.arkiv.network/faucet">Arkiv faucet</a>.
        </p>
      </div>
      {!address ? (
        <div>
          <button
            className="btn ghost"
            onClick={async () => {
              try {
                setAddress(await connectWallet())
              } catch (e) {
                setMsg({ ok: false, message: e instanceof Error ? e.message : "could not connect" })
              }
            }}
          >
            Connect wallet
          </button>
        </div>
      ) : (
        <>
          <p className="meta">
            Connected <span className="mono">{shortAddress(address)}</span> on Tiramisu ·{" "}
            <Link href={`/issuer/${address}`}>your issuer page</Link>
          </p>
          <div className="grid2">
            <div className="field">
              <label htmlFor="n">Institution name</label>
              <input id="n" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="d">Its domain</label>
              <input id="d" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.edu.in" />
            </div>
          </div>
          <div>
            <button
              className="btn ghost"
              disabled={busy || !name || !domain}
              onClick={() =>
                run(async (w) => {
                  const r = await registerIssuer(w, { name, domain, category: "university", about: "Registered from the Asli console." })
                  return { ok: true, message: "Registered", tx: r.txHash }
                })
              }
            >
              Register as issuer
            </button>
          </div>
          <div className="field">
            <label htmlFor="t2">Notice title</label>
            <input id="t2" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="b2">Notice text</label>
            <textarea id="b2" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div>
            <button
              className="btn"
              disabled={busy || !title || body.trim().length < 20}
              onClick={() =>
                run(async (w) => {
                  const r = await issueNotice(w, {
                    codePrefix: "OWN",
                    title,
                    body,
                    category: "general",
                    lang: "en",
                    validUntil: days(3),
                  })
                  return { ok: true, message: "Published", tx: r.txHash, code: r.code }
                })
              }
            >
              Sign and publish (3 days)
            </button>
          </div>
        </>
      )}
      {msg && (
        <p className={msg.ok ? "ok" : "error"}>
          {msg.ok ? `${msg.message}${msg.code ? ` with code ${msg.code}` : ""}. ` : msg.message}
          {msg.tx && (
            <a href={explorerTx(msg.tx)} target="_blank" rel="noreferrer">
              View transaction
            </a>
          )}
        </p>
      )}
    </div>
  )
}
