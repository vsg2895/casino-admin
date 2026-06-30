import client from './client'
import type { Site, SiteRegistrationResponse } from '@shared/types/site'
import type { ApiResponse, PaginatedResponse } from '@shared/types/api'

export interface CreateSitePayload {
  name: string
  slug: string
  domain: string
  revalidation_url: string | null
}

export interface UpdateSitePayload {
  name?: string
  domain?: string
  revalidation_url?: string | null
  active?: boolean
}

export function listSites(): Promise<PaginatedResponse<Site>> {
  return client.get<PaginatedResponse<Site>>('/admin/sites').then((r) => r.data)
}

export function getSite(id: number): Promise<ApiResponse<Site>> {
  return client.get<ApiResponse<Site>>(`/admin/sites/${id}`).then((r) => r.data)
}

export function createSite(payload: CreateSitePayload): Promise<ApiResponse<SiteRegistrationResponse>> {
  return client
    .post<ApiResponse<SiteRegistrationResponse>>('/admin/sites', payload)
    .then((r) => r.data)
}

export function updateSite(id: number, payload: UpdateSitePayload): Promise<ApiResponse<Site>> {
  return client
    .put<ApiResponse<Site>>(`/admin/sites/${id}`, payload)
    .then((r) => r.data)
}

export function deleteSite(id: number): Promise<void> {
  return client.delete(`/admin/sites/${id}`).then(() => undefined)
}

export function rotateKey(id: number): Promise<ApiResponse<SiteRegistrationResponse>> {
  return client
    .post<ApiResponse<SiteRegistrationResponse>>(`/admin/sites/${id}/rotate-key`)
    .then((r) => r.data)
}
