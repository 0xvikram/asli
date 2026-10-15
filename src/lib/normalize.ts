import { keccak256, stringToBytes, type Hex } from "viem"

const DEVANAGARI_ZERO = 0x0966

// Lines WhatsApp and forwarders add on top of a notice. They are not part of what the
// institution wrote, so they must not change the hash.
const FORWARD_NOISE = [
  /^forwarded( many times)?$/,
  /^fwd:?$/,
  /^please (share|forward).*$/,
  /^share (this )?with (all|everyone).*$/,
]

/**
 * Turns any copy of a notice (typed, pasted from WhatsApp, OCR'd from a screenshot) into one
 * canonical string, so two copies of the same notice hash the same.
 *
 * Kept: letters (any script), combining marks (Hindi matras), digits.
 * Dropped: emoji, punctuation, formatting stars/underscores, zero-width characters,
 * forward banners, case and spacing differences.
 */
export function normalizeNotice(input: string): string {
  let text = input.normalize("NFKC")
  // Devanagari digits ०-९ → 0-9, so "१२ मार्च" and "12 मार्च" match.
  text = text.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - DEVANAGARI_ZERO))
  text = text.replace(/[​-‍﻿]/g, "")
  text = text.toLowerCase()

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !FORWARD_NOISE.some((re) => re.test(line)))

  return lines.join(" ")
}

/** The words of a normalized notice. */
export function noticeWords(input: string): string[] {
  const normalized = normalizeNotice(input)
  return normalized.length === 0 ? [] : normalized.split(" ")
}

/** keccak256 of the normalized text: the `text_hash` attribute on a notice. */
export function hashNoticeText(input: string): Hex {
  return keccak256(stringToBytes(normalizeNotice(input)))
}

/** keccak256 of raw file bytes: the `file_hash` attribute (PDFs, offer letters). */
export function hashFileBytes(bytes: Uint8Array): Hex {
  return keccak256(bytes)
}

/**
 * Notice codes are printed on the notice ("Asli code: DBSE-26-7K3Q"). People retype them, so
 * the lookup ignores case, spaces and dash style.
 */
export function normalizeCode(code: string): string {
  return code
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s_–—]+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}
