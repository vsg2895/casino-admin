import client from './client'
import type {
  UpdateVerificationPromotionEmailPayload,
  VerificationPromotionEmail,
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
export function sendTestVerificationPromotion(
  to: string,
  name?: string,
): Promise<{ ok: boolean; message: string }> {
  return client
    .post<{ ok: boolean; message: string }>('/admin/verification-promotion/test', { to, name })
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
