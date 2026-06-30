import client from './client'
import type { CmsPageAdmin, CmsPageStatus } from '@shared/types/cmsPage'
import type { ApiResponse, PaginatedResponse } from '@shared/types/api'

export interface CreateCmsPagePayload {
  site_id: number
  slug: string
  title: string
  content?: string | null
  meta_title?: string | null
  meta_description?: string | null
  status?: CmsPageStatus
}

// site_id cannot change once a page is created.
export type UpdateCmsPagePayload = Partial<Omit<CreateCmsPagePayload, 'site_id'>>

export function listCmsPages(params?: { page?: number; site_id?: number }): Promise<PaginatedResponse<CmsPageAdmin>> {
  return client.get<PaginatedResponse<CmsPageAdmin>>('/admin/pages', { params }).then((r) => r.data)
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

export function deleteCmsPage(id: number): Promise<void> {
  return client.delete(`/admin/pages/${id}`).then(() => undefined)
}
