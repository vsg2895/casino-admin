/**
 * SMS segment arithmetic — the one client-side definition.
 *
 * Shared by the template editor and the bulk-send dialog so the two can never
 * disagree about what a message costs. Mirrors SmsTemplate::segments() on the
 * server, which computes the same figures for the listing.
 *
 * Why it matters: a GSM-7 segment is 160 characters, but the moment a message
 * contains one character outside that alphabet the WHOLE message is re-encoded as
 * UCS-2 and a segment drops to 70. A single curly quote pasted from Word, or one
 * emoji, can turn a 1-segment blast into 3 — billed per segment, per recipient.
 * At 50,000 recipients that is the difference between 50k and 150k messages.
 */

export const GSM_SEGMENT = 160
export const UNICODE_SEGMENT = 70

/**
 * Whether the text forces UCS-2 encoding.
 *
 * Approximated as "contains a non-ASCII character". Not exact — GSM-7 includes a
 * few characters outside ASCII and excludes a few inside it — but it errs towards
 * warning, which is the safe direction when the consequence is a silently
 * multiplied bill.
 */
export function usesUnicode(text: string): boolean {
  return /[^\x00-\x7F]/.test(text)
}

export function segmentSize(text: string): number {
  return usesUnicode(text) ? UNICODE_SEGMENT : GSM_SEGMENT
}

export function segmentCount(text: string): number {
  return text.length === 0 ? 0 : Math.ceil(text.length / segmentSize(text))
}

/** The line shown under a compose box, e.g. "72 characters · 1 segment · …". */
export function segmentSummary(text: string): string {
  const segments = segmentCount(text)
  const encoding = usesUnicode(text)
    ? 'non-GSM characters detected, so a segment is 70 characters'
    : 'a segment is 160 characters'

  return (
    `${text.length} characters · ${segments} segment${segments === 1 ? '' : 's'} · ${encoding}` +
    (segments > 1 ? ' — each segment is billed separately.' : '')
  )
}
