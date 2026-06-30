import client from './client'
import type { Casino } from '@shared/types/casino'
import type { ApiResponse, PaginatedResponse } from '@shared/types/api'

export interface CreateCasinoPayload {
  name: string
  image_path?: string | null
  banner_image?: string | null
  bonuses?: string | null
  affiliate_url?: string | null
  description?: string | null
  rating?: number
  sort_order?: number
  featured_special_offer_id?: number | null
  meta_title?: string | null
  meta_description?: string | null
  active?: boolean
  category_ids?: number[]
}

export type UpdateCasinoPayload = Partial<CreateCasinoPayload>

export function listCasinos(params?: {
  page?: number
  per_page?: number
}): Promise<PaginatedResponse<Casino>> {
  return client.get<PaginatedResponse<Casino>>('/admin/casinos', { params }).then((r) => r.data)
}

export function getCasino(id: number): Promise<ApiResponse<Casino>> {
  return client.get<ApiResponse<Casino>>(`/admin/casinos/${id}`).then((r) => r.data)
}

export function createCasino(payload: CreateCasinoPayload): Promise<ApiResponse<Casino>> {
  return client.post<ApiResponse<Casino>>('/admin/casinos', payload).then((r) => r.data)
}

export function updateCasino(id: number, payload: UpdateCasinoPayload): Promise<ApiResponse<Casino>> {
  return client.put<ApiResponse<Casino>>(`/admin/casinos/${id}`, payload).then((r) => r.data)
}

export function deleteCasino(id: number): Promise<void> {
  return client.delete(`/admin/casinos/${id}`).then(() => undefined)
}
