// The verify-email send log — the double opt-in confirmations.
//
// The first email a subscriber ever receives, and the one that decides whether
// they are verified at all. Shaped identically to the post-verification history
// it sits beside in Email History, so one screen reads both.

export type VerifyEmailSendStatus = 'success' | 'failed'

export interface VerifyEmailSend {
  id: number
  email: string
  /** Null once the subscriber has been deleted — `email` keeps the row readable. */
  newsletter_id: number | null
  status: VerifyEmailSendStatus
  error: string | null
  /** A "Send test" from the Verify Email screen, not a subscriber's confirmation. */
  is_test: boolean
  site: { id: number; name: string; domain: string } | null
  site_id: number
  sent_at: string
  created_at: string | null
}

export interface VerifyEmailSendFilters {
  page?: number
  per_page?: number
  search?: string
  site_id?: number
  status?: VerifyEmailSendStatus
  /** `YYYY-MM-DD`, inclusive. */
  sent_from?: string
  sent_to?: string
}
