import client from './client'
import type { ApiResponse } from '@shared/types/api'

export interface CasinoAttachmentEntry {
  site_id: number
  affiliate_url: string
  position: number
  featured: boolean
  active?: boolean
  // Per-site byline. Returned by the listing; never sent with sync() — it has
  // its own endpoint so saving the attachment table cannot wipe it.
  author_id?: number | null
  reviewed_by_id?: number | null
  last_reviewed_at?: string | null
  // This site's own review text; null = the shared description. Own endpoint,
  // never sent with sync(), for the same reason as the byline.
  description?: string | null
}

export interface CasinoBylinePayload {
  author_id: number | null
  reviewed_by_id: number | null
  last_reviewed_at: string | null
}

export function getCasinoAttachments(casinoId: number): Promise<ApiResponse<CasinoAttachmentEntry[]>> {
  return client
    .get<ApiResponse<CasinoAttachmentEntry[]>>(`/admin/casinos/${casinoId}/sites`)
    .then((r) => r.data)
}

export function syncCasinoAttachments(
  casinoId: number,
  sites: CasinoAttachmentEntry[],
): Promise<ApiResponse<CasinoAttachmentEntry[]>> {
  // Backend (SyncCasinoSitesRequest) expects the payload under `sites`.
  return client
    .post<ApiResponse<CasinoAttachmentEntry[]>>(`/admin/casinos/${casinoId}/sites/sync`, { sites })
    .then((r) => r.data)
}

/** One site's "Written by / Reviewed by" for this casino. */
export function updateCasinoByline(
  casinoId: number,
  siteId: number,
  payload: CasinoBylinePayload,
): Promise<ApiResponse<CasinoAttachmentEntry>> {
  return client
    .put<ApiResponse<CasinoAttachmentEntry>>(`/admin/casinos/${casinoId}/sites/${siteId}/byline`, payload)
    .then((r) => r.data)
}

/** This site's own review text for this casino; null or empty clears it. */
export function updateCasinoSiteDescription(
  casinoId: number,
  siteId: number,
  description: string | null,
): Promise<ApiResponse<CasinoAttachmentEntry>> {
  return client
    .put<ApiResponse<CasinoAttachmentEntry>>(`/admin/casinos/${casinoId}/sites/${siteId}/description`, { description })
    .then((r) => r.data)
}
