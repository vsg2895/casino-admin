import client from './client'
import type { PaginatedResponse } from '@shared/types/api'
import type { PromotionEmailHistory, PromotionEmailStatus } from '@shared/types/promotionEmailHistory'

export interface PromotionHistoryFilters {
  page?: number
  site_id?: number
  from?: string // Y-m-d
  to?: string // Y-m-d
  search?: string // email prefix
  status?: PromotionEmailStatus
}

export function listPromotionHistory(
  params?: PromotionHistoryFilters,
): Promise<PaginatedResponse<PromotionEmailHistory>> {
  return client
    .get<PaginatedResponse<PromotionEmailHistory>>('/admin/promotion-history', { params })
    .then((r) => r.data)
}

// Total matching the current filters. A dedicated COUNT on the server, issued
// separately from the listing so the paginated query never carries its weight.
export function countPromotionHistory(
  params?: Omit<PromotionHistoryFilters, 'page'>,
): Promise<number> {
  return client
    .get<{ total: number }>('/admin/promotion-history/count', { params })
    .then((r) => r.data.total)
}
