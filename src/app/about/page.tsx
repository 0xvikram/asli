import { EXPLORER } from "@/lib/arkiv/client"
import { demoIssuers } from "@/lib/issuers"
import { KINDS, LIFETIMES, QUERIES } from "@/lib/schema"

export const metadata = { title: "How Asli works" }

export default function AboutPage() {
  return (
    <div className="stack narrow">
      <div>
        <h1>How Asli works</h1>
        <p className="lede">
          In 2026 alone, CBSE and PIB Fact Check had to deny fake circulars about cancelled board exams, re-evaluation and
          a NEET re-exam. Each spread on WhatsApp faster than any denial. Parents and students have no way to check a
          forward except &quot;look at the official website&quot;, and job seekers get fake offer letters with real logos.
        </p>
      </div>

      <div className="card">
        <h3>The flow</h3>
        <ol>
          <li>An institution publishes each notice on Arkiv from its own wallet. Its website lists that wallet.</li>
          <li>The notice&apos;s lifetime on Arkiv is its validity. Postponing extends it; withdrawing deletes it and leaves a public revocation.</li>
          <li>Anyone pastes a forward. The text is cleaned (emoji, *stars*, spacing, Hindi digits) and hashed in the browser.</li>
          <li>The browser queries Arkiv and the institution&apos;s domain directly. Exact match: real. Near match: fake, with the changed words. Revoked, expired or unknown otherwise.</li>
        </ol>
      </div>

      <h2>Why Arkiv, and not Postgres, IPFS or our own API</h2>
      <div className="grid2">
        <div className="card">
          <h3>A database we run</h3>
          <p className="meta" style={{ fontSize: 14 }}>
            We could insert a fake &quot;real&quot; or delete an inconvenient notice, and readers could not tell. A notice
            checker that the checker controls is one more thing to trust. On Arkiv the author of every notice is its{" "}
            <code>$creator</code>, set by the chain, and readers query it without us.
          </p>
        </div>
        <div className="card">
          <h3>IPFS</h3>
          <p className="meta" style={{ fontSize: 14 }}>
            Content-addressed files cannot be queried (&quot;all live notices from this board&quot;, &quot;any notice with this
            hash&quot;), and have no notion of a notice ending. Asli&apos;s core is exactly those queries and that lifetime.
          </p>
        </div>
        <div className="card">
          <h3>A subgraph over a contract</h3>
          <p className="meta" style={{ fontSize: 14 }}>
            An indexer someone operates sits between the reader and the data, and expiry becomes our code comparing dates.
            On Arkiv an expired notice is simply not returned: there is no date check in Asli to get wrong.
          </p>
        </div>
        <div className="card">
          <h3>What stays off Arkiv</h3>
          <p className="meta" style={{ fontSize: 14 }}>
            PDFs and images (only their fingerprint), any student or candidate data (not even hashed), signing keys and the
            access key, OCR and diffing (done in the browser), and the playground rate limits.
          </p>
        </div>
      </div>

      <h2>Entity lifetimes</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Lifetime</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {KINDS.map((k) => (
              <tr key={k}>
                <td>
                  <code>{k}</code>
                </td>
                <td>{LIFETIMES[k].rule}</td>
                <td>{LIFETIMES[k].why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>The exact queries</h2>
      <p className="meta">Run any of these against the public Tiramisu RPC with <code>arkiv_query</code>; you do not need Asli.</p>
      <div className="card">
        {Object.entries(QUERIES).map(([name, q]) => (
          <div key={name} style={{ marginBottom: 10 }}>
            <div className="meta">{name}</div>
            <pre>{q}</pre>
          </div>
        ))}
      </div>

      <h2 id="integrate">Add Asli to what an institution already runs</h2>
      <div className="card">
        <h3>Two steps, nothing to replace</h3>
        <ol>
          <li>
            Prove the wallet is yours: put <code>/.well-known/asli-issuer.json</code> on your website listing your wallet, or add
            a DNS record <code>_asli.your-domain TXT &quot;asli-issuer=0x…&quot;</code>. About five minutes for your IT team.
          </li>
          <li>
            Publish as you do now, then paste the same circular into the <a href="/publish">console</a> and sign with your
            wallet. Postpone or withdraw it there later.
          </li>
        </ol>
        <p className="meta">
          No account, no database, no change to your website, ERP or student portal. Asli never holds a real
          institution&apos;s keys.
        </p>
      </div>
      <div className="card">
        <h3>Other apps can read the same data</h3>
        <p className="meta" style={{ fontSize: 14 }}>
          Every notice is public on Arkiv, in the schema below. A school app, a news site or a fact-checker can query it with
          the Arkiv SDK and run the same check, without asking us and without our servers.
        </p>
      </div>

      <h2>Coming next</h2>
      <div className="grid2">
        {[
          ["Check on WhatsApp", "Forward a message to Asli's number and get the verdict back in the same chat."],
          ["Website plugin", "Post a notice on your school or university site and it is published to Arkiv at the same time."],
          ["Bulk publishing", "Upload a CSV of circulars and sign them all from the institution's own wallet."],
          ["npm package", "asli-verify: one call returns real, altered, withdrawn, expired or unknown, for any app."],
          ["Offer letters from HR tools", "The HR system publishes each offer letter's fingerprint when the offer goes out."],
        ].map(([t, b]) => (
          <div className="card" key={t}>
            <span className="badge soon">Coming next</span>
            <h3>{t}</h3>
            <p className="meta" style={{ fontSize: 14 }}>
              {b}
            </p>
          </div>
        ))}
      </div>

      <h2>Demo issuers (fictional)</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Issuer</th>
              <th>Domain</th>
              <th>Wallet ($creator)</th>
            </tr>
          </thead>
          <tbody>
            {demoIssuers().map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td>
                  <a href={`https://${i.domain}/.well-known/asli-issuer.json`}>{i.domain}</a>
                </td>
                <td className="mono">
                  <a href={`${EXPLORER}/address/${i.address}`}>{i.address}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="meta">
          A real institution would keep its key in a hardware wallet or a multisig. The demo keys are held by this
          deployment&apos;s server so judges can use the playground without a wallet.
        </p>
      </div>
    </div>
  )
}
