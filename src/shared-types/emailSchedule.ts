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

/**
 * WHICH email a schedule sends: one of the site's stored templates, or the
 * operator's own HTML typed into the schedule itself.
 *
 * The keys match EmailSchedule::TEMPLATE_* and the warmup/email-history
 * template keys, so one template is one string everywhere.
 */
export type ScheduleTemplate = 'promotion' | 'subscribe' | 'verify' | 'custom'

/**
 * Templates the API accepts only for the `newsletters` audience. Mirrors
 * EmailSchedule::SUBSCRIBER_ONLY_TEMPLATES — keep the two in step.
 *
 * Just the verify email: it asks the recipient to confirm an address they
 * submitted themselves, and the button is resolved from their subscriber row.
 * Every address on a global list was entered by an operator who already has
 * it, so there is no claim to confirm and the button would have nothing to do.
 *
 * `subscribe` was in here until 2026-12, for a reason that no longer holds: its
 * opt-out link was resolved from a subscriber's own token, and only a
 * subscriber had one. Every global list — Mailgun receivers, SendGrid
 * receivers, warmup — now carries its own, so a welcome message to any of them
 * carries a working opt-out for the list that mailed them.
 */
export const SUBSCRIBER_ONLY_TEMPLATES: readonly ScheduleTemplate[] = ['verify']

// Fields match EmailScheduleResource.php — a scheduled promotion campaign: the
// site's promotion email, sent to the newest `limit` addresses of `audience`,
// skipping anyone who received it from this site within `cooldown_days`.
export interface EmailSchedule {
  id: number
  site_id: number
  site?: Site
  name: string | null
  /** Which email this schedule sends. 'promotion' for every schedule saved before the choice existed. */
  template: ScheduleTemplate
  /** The same, in words — 'Custom HTML'. */
  template_label: string
  /** Custom HTML only; null for every stored-template schedule. */
  custom_from_name: string | null
  custom_from_address: string | null
  custom_subject: string | null
  custom_html: string | null
  audience: ScheduleAudience
  limit: number | null // emails per run; null only on a schedule saved before counts existed
  cooldown_days: number // 1..365
  /**
   * Whether this schedule mails addresses that opted out of its site.
   *
   * False everywhere unless an admin deliberately turned it on. An opt-out is
   * global per site — any unsubscribe, through any template, stops all mail
   * from that site to that address, on every audience.
   */
  include_unsubscribed: boolean
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
  template: ScheduleTemplate
  // Required by the API when template = 'custom', ignored (and cleared) otherwise.
  custom_from_name?: string | null
  custom_from_address?: string | null
  custom_subject?: string | null
  custom_html?: string | null
  audience: ScheduleAudience
  limit: number
  cooldown_days: number
  include_unsubscribed?: boolean
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
