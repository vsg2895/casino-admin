import client from './client'
import type { SpecialOffer } from '@shared/types/specialOffer'
import type { ApiResponse } from '@shared/types/api'

export interface CreateSpecialOfferPayload {
  casino_id: number
  title: string
  image_path?: string | null
  banner_image?: string | null
  bonuses?: string | null
  affiliate_url?: string | null
  description?: string | null
  rating?: number
  sort_order?: number
  active?: boolean
}

export type UpdateSpecialOfferPayload = Partial<CreateSpecialOfferPayload>

export function listSpecialOffers(): Promise<ApiResponse<SpecialOffer[]>> {
  return client.get<ApiResponse<SpecialOffer[]>>('/admin/special-offers').then((r) => r.data)
}

// Total special offers. A dedicated COUNT on the server, issued separately from
// the listing so that query never carries its weight.
export function countSpecialOffers(): Promise<number> {
  return client.get<{ total: number }>('/admin/special-offers/count').then((r) => r.data.total)
}

export function getSpecialOffer(id: number): Promise<ApiResponse<SpecialOffer>> {
  return client.get<ApiResponse<SpecialOffer>>(`/admin/special-offers/${id}`).then((r) => r.data)
}

export function createSpecialOffer(payload: CreateSpecialOfferPayload): Promise<ApiResponse<SpecialOffer>> {
  return client.post<ApiResponse<SpecialOffer>>('/admin/special-offers', payload).then((r) => r.data)
}

export function updateSpecialOffer(id: number, payload: UpdateSpecialOfferPayload): Promise<ApiResponse<SpecialOffer>> {
  return client.put<ApiResponse<SpecialOffer>>(`/admin/special-offers/${id}`, payload).then((r) => r.data)
}

export function deleteSpecialOffer(id: number): Promise<void> {
  return client.delete(`/admin/special-offers/${id}`).then(() => undefined)
}

export function duplicateSpecialOffer(id: number): Promise<ApiResponse<SpecialOffer>> {
  return client.post<ApiResponse<SpecialOffer>>(`/admin/special-offers/${id}/duplicate`).then((r) => r.data)
}
