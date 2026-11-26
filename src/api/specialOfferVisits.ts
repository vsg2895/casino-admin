import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { SimplePaginatedResponse } from '@shared/types/pagination'
import type {
  SpecialOfferVisit,
  SpecialOfferVisitFilters,
  SpecialOfferVisitStats,
} from '@shared/types/specialOfferVisit'

/**
 * Special Offers Visitors Ip Info — read-only.
 *
 * There is no create, update or delete here and that is deliberate: the table
 * is an audit record of what arrived. The one write is re-resolving geography,
 * which replaces a provider's opinion, never the observation.
 */

export function listSpecialOfferVisits(
  params?: SpecialOfferVisitFilters,
): Promise<SimplePaginatedResponse<SpecialOfferVisit>> {
  return client
    .get<SimplePaginatedResponse<SpecialOfferVisit>>('/admin/special-offer-visits', { params })
    .then((r) => r.data)
}

/**
 * The real total, from its own endpoint.
 *
 * The listing is simple-paginated and carries no `meta.total`, so anything
 * quoting a number — the badge, the stat tiles — must come from here. See
 * admin/CLAUDE.md: never quote the pager's estimate.
 */
export function countSpecialOfferVisits(params?: SpecialOfferVisitFilters): Promise<number> {
  return client
    .get<{ total: number }>('/admin/special-offer-visits/count', { params })
    .then((r) => r.data.total)
}

export function getSpecialOfferVisit(id: number): Promise<ApiResponse<SpecialOfferVisit>> {
  return client
    .get<ApiResponse<SpecialOfferVisit>>(`/admin/special-offer-visits/${id}`)
    .then((r) => r.data)
}

/** Tiles above the table. Takes the SAME filters, so the two always agree. */
export function specialOfferVisitStats(
  params?: SpecialOfferVisitFilters,
): Promise<SpecialOfferVisitStats> {
  return client
    .get<SpecialOfferVisitStats>('/admin/special-offer-visits/stats', { params })
    .then((r) => r.data)
}

/** Queue a fresh geo lookup for the selected visits. Returns how many were queued. */
export function resolveSpecialOfferVisitGeo(ids: number[]): Promise<number> {
  return client
    .post<{ queued: number }>('/admin/special-offer-visits/resolve-geo', { ids })
    .then((r) => r.data.queued)
}
