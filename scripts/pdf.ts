/**
 * A tiny, dependency-free, deterministic PDF writer for the sample documents (one page, Helvetica,
 * plain lines). Deterministic matters: the file hash registered on Arkiv must match the file
 * judges download from /samples.
 */
function escape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

export function makePdf(lines: { text: string; size?: number; bold?: boolean }[]): Uint8Array {
  let y = 790
  const ops: string[] = ["BT"]
  for (const l of lines) {
    const size = l.size ?? 11
    y -= size + 8
    ops.push(`/${l.bold ? "F2" : "F1"} ${size} Tf`, `1 0 0 1 56 ${y} Tm`, `(${escape(l.text)}) Tj`)
  }
  ops.push("ET")
  const content = ops.join("\n")

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ]

  let out = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"))
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(out, "latin1")
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(out, "latin1"))
}
