import type { Hex } from "viem"
import type { IssuerCategory } from "./schema"

/**
 * The fictional issuers that ship with the demo. Their wallets are public facts (they are the
 * `$creator` of everything they publish); their private keys live only in server env vars.
 *
 * Each one has its own domain. The deployment answers `/.well-known/asli-issuer.json` per host,
 * which is exactly what a real institution would put on its own site.
 */
export type DemoIssuer = {
  id: "board" | "univ" | "employer"
  name: string
  nameHi: string
  category: IssuerCategory
  codePrefix: string
  address: Hex
  domain: string
  envKey: string
  about: string
}

const domain = (envName: string, fallback: string) => process.env[envName]?.trim() || fallback

export function demoIssuers(): DemoIssuer[] {
  return [
    {
      id: "board",
      name: "Demo Board of Secondary Education",
      nameHi: "डेमो माध्यमिक शिक्षा बोर्ड",
      category: "board",
      codePrefix: "DBSE",
      address: "0x2043DB00a32bd8C4804227B72b97438af39a7De6",
      domain: domain("NEXT_PUBLIC_DOMAIN_BOARD", "asli-board.vercel.app"),
      envKey: "ISSUER_BOARD_KEY",
      about: "A fictional school exam board used to demonstrate Asli. Not affiliated with any real board.",
    },
    {
      id: "univ",
      name: "Pune Demo University",
      nameHi: "पुणे डेमो विश्वविद्यालय",
      category: "university",
      codePrefix: "PDU",
      address: "0x94a9C31a9dcdd7EBD44b9c4d7511a27149ec6F81",
      domain: domain("NEXT_PUBLIC_DOMAIN_UNIV", "asli-puneuni.vercel.app"),
      envKey: "ISSUER_UNIV_KEY",
      about: "A fictional university used to demonstrate Asli. Not affiliated with any real university.",
    },
    {
      id: "employer",
      name: "Acme Infotech",
      nameHi: "एक्मी इन्फोटेक",
      category: "employer",
      codePrefix: "ACME",
      address: "0x51Ad2Cf42bc81C254bcdd078e15c75890532905f",
      domain: domain("NEXT_PUBLIC_DOMAIN_EMPLOYER", "asli-acme.vercel.app"),
      envKey: "ISSUER_EMPLOYER_KEY",
      about: "A fictional employer used to demonstrate Asli offer-letter checks. Not a real company.",
    },
  ]
}

export function demoIssuer(id: string) {
  return demoIssuers().find((i) => i.id === id)
}

/** The issuers a given host vouches for (one per host in production; all of them locally). */
export function issuersForHost(host: string | null): DemoIssuer[] {
  const h = (host ?? "").toLowerCase()
  if (h.startsWith("localhost") || h.startsWith("127.0.0.1")) return demoIssuers()
  return demoIssuers().filter((i) => i.domain === h)
}

export function issuerKey(issuer: DemoIssuer): Hex | undefined {
  const k = process.env[issuer.envKey]?.trim()
  return k && /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as Hex) : undefined
}

/** Body of /.well-known/asli-issuer.json for a host: only the wallets that host vouches for. */
export function wellKnownBody(host: string | null) {
  return {
    asli: 1 as const,
    issuers: issuersForHost(host).map((i) => ({ address: i.address, name: i.name })),
  }
}
