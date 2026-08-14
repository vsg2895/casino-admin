// Fields match WarmupEmailResource.php — one address on the email-warmup list.
// Not site-scoped: warmup builds the reputation of the shared sending mailbox,
// so a single global list is the correct model.

export interface WarmupEmail {
  id: number
  email: string
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
// which is the catalog minus what warmup forbids (currently the verify email:
// its payload is a confirmation link that means nothing for a seed address).
export interface WarmupTemplate {
  value: string
  label: string
  description: string
}

// Payload for a warmup run. `count` is OPTIONAL — omit it (or send null) to mail
// every address on the list; a number takes that many, least-recently-contacted
// first, so the list warms evenly instead of the same addresses absorbing it all.
export interface WarmupSendPayload {
  site_id: number
  template: string
  count?: number | null
}
