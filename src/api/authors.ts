import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { Author, UpsertAuthorPayload } from '@shared/types/author'

// Nested under a site — an author belongs to one domain. The admin listing
// includes hidden authors; the public site never sees them.

export function listAuthors(siteId: number): Promise<Author[]> {
  return client.get<ApiResponse<Author[]>>(`/admin/sites/${siteId}/authors`).then((r) => r.data.data)
}

export function createAuthor(siteId: number, payload: UpsertAuthorPayload): Promise<Author> {
  return client.post<ApiResponse<Author>>(`/admin/sites/${siteId}/authors`, payload).then((r) => r.data.data)
}

export function updateAuthor(siteId: number, id: number, payload: UpsertAuthorPayload): Promise<Author> {
  return client.put<ApiResponse<Author>>(`/admin/sites/${siteId}/authors/${id}`, payload).then((r) => r.data.data)
}

export function deleteAuthor(siteId: number, id: number): Promise<void> {
  return client.delete(`/admin/sites/${siteId}/authors/${id}`).then(() => undefined)
}
