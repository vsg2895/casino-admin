/**
 * Turning a date picker's value into a filter the server can read.
 *
 * Two functions, because sending a day to the API takes two pieces of
 * information and sending only one of them is the bug this file exists to
 * prevent.
 *
 * ── Why `toISOString().slice(0, 10)` is wrong ───────────────────────────────
 *
 * A date picker hands back a Date at LOCAL midnight. `toISOString()` converts
 * to UTC first, so for an operator in UTC+3 the 20th becomes
 * `2026-10-19T21:00:00Z` and the slice yields "2026-10-19" — picking the 20th
 * filters the 19th. The date is shifted a whole day before it ever leaves the
 * browser, and nothing downstream can recover it.
 *
 * ── Why the local date alone is not enough either ───────────────────────────
 *
 * The columns these filters compare against are stored in UTC. "2026-10-20"
 * means the operator's 20th, which starts at 21:00 UTC on the 19th — so the
 * server has to know the zone to place the boundary. Without it, it assumes
 * UTC midnight and the operator silently loses the first hours of their own
 * day out of every window, while the table (rendered in local time) still
 * shows those rows. See App\Support\DayWindow on the server.
 */

/**
 * The LOCAL calendar date, as `YYYY-MM-DD`.
 *
 * Built from the local getters rather than from an ISO string, so the day the
 * operator clicked is the day that gets sent.
 */
export function asLocalDate(d: Date | null | undefined): string | null {
  if (!d) return null

  const pad = (n: number): string => String(n).padStart(2, '0')

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The browser's IANA timezone, e.g. "Europe/Tallinn".
 *
 * Paired with `asLocalDate()` on every request that carries a day filter.
 * Falls back to UTC on the rare runtime that resolves nothing — which is also
 * what the server defaults to, so the two agree either way.
 */
export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}
