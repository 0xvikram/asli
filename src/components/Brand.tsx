/** The Asli mark: a seal with a tick, in the accent colour. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
      <path
        d="M16 2.5l3.1 2.3 3.8-.5 1.5 3.6 3.6 1.5-.5 3.8 2.3 3.1-2.3 3.1.5 3.8-3.6 1.5-1.5 3.6-3.8-.5L16 29.5l-3.1-2.3-3.8.5-1.5-3.6-3.6-1.5.5-3.8L2.2 16l2.3-3.1-.5-3.8 3.6-1.5 1.5-3.6 3.8.5z"
        fill="var(--accent)"
      />
      <path d="M10.5 16.4l3.6 3.6 7.4-7.6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const COLOURS = ["#1f4e8c", "#7a3b8f", "#1f6f5c", "#9a4a12", "#4a5568"]

/** A stand-in logo for an institution: its initials on a colour picked from its wallet. */
export function InstLogo({ name, address }: { name: string; address: string }) {
  const words = name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w) && !["Of", "Demo", "Infotech", "Ltd"].includes(w))
  const initials = words.length === 1 ? words[0].slice(0, 2).toUpperCase() : words.slice(0, 3).map((w) => w[0]).join("")
  const colour = COLOURS[parseInt(address.slice(2, 6), 16) % COLOURS.length]
  return (
    <span className="inst-logo" style={{ background: colour }} aria-hidden>
      {initials || name.slice(0, 2).toUpperCase()}
    </span>
  )
}
