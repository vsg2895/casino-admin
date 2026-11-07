import client from './client'
import { receiverListApi, type ReceiverSources } from './receiverLists'
import type { ApiResponse } from '@shared/types/api'
import type {
  MailgunReceiver,
  MailgunReceiverSettings,
  MailgunReceiverTemplate,
  MailgunReceiverTemplateSeed,
} from '@shared/types/mailgunReceiver'

/**
 * The Mailgun receiver list — Custom Receivers → Mailgun Receivers.
 *
 * The list endpoints are the shared Custom Receivers client
 * ({@link receiverListApi}); the SendGrid list builds the same client in
 * `sendgridReceivers.ts`. The names below are kept for the Mailgun Credentials
 * and Email Configs screens, which read the list's sources and reset it.
 */
export const mailgunReceiverList = receiverListApi('/admin/mailgun-receivers')

/** The two sources with their counts — what the pickers are built from. */
export type MailgunReceiverSources = ReceiverSources

export function listMailgunReceiverSources(): Promise<MailgunReceiverSources> {
  return mailgunReceiverList.sources()
}

/**
 * Clear "Last sent" and "Sent" on EVERY Mailgun receiver. Returns the rows changed.
 *
 * Takes no id list by design — this is the whole-list reset, the same one
 * `php artisan mailgun:reset-receiver-sends` performs, sharing one service on
 * the server so the panel and the CLI cannot reset different things.
 *
 * Clearing the last-sent timestamp drops the cooldown filter for everyone, so
 * the next campaign can mail the whole list. Always confirm before calling.
 */
export function resetMailgunReceiverSends(clearErrors = false): Promise<number> {
  return mailgunReceiverList.resetSends(clearErrors)
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
