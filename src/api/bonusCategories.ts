import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { BonusCategory, UpsertBonusCategoryPayload } from '@shared/types/bonusCategory'

// Bonus categories are GLOBAL, not per-site — a bonus type is a property of the
// offer, not of the domain showing it. Whether a site publishes the Bonus area
// at all is the per-site `bonus_enabled` flag on the site itself.
//
// The admin listing includes hidden categories; the public endpoint cannot.

export function listBonusCategories(): Promise<BonusCategory[]> {
  return client.get<ApiResponse<BonusCategory[]>>('/admin/bonus-categories').then((r) => r.data.data)
}

export function createBonusCategory(payload: UpsertBonusCategoryPayload): Promise<BonusCategory> {
  return client
    .post<ApiResponse<BonusCategory>>('/admin/bonus-categories', payload)
    .then((r) => r.data.data)
}

export function updateBonusCategory(
  id: number,
  payload: UpsertBonusCategoryPayload,
): Promise<BonusCategory> {
  return client
    .put<ApiResponse<BonusCategory>>(`/admin/bonus-categories/${id}`, payload)
    .then((r) => r.data.data)
}

export function deleteBonusCategory(id: number): Promise<{ orphaned: number; message: string }> {
  return client
    .delete<{ orphaned: number; message: string }>(`/admin/bonus-categories/${id}`)
    .then((r) => r.data)
}
