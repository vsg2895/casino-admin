import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { ContentCoverage, SiteContentFields, SiteContentOverview, SiteContentSaved } from '@shared/types/siteContent'

/** Which record the per-site content belongs to. */
export type SiteContentEntity = 'casino' | 'offer'

function base(entity: SiteContentEntity, id: number): string {
  return entity === 'casino' ? `/admin/casinos/${id}/site-contents` : `/admin/special-offers/${id}/site-contents`
}

export function getSiteContents(entity: SiteContentEntity, id: number): Promise<ApiResponse<SiteContentOverview>> {
  return client.get<ApiResponse<SiteContentOverview>>(base(entity, id)).then((r) => r.data)
}

/** Saves ONE site's override. All-empty + inherit removes it (content: null). */
export function saveSiteContent(
  entity: SiteContentEntity,
  id: number,
  siteId: number,
  fields: SiteContentFields,
): Promise<ApiResponse<SiteContentSaved>> {
  return client.put<ApiResponse<SiteContentSaved>>(`${base(entity, id)}/${siteId}`, fields).then((r) => r.data)
}

export function clearSiteContent(entity: SiteContentEntity, id: number, siteId: number): Promise<void> {
  return client.delete(`${base(entity, id)}/${siteId}`).then(() => undefined)
}

export function getContentCoverage(type: SiteContentEntity): Promise<ApiResponse<ContentCoverage>> {
  return client.get<ApiResponse<ContentCoverage>>('/admin/content-coverage', { params: { type } }).then((r) => r.data)
}
