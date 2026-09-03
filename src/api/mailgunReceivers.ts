import client from './client'
import type { ApiResponse, PaginatedResponse } from '@shared/types/api'
import type {
  MailgunReceiver,
  MailgunReceiverImport,
  MailgunReceiverSettings,
  MailgunReceiverTemplate,
  MailgunReceiverTemplateSeed,
  UpsertMailgunReceiverPayload,
} from '@shared/types/mailgunReceiver'

export interface MailgunReceiverFilters {
  page?: number
  per_page?: number
  search?: string
  unsubscribed?: boolean
  suppressed?: boolean
  source?: 'import' | 'manual'
}

export function listMailgunReceivers(
  params?: MailgunReceiverFilters,
): Promise<PaginatedResponse<MailgunReceiver>> {
  return client
    .get<PaginatedResponse<MailgunReceiver>>('/admin/mailgun-receivers', { params })
    .then((r) => r.data)
}

// Dedicated COUNT, issued separately so the paginated query never carries its
// weight — the same split the newsletter and warmup lists use.
export function countMailgunReceivers(
  params?: Omit<MailgunReceiverFilters, 'page' | 'per_page'>,
): Promise<number> {
  return client
    .get<{ total: number }>('/admin/mailgun-receivers/count', { params })
    .then((r) => r.data.total)
}

export function createMailgunReceiver(
  payload: UpsertMailgunReceiverPayload,
): Promise<ApiResponse<MailgunReceiver>> {
  return client.post<ApiResponse<MailgunReceiver>>('/admin/mailgun-receivers', payload).then((r) => r.data)
}

export function updateMailgunReceiver(
  id: number,
  payload: UpsertMailgunReceiverPayload,
): Promise<ApiResponse<MailgunReceiver>> {
  return client
    .put<ApiResponse<MailgunReceiver>>(`/admin/mailgun-receivers/${id}`, payload)
    .then((r) => r.data)
}

export function deleteMailgunReceiver(id: number): Promise<void> {
  return client.delete(`/admin/mailgun-receivers/${id}`).then(() => undefined)
}

/** Delete is the only bulk action: every receiver is active, so there is nothing to toggle. */
export function bulkMailgunReceivers(ids: number[]): Promise<number> {
  return client
    .post<{ affected: number }>('/admin/mailgun-receivers/bulk', { action: 'delete', ids })
    .then((r) => r.data.affected)
}

/**
 * Upload a spreadsheet. Returns immediately with the import row — the work is
 * queued, so the caller polls `getMailgunReceiverImport` until `finished_at`.
 *
 * `consent_source` is mandatory and applies to every row in the file.
 */
export function importMailgunReceivers(
  file: File,
  consentSource: string,
): Promise<ApiResponse<MailgunReceiverImport>> {
  const form = new FormData()
  form.append('file', file)
  form.append('consent_source', consentSource)

  return client
    .post<ApiResponse<MailgunReceiverImport>>('/admin/mailgun-receivers/import', form)
    .then((r) => r.data)
}

export function getMailgunReceiverImport(id: number): Promise<ApiResponse<MailgunReceiverImport>> {
  return client
    .get<ApiResponse<MailgunReceiverImport>>(`/admin/mailgun-receivers/imports/${id}`)
    .then((r) => r.data)
}

// ── Per-credential targeting ─────────────────────────────────────────────────
// Addressed by credential id. There is no credential parameter in the payload,
// because the credential IS the configuration.

export function getReceiverSettings(
  credentialId: number,
): Promise<ApiResponse<MailgunReceiverSettings>> {
  return client
    .get<ApiResponse<MailgunReceiverSettings>>(`/admin/mailgun-keys/${credentialId}/receiver-settings`)
    .then((r) => r.data)
}

export function saveReceiverSettings(
  credentialId: number,
  payload: Partial<MailgunReceiverSettings>,
): Promise<{ eligible_count: number; next_batch_count: number; blocked_reason: string | null }> {
  return client
    .put<ApiResponse<{ eligible_count: number; next_batch_count: number; blocked_reason: string | null }>>(
      `/admin/mailgun-keys/${credentialId}/receiver-settings`,
      payload,
    )
    .then((r) => r.data.data)
}

/**
 * The source site's promotion template, for re-seeding the form.
 *
 * The settings endpoint already seeds an unconfigured credential; this is the
 * admin asking for it again after editing, so it is a separate, explicit call.
 */
export function getReceiverTemplateSource(
  credentialId: number,
): Promise<MailgunReceiverTemplateSeed> {
  return client
    .get<ApiResponse<MailgunReceiverTemplateSeed>>(
      `/admin/mailgun-keys/${credentialId}/receiver-template-source`,
    )
    .then((r) => r.data.data)
}

/**
 * Render the message from the CURRENT, unsaved fields.
 *
 * A POST because the draft template travels in the body — the same shape the
 * site email-template previews use.
 */
export function previewReceiverMessage(
  credentialId: number,
  template: MailgunReceiverTemplate,
): Promise<string> {
  return client
    .post<{ html: string }>(`/admin/mailgun-keys/${credentialId}/receiver-message-preview`, {
      message_template: template,
    })
    .then((r) => r.data.html)
}

/** The exact receivers the next run would take — resolved by the same selector the job uses. */
export function previewReceiverBatch(
  credentialId: number,
): Promise<{ data: MailgunReceiver[]; meta: { eligible_count: number; next_batch_count: number } }> {
  return client
    .get<{ data: MailgunReceiver[]; meta: { eligible_count: number; next_batch_count: number } }>(
      `/admin/mailgun-keys/${credentialId}/receiver-preview`,
    )
    .then((r) => r.data)
}

export function runReceiverCampaign(
  credentialId: number,
): Promise<{ ok: boolean; message: string }> {
  return client
    .post<{ ok: boolean; message: string }>(`/admin/mailgun-keys/${credentialId}/receiver-run`)
    .then((r) => r.data)
}
