import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { Redirect, UpsertRedirectPayload } from '@shared/types/redirect'

// A 422 from create/update may carry a loop warning: the API refuses a rule
// whose destination already redirects back to its source.

export function listRedirects(siteId: number): Promise<Redirect[]> {
  return client
    .get<ApiResponse<Redirect[]>>(`/admin/sites/${siteId}/redirects`)
    .then((r) => r.data.data)
}

export function createRedirect(siteId: number, payload: UpsertRedirectPayload): Promise<Redirect> {
  return client
    .post<ApiResponse<Redirect>>(`/admin/sites/${siteId}/redirects`, payload)
    .then((r) => r.data.data)
}

export function updateRedirect(
  siteId: number,
  id: number,
  payload: UpsertRedirectPayload,
): Promise<Redirect> {
  return client
    .put<ApiResponse<Redirect>>(`/admin/sites/${siteId}/redirects/${id}`, payload)
    .then((r) => r.data.data)
}

export function deleteRedirect(siteId: number, id: number): Promise<void> {
  return client.delete(`/admin/sites/${siteId}/redirects/${id}`).then(() => undefined)
}
