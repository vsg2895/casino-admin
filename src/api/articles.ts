import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { Article, UpsertArticlePayload } from '@shared/types/article'

/** Which section an article belongs to. Mirrors Article::TYPES on the server. */
export type ArticleType = 'guide' | 'news'

const query = (type: ArticleType) => `?type=${encodeURIComponent(type)}`

// Guides and News are nested under a site — the only content types in this
// application that belong to exactly one domain.
//
// They share one table and one endpoint, separated by `?type=`. `guide` is the
// default on both sides, so nothing written before News existed had to change.
//
// The admin listing includes DRAFTS; the public one cannot. That asymmetry is
// the entire point of having a draft state.

export function listArticles(siteId: number, type: ArticleType = 'guide'): Promise<Article[]> {
  return client
    .get<ApiResponse<Article[]>>(`/admin/sites/${siteId}/articles${query(type)}`)
    .then((r) => r.data.data)
}

export function getArticle(siteId: number, id: number, type: ArticleType = 'guide'): Promise<Article> {
  return client
    .get<ApiResponse<Article>>(`/admin/sites/${siteId}/articles/${id}${query(type)}`)
    .then((r) => r.data.data)
}

export function createArticle(
  siteId: number,
  payload: UpsertArticlePayload,
  type: ArticleType = 'guide',
): Promise<Article> {
  return client
    .post<ApiResponse<Article>>(`/admin/sites/${siteId}/articles${query(type)}`, payload)
    .then((r) => r.data.data)
}

export function updateArticle(
  siteId: number,
  id: number,
  payload: UpsertArticlePayload,
  type: ArticleType = 'guide',
): Promise<Article> {
  return client
    .put<ApiResponse<Article>>(`/admin/sites/${siteId}/articles/${id}${query(type)}`, payload)
    .then((r) => r.data.data)
}

export function deleteArticle(siteId: number, id: number, type: ArticleType = 'guide'): Promise<void> {
  return client.delete(`/admin/sites/${siteId}/articles/${id}${query(type)}`).then(() => undefined)
}
