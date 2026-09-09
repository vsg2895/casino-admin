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
  // One short sentence saying what makes this brand different. Appended to every
  // generated legal page's meta description so the eleven standard pages stop
  // reading identically across the sibling domains.
  positioning?: string | null
  revalidation_url?: string | null
  active?: boolean
  newsletter_emails_enabled?: boolean
  countries_enabled?: boolean
  reviews_enabled?: boolean
  review_auto_publish?: boolean
  // Whether this site renders each casino's factual operator profile. Default
  // false server-side, like the other two — a new surface never switches itself
  // on for a live domain.
  operator_profile_enabled?: boolean
  // Editorial identity. The byline only renders when a name is set AND the
  // casino has a review date — see the site form.
  byline_enabled?: boolean
  guides_enabled?: boolean
  author_name?: string | null
  author_role?: string | null
  author_bio?: string | null
  author_avatar_path?: string | null
  methodology_page_slug?: string | null
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
