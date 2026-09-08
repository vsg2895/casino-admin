import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { NavItem, UpsertNavItemPayload } from '@shared/types/navItem'

// Navigation is nested under the site because a menu belongs to exactly one
// domain. Every write refreshes only that site.

export function listNavItems(siteId: number): Promise<NavItem[]> {
  return client
    .get<ApiResponse<NavItem[]>>(`/admin/sites/${siteId}/nav-items`)
    .then((r) => r.data.data)
}

export function createNavItem(siteId: number, payload: UpsertNavItemPayload): Promise<NavItem> {
  return client
    .post<ApiResponse<NavItem>>(`/admin/sites/${siteId}/nav-items`, payload)
    .then((r) => r.data.data)
}

export function updateNavItem(
  siteId: number,
  id: number,
  payload: UpsertNavItemPayload,
): Promise<NavItem> {
  return client
    .put<ApiResponse<NavItem>>(`/admin/sites/${siteId}/nav-items/${id}`, payload)
    .then((r) => r.data.data)
}

export function deleteNavItem(siteId: number, id: number): Promise<void> {
  return client.delete(`/admin/sites/${siteId}/nav-items/${id}`).then(() => undefined)
}

/**
 * Persist a whole new order in one request.
 *
 * Reordering produces a complete order at once; sending it as N updates would
 * leave the menu half-reordered if one failed.
 */
export function reorderNavItems(siteId: number, ids: number[]): Promise<number> {
  return client
    .post<{ reordered: number }>(`/admin/sites/${siteId}/nav-items/reorder`, { ids })
    .then((r) => r.data.reordered)
}
