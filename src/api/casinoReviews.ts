import client from './client'
import type { ApiResponse, PaginatedResponse } from '@shared/types/api'
import type { CasinoReview, CasinoReviewStatus } from '@shared/types/casinoReview'

export interface CasinoReviewFilters {
  page?: number
  per_page?: number
  search?: string
  status?: CasinoReviewStatus
  site_id?: number
  casino_id?: number
  rating?: number
}

export function listReviews(params?: CasinoReviewFilters): Promise<PaginatedResponse<CasinoReview>> {
  return client
    .get<PaginatedResponse<CasinoReview>>('/admin/reviews', { params })
    .then((r) => r.data)
}

// Dedicated COUNT, issued separately so the paginated query never carries its
// weight — the same split the newsletter and receiver lists use.
export function countReviews(
  params?: Omit<CasinoReviewFilters, 'page' | 'per_page'>,
): Promise<number> {
  return client
    .get<{ total: number }>('/admin/reviews/count', { params })
    .then((r) => r.data.total)
}

/** How many are waiting to be moderated, regardless of the current filters. */
export function countPendingReviews(): Promise<number> {
  return client
    .get<{ total: number }>('/admin/reviews/pending-count')
    .then((r) => r.data.total)
}

/** Show or hide one review. One endpoint taking a boolean, so the two can't drift. */
export function setReviewVisibility(
  id: number,
  published: boolean,
): Promise<ApiResponse<CasinoReview>> {
  return client
    .patch<ApiResponse<CasinoReview>>(`/admin/reviews/${id}/visibility`, { published })
    .then((r) => r.data)
}

/** Permanent — there is no soft delete on this model. */
export function deleteReview(id: number): Promise<void> {
  return client.delete(`/admin/reviews/${id}`).then(() => undefined)
}

export function bulkReviews(
  action: 'publish' | 'hide' | 'delete',
  ids: number[],
): Promise<number> {
  return client
    .post<{ affected: number }>('/admin/reviews/bulk', { action, ids })
    .then((r) => r.data.affected)
}
