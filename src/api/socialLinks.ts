import client from './client'
import type { SocialLink } from '@shared/types/socialLink'
import type { ApiResponse } from '@shared/types/api'

export interface SocialLinkPayload {
  site_id: number
  platform: string
  label: string | null
  url: string
  sort_order: number
  active: boolean
}

export function listSocialLinks(siteId?: number): Promise<ApiResponse<SocialLink[]>> {
  return client
    .get<ApiResponse<SocialLink[]>>('/admin/social-links', { params: siteId ? { site_id: siteId } : {} })
    .then((r) => r.data)
}

export function createSocialLink(payload: SocialLinkPayload): Promise<ApiResponse<SocialLink>> {
  return client.post<ApiResponse<SocialLink>>('/admin/social-links', payload).then((r) => r.data)
}

export function updateSocialLink(
  id: number,
  payload: Partial<Omit<SocialLinkPayload, 'site_id'>>,
): Promise<ApiResponse<SocialLink>> {
  return client.patch<ApiResponse<SocialLink>>(`/admin/social-links/${id}`, payload).then((r) => r.data)
}

export function deleteSocialLink(id: number): Promise<void> {
  return client.delete(`/admin/social-links/${id}`).then(() => undefined)
}
