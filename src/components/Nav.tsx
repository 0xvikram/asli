"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/", label: "Check a notice" },
  { href: "/offer", label: "Offer letters" },
  { href: "/board", label: "Live notices" },
  { href: "/about", label: "How it works" },
]

export function Nav() {
  const path = usePathname()
  return (
    <nav className="nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={path === l.href ? "active" : undefined}>
          {l.label}
        </Link>
      ))}
      <span className="spacer" />
      <Link href="/publish" className={`cta${path === "/publish" ? " active" : ""}`}>
        For institutions
      </Link>
    </nav>
  )
}
