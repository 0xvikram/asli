import type { Verdict } from "./verify"

export type Tone = "good" | "bad" | "warn" | "neutral"

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

const IST = "Asia/Kolkata"

/** Dates as Indian readers write them, in IST: "12 Mar 2026, 10:30 am". */
export function formatDate(ms: number | Date): string {
  const d = typeof ms === "number" ? new Date(ms) : ms
  return d.toLocaleString("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function formatDay(ms: number | Date): string {
  const d = typeof ms === "number" ? new Date(ms) : ms
  return d.toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short", year: "numeric" })
}

/** "3 days left", "5 hours left", "expired". */
export function timeLeft(untilMs: number, nowMs: number = Date.now()): string {
  const diff = untilMs - nowMs
  if (diff <= 0) return "expired"
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins} min left`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} left`
  const days = Math.floor(hours / 24)
  return `${days} days left`
}

export type VerdictCopy = { tone: Tone; headline: string; hindi: string; detail: string }

/**
 * What a parent or student reads first. Plain words, one line, then a Hindi line, because these
 * forwards travel in both languages.
 */
export function verdictCopy(v: Verdict, opts: { fromOcr?: boolean } = {}): VerdictCopy {
  switch (v.status) {
    case "real":
      return {
        tone: "good",
        headline: `Real notice from ${v.issuer.domain}`,
        hindi: "यह सूचना असली है",
        detail:
          v.amendments.length > 0
            ? `Postponed by the issuer: ${v.amendments[0].reason.replace(/[.\s]+$/, "")}. Now in force until ${formatDay(v.amendments[0].newValidUntil)}.`
            : `Published by ${v.issuer.name}. Valid till ${formatDay(v.notice.validUntil)}.`,
      }
    case "altered":
      return opts.fromOcr
        ? {
            tone: "warn",
            headline: `Close to a real notice from ${v.issuer.domain}, but not identical`,
            hindi: "असली सूचना से मिलती है, पर पूरी तरह नहीं",
            detail:
              "Screenshots can be misread. Compare the highlighted words below with the real notice before trusting the forward.",
          }
        : {
            tone: "bad",
            headline: `Fake: someone changed a real notice from ${v.issuer.domain}`,
            hindi: "नकली: असली सूचना में बदलाव किया गया है",
            detail: `The real notice is "${v.notice.title}". The words in red and green below were changed.`,
          }
    case "revoked":
      return {
        tone: "bad",
        headline: `Withdrawn by ${v.issuer.domain}`,
        hindi: "यह सूचना वापस ले ली गई है",
        detail: `"${v.revocation.title}" was revoked on ${formatDay(v.revocation.revokedAt)}. Reason: ${v.revocation.reason}`,
      }
    case "expired":
      return {
        tone: "warn",
        headline: `Was real, but no longer in force`,
        hindi: "यह सूचना असली थी, पर अब मान्य नहीं है",
        detail: `${v.issuer.name} published it, and its validity ended on ${formatDay(v.notice.validUntil)}.`,
      }
    case "unverified-issuer":
      return {
        tone: "bad",
        headline: "Published by someone the institution does not vouch for",
        hindi: "यह किसी अनधिकृत स्रोत से है",
        detail: v.claimedDomain
          ? `It claims to be from ${v.claimedDomain}, but ${v.claimedDomain} does not list the wallet that published it.`
          : v.reason,
      }
    case "unknown":
      return {
        tone: "neutral",
        headline: "No institution on Asli published this",
        hindi: "किसी संस्था ने यह सूचना जारी नहीं की",
        detail: `None of the ${v.checkedIssuers} verified issuers has a live notice like it. Treat it as unconfirmed and check the official website.`,
      }
    case "empty":
      return { tone: "neutral", headline: "Paste a notice to check it", hindi: "जाँचने के लिए सूचना पेस्ट करें", detail: "" }
  }
}

export async function fileToBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

/** `datetime-local` value for an input, in local time. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export type StepState = "pass" | "fail" | "info"
export type CheckStep = { label: string; detail: string; state: StepState }

/**
 * The checks behind a verdict, in the order the engine runs them. Shown under the headline so a
 * reader sees why the answer is what it is, not just the answer.
 */
