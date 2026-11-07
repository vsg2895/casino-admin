import type { Site } from './site'
import type { SendgridKey } from './sendgridKey'
import type { MailgunKey } from './mailgunKey'

// How a schedule's promotion campaign is delivered.
export type ScheduleProvider = 'smtp' | 'sendgrid' | 'mailgun'

// Which list a schedule mails: the site's own subscribers, one of the Custom
// Receivers lists, or the warmup list.
export type ScheduleAudience = 'newsletters' | 'mailgun_receivers' | 'sendgrid_receivers' | 'warmup'

// How often the campaign runs.
export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly'

// Fields match EmailScheduleResource.php — a scheduled promotion campaign: the
// site's promotion email, sent to the newest `limit` addresses of `audience`,
// skipping anyone who received it from this site within `cooldown_days`.
export interface EmailSchedule {
  id: number
  site_id: number
  site?: Site
  name: string | null
  audience: ScheduleAudience
  limit: number | null // emails per run; null only on a schedule saved before counts existed
  cooldown_days: number // 1..365
  /** Non-null when the schedule cannot send — a legacy row with no count. */
  blocked_reason: string | null
  frequency: ScheduleFrequency
  time: string // 'HH:MM'
  day_of_week: number | null // 0=Sun..6=Sat, only when frequency = 'weekly'
  day_of_month: number | null // 1..31, only when frequency = 'monthly'
  provider: ScheduleProvider // delivery transport
  sendgrid_key_id: number | null // stored key id, only when provider = 'sendgrid'
  sendgrid_key?: SendgridKey | null // hydrated key (masked), when loaded
  mailgun_key_id: number | null // stored credential id, only when provider = 'mailgun'
  mailgun_key?: MailgunKey | null // hydrated credential (masked), when loaded
  active: boolean
  last_run_at: string | null
  created_at: string
  updated_at: string
}

// Payload for creating/updating a schedule.
export interface UpsertEmailSchedulePayload {
  site_id: number
  name?: string | null
  audience: ScheduleAudience
  limit: number
  cooldown_days: number
  frequency: ScheduleFrequency
  time: string
  day_of_week?: number | null
  day_of_month?: number | null
  provider: ScheduleProvider
  sendgrid_key_id?: number | null
  mailgun_key_id?: number | null
  active?: boolean
}

// One recipient row shown in the preview table. `created_at` is when the
// address joined its list.
export interface ScheduleRecipient {
  email: string
  created_at: string | null
}

// GET /admin/schedules/{id}/recipients — resolved by the same query the send
// uses, so `count` is exactly how many addresses would be mailed right now.
export interface ScheduleRecipientPreview {
  count: number
  audience: ScheduleAudience
  sample_size: number
  sample: ScheduleRecipient[]
  generated_at: string
}
