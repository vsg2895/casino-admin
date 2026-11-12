/**
 * Per-site content overrides for casinos and special offers (admin only).
 *
 * The record's own fields are the default content (the default site's, and
 * every other site's fallback). A site's row replaces them field by field;
 * null means "uses the default".
 */

export interface SiteContentFields {
  description: string | null
  meta_title: string | null
  meta_description: string | null
  /** null = inherit; true = Noindex on this site; false = Index on this site. */
  noindex: boolean | null
}

export interface SiteContentRow extends SiteContentFields {
  updated_at: string | null
}

export interface SiteContentSite {
  site_id: number
  name: string
  slug: string
  domain: string
  /** Whether the site publishes the record at all (casino attached and active). */
  attached: boolean
  /** null = uses the default. */
  content: SiteContentRow | null
}

export interface SiteContentOverview {
  default_site: { id: number; name: string; slug: string; domain: string } | null
  default: {
    description: string | null
    meta_title: string | null
    meta_description: string | null
    noindex: boolean
  }
  sites: SiteContentSite[]
}

export interface SiteContentSaved {
  site_id: number
  content: SiteContentRow | null
}

export type CoverageStatus = 'custom' | 'default' | 'not_attached'

export interface ContentCoverage {
  type: 'casino' | 'offer'
  sites: { id: number; name: string; slug: string }[]
  rows: {
    id: number
    name: string
    slug: string
    casino_name: string | null
    /** Keyed by site slug. */
    cells: Record<string, CoverageStatus>
  }[]
}
