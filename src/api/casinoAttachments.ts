import client from './client'
import type { ApiResponse } from '@shared/types/api'

export interface CasinoAttachmentEntry {
  site_id: number
  affiliate_url: string
  position: number
  featured: boolean
  active?: boolean
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
