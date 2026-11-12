/**
 * Near-duplicate detection for per-site content (warnings only, never blocking).
 *
 * Text is normalised (tags stripped, lower-cased, punctuation dropped), cut into
 * overlapping word shingles, and two texts are compared by the Jaccard index of
 * their shingle sets. Long texts use 5-word shingles; short ones (meta titles
 * and descriptions) use 2-word shingles, because a 10-word title has too few
 * 5-word windows for the score to mean anything.
 */

export const SIMILARITY_THRESHOLD = 0.5

export function normaliseWords(html: string | null | undefined): string[] {
  return (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w !== '')
}

export function shingles(words: string[], size: number): Set<string> {
  const out = new Set<string>()
  if (words.length === 0) return out
  if (words.length < size) {
    out.add(words.join(' '))
    return out
  }
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(' '))
  return out
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const s of a) if (b.has(s)) shared++
  return shared / (a.size + b.size - shared)
}

/** Similarity of two texts, 0–1. `short` = meta fields. */
export function similarity(x: string | null | undefined, y: string | null | undefined, short = false): number {
  const size = short ? 2 : 5
  const a = normaliseWords(x)
  const b = normaliseWords(y)
  if (a.length === 0 || b.length === 0) return 0
  if (a.join(' ') === b.join(' ')) return 1
  return jaccard(shingles(a, size), shingles(b, size))
}

/** Names of the candidates whose text is too close to `text`. */
export function similarTo(
  text: string | null | undefined,
  candidates: { name: string; text: string | null | undefined }[],
  short = false,
): string[] {
  if (normaliseWords(text).length === 0) return []
  return candidates.filter((c) => similarity(text, c.text, short) > SIMILARITY_THRESHOLD).map((c) => c.name)
}
