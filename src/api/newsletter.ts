import client from './client'
import { downloadFile } from './download'
import type { Newsletter } from '@shared/types/newsletter'
import type { ApiResponse, PaginatedResponse } from '@shared/types/api'

export function listNewsletters(params?: {
  page?: number
  site_id?: number
  trashed?: boolean
}): Promise<PaginatedResponse<Newsletter>> {
  return client.get<PaginatedResponse<Newsletter>>('/admin/newsletters', { params }).then((r) => r.data)
}

export function createNewsletter(payload: { site_id: number; email: string }): Promise<ApiResponse<Newsletter>> {
  return client.post<ApiResponse<Newsletter>>('/admin/newsletters', payload).then((r) => r.data)
}

export function exportNewsletters(siteId?: number): Promise<void> {
  const query = siteId ? `?site_id=${siteId}` : ''
  return downloadFile(`/admin/newsletters/export${query}`, 'newsletter.csv')
}

export interface ImportResult {
  imported: number
  skipped: number
  total: number
  message: string
}

// Bulk-import subscribers from an .xlsx / .csv file with an "Email" column.
export function importNewsletters(siteId: number, file: File): Promise<ImportResult> {
  const form = new FormData()
  form.append('site_id', String(siteId))
  form.append('file', file)
  return client
    .post<ImportResult>('/admin/newsletters/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
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
