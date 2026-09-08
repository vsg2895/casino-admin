import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { Article, UpsertArticlePayload } from '@shared/types/article'

// Guides are nested under a site — the only content type in this application
// that belongs to exactly one domain.
//
// The admin listing includes DRAFTS; the public one cannot. That asymmetry is
// the entire point of having a draft state.

export function listArticles(siteId: number): Promise<Article[]> {
  return client
    .get<ApiResponse<Article[]>>(`/admin/sites/${siteId}/articles`)
    .then((r) => r.data.data)
}

export function getArticle(siteId: number, id: number): Promise<Article> {
  return client
    .get<ApiResponse<Article>>(`/admin/sites/${siteId}/articles/${id}`)
    .then((r) => r.data.data)
}

export function createArticle(siteId: number, payload: UpsertArticlePayload): Promise<Article> {
  return client
    .post<ApiResponse<Article>>(`/admin/sites/${siteId}/articles`, payload)
    .then((r) => r.data.data)
}

export function updateArticle(
  siteId: number,
  id: number,
  payload: UpsertArticlePayload,
): Promise<Article> {
  return client
    .put<ApiResponse<Article>>(`/admin/sites/${siteId}/articles/${id}`, payload)
    .then((r) => r.data.data)
}

export function deleteArticle(siteId: number, id: number): Promise<void> {
  return client.delete(`/admin/sites/${siteId}/articles/${id}`).then(() => undefined)
}
