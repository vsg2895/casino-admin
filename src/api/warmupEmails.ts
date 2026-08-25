import client from './client'
import type { ApiResponse, PaginatedResponse } from '@shared/types/api'
import type {
  WarmupEmail,
  WarmupHistoryEntry,
  WarmupImportSummary,
  WarmupRecipientPreview,
  WarmupSendPayload,
  WarmupSendResult,
  WarmupSendStatus,
  WarmupTemplate,
} from '@shared/types/warmupEmail'

export interface WarmupFilters {
  page?: number
  per_page?: number
  search?: string
}

export interface WarmupHistoryFilters {
  page?: number
  per_page?: number
  search?: string
  site_id?: number
  template?: string
  status?: WarmupSendStatus
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

// Templates a warmup run may use — the catalog minus what warmup forbids. Served
// from the same allow-list the server validates against, so the dropdown can
// never offer something the send would reject.
export function listWarmupTemplates(): Promise<{ data: WarmupTemplate[] }> {
  return client.get<{ data: WarmupTemplate[] }>('/admin/warmup-emails/templates').then((r) => r.data)
}

// Queues a warmup run: one site's template, sent to `count` addresses — or to the
// whole list when `count` is omitted. Still goes over the .env SMTP mailer;
// resolves as soon as the fan-out is queued, not when delivery finishes.
// Returns 409 if a run is already in flight.
export function sendWarmupEmails(payload: WarmupSendPayload): Promise<WarmupSendResult> {
  return client
    .post<WarmupSendResult>('/admin/warmup-emails/send', payload)
    .then((r) => r.data)
}

// Who a run with these settings would reach right now. Runs the same query as the
// send, so the dialog's preview and the actual audience can never disagree. Also
// carries the cooldown bounds, so the number input takes its min/max from the
// server instead of hard-coding them here.
export function previewWarmupRecipients(params?: {
  count?: number | null
  cooldown_days?: number | null
}): Promise<WarmupRecipientPreview> {
  return client
    .get<ApiResponse<WarmupRecipientPreview>>('/admin/warmup-emails/recipients', { params })
    .then((r) => r.data.data)
}

// ── History ───────────────────────────────────────────────────────────────────
// Per-address delivery log: which address, from which site, with which template,
// and when. Read-only.
export function listWarmupHistory(
  params?: WarmupHistoryFilters,
): Promise<PaginatedResponse<WarmupHistoryEntry>> {
  return client
    .get<PaginatedResponse<WarmupHistoryEntry>>('/admin/warmup-emails/history', { params })
    .then((r) => r.data)
}

// Dedicated COUNT for the history, issued separately from the listing so the
// paginated query never carries its weight.
export function countWarmupHistory(
  params?: Omit<WarmupHistoryFilters, 'page' | 'per_page'>,
): Promise<number> {
  return client
    .get<{ total: number }>('/admin/warmup-emails/history/count', { params })
    .then((r) => r.data.total)
}
