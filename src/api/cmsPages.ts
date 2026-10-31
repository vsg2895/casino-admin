import client from './client'
import type { CmsPageAdmin, CmsPageStatus } from '@shared/types/cmsPage'
import type { ApiResponse } from '@shared/types/api'
import type { SimplePaginatedResponse } from '@shared/types/pagination'

export interface CreateCmsPagePayload {
  site_id: number
  slug: string
  title: string
  content?: string | null
  meta_title?: string | null
  meta_description?: string | null
  status?: CmsPageStatus
  /**
   * Keep this page out of the search index (`noindex, follow`).
   *
   * The six standard legal pages ship true — every site in the network shares
   * one template for them. The five trust pages (about, contact,
   * responsible-gambling, affiliate-disclosure, editorial-policy) ship false,
   * because Google weighs them when judging the whole domain.
   */
  noindex?: boolean
  /** Byline — authors of the page's own site only. */
  author_id?: number | null
  reviewed_by_id?: number | null
  last_reviewed_at?: string | null
  /** A pending revision; the live fields stay public until it is published. */
  draft_title?: string | null
  draft_content?: string | null
  draft_meta_title?: string | null
  draft_meta_description?: string | null
}

// site_id cannot change once a page is created.
export type UpdateCmsPagePayload = Partial<Omit<CreateCmsPagePayload, 'site_id'>>

export function listCmsPages(params?: { page?: number; per_page?: number; site_id?: number }): Promise<SimplePaginatedResponse<CmsPageAdmin>> {
  return client.get<SimplePaginatedResponse<CmsPageAdmin>>('/admin/pages', { params }).then((r) => r.data)
}

/** Pages matching the site filter — a dedicated COUNT that sizes the list's paginator. */
export function countCmsPages(params?: { site_id?: number }): Promise<number> {
  return client.get<{ total: number }>('/admin/pages/count', { params }).then((r) => r.data.total)
}

export function getCmsPage(id: number): Promise<ApiResponse<CmsPageAdmin>> {
  return client.get<ApiResponse<CmsPageAdmin>>(`/admin/pages/${id}`).then((r) => r.data)
}

export function createCmsPage(payload: CreateCmsPagePayload): Promise<ApiResponse<CmsPageAdmin>> {
  return client.post<ApiResponse<CmsPageAdmin>>('/admin/pages', payload).then((r) => r.data)
}

export function updateCmsPage(id: number, payload: UpdateCmsPagePayload): Promise<ApiResponse<CmsPageAdmin>> {
  return client.put<ApiResponse<CmsPageAdmin>>(`/admin/pages/${id}`, payload).then((r) => r.data)
}

/** Copy the pending draft over the live page and clear it. */
export function publishCmsPageDraft(id: number): Promise<ApiResponse<CmsPageAdmin>> {
  return client.post<ApiResponse<CmsPageAdmin>>(`/admin/pages/${id}/publish-draft`).then((r) => r.data)
}

export function deleteCmsPage(id: number): Promise<void> {
  return client.delete(`/admin/pages/${id}`).then(() => undefined)
}
