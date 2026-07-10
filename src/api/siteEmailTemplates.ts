import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type {
  SiteEmailTemplate,
  UpdateSiteEmailTemplatePayload,
} from '@shared/types/siteEmailTemplate'

export function getEmailTemplate(siteId: number): Promise<ApiResponse<SiteEmailTemplate>> {
  return client
    .get<ApiResponse<SiteEmailTemplate>>(`/admin/sites/${siteId}/email-template`)
    .then((r) => r.data)
}

export function updateEmailTemplate(
  siteId: number,
  payload: UpdateSiteEmailTemplatePayload,
): Promise<ApiResponse<SiteEmailTemplate>> {
  return client
    .put<ApiResponse<SiteEmailTemplate>>(`/admin/sites/${siteId}/email-template`, payload)
    .then((r) => r.data)
}

// Render the (unsaved) template to HTML for the live preview pane.
export function previewEmailTemplate(
  siteId: number,
  payload: UpdateSiteEmailTemplatePayload,
): Promise<{ html: string }> {
  return client
    .post<{ html: string }>(`/admin/sites/${siteId}/email-template/preview`, payload)
    .then((r) => r.data)
}

// Send a test of the saved template to an arbitrary address.
export function sendTestEmail(
  siteId: number,
  to: string,
  name?: string,
): Promise<{ ok: boolean; message: string }> {
  return client
    .post<{ ok: boolean; message: string }>(`/admin/sites/${siteId}/email-template/test`, { to, name })
    .then((r) => r.data)
}
