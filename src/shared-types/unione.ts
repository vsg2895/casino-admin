// Fields match the UniOne* resources in the Laravel API.
//
// A self-contained feature: nothing here references SendGrid, Mailgun, Warmup or
// the newsletter types, and nothing in those files references this one.

export type UniOneKeyType = 'user' | 'project'
export type UniOneRegion = 'auto' | 'eu1' | 'us1'

export interface UniOneApiKey {
  id: number
  name: string
  /** Last four characters only. The plaintext never leaves the server. */
  masked_key: string
  key_type: UniOneKeyType
  project_id: string | null
  region: UniOneRegion
  base_url: string
  is_active: boolean
  is_default: boolean
  default_from_email: string | null
  default_from_name: string | null
  track_links: boolean
  track_read: boolean
  timeout_seconds: number
  last_verified_at: string | null
  last_verify_status: string | null
  is_verified: boolean
  notes: string | null
  /** Contains the path token — an operator must paste this into UniOne. */
  webhook_url: string
  created_at: string | null
  updated_at: string | null
}

export interface UpsertUniOneApiKeyPayload {
  name: string
  /** Omit or leave empty on edit to keep the stored key. */
  api_key?: string
  key_type: UniOneKeyType
  project_id?: string | null
  region: UniOneRegion
  base_url?: string | null
  is_active?: boolean
  default_from_email?: string | null
  default_from_name?: string | null
  track_links?: boolean
  track_read?: boolean
  timeout_seconds?: number
  notes?: string | null
}

export type UniOneReceiverStatus =
  | 'active' | 'unsubscribed' | 'bounced' | 'complained' | 'suppressed'

export interface UniOneReceiver {
  id: number
  email: string
  name: string | null
  status: UniOneReceiverStatus
  consent_source: string | null
  consent_at: string | null
  last_sent_at: string | null
  last_status: string | null
  retry_after: string | null
  send_count: number
  bounce_count: number
  complaint_count: number
  /** What the send path would decide, so the list explains itself. */
  is_sendable: boolean
  notes: string | null
  created_at: string | null
}

export interface UpsertUniOneReceiverPayload {
  email: string
  name?: string | null
  status?: UniOneReceiverStatus
  /**
   * Optional metadata. No send path checks these — they are kept so an operator
   * can record where an address came from, not to gate anything.
   */
  consent_source?: string | null
  consent_at?: string | null
  notes?: string | null
}

export interface UniOneReceiverStats {
  total: number
  by_status: Record<string, number>
  sendable: number
}

export interface UniOneSendChunk {
  chunk_index: number
  job_id: string | null
  status: string
  recipient_count: number
  accepted_count: number
  failed_count: number
  http_status: number | null
  api_error_code: number | null
  latency_ms: number | null
  attempts: number
  error: string | null
  committed_at: string | null
}

export interface UniOneSend {
  id: number
  subject: string
  from_email: string
  from_name: string | null
  reply_to: string | null
  status: string
  requested_count: number
  eligible_count: number
  accepted_count: number
  failed_count: number
  chunk_count: number
  cooldown_hours: number
  error: string | null
  completed_at: string | null
  created_at: string | null
  key?: { id: number; name: string; key_type: UniOneKeyType; region: UniOneRegion }
  chunks?: UniOneSendChunk[]
  failed_emails?: Array<{ email: string; reason: string | null }>
}

export interface UniOneSendPreview {
  eligible: number
  will_send: number
  chunks: number
  chunk_size: number
}

/**
 * What a spreadsheet import reports — the same four figures the Warmup import
 * returns, because an operator reads them the same way.
 *
 * `duplicates` covers both repeats inside the file and addresses already on the
 * list: from the admin's point of view both mean nothing was added.
 */
export interface UniOneImportSummary {
  ok: boolean
  rows: number
  imported: number
  duplicates: number
  invalid: number
  message: string
}

export interface UniOneSendTemplate {
  value: string
  label: string
  description: string
}

/** A domain as /domain/list.json reports it. */
export interface UniOneDomain {
  domain: string
  'verification-record'?: { value: string; status: string }
  dkim?: { key: string; status: string }
}
