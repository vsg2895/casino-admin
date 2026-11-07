// Fields match ScheduleSendHistoryResource.php — one row of Email History →
// Schedules: an address a schedule sent to, skipped or failed on.

import type { ScheduleAudience, ScheduleProvider } from './emailSchedule'

export type ScheduleSendStatus = 'sent' | 'failed' | 'skipped'

export interface ScheduleSendHistory {
  id: number
  /** Null once the schedule is deleted; the row keeps its name. */
  email_schedule_id: number | null
  schedule_name: string | null
  site_id: number
  site_name?: string | null
  audience: ScheduleAudience
  audience_label: string
  email: string
  /** The template sent — the site's promotion email. */
  template: string
  provider: ScheduleProvider
  /** The email config used, as named when it sent, e.g. "SendGrid · Main key". */
  credential_label: string
  from_address: string | null
  status: ScheduleSendStatus
  /** Only on failed rows. */
  error: string | null
  sent_at: string
  sent_date: string
}

/** A schedule that appears in the history — the Schedule filter's options. */
export interface ScheduleHistorySchedule {
  id: number
  name: string
}
