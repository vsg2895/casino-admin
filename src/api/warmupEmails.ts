import client from './client'
import type { ApiResponse, PaginatedResponse } from '@shared/types/api'
import type { WarmupEmail, WarmupImportSummary, WarmupSendResult } from '@shared/types/warmupEmail'

export interface WarmupFilters {
  page?: number
  per_page?: number
  search?: string
}

export function listWarmupEmails(params?: WarmupFilters): Promise<PaginatedResponse<WarmupEmail>> {
  return client
    .get<PaginatedResponse<WarmupEmail>>('/admin/warmup-emails', { params })
    .then((r) => r.data)
}

// Total matching the current filters. A dedicated COUNT on the server, issued
// separately from the listing so the paginated query never carries its weight.
export function countWarmupEmails(
  params?: Omit<WarmupFilters, 'page' | 'per_page'>,
): Promise<number> {
  return client.get<{ total: number }>('/admin/warmup-emails/count', { params }).then((r) => r.data.total)
}

export function createWarmupEmail(email: string): Promise<ApiResponse<WarmupEmail>> {
  return client.post<ApiResponse<WarmupEmail>>('/admin/warmup-emails', { email }).then((r) => r.data)
}

export function updateWarmupEmail(id: number, email: string): Promise<ApiResponse<WarmupEmail>> {
  return client.put<ApiResponse<WarmupEmail>>(`/admin/warmup-emails/${id}`, { email }).then((r) => r.data)
}

export function deleteWarmupEmail(id: number): Promise<void> {
  return client.delete(`/admin/warmup-emails/${id}`).then(() => undefined)
}

export function bulkDeleteWarmupEmails(ids: number[]): Promise<{ deleted: number }> {
  return client.post<{ deleted: number }>('/admin/warmup-emails/bulk-delete', { ids }).then((r) => r.data)
}

// Runs synchronously and returns the per-row breakdown, unlike the newsletter
// import — a warmup list is small enough that the admin gets an answer at once.
export function importWarmupEmails(file: File): Promise<WarmupImportSummary> {
  const form = new FormData()
  form.append('file', file)
  return client
    .post<WarmupImportSummary>('/admin/warmup-emails/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)
}

// Queues the warmup send over the .env SMTP mailer; resolves as soon as the
// batches are queued, not when delivery finishes.
export function sendWarmupEmails(subject: string, body: string): Promise<WarmupSendResult> {
  return client
    .post<WarmupSendResult>('/admin/warmup-emails/send', { subject, body })
    .then((r) => r.data)
}
