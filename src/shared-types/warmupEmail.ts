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
  recipients: number
  message: string
}
