import client from './client'
import type { ApiResponse, PaginatedResponse } from '@shared/types/api'
import type {
  BulkSmsResult,
  NewsletterPhone,
  PhoneAudienceFilters,
  PhoneImportProgress,
  PhoneRecipientPreview,
  PhoneSmsHistory,
} from '@shared/types/newsletterPhone'

// Every endpoint here reads the STANDALONE `newsletters_based_on_phone` table.
// Nothing in this module touches the email newsletter endpoints.

export interface PhoneListFilters extends PhoneAudienceFilters {
  page?: number
  per_page?: number
  // Tri-state: omit for "all", true for only opted-out, false for only
  // subscribed. Sending `false` when you mean "all" would hide opted-out rows.
  opted_out?: boolean
  sort_by?: 'created_at' | 'phone' | 'opted_out'
  sort_dir?: 'asc' | 'desc'
}

export function listNewsletterPhones(
  params?: PhoneListFilters,
): Promise<PaginatedResponse<NewsletterPhone>> {
  return client
    .get<PaginatedResponse<NewsletterPhone>>('/admin/newsletter-phones', { params })
    .then((r) => r.data)
}

// Total matching the current filters. A dedicated COUNT on the server, issued
// separately from the listing so the paginated query never carries its weight.
export function countNewsletterPhones(
  params?: Omit<PhoneListFilters, 'page' | 'per_page' | 'sort_by' | 'sort_dir'>,
): Promise<number> {
  return client
    .get<{ total: number }>('/admin/newsletter-phones/count', { params })
    .then((r) => r.data.total)
}

export function createNewsletterPhone(phone: string): Promise<ApiResponse<NewsletterPhone>> {
  return client
    .post<ApiResponse<NewsletterPhone>>('/admin/newsletter-phones', { phone })
    .then((r) => r.data)
}

export function updateNewsletterPhone(
  id: number,
  payload: { phone: string; opted_out?: boolean },
): Promise<ApiResponse<NewsletterPhone>> {
  return client
    .put<ApiResponse<NewsletterPhone>>(`/admin/newsletter-phones/${id}`, payload)
    .then((r) => r.data)
}

export function deleteNewsletterPhone(id: number): Promise<void> {
  return client.delete(`/admin/newsletter-phones/${id}`).then(() => undefined)
}

export function bulkDeleteNewsletterPhones(ids: number[]): Promise<{ deleted: number }> {
  return client
    .post<{ deleted: number }>('/admin/newsletter-phones/bulk-delete', { ids })
    .then((r) => r.data)
}

// Deletes everything matching the CURRENT filters, not the whole table.
export function deleteAllNewsletterPhones(
  params?: Omit<PhoneListFilters, 'page' | 'per_page'>,
): Promise<{ deleted: number }> {
  return client
    .post<{ deleted: number }>('/admin/newsletter-phones/delete-all', null, { params })
    .then((r) => r.data)
}

// ── Import ───────────────────────────────────────────────────────────────────
// Queued on the `high` queue and answered with 202: the response is the initial
// status record, not the result. Poll getPhoneImportStatus until `finished`.

export function importNewsletterPhones(file: File): Promise<PhoneImportProgress> {
  const form = new FormData()
  form.append('file', file)
  return client
    .post<PhoneImportProgress>('/admin/newsletter-phones/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)
}

export function getPhoneImportStatus(importId: number): Promise<PhoneImportProgress> {
  return client
    .get<PhoneImportProgress>(`/admin/newsletter-phones/imports/${importId}`)
    .then((r) => r.data)
}

// ── Bulk SMS ─────────────────────────────────────────────────────────────────

// Who a send with these filters would reach. Resolved by the same query the send
// uses, so the number shown is the number that gets messaged. Note it excludes
// opted-out numbers even when the listing is showing them.
export function previewSmsRecipients(
  params?: PhoneAudienceFilters,
): Promise<PhoneRecipientPreview> {
  return client
    .get<PhoneRecipientPreview>('/admin/newsletter-phones/recipients', { params })
    .then((r) => r.data)
}

// Queues the run and resolves as soon as the fan-out is queued, not when
// delivery finishes. Returns 409 if a run is already in flight.
export function sendBulkSms(payload: {
  twilio_config_id: number
  body: string
} & PhoneAudienceFilters): Promise<BulkSmsResult> {
  return client
    .post<BulkSmsResult>('/admin/newsletter-phones/send', payload)
    .then((r) => r.data)
}

// ── Send history ─────────────────────────────────────────────────────────────

export interface SmsHistoryFilters {
  page?: number
  per_page?: number
  search?: string
  status?: 'sent' | 'failed'
}

export function listSmsHistory(
  params?: SmsHistoryFilters,
): Promise<PaginatedResponse<PhoneSmsHistory>> {
  return client
    .get<PaginatedResponse<PhoneSmsHistory>>('/admin/newsletter-phones/history', { params })
    .then((r) => r.data)
}

export function countSmsHistory(
  params?: Omit<SmsHistoryFilters, 'page' | 'per_page'>,
): Promise<number> {
  return client
    .get<{ total: number }>('/admin/newsletter-phones/history/count', { params })
    .then((r) => r.data.total)
}
