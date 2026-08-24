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
// `siteId` resolves the placeholders exactly as the preview does.
export function sendTestVerificationPromotion(
  to: string,
  name?: string,
  siteId?: number | null,
): Promise<{ ok: boolean; message: string }> {
  return client
    .post<{ ok: boolean; message: string }>('/admin/verification-promotion/test', {
      to,
      name,
      site_id: siteId ?? null,
    })
    .then((r) => r.data)
}
