import { getAddress, isAddress, type Address } from "viem"

/**
 * How an issuer proves "this wallet speaks for this domain". The domain owner publishes one of:
 *
 *  1. https://<domain>/.well-known/asli-issuer.json
 *       { "asli": 1, "issuers": [{ "address": "0x…", "name": "…" }] }
 *  2. a DNS TXT record on _asli.<domain>:  asli-issuer=0x…
 *
 * Asli has no list of trusted issuers of its own. Whoever controls the domain decides, the same
 * way OpenAttestation binds document stores to DNS. Both checks run in the reader's browser.
 */
export const WELL_KNOWN_PATH = "/.well-known/asli-issuer.json"
export const DNS_PREFIX = "_asli"
const TXT_RE = /asli-issuer=(0x[0-9a-fA-F]{40})/g

export type WellKnownDoc = { asli: 1; issuers: { address: Address; name?: string }[] }

export type ProofResult =
  | { ok: true; method: "well-known" | "dns-txt"; domain: string }
  | { ok: false; domain: string; reason: string }

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/** Accepts only bare hostnames (optionally with a port for local dev). No paths, no schemes. */
export function cleanDomain(domain: string): string | null {
  const d = domain.trim().toLowerCase().replace(/\.$/, "")
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/.test(d)
    ? d
    : null
}

export function parseWellKnown(raw: unknown): Address[] {
  if (!raw || typeof raw !== "object") return []
  const doc = raw as Partial<WellKnownDoc>
  if (doc.asli !== 1 || !Array.isArray(doc.issuers)) return []
  return doc.issuers
    .map((i) => (i && typeof i.address === "string" && isAddress(i.address) ? getAddress(i.address) : null))
    .filter((a): a is Address => a !== null)
}

export function parseTxtRecords(records: string[]): Address[] {
  const found: Address[] = []
  for (const record of records) {
    // DNS JSON wraps TXT data in quotes and may split it into several quoted chunks.
    const joined = record.replace(/"\s*"/g, "").replace(/"/g, "")
    for (const m of joined.matchAll(TXT_RE)) {
      if (isAddress(m[1])) found.push(getAddress(m[1]))
    }
  }
  return found
}

function sameAddress(list: Address[], address: string) {
  return isAddress(address) && list.includes(getAddress(address))
}

export async function checkWellKnown(
  domain: string,
  address: string,
  fetcher: Fetcher = fetch,
): Promise<ProofResult> {
  const d = cleanDomain(domain)
  if (!d) return { ok: false, domain, reason: "not a valid domain" }
  const scheme = d.startsWith("localhost") ? "http" : "https"
  try {
    const res = await fetcher(`${scheme}://${d}${WELL_KNOWN_PATH}`, { cache: "no-store" })
    if (!res.ok) return { ok: false, domain: d, reason: `${WELL_KNOWN_PATH} returned ${res.status}` }
    const listed = parseWellKnown(await res.json())
    return sameAddress(listed, address)
      ? { ok: true, method: "well-known", domain: d }
      : { ok: false, domain: d, reason: "wallet is not listed by this domain" }
  } catch {
    return { ok: false, domain: d, reason: `could not read ${WELL_KNOWN_PATH}` }
  }
}

export async function checkDnsTxt(
  domain: string,
  address: string,
  fetcher: Fetcher = fetch,
): Promise<ProofResult> {
  const d = cleanDomain(domain)
  if (!d || d.includes(":")) return { ok: false, domain, reason: "not a valid DNS name" }
  try {
    // DNS-over-HTTPS with a JSON answer and open CORS, so a browser can check DNS itself.
    const url = `https://cloudflare-dns.com/dns-query?name=${DNS_PREFIX}.${d}&type=TXT`
    const res = await fetcher(url, { headers: { accept: "application/dns-json" } })
    if (!res.ok) return { ok: false, domain: d, reason: `DNS lookup returned ${res.status}` }
    const body = (await res.json()) as { Answer?: { data: string }[] }
    const listed = parseTxtRecords((body.Answer ?? []).map((a) => a.data))
    return sameAddress(listed, address)
      ? { ok: true, method: "dns-txt", domain: d }
      : { ok: false, domain: d, reason: "no matching asli-issuer TXT record" }
  } catch {
    return { ok: false, domain: d, reason: "DNS lookup failed" }
  }
}

/** Tries the well-known file first, then DNS. */
export async function proveDomain(
  domain: string,
  address: string,
  fetcher: Fetcher = fetch,
): Promise<ProofResult> {
  const wk = await checkWellKnown(domain, address, fetcher)
  if (wk.ok) return wk
  const dns = await checkDnsTxt(domain, address, fetcher)
  if (dns.ok) return dns
  return { ok: false, domain: wk.domain, reason: `${wk.reason}; ${dns.reason}` }
}
