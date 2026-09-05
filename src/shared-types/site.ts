// Fields match SiteResource.php exactly. api_key is never present.
export interface Site {
  id: number
  name: string
  slug: string
  domain: string
  // One short sentence saying what makes this brand different. It is appended to
  // every generated legal page's meta description, so the eleven standard pages
  // stop reading identically across the sibling domains. Null = the previous
  // generic wording.
  positioning: string | null
  revalidation_url: string | null
  settings: Record<string, unknown> | null
  active: boolean
  /**
   * Does this site publish the countries filter? Opt-in per site, off by
   * default. The public /countries endpoints 404 when it is false, so this is
   * what the front end reads to decide whether to render the nav link at all.
   */
  countries_enabled: boolean
  /**
   * Does this site display AND accept visitor reviews? Opt-in per site, off by
   * default. Gates both directions — the public read and write endpoints 404
   * when it is false.
   */
  reviews_enabled: boolean
  created_at: string
  updated_at: string
}

// Returned only by POST /admin/sites and POST /admin/sites/{id}/rotate-key.
// The api_key is the plain text value shown exactly once.
export interface SiteRegistrationResponse extends Site {
  api_key: string
  this_key_will_not_be_shown_again: true
}
