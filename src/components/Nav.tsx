"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/", label: "Check a notice", short: "Check" },
  { href: "/offer", label: "Offer letters", short: "Offers" },
  { href: "/board", label: "Live notices", short: "Live" },
  { href: "/about", label: "How it works", short: "How" },
]

export function Nav() {
  const path = usePathname()
  return (
    <>
      <nav className="nav">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={path === l.href ? "active" : undefined}>
            <span className="long">{l.label}</span>
            <span className="short">{l.short}</span>
          </Link>
        ))}
        <span className="spacer" />
      </nav>
      <Link href="/publish" className={`cta${path === "/publish" ? " active" : ""}`}>
        For institutions
      </Link>
    </>
  )
}
