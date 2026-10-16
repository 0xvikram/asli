import type { Metadata, Viewport } from "next"
import { Anton, Baloo_2, DM_Sans } from "next/font/google"
import Link from "next/link"
import { BrandMark } from "@/components/Brand"
import { Nav } from "@/components/Nav"
import "./globals.css"

export const metadata: Metadata = {
  title: "Asli: check a notice before you forward it",
  description:
    "Check a forwarded school, university or job notice. Institutions publish notices on Arkiv; anyone verifies a WhatsApp forward, PDF or screenshot in seconds.",
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1600cf" }

const display = Anton({ weight: "400", subsets: ["latin"], variable: "--font-display", display: "swap" })
const hindi = Baloo_2({ weight: ["500", "700"], subsets: ["devanagari", "latin"], variable: "--font-hindi", display: "swap" })
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" })

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${hindi.variable} ${body.variable}`}>
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand">
              <BrandMark />
              Asli <span className="hi-name">असली</span>
            </Link>
            <Nav />
            <span className="net-pill" title="Asli reads and writes Arkiv's Tiramisu test network">Arkiv testnet</span>
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer>
          <div className="wrap">
            <div>
              Asli checks notices against what institutions publish on Arkiv, straight from your browser.
              <br />
              Running on Arkiv&apos;s Tiramisu testnet. The institutions shown are demo institutions.
            </div>
            <div className="links">
              <Link href="/about">How it works</Link>
              <Link href="/publish">For institutions</Link>
              <a href="https://github.com/0xvikram/asli">Source (MIT)</a>
            </div>
            <div className="big-word" aria-hidden>
              Asli असली
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
