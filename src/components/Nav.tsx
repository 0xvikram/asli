"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/", label: "Verify" },
  { href: "/board", label: "Live board" },
  { href: "/offer", label: "Offer letter" },
  { href: "/publish", label: "Publish" },
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
    </nav>
  )
}
