/**
 * Publishes the demo world to Tiramisu: three domain-verified issuers, one impostor, and notices
 * covering every verdict. Safe to re-run: anything already published is skipped.
 *
 *   npm run seed            # needs funded ISSUER_*_KEY values in .env.local
 *
 * Writes arkiv/seed-output.json (wallets, entity keys, codes, transactions) for the submission.
 */
import { config } from "dotenv"
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { formatEther, parseEther, type Hex } from "viem"
import { generatePrivateKey } from "viem/accounts"
import { issuerWallet, publicReader, explorerTx } from "../src/lib/arkiv/client"
import {
  listIssuers,
  noticesByTextHash,
  offersByFileHash,
  revocationsByTextHash,
} from "../src/lib/arkiv/read"
import { issueNotice, postponeNotice, registerIssuer, registerOffer, revokeNotice } from "../src/lib/arkiv/write"
import { IMPOSTOR_NOTICE, SEED_NOTICES } from "../src/lib/demoData"
import { demoIssuers, issuerKey } from "../src/lib/issuers"
import { hashFileBytes, hashNoticeText } from "../src/lib/normalize"

config({ path: ".env.local" })

const DAY = 86_400_000
const out: Record<string, unknown> = { network: "Tiramisu (7738577)", seededAt: new Date().toISOString(), wallets: {}, entities: [] }
const log = (entry: Record<string, unknown>) => {
  ;(out.entities as unknown[]).push(entry)
  console.log(`  ${entry.what}${entry.tx ? `  ${explorerTx(String(entry.tx))}` : ""}${entry.skipped ? "  (already there)" : ""}`)
}

function impostorKey(): Hex {
  const existing = process.env.ISSUER_IMPOSTOR_KEY?.trim()
  if (existing) return existing as Hex
  const k = generatePrivateKey()
  appendFileSync(".env.local", `ISSUER_IMPOSTOR_KEY=${k}\n`)
  process.env.ISSUER_IMPOSTOR_KEY = k
  return k
}

