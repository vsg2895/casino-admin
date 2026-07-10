import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type {
  SiteVerifyEmail,
  UpdateSiteVerifyEmailPayload,
} from '@shared/types/siteVerifyEmail'

export function getVerifyEmail(siteId: number): Promise<ApiResponse<SiteVerifyEmail>> {
  return client
    .get<ApiResponse<SiteVerifyEmail>>(`/admin/sites/${siteId}/verify-email`)
    .then((r) => r.data)
}

export function updateVerifyEmail(
  siteId: number,
  payload: UpdateSiteVerifyEmailPayload,
): Promise<ApiResponse<SiteVerifyEmail>> {
  return client
    .put<ApiResponse<SiteVerifyEmail>>(`/admin/sites/${siteId}/verify-email`, payload)
    .then((r) => r.data)
}

// Render the (unsaved) template to HTML for the live preview pane.
export function previewVerifyEmail(
  siteId: number,
  payload: UpdateSiteVerifyEmailPayload,
): Promise<{ html: string }> {
  return client
    .post<{ html: string }>(`/admin/sites/${siteId}/verify-email/preview`, payload)
    .then((r) => r.data)
}

// Send a test of the saved template to an arbitrary address.
export function sendTestVerifyEmail(
  siteId: number,
  to: string,
  name?: string,
): Promise<{ ok: boolean; message: string }> {
  return client
    .post<{ ok: boolean; message: string }>(`/admin/sites/${siteId}/verify-email/test`, { to, name })
    .then((r) => r.data)
}
