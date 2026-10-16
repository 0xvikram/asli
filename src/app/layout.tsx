import type { Metadata, Viewport } from "next"
import Link from "next/link"
import { Nav } from "@/components/Nav"
import "./globals.css"

export const metadata: Metadata = {
  title: "Asli: is this notice real?",
  description:
    "Check a forwarded school, university or job notice. Institutions publish notices on Arkiv; anyone verifies a WhatsApp forward, PDF or screenshot in seconds.",
}

export const viewport: Viewport = { width: "device-width", initialScale: 1 }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand">
              असली <span>Asli</span>
            </Link>
            <Nav />
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer>
          <div className="wrap">
            Asli reads Arkiv&apos;s Tiramisu testnet directly from your browser. All issuers and notices are
            fictional demo data. <Link href="/about">How it works</Link> ·{" "}
            <a href="https://github.com/0xvikram/asli">Source (MIT)</a>
          </div>
        </footer>
      </body>
    </html>
  )
}