async function main() {
  const r = publicReader()
  const issuers = demoIssuers()
  const wallets = Object.fromEntries(
    issuers.map((i) => {
      const key = issuerKey(i)
      if (!key) throw new Error(`${i.envKey} is missing in .env.local`)
      return [i.id, issuerWallet(key)]
    }),
  ) as Record<"board" | "univ" | "employer", ReturnType<typeof issuerWallet>>

  console.log("Balances")
  for (const i of issuers) {
    const bal = await r.getBalance({ address: i.address })
    ;(out.wallets as Record<string, unknown>)[i.id] = { address: i.address, domain: i.domain, role: `${i.name} (verified issuer)` }
    console.log(`  ${i.id.padEnd(9)} ${i.address}  ${formatEther(bal)} GLM`)
    if (bal === 0n) throw new Error(`${i.id} has no GLM. Fund ${i.address} at https://hub.arkiv.network/faucet`)
  }

  // The impostor gets a little GLM from the board's wallet so the faucet is only needed three times.
  const impostor = issuerWallet(impostorKey())
  const impBal = await r.getBalance({ address: impostor.account.address })
  if (impBal < parseEther("0.001")) {
    const boardBal = await r.getBalance({ address: issuers[0].address })
    const hash = await wallets.board.sendTransaction({ to: impostor.account.address, value: boardBal / 20n })
    await r.waitForTransactionReceipt({ hash })
    console.log(`  funded impostor ${impostor.account.address} with ${formatEther(boardBal / 20n)} GLM`)
  }
  ;(out.wallets as Record<string, unknown>).impostor = {
    address: impostor.account.address,
    domain: issuers[0].domain,
    role: "Impostor: claims the board's name and domain, but the domain does not list this wallet",
  }

  console.log("Issuers")
  const existing = await listIssuers(r)
  const hasIssuer = (address: string) => existing.some((e) => e.creator.toLowerCase() === address.toLowerCase())
  for (const i of issuers) {
    if (hasIssuer(i.address)) {
      log({ what: `issuer ${i.id}`, skipped: true })
      continue
    }
    const res = await registerIssuer(wallets[i.id], { name: i.name, domain: i.domain, category: i.category, about: i.about })
    log({ what: `issuer ${i.id}`, kind: "issuer", key: res.entityKey, tx: res.txHash, creator: i.address })
  }
  if (!hasIssuer(impostor.account.address)) {
    const res = await registerIssuer(impostor, {
      name: issuers[0].name,
      domain: issuers[0].domain,
      category: "board",
      about: "Official account. Trust this one.",
    })
    log({ what: "issuer impostor", kind: "issuer", key: res.entityKey, tx: res.txHash, creator: impostor.account.address })
  }

  console.log("Notices")
  const noticePdf = readFileSync(join("public", "samples", "dbse-notice-41.pdf"))
  for (const n of SEED_NOTICES) {
    const issuer = issuers.find((i) => i.id === n.issuer)!
    const w = wallets[n.issuer]
    const textHash = hashNoticeText(n.body)
    const live = (await noticesByTextHash(r, textHash)).filter((x) => x.creator.toLowerCase() === issuer.address.toLowerCase())
    const revoked = (await revocationsByTextHash(r, textHash)).filter((x) => x.creator.toLowerCase() === issuer.address.toLowerCase())
    if (live.length > 0 || revoked.length > 0) {
      log({ what: `notice ${n.id}`, skipped: true, code: live[0]?.code ?? revoked[0]?.code })
      continue
    }
    const issued = await issueNotice(w, {
      codePrefix: issuer.codePrefix,
      title: n.title,
      body: n.body,
      category: n.category,
      lang: n.lang,
      validUntil: new Date(Date.now() + n.validDays * DAY),
      fileHash: n.id === "maths-preboard" ? hashFileBytes(new Uint8Array(noticePdf)) : undefined,
    })
    log({ what: `notice ${n.id} (${issued.code})`, kind: "notice", key: issued.entityKey, tx: issued.txHash, code: issued.code, creator: issuer.address })

    if (n.then && "postponeDays" in n.then) {
      const res = await postponeNotice(w, {
        noticeKey: issued.entityKey,
        newValidUntil: new Date(Date.now() + n.then.postponeDays * DAY),
        reason: n.then.reason,
      })
      log({ what: `  postponed ${n.id} (extend + amendment, one batch)`, kind: "amendment", key: res.amendmentKey, tx: res.txHash })
    } else if (n.then && "revoke" in n.then) {
      const res = await revokeNotice(w, {
        noticeKey: issued.entityKey,
        textHash: issued.textHash,
        code: issued.code,
        title: n.title,
        reason: n.then.revoke,
      })
      log({ what: `  revoked ${n.id} (revocation + delete, one batch)`, kind: "revocation", key: res.revocationKey, tx: res.txHash })
    }
  }

  const impHash = hashNoticeText(IMPOSTOR_NOTICE.body)
  if ((await noticesByTextHash(r, impHash)).length === 0) {
    const res = await issueNotice(impostor, {
      codePrefix: "DBSE",
      title: IMPOSTOR_NOTICE.title,
      body: IMPOSTOR_NOTICE.body,
      category: "exam",
      lang: "en",
      validUntil: new Date(Date.now() + 14 * DAY),
    })
    log({ what: `impostor notice (${res.code})`, kind: "notice", key: res.entityKey, tx: res.txHash, creator: impostor.account.address })
  } else {
    log({ what: "impostor notice", skipped: true })
  }

  console.log("Offer letters")
  const offer = hashFileBytes(new Uint8Array(readFileSync(join("public", "samples", "acme-offer-letter.pdf"))))
  if ((await offersByFileHash(r, offer)).length === 0) {
    const res = await registerOffer(wallets.employer, {
      fileHash: offer,
      roleCode: "ACME-GSE-26",
      roleTitle: "Graduate Software Engineer",
      location: "Pune",
      validUntil: new Date("2026-11-15T18:29:00Z"),
    })
    log({ what: "offer acme-offer-letter.pdf", kind: "offer", key: res.entityKey, tx: res.txHash, creator: issuers[2].address })
  } else {
    log({ what: "offer acme-offer-letter.pdf", skipped: true })
  }

  writeFileSync(join("arkiv", "seed-output.json"), JSON.stringify(out, null, 2) + "\n")
  console.log("\nWrote arkiv/seed-output.json")
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message.split("\n")[0] : e)
  process.exit(1)
})
