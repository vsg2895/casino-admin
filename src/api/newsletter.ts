import client from './client'
import { downloadFile } from './download'
import type { Newsletter } from '@shared/types/newsletter'
import type { NewsletterImportProgress } from '@shared/types/newsletterImport'
import type { ApiResponse, PaginatedResponse } from '@shared/types/api'

export function listNewsletters(params?: {
  page?: number
  per_page?: number
  site_id?: number
  trashed?: boolean
  // Tri-state: true / false filter, or omit for "all".
  verified?: boolean
}): Promise<PaginatedResponse<Newsletter>> {
  return client.get<PaginatedResponse<Newsletter>>('/admin/newsletters', { params }).then((r) => r.data)
}

// Total matching the current filters. A dedicated COUNT on the server, issued
// separately from the listing so the paginated query never carries its weight.
export function countNewsletters(params?: {
  site_id?: number
  trashed?: boolean
  verified?: boolean
}): Promise<number> {
  return client.get<{ total: number }>('/admin/newsletters/count', { params }).then((r) => r.data.total)
}

export function createNewsletter(payload: { site_id: number; email: string }): Promise<ApiResponse<Newsletter>> {
  return client.post<ApiResponse<Newsletter>>('/admin/newsletters', payload).then((r) => r.data)
}

export function exportNewsletters(siteId?: number): Promise<void> {
  const query = siteId ? `?site_id=${siteId}` : ''
  return downloadFile(`/admin/newsletters/export${query}`, 'newsletter.csv')
}

// Queue a bulk import of subscribers from an .xlsx / .csv file with an "Email"
// column. `verified` marks imported subscribers as already verified (default
// false). Resolves as soon as the file is staged and the job is queued — poll
// `getImportStatus` with the returned import_id for progress and final counts.
export function importNewsletters(
  siteId: number,
  file: File,
  verified = false,
): Promise<NewsletterImportProgress> {
  const form = new FormData()
  form.append('site_id', String(siteId))
  form.append('file', file)
  form.append('verified', verified ? '1' : '0')
  return client
    .post<NewsletterImportProgress>('/admin/newsletters/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)
}

// Current progress of a queued import. `finished` tells you when to stop.
export function getImportStatus(importId: number): Promise<NewsletterImportProgress> {
  return client
    .get<NewsletterImportProgress>(`/admin/newsletters/imports/${importId}`)
    .then((r) => r.data)
}

export function deleteNewsletter(id: number): Promise<void> {
  return client.delete(`/admin/newsletters/${id}`).then(() => undefined)
}

export function bulkDeleteNewsletters(ids: number[]): Promise<{ deleted: number }> {
  return client.post<{ deleted: number }>('/admin/newsletters/bulk-delete', { ids }).then((r) => r.data)
}

export function deleteAllNewsletters(siteId?: number): Promise<{ deleted: number }> {
  return client
    .post<{ deleted: number }>('/admin/newsletters/delete-all', siteId ? { site_id: siteId } : {})
    .then((r) => r.data)
}

export function restoreNewsletter(id: number): Promise<void> {
  return client.post(`/admin/newsletters/${id}/restore`).then(() => undefined)
}

export function bulkRestoreNewsletters(ids: number[]): Promise<{ restored: number }> {
  return client.post<{ restored: number }>('/admin/newsletters/restore', { ids }).then((r) => r.data)
}

export function forceDeleteNewsletter(id: number): Promise<void> {
  return client.delete(`/admin/newsletters/${id}/force`).then(() => undefined)
}

export function bulkForceDeleteNewsletters(ids: number[]): Promise<{ deleted: number }> {
  return client.post<{ deleted: number }>('/admin/newsletters/force-delete', { ids }).then((r) => r.data)
}
