// Fields match WarmupEmailResource.php — one address on the email-warmup list.
// Not site-scoped: warmup builds the reputation of the shared sending mailbox,
// so a single global list is the correct model.

export interface WarmupEmail {
  id: number
  email: string
  // When this address was last SUCCESSFULLY contacted; null = never. This is the
  // column the cooldown filter reads, so it explains why a run skipped an address.
  last_sent_at: string | null
  created_at: string
  updated_at: string
}

// Summary returned by the spreadsheet import.
export interface WarmupImportSummary {
  ok: boolean
  rows: number // data rows read, excluding a recognised header
  imported: number // rows actually added
  duplicates: number // already on the list, or repeated within the file
  invalid: number // non-empty cells that were not valid addresses
  message: string
}

export interface WarmupSendResult {
  ok: boolean
  send_id: number
  recipients: number
  message: string
}

// A template a warmup run may use. Served by /admin/warmup-emails/templates,
// which is the catalog filtered by WarmupMailResolver::ALLOWED_TEMPLATES — all
// four site templates. Verify is offered but carries a caveat: its confirmation
// link means nothing for a seed address, so prefer subscribe/promotion for
// routine warming.
export interface WarmupTemplate {
  value: string
  label: string
  description: string
}

// Payload for a warmup run.
//
// `count` is OPTIONAL — omit it (or send null) to mail every address on the list;
// a number takes that many, MOST RECENTLY ADDED first.
//
// `cooldown_days` only applies when `count` is set. It skips addresses that were
// successfully contacted within that many days, which is what stops the newest
// addresses absorbing every run. The server discards it for a whole-list send.
export interface WarmupSendPayload {
  // No site_id: warmup is pinned server-side to config('warmup.site_slug').
  template: string
  count?: number | null
  cooldown_days?: number | null
}

// Audience preview from /admin/warmup-emails/recipients — the same query the send
// runs, so the number shown before clicking is the number that gets mailed.
export interface WarmupRecipientPreview {
  total: number // addresses on the list
  eligible: number // addresses passing the cooldown filter
  recipients: number // what this run would actually reach (eligible capped by count)
  count: number | null // the requested cap, null = everyone
  cooldown_days: number | null
  min_cooldown_days: number
  max_cooldown_days: number
  default_cooldown_days: number
  // The ONE site warmup sends as, from config('warmup.site_slug'). Shown
  // read-only: warmup is pinned to a single brand and the send endpoint does not
  // accept a site at all. Null means the configured slug names no active site,
  // and a run cannot start until that is fixed.
  site_id: number | null
  site_name: string | null
  site_slug: string
}

/**
 * The most recent warmup run, summarised — what `GET /warmup-emails/last-send`
 * returns, or null when no run has ever happened.
 *
 * THREE COUNTS, not one, and they answer different questions:
 *
 *   requestedCount  what the operator typed; null means "the whole list"
 *   queuedCount     what the picker found after the cooldown filter
 *   sentCount       what the transport accepted — the headline number
 *
 * They diverge for ordinary reasons, and the gap is the useful part: asking for
 * 250 and queueing 180 is a cooldown too long for the list's size, while
 * queueing 250 and sending 243 is seven addresses that bounced.
 */
export interface WarmupLastSend {
  id: number
  /** When the run was STARTED. Per-address `sent_at` values trail it. */
  started_at: string | null
  requested_count: number | null
  queued_count: number
  sent_count: number
  failed_count: number
  attempted_count: number
  cooldown_days: number | null
  template: string
  template_label: string
  site_name: string | null
  /** The admin who pressed Send; null once that account is deleted. */
  sent_by: string | null
  /**
   * True while batches are still landing, in which case every count above is a
   * PARTIAL that will keep growing. The screen must say so rather than present
   * it as the run's total.
   */
  in_progress: boolean
  cancelled_at: string | null
}

export type WarmupSendStatus = 'sent' | 'failed'

// One recorded delivery attempt — matches WarmupSendRecipientResource.php.
// `email` is denormalised on purpose: the history outlives the address being
// removed from the list, at which point `warmup_email_id` becomes null.
export interface WarmupHistoryEntry {
  id: number
  email: string
  warmup_email_id: number | null
  warmup_send_id: number
  template: string
  template_label: string
  status: WarmupSendStatus
  error: string | null
  site: { id: number; name: string; domain: string } | null
  site_id: number | null
  sent_at: string
  created_at: string
}
