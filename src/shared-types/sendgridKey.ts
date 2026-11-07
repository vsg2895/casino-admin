// Fields match SendgridKeyResource.php — a stored SendGrid API key used as an
// alternative transport for scheduled promotion campaigns, and the sender of
// campaigns to the SendGrid receiver list (Custom Receivers → Sendgrid
// Receivers). The raw key is never returned by the API; only a masked preview
// (`masked_key`) is exposed.

import type { SmtpReceiverSettings } from './smtpCredential'

export type SendgridKeyStatus = 'active' | 'inactive'

export interface SendgridKey {
  id: number
  name: string
  masked_key: string
  /**
   * Sender of receiver campaigns — must be a verified SendGrid sender. Null
   * until set; schedules and the test button never read it (they use the site
   * template's sender), but a receiver campaign refuses to run without it.
   */
  from_address: string | null
  from_name: string | null
  /**
   * The Signed Event Webhook's verification key from the SendGrid account — a
   * PUBLIC key, so it is returned. Null = no webhook: bounces from this account
   * are not received, and the endpoint refuses events nobody can verify.
   */
  webhook_verification_key: string | null
  status: SendgridKeyStatus
  created_at: string
  updated_at: string
}

// Payload for creating/updating a key. On EDIT, leave `api_key` empty/undefined
// to keep the stored key; provide a value to rotate it.
export interface UpsertSendgridKeyPayload {
  name: string
  api_key?: string | null
  from_address?: string | null
  from_name?: string | null
  webhook_verification_key?: string | null
  status?: SendgridKeyStatus
}

/**
 * Per-key receiver targeting. The same shape as an SMTP server's: this channel
 * runs only from "Run now", so there is no `send_enabled` switch.
 */
export type SendgridReceiverSettings = SmtpReceiverSettings

