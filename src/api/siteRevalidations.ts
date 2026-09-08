import client from './client'
import type { ApiResponse, PaginatedResponse } from '@shared/types/api'
import type { SiteRevalidation } from '@shared/types/siteRevalidation'

// Cache health for one site.

export function listRevalidations(
  siteId: number,
  perPage = 20,
): Promise<PaginatedResponse<SiteRevalidation>> {
  return client
    .get<PaginatedResponse<SiteRevalidation>>(`/admin/sites/${siteId}/revalidations`, {
      params: { per_page: perPage },
    })
    .then((r) => r.data)
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
