import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type {
  SitePromotionEmail,
  UpdateSitePromotionEmailPayload,
} from '@shared/types/sitePromotionEmail'

export function getPromotionEmail(siteId: number): Promise<ApiResponse<SitePromotionEmail>> {
  return client
    .get<ApiResponse<SitePromotionEmail>>(`/admin/sites/${siteId}/promotion-email`)
    .then((r) => r.data)
}

export function updatePromotionEmail(
  siteId: number,
  payload: UpdateSitePromotionEmailPayload,
): Promise<ApiResponse<SitePromotionEmail>> {
  return client
    .put<ApiResponse<SitePromotionEmail>>(`/admin/sites/${siteId}/promotion-email`, payload)
    .then((r) => r.data)
}

// Render the (unsaved) template to HTML for the live preview pane.
export function previewPromotionEmail(
  siteId: number,
  payload: UpdateSitePromotionEmailPayload,
): Promise<{ html: string }> {
  return client
    .post<{ html: string }>(`/admin/sites/${siteId}/promotion-email/preview`, payload)
    .then((r) => r.data)
}

// Send a test of the saved template to an arbitrary address.
export function sendTestPromotionEmail(
  siteId: number,
  to: string,
): Promise<{ ok: boolean; message: string }> {
  return client
    .post<{ ok: boolean; message: string }>(`/admin/sites/${siteId}/promotion-email/test`, { to })
    .then((r) => r.data)
}
