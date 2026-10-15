import { noticeWords } from "./normalize"

export type DiffOp =
  | { type: "same"; words: string[] }
  | { type: "removed"; words: string[] }
  | { type: "added"; words: string[] }

/** A word-level edit, ready to show as "12 march → 15 march". */
export type Change = { original: string; forwarded: string }

export type MatchResult =
  | { kind: "exact"; similarity: 1; candidateIndex: number }
  | {
      kind: "altered"
      similarity: number
      candidateIndex: number
      ops: DiffOp[]
      changes: Change[]
    }
  | { kind: "unrelated"; similarity: number }

/** At or above this share of shared words, a forward is a doctored copy, not a new text. */
export const ALTERED_THRESHOLD = 0.6

/** Longest-common-subsequence diff over words. Notices are short, so O(n·m) is fine. */
export function diffWords(original: string[], forwarded: string[]): DiffOp[] {
  const n = original.length
  const m = forwarded.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        original[i] === forwarded[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const ops: DiffOp[] = []
  const push = (type: DiffOp["type"], word: string) => {
    const last = ops[ops.length - 1]
    if (last && last.type === type) last.words.push(word)
    else ops.push({ type, words: [word] })
  }

  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (original[i] === forwarded[j]) {
      push("same", original[i])
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push("removed", original[i++])
    } else {
      push("added", forwarded[j++])
    }
  }
  while (i < n) push("removed", original[i++])
  while (j < m) push("added", forwarded[j++])
  return ops
}

/** Share of words the two texts have in common (Dice coefficient over the LCS). */
export function similarity(original: string[], forwarded: string[]): number {
  if (original.length === 0 && forwarded.length === 0) return 1
  const shared = diffWords(original, forwarded)
    .filter((op) => op.type === "same")
    .reduce((sum, op) => sum + op.words.length, 0)
  return (2 * shared) / (original.length + forwarded.length)
}

/** Groups removed/added runs into human-readable replacements. */
export function describeChanges(ops: DiffOp[]): Change[] {
  const changes: Change[] = []
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k]
    if (op.type === "same") continue
    const next = ops[k + 1]
    if (op.type === "removed" && next?.type === "added") {
      changes.push({ original: op.words.join(" "), forwarded: next.words.join(" ") })
      k++
    } else if (op.type === "removed") {
      changes.push({ original: op.words.join(" "), forwarded: "" })
    } else {
      changes.push({ original: "", forwarded: op.words.join(" ") })
    }
  }
  return changes
}

/**
 * Compares a pasted forward against an issuer's real notices and returns the best verdict:
 * an exact copy, a doctored copy of one of them (with what changed), or unrelated.
 */
export function matchAgainst(forwardedText: string, candidates: string[]): MatchResult {
  const forwarded = noticeWords(forwardedText)
  let best: { index: number; score: number; words: string[] } | undefined

  candidates.forEach((candidate, index) => {
    const words = noticeWords(candidate)
    if (words.join(" ") === forwarded.join(" ")) {
      best = { index, score: 1, words }
      return
    }
    const score = similarity(words, forwarded)
    if (!best || (best.score < 1 && score > best.score)) best = { index, score, words }
  })

  if (!best) return { kind: "unrelated", similarity: 0 }
  if (best.score === 1 && best.words.join(" ") === forwarded.join(" ")) {
    return { kind: "exact", similarity: 1, candidateIndex: best.index }
  }
  if (best.score >= ALTERED_THRESHOLD) {
    const ops = diffWords(best.words, forwarded)
    return {
      kind: "altered",
      similarity: best.score,
      candidateIndex: best.index,
      ops,
      changes: describeChanges(ops),
    }
  }
  return { kind: "unrelated", similarity: best.score }
}