export function checkSteps(v: Verdict): CheckStep[] {
  const signed = (creator: string): CheckStep => ({
    label: "Signed by the institution's wallet",
    detail: `Arkiv records ${shortAddress(creator)} as the author. Nobody else can write as that wallet.`,
    state: "pass",
  })
  const vouched = (domain: string): CheckStep => ({
    label: `${domain} vouches for that wallet`,
    detail: `Your browser fetched ${domain}/.well-known/asli-issuer.json and found the same wallet listed.`,
    state: "pass",
  })
  switch (v.status) {
    case "real":
      return [
        { label: "Found on Arkiv", detail: `Notice ${v.notice.code}, published ${formatDay(v.notice.issuedAt)}.`, state: "pass" },
        signed(v.issuer.creator),
        vouched(v.issuer.domain),
        { label: "Matches word for word", detail: "The text you checked is identical to what the institution published.", state: "pass" },
        {
          label: "Still in force",
          detail:
            v.amendments.length > 0
              ? `Postponed ${v.amendments.length === 1 ? "once" : `${v.amendments.length} times`}; now valid until ${formatDay(v.notice.validUntil)}.`
              : `Valid until ${formatDay(v.notice.validUntil)} (${timeLeft(v.notice.validUntil)}).`,
          state: "pass",
        },
      ]
    case "altered":
      return [
        { label: "Closest real notice found on Arkiv", detail: `Notice ${v.notice.code}: "${v.notice.title}".`, state: "pass" },
        signed(v.issuer.creator),
        vouched(v.issuer.domain),
        {
          label: "Matches word for word",
          detail: `${v.changes.length || "Some"} change${v.changes.length === 1 ? "" : "s"} from the real notice. See them below.`,
          state: "fail",
        },
      ]
    case "revoked":
      return [
        { label: "Found on Arkiv", detail: `Notice ${v.revocation.code}: "${v.revocation.title}".`, state: "pass" },
        signed(v.issuer.creator),
        vouched(v.issuer.domain),
        { label: "Still in force", detail: `Withdrawn on ${formatDay(v.revocation.revokedAt)}. ${v.revocation.reason}`, state: "fail" },
      ]
    case "expired":
      return [
        { label: "Found in Arkiv's history", detail: `Notice ${v.notice.code} existed at block ${v.seenAtBlock}.`, state: "pass" },
        signed(v.issuer.creator),
        vouched(v.issuer.domain),
        { label: "Still in force", detail: `Its validity ended on ${formatDay(v.notice.validUntil)}, so Arkiv no longer returns it.`, state: "fail" },
      ]
    case "unverified-issuer":
      return [
        { label: "Found on Arkiv", detail: `Notice ${v.notice.code}.`, state: "pass" },
        {
          label: "Published by wallet " + shortAddress(v.notice.creator),
          detail: "Anyone can write to Arkiv, so the author alone proves nothing.",
          state: "info",
        },
        {
          label: v.claimedDomain ? `${v.claimedDomain} vouches for that wallet` : "A domain vouches for that wallet",
          detail: v.claimedDomain
            ? `${v.claimedDomain} lists a different wallet. This one is an impostor using its name.`
            : "No institution's website lists this wallet.",
          state: "fail",
        },
      ]
    case "unknown":
      return [
        {
          label: `Searched ${v.checkedIssuers} verified institution${v.checkedIssuers === 1 ? "" : "s"}`,
          detail: "Live notices, withdrawn notices, and notices that ended in the last 12 days.",
          state: "info",
        },
        { label: "Found a matching notice", detail: "Nothing close to this text or code.", state: "fail" },
      ]
    case "empty":
      return []
  }
}

const SHARE_ICON: Record<Tone, string> = { good: "✅", bad: "❌", warn: "⚠️", neutral: "❓" }

/** A short reply for the WhatsApp group the forward came from, with a link anyone can open. */
export function shareText(v: Verdict, site: string, opts: { fromOcr?: boolean } = {}): string {
  if (v.status === "empty") return ""
  const c = verdictCopy(v, opts)
  const code = "notice" in v ? v.notice.code : v.status === "revoked" ? v.revocation.code : null
  const lines = [`${SHARE_ICON[c.tone]} ${c.headline}`, c.hindi]
  if (v.status === "altered" && v.changes.length > 0) {
    const shown = v.changes
      .slice(0, 3)
      .map((ch) => (ch.original && ch.forwarded ? `"${ch.original}" was changed to "${ch.forwarded}"` : ch.forwarded ? `"${ch.forwarded}" was added` : `"${ch.original}" was removed`))
    lines.push(`The real notice: ${shown.join("; ")}.`)
  } else if (c.detail) {
    lines.push(c.detail)
  }
  lines.push(code && v.status !== "unverified-issuer" ? `Check it yourself: ${site}/?code=${code}` : `Check any forward: ${site}`)
  return lines.join("\n")
}
