import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { SimplePaginatedResponse } from '@shared/types/pagination'
import type { SiteRevalidation } from '@shared/types/siteRevalidation'

// Cache health for one site.

export function listRevalidations(
  siteId: number,
  perPage = 20,
  page = 1,
): Promise<SimplePaginatedResponse<SiteRevalidation>> {
  return client
    .get<SimplePaginatedResponse<SiteRevalidation>>(`/admin/sites/${siteId}/revalidations`, {
      params: { per_page: perPage, page },
    })
    .then((r) => r.data)
}

/** The size of this site's revalidation log — a dedicated COUNT that sizes the paginator. */
export function countRevalidations(siteId: number): Promise<number> {
  return client.get<{ total: number }>(`/admin/sites/${siteId}/revalidations/count`).then((r) => r.data.total)
}

/**
 * Force a full rebuild of this site's cache.
 *
 * Resolves with the ACTUAL attempt — success or failure — rather than an
 * optimistic "queued", because the whole point of this screen is that the
 * outcome stops being invisible.
 */
export function rebuildSiteCache(siteId: number): Promise<SiteRevalidation | null> {
  return client
    .post<ApiResponse<SiteRevalidation | null>>(`/admin/sites/${siteId}/revalidate`)
    .then((r) => r.data.data)
}
