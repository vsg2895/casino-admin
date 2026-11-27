import type { VisitIpType } from '@shared/types/specialOfferVisit'

/**
 * Human names for the `type` enum.
 *
 * Deliberately says WHERE a value was read from rather than inventing a
 * friendlier word: an operator judging whether to believe an address needs to
 * know it came from `X-Forwarded-For` rather than that it is "the visitor's
 * IP", which is the claim under examination.
 */
export const IP_TYPE_LABELS: Record<VisitIpType, string> = {
  site_reported: 'Reported by the site server',
  remote_addr: 'REMOTE_ADDR (connection peer)',
  cf_connecting_ip: 'CF-Connecting-IP',
  true_client_ip: 'True-Client-IP',
  x_real_ip: 'X-Real-IP',
  x_forwarded_for: 'X-Forwarded-For',
  x_client_ip: 'X-Client-IP',
  forwarded: 'Forwarded (RFC 7239)',
  client_ipv4: 'Client probe — IPv4',
  client_ipv6: 'Client probe — IPv6',
}

export const IP_TYPE_OPTIONS = (Object.keys(IP_TYPE_LABELS) as VisitIpType[]).map((value) => ({
  value,
  label: IP_TYPE_LABELS[value],
}))

/**
 * ISO 3166-1 alpha-2 to a flag, by mapping each letter to its regional
 * indicator symbol. No image assets and no network: the pair of code points
 * IS the flag, and a code the font cannot render degrades to two letters
 * rather than a broken image.
 */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return ''

  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split('')
      .map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65)),
  )
}
