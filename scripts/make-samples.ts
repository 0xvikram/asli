/**
 * Writes the sample documents to public/samples. Run with `npm run samples`.
 * Synthetic only: "Sample Candidate" is not a person.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makePdf } from "./pdf"
import { SEED_NOTICES } from "../src/lib/demoData"
import { hashFileBytes } from "../src/lib/normalize"

const dir = join(process.cwd(), "public", "samples")
mkdirSync(dir, { recursive: true })

function offer(amount: string) {
  return makePdf([
    { text: "ACME INFOTECH (fictional demo employer)", size: 16, bold: true },
    { text: "asli-acme.vercel.app" },
    { text: " " },
    { text: "Letter of Offer   Ref: ACME/HR/2026/GSE/0417", bold: true },
    { text: "Dear Sample Candidate," },
    { text: "We are pleased to offer you the role of Graduate Software Engineer in Pune." },
    { text: `Annual fixed compensation: ${amount}.` },
    { text: "Please confirm your acceptance before 15 November 2026." },
    { text: "Acme Infotech never asks candidates to pay any fee at any stage of hiring." },
    { text: " " },
    { text: "Head of Talent Acquisition, Acme Infotech" },
  ])
}

const files: Record<string, Uint8Array> = {
  "acme-offer-letter.pdf": offer("Rs 9,00,000"),
  // A doctored copy: same letter, the scammer's version asks for a "refundable training deposit".
  "acme-offer-letter-edited.pdf": makePdf([
    { text: "ACME INFOTECH (fictional demo employer)", size: 16, bold: true },
    { text: "asli-acme.vercel.app" },
    { text: " " },
    { text: "Letter of Offer   Ref: ACME/HR/2026/GSE/0417", bold: true },
    { text: "Dear Sample Candidate," },
    { text: "We are pleased to offer you the role of Graduate Software Engineer in Pune." },
    { text: "Annual fixed compensation: Rs 9,00,000." },
    { text: "Pay a refundable training deposit of Rs 15,000 to confirm your joining." },
    { text: " " },
    { text: "Head of Talent Acquisition, Acme Infotech" },
  ]),
  "dbse-notice-41.pdf": makePdf(
    SEED_NOTICES.find((n) => n.id === "maths-preboard")!
      .body.split("\n")
      .map((text, i) => ({ text, bold: i === 0, size: i === 0 ? 15 : 11 })),
  ),
}

for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(join(dir, name), bytes)
  console.log(name, hashFileBytes(bytes))
}
