import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { SiteForum, UpdateSiteForumPayload } from '@shared/types/forum'

// The forum page's rules for one site. Nested under the site because a page
// belongs to exactly one domain — the same reason navigation is.
//
// GET creates the row with defaults (and DISABLED) on first access, so the
// screen always has something to show and opening it never publishes anything.

export function getSiteForum(siteId: number): Promise<SiteForum> {
  return client
    .get<ApiResponse<SiteForum>>(`/admin/sites/${siteId}/forum`)
    .then((r) => r.data.data)
}

export function updateSiteForum(
  siteId: number,
  payload: UpdateSiteForumPayload,
): Promise<SiteForum> {
  return client
    .put<ApiResponse<SiteForum>>(`/admin/sites/${siteId}/forum`, payload)
    .then((r) => r.data.data)
}
