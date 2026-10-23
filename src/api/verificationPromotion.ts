import client from './client'
import type { PaginatedResponse } from '@shared/types/api'
import type {
  UpdateVerificationPromotionEmailPayload,
  VerificationPromotionEmail,
  VerificationPromotionHistoryEntry,
  VerificationPromotionSendStatus,
} from '@shared/types/verificationPromotionEmail'

// The global post-verification promotion. Note the absence of a site id in every
// path: there is exactly one of these for all sites.
//
// The backend returns the resource unwrapped (response()->json(new Resource(...)))
// rather than in a `data` envelope, so these resolve to the object directly.

export function getVerificationPromotion(): Promise<VerificationPromotionEmail> {
  return client
    .get<VerificationPromotionEmail>('/admin/verification-promotion')
    .then((r) => r.data)
}

export function updateVerificationPromotion(
  payload: UpdateVerificationPromotionEmailPayload,
): Promise<VerificationPromotionEmail> {
  return client
    .put<VerificationPromotionEmail>('/admin/verification-promotion', payload)
    .then((r) => r.data)
}

// Render the (unsaved) template to HTML for the live preview pane. `siteId`
// selects which registered site the {{site_name}} / {{site_url}} placeholders
// resolve against; omit it to let the server pick a representative site.
export function previewVerificationPromotion(
  payload: UpdateVerificationPromotionEmailPayload,
  siteId?: number | null,
): Promise<{ html: string }> {
  return client
    .post<{ html: string }>('/admin/verification-promotion/preview', { ...payload, site_id: siteId ?? null })
    .then((r) => r.data)
}

// Send a test of the SAVED template through the SAVED transport — the same
// provider + key the real promotion uses, so a success here proves that path.
// Same fixed branding as the automatic send, so the test is byte-identical.
/**
 * Send a one-off test of the saved template.
 *
 * `siteId` does NOT change what lands in the inbox — this template is pinned to
 * one brand on the server, so the mail is identical whichever site is chosen.
 * What it decides is which site the row is filed under in the After-verification
 * history, and therefore whether the "Site" filter on that tab can find it.
 *
 * Omitted, the server falls back to the first active site, which is what it did
 * before the picker existed.
 */
export function sendTestVerificationPromotion(
  to: string,
  name?: string,
  siteId?: number | null,
): Promise<{ ok: boolean; message: string }> {
  return client
    .post<{ ok: boolean; message: string }>('/admin/verification-promotion/test', {
      to,
      name,
      // Only send the key when there is a value: `site_id: null` would be
      // rejected by nothing, but an absent field is what the server's fallback
      // branch is written against.
      ...(siteId == null ? {} : { site_id: siteId }),
    })
    .then((r) => r.data)
}

// ── per-site image + link overrides ─────────────────────────────────────────
//
// The promotion stays ONE global template. These change only the hero image
// and where the links point, for one site, and can carry no text at all — the
// email's copy is identical on every site by design.

export interface VerificationPromotionOverride {
  site_id: number
  site_name: string
  site_slug: string
  domain: string
  /** Whether this site currently changes anything. */
  active: boolean
  hero_image_url: string | null
  hero_url: string | null
  top_button_url: string | null
  cta_button_url: string | null
  email_preferences_url: string | null
  /** Positional targets for the template's own footer links. URLs only. */
  footer_link_urls: (string | null)[]
}

export interface VerificationPromotionOverridePage {
  /** The template's footer link LABELS, so each URL input can be captioned. */
  footer_link_labels: string[]
  data: VerificationPromotionOverride[]
}

export function listVerificationPromotionOverrides(): Promise<VerificationPromotionOverridePage> {
  return client
    .get<VerificationPromotionOverridePage>('/admin/verification-promotion/overrides')
    .then((r) => r.data)
}

export type UpdateVerificationPromotionOverridePayload = Pick<
  VerificationPromotionOverride,
  'hero_image_url' | 'hero_url' | 'top_button_url' | 'cta_button_url' | 'email_preferences_url' | 'footer_link_urls'
>

export function updateVerificationPromotionOverride(
  siteId: number,
  payload: UpdateVerificationPromotionOverridePayload,
): Promise<{ data: { site_id: number; active: boolean } }> {
  return client
    .put<{ data: { site_id: number; active: boolean } }>(
      `/admin/verification-promotion/overrides/${siteId}`,
      payload,
    )
    .then((r) => r.data)
}

// ── Send history ─────────────────────────────────────────────────────────────
//
// The stream's own log, shaped exactly like the warmup history: a lazy listing
// plus a dedicated COUNT, so the badge never rides on the paginated query.

export interface VerificationPromotionHistoryFilters {
  page?: number
  per_page?: number
  /** PREFIX match on the address, like the newsletter and warmup searches. */
  search?: string
  site_id?: number
  status?: VerificationPromotionSendStatus
  /**
   * Inclusive `sent_at` bounds as `YYYY-MM-DD`. Both ends cover the whole day in
   * the column's own zone, so a row sent near midnight can fall on the adjacent
   * day from the one the table displays locally.
   */
  sent_from?: string
  sent_to?: string
  /**
   * The operator's IANA timezone, so the server can place the day boundaries
   * of the date filters above against the UTC column they compare. Set
   * automatically from the browser; never a user-facing control.
   * See utils/dayFilters.
   */
  tz?: string
}

export function listVerificationPromotionHistory(
  params?: VerificationPromotionHistoryFilters,
): Promise<PaginatedResponse<VerificationPromotionHistoryEntry>> {
  return client
    .get<PaginatedResponse<VerificationPromotionHistoryEntry>>(
      '/admin/verification-promotion/history',
      { params },
    )
    .then((r) => r.data)
}

/**
 * Totals for the current filters.
 *
 * Returns both numbers the header needs: how many attempts match, and how many
 * of those failed — counted over the whole filtered set rather than the page.
 */
/** Remove ONE row of this stream's history. */
export function deleteVerificationPromotionHistory(id: number): Promise<void> {
  return client.delete(`/admin/verification-promotion/history/${id}`).then(() => undefined)
}

export function countVerificationPromotionHistory(
  params?: Omit<VerificationPromotionHistoryFilters, 'page' | 'per_page'>,
): Promise<{ total: number; failed: number }> {
  return client
    .get<{ total: number; failed: number }>('/admin/verification-promotion/history/count', {
      params,
    })
    .then((r) => r.data)
}
