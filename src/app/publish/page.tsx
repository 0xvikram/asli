"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import type { Hex } from "viem"
import { browserReader } from "@/components/arkivBrowser"
import { InstLogo } from "@/components/Brand"
import { browserWallet, connectWallet } from "@/components/metamask"
import { explorerAddress, explorerTx, type Writer } from "@/lib/arkiv/client"
import { noticesOfIssuer, type NoticeRecord } from "@/lib/arkiv/read"
import { issueNotice, registerIssuer } from "@/lib/arkiv/write"
import { WELL_KNOWN_PATH } from "@/lib/domainProof"
import { hashFileBytes } from "@/lib/normalize"
import { NOTICE_CATEGORIES } from "@/lib/schema"
import { fileToBytes, formatDay, shortAddress, timeLeft, toLocalInput } from "@/lib/ui"

const ISSUERS = [
  { id: "board", name: "Demo Board of Secondary Education", domain: "asli-board.vercel.app", address: "0x2043DB00a32bd8C4804227B72b97438af39a7De6" },
  { id: "univ", name: "Pune Demo University", domain: "asli-puneuni.vercel.app", address: "0x94a9C31a9dcdd7EBD44b9c4d7511a27149ec6F81" },
  { id: "employer", name: "Acme Infotech", domain: "asli-acme.vercel.app", address: "0x51Ad2Cf42bc81C254bcdd078e15c75890532905f" },
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
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setMine(null)
    noticesOfIssuer(browserReader(), active.address as Hex).then(
      (list) => setMine(list.sort((a, b) => b.issuedAt - a.issuedAt)),
      () => setMine([]),
    )
  }, [active.address])
  useEffect(refresh, [refresh])

  async function act(action: string, body: Record<string, unknown>, label: string) {
    setBusy(label)
    setResult(null)
    const r = await call(action, { issuer, ...body })
    setResult(r)
    setBusy(null)
    if (r.ok) setTimeout(refresh, 2500)
  }

  return (
    <div className="stack">
      <div>
        <span className="eyebrow">Institution console</span>
        <h1>Publish notices people can verify.</h1>
        <p className="lede" style={{ marginBottom: 0 }}>
          Every notice you publish is signed by your institution&apos;s wallet and stored on Arkiv until its valid-until
          date. Postpone it and every forward shows the new date; withdraw it and every forward shows it was withdrawn.
        </p>
      </div>

      <section>
        <p className="section-title">Signed in as (demo institutions)</p>
        <div className="inst-grid">
          {ISSUERS.map((i) => (
            <button
              key={i.id}
              className="inst"
              aria-pressed={issuer === i.id}
              onClick={() => {
                setIssuer(i.id)
                setResult(null)
              }}
            >
              <InstLogo name={i.name} address={i.address} />
              <span>
                <span className="name">{i.name}</span>
                <br />
                <span className="dom">{i.domain}</span> <span className="tick">✓ verified</span>
              </span>
            </button>
          ))}
        </div>
        <p className="meta">
          Demo sign-in: Asli signs with the institution&apos;s own wallet{" "}
          <a href={explorerAddress(active.address)} target="_blank" rel="noreferrer">
            {shortAddress(active.address)}
          </a>
          , so Arkiv records it as the author. Demo notices last up to 7 days. A real institution signs with its own
          wallet (below). · <Link href={`/issuer/${active.address}`}>Public page</Link>
        </p>
      </section>

      {result && (
        <div className={`verdict ${result.ok ? "good" : "bad"}`} style={{ padding: 16 }}>
          {result.ok ? (
            <>
              <strong>Published to Arkiv{result.code && <> as {result.code}</>}.</strong>{" "}
              {result.code && (
                <>
                  <Link href={`/?code=${result.code}`}>Check it like a parent would</Link> ·{" "}
                </>
              )}
              {result.tx && (
                <a href={explorerTx(result.tx)} target="_blank" rel="noreferrer">
                  View the transaction
                </a>
              )}
            </>
          ) : (
            <strong>{result.message}</strong>
          )}
        </div>
      )}

      <div className="split">
        {issuer === "employer" ? (
          <OfferForm busy={busy !== null} onSubmit={(b) => act("offer", b, "Registering…")} />
        ) : (
          <NoticeForm busy={busy !== null} onSubmit={(b) => act("issue", b, "Publishing…")} />
        )}

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>{issuer === "employer" ? "Offer letters" : "Your live notices"}</h3>
            {busy && (
              <span className="meta">
                <span className="spinner" /> {busy}
              </span>
            )}
          </div>
          {issuer === "employer" ? (
            <p className="meta">
              Offer letters are stored as a file fingerprint only, never the candidate&apos;s name. Candidates check them
              on the <Link href="/offer">Offer letters</Link> page.
            </p>
          ) : mine === null ? (
            <p className="meta">Loading from Arkiv…</p>
          ) : mine.length === 0 ? (
            <p className="meta">No live notices. Publish one on the left.</p>
          ) : (
            mine.map((n) => {
              const postponed = n.validUntil - n.originalValidUntil > 60 * 60_000
              return (
                <div key={n.key} className="notice-card">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <h3>{n.title}</h3>
                    <span className={`badge ${postponed ? "warn" : "good"}`}>{postponed ? "Postponed" : "Live"}</span>
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
                    <code>{n.code}</code> · {n.category} · valid until {formatDay(n.validUntil)} ({timeLeft(n.validUntil)})
                  </div>
                  <div className="row" style={{ marginTop: 10, gap: 8 }}>
                    <Link className="btn ghost small" href={`/?code=${n.code}`}>
                      Verify
                    </Link>
                    <button
                      className="btn ghost small"
                      disabled={busy !== null}
                      onClick={() =>
                        act(
                          "postpone",
                          {
                            noticeKey: n.key,
                            newValidUntil: new Date(Math.min(n.validUntil + 2 * 86_400_000, days(7).getTime() - 60_000)).toISOString(),
                            reason: "Postponed by the institution",
                          },
                          "Postponing…",
                        )
                      }
                    >
                      Postpone 2 days
                    </button>
                    <button
                      className="btn ghost small"
                      disabled={busy !== null}
                      onClick={() => act("revoke", { noticeKey: n.key, reason: "Withdrawn by the institution" }, "Withdrawing…")}
                    >
                      Withdraw
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

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
      <h3>New notice</h3>
      <div className="field">
        <label htmlFor="ti">Title</label>
        <input id="ti" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor="bo">Full text, exactly as people will forward it</label>
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
          <label htmlFor="un">Valid until (its lifetime on Arkiv)</label>
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
        <h3>Publish as your own institution</h3>
        <p className="meta" style={{ fontSize: 14 }}>
          Connect MetaMask and your wallet becomes the permanent author of what you publish.
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
