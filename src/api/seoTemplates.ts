import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { SeoTemplate } from '@shared/types/seo'

// Read and written as one set: an editor tuning "make every title say 2026" is
// having one thought, not five, and five endpoints would give five chances to
// leave the set half-applied.

export function getSeoTemplates(siteId: number): Promise<SeoTemplate[]> {
  return client
    .get<ApiResponse<SeoTemplate[]>>(`/admin/sites/${siteId}/seo-templates`)
    .then((r) => r.data.data)
}

export function saveSeoTemplates(siteId: number, templates: SeoTemplate[]): Promise<SeoTemplate[]> {
  return client
    .put<ApiResponse<SeoTemplate[]>>(`/admin/sites/${siteId}/seo-templates`, { templates })
    .then((r) => r.data.data)
}

/** Render a pattern against sample values — the same substitution a real page uses. */
export function previewSeoPattern(
  siteId: number,
  pattern: string,
  name?: string,
): Promise<string> {
  return client
    .post<{ preview: string }>(`/admin/sites/${siteId}/seo-templates/preview`, { pattern, name })
    .then((r) => r.data.preview)
}
