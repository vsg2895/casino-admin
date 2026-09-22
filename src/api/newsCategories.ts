import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { NewsCategory, UpsertNewsCategoryPayload } from '@shared/types/newsCategory'

// Nested under a site — each domain owns its editorial sections. The admin
// listing includes inactive categories; the public feed cannot.

export function listNewsCategories(siteId: number): Promise<NewsCategory[]> {
  return client
    .get<ApiResponse<NewsCategory[]>>(`/admin/sites/${siteId}/news-categories`)
    .then((r) => r.data.data)
}

export function createNewsCategory(
  siteId: number,
  payload: UpsertNewsCategoryPayload,
): Promise<NewsCategory> {
  return client
    .post<ApiResponse<NewsCategory>>(`/admin/sites/${siteId}/news-categories`, payload)
    .then((r) => r.data.data)
}

export function updateNewsCategory(
  siteId: number,
  id: number,
  payload: UpsertNewsCategoryPayload,
): Promise<NewsCategory> {
  return client
    .put<ApiResponse<NewsCategory>>(`/admin/sites/${siteId}/news-categories/${id}`, payload)
    .then((r) => r.data.data)
}

export function deleteNewsCategory(
  siteId: number,
  id: number,
): Promise<{ orphaned: number; message: string }> {
  return client
    .delete<{ orphaned: number; message: string }>(`/admin/sites/${siteId}/news-categories/${id}`)
    .then((r) => r.data)
}
