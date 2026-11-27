/**
 * Special Offers visitor IP records.
 *
 * Mirrors App\Http\Resources\SpecialOfferVisitResource and
 * SpecialOfferVisitIpResource. snake_case, because that is what the API sends
 * — the admin converts at the boundary, it does not reshape the API.
 */

/** Where a value came from. Mirrors the `type` enum on special_offer_visit_ips. */
export type VisitIpType =
  /**
   * The site's own Next.js server stating who called IT.
   *
   * The only address that survives the hop to the API, because that hop goes
   * through Cloudflare a second time and Cloudflare rewrites every other
   * address header with the calling server's own. Highest priority upstream.
   */
  | 'site_reported'
  | 'remote_addr'
  | 'cf_connecting_ip'
  | 'true_client_ip'
  | 'x_real_ip'
  | 'x_forwarded_for'
  | 'x_client_ip'
  | 'forwarded'
  | 'client_ipv4'
  | 'client_ipv6'

/**
 * WHO said it.
 *
 * `client_reported` is spoofable — anyone can POST any address — and the admin
 * is required to badge it as such rather than showing it beside a
 * `server_seen` value as if the two carried equal weight.
 */
export type VisitIpSource = 'server_seen' | 'client_reported'

export interface SpecialOfferVisitIp {
  id: number
  ip: string
  /** null for an mDNS hostname, which is not an address at all. */
  ip_version: 4 | 6 | null
  is_private: boolean
  is_mdns: boolean
  type: VisitIpType
  source: VisitIpSource

  country_code: string | null
  country: string | null
  region: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  timezone: string | null
  isp: string | null
  org: string | null
  asn: string | null
  is_proxy: boolean
  is_vpn: boolean
  is_hosting: boolean
  /** Set once a lookup has been ATTEMPTED — success or failure. */
  geo_resolved_at: string | null
  /** Detail view only. The provider's whole payload. */
  geo_raw?: Record<string, unknown> | null
}

export interface SpecialOfferVisit {
  id: number
  visit_uuid: string
  created_at: string | null

  special_offer_id: number
  special_offer?: {
    id: number
    title: string
    slug: string
    casino: { id: number; name: string } | null
  }
  site?: { id: number; name: string; slug: string }

  primary_ip: string | null

  /** Flattened from the primary address, so the list needs no per-row walk. */
  country_code: string | null
  country: string | null
  city: string | null
  isp: string | null

  ip_mismatch: boolean
  vpn_suspected: boolean
  is_proxy: boolean
  is_hosting: boolean
  unique_ip_count: number

  client_ipv4: string | null
  client_ipv6: string | null

  device_type: string | null
  browser: string | null
  os: string | null
  /** What the visitor answered in the cookie banner when this was recorded. */
  consent: 'all' | 'necessary' | null

  /**
   * TRUE / FALSE / null, and null is NOT "they agree": it means one of the two
   * zones is unknown. Render the three states distinctly.
   */
  timezone_mismatch: boolean | null

  // Detail view only.
  page_url?: string | null
  referer?: string | null
  user_agent?: string | null
  accept_language?: string | null
  browser_timezone?: string | null
  screen_size?: string | null
  platform?: string | null
  headers_raw?: Record<string, string | null> | null

  ips?: SpecialOfferVisitIp[]
}

export interface SpecialOfferVisitStats {
  visits_today: number
  visits_7d: number
  visits_30d: number
  visits_total: number
  unique_ips: number
  vpn_suspected: number
  /** Integer percent of the FILTERED set, not of all time. */
  vpn_percent: number
  top_countries: Array<{ country_code: string; visits: number }>
}

export interface SpecialOfferVisitFilters {
  date_from?: string
  date_to?: string
  special_offer_id?: number
  casino_id?: number
  site_id?: number
  country_code?: string
  /** Searches across EVERY address of a visit, not just the primary one. */
  ip?: string
  ip_type?: VisitIpType
  mismatch_only?: boolean
  vpn_only?: boolean
  has_ipv6?: boolean
  page?: number
  per_page?: number
}
