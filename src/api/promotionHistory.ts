import client from './client'
import type { PaginatedResponse } from '@shared/types/api'
import type { PromotionEmailHistory } from '@shared/types/promotionEmailHistory'

export interface PromotionHistoryFilters {
  page?: number
  site_id?: number
  from?: string // Y-m-d
  to?: string // Y-m-d
  search?: string // email prefix
}

export function listPromotionHistory(
  params?: PromotionHistoryFilters,
): Promise<PaginatedResponse<PromotionEmailHistory>> {
  return client
    .get<PaginatedResponse<PromotionEmailHistory>>('/admin/promotion-history', { params })
    .then((r) => r.data)
}
