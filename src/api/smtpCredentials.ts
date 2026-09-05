import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type {
  SmtpCredential,
  SmtpReceiverSettings,
  UpsertSmtpCredentialPayload,
} from '@shared/types/smtpCredential'
import type {
  MailgunReceiver,
  MailgunReceiverTemplate,
  MailgunReceiverTemplateSeed,
} from '@shared/types/mailgunReceiver'

// Stored SMTP servers ("Email Configs"). They mail the SAME receiver list as the
// Mailgun credentials — only the transport differs — so the receiver-facing
// calls below mirror mailgunReceivers.ts exactly, addressed by credential id.

export function listSmtpCredentials(params?: {
  status?: 'active' | 'inactive'
}): Promise<ApiResponse<SmtpCredential[]>> {
  return client
    .get<ApiResponse<SmtpCredential[]>>('/admin/smtp-credentials', { params })
    .then((r) => r.data)
}

export function createSmtpCredential(
  payload: UpsertSmtpCredentialPayload,
): Promise<ApiResponse<SmtpCredential>> {
  return client
    .post<ApiResponse<SmtpCredential>>('/admin/smtp-credentials', payload)
    .then((r) => r.data)
}

export function updateSmtpCredential(
  id: number,
  payload: UpsertSmtpCredentialPayload,
): Promise<ApiResponse<SmtpCredential>> {
  return client
    .put<ApiResponse<SmtpCredential>>(`/admin/smtp-credentials/${id}`, payload)
    .then((r) => r.data)
}

export function deleteSmtpCredential(id: number): Promise<void> {
  return client.delete(`/admin/smtp-credentials/${id}`).then(() => undefined)
}

export function toggleSmtpCredential(id: number): Promise<ApiResponse<SmtpCredential>> {
  return client
    .patch<ApiResponse<SmtpCredential>>(`/admin/smtp-credentials/${id}/toggle`)
    .then((r) => r.data)
}

/**
 * Send one test message through this server.
 *
 * Sends the credential's OWN configured message, so there is no template picker
 * the way the Mailgun test dialog has one. A 422 carries the transport's real
 * error text ("535 authentication failed"), which is the useful part.
 */
export function testSmtpCredential(
  id: number,
  payload: { to: string; name?: string | null },
): Promise<{ ok: boolean; message: string }> {
  return client
    .post<{ ok: boolean; message: string }>(`/admin/smtp-credentials/${id}/test`, payload)
    .then((r) => r.data)
}

// ── Receiver targeting ───────────────────────────────────────────────────────

export function getSmtpReceiverSettings(id: number): Promise<ApiResponse<SmtpReceiverSettings>> {
  return client
    .get<ApiResponse<SmtpReceiverSettings>>(`/admin/smtp-credentials/${id}/receiver-settings`)
    .then((r) => r.data)
}

export function saveSmtpReceiverSettings(
  id: number,
  payload: Partial<SmtpReceiverSettings>,
): Promise<{ eligible_count: number; next_batch_count: number; blocked_reason: string | null }> {
  return client
    .put<ApiResponse<{ eligible_count: number; next_batch_count: number; blocked_reason: string | null }>>(
      `/admin/smtp-credentials/${id}/receiver-settings`,
      payload,
    )
    .then((r) => r.data.data)
}

/** The source site's promotion template, for re-seeding the form. */
export function getSmtpTemplateSource(id: number): Promise<MailgunReceiverTemplateSeed> {
  return client
    .get<ApiResponse<MailgunReceiverTemplateSeed>>(
      `/admin/smtp-credentials/${id}/receiver-template-source`,
    )
    .then((r) => r.data.data)
}

/** Render the message from the CURRENT, unsaved fields — hence a POST. */
export function previewSmtpReceiverMessage(
  id: number,
  template: MailgunReceiverTemplate,
): Promise<string> {
  return client
    .post<{ html: string }>(`/admin/smtp-credentials/${id}/receiver-message-preview`, {
      message_template: template,
    })
    .then((r) => r.data.html)
}

/** The exact receivers the next run would take — same selector the job uses. */
export function previewSmtpReceiverBatch(
  id: number,
): Promise<{ data: MailgunReceiver[]; meta: { eligible_count: number; next_batch_count: number } }> {
  return client
    .get<{ data: MailgunReceiver[]; meta: { eligible_count: number; next_batch_count: number } }>(
      `/admin/smtp-credentials/${id}/receiver-preview`,
    )
    .then((r) => r.data)
}

/** Queue one run now. The ONLY way this channel sends — there is no scheduler. */
export function runSmtpReceiverCampaign(id: number): Promise<{ ok: boolean; message: string }> {
  return client
    .post<{ ok: boolean; message: string }>(`/admin/smtp-credentials/${id}/receiver-run`)
    .then((r) => r.data)
}
