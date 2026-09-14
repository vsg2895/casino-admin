import client from './client'
import type { PaginatedResponse } from '@shared/types/api'
import type {
  EmailValidationAnalysis,
  EmailValidationCheckFlags,
  EmailValidationCheckResult,
  EmailValidationLog,
  EmailValidationOutcome,
  EmailValidationStats,
  EmailValidationVerdict,
} from '@shared/types/emailValidation'

// Read-only by design: no create/update/delete, and no "re-validate" action —
// that would spend a paid SendGrid credit from an audit screen. Rows leave only
// via the scheduled `email-validation:prune` command.

export interface EmailValidationFilters extends Partial<Record<keyof EmailValidationCheckFlags, boolean>> {
  page?: number
  per_page?: number
  site_id?: number
  verdict?: EmailValidationVerdict
  outcome?: EmailValidationOutcome
  reason_code?: string
  from?: string // Y-m-d
  to?: string // Y-m-d
  /** Inclusive score bounds — the histogram is read, then the range narrowed. */
  min_score?: number
  max_score?: number
  cached?: boolean
  search?: string
  /** contains (default) | exact | domain ("@gmail.com") */
  search_mode?: 'contains' | 'exact' | 'domain'
  sort?: 'created_at' | 'score'
  direction?: 'asc' | 'desc'
}

export function listEmailValidationLogs(
  params?: EmailValidationFilters,
): Promise<PaginatedResponse<EmailValidationLog>> {
  return client
    .get<PaginatedResponse<EmailValidationLog>>('/admin/email-validation', { params })
    .then((r) => r.data)
}

// Total for the current filters, issued separately so the paginated query never
// carries the count's weight — same split as the other admin tables.
export function countEmailValidationLogs(
  params?: Omit<EmailValidationFilters, 'page'>,
): Promise<number> {
  return client
    .get<{ total: number }>('/admin/email-validation/count', { params })
    .then((r) => r.data.total)
}

/**
 * Aggregates over the CURRENT filters — verdict/outcome splits, the score
 * histogram, top reasons and rejected domains, and how often each check is true.
 * Separate from the listing so the panel describes the whole filtered range,
 * not the visible page.
 */
export function getEmailValidationAnalysis(
  params?: Omit<EmailValidationFilters, 'page' | 'per_page'>,
): Promise<EmailValidationAnalysis> {
  return client
    .get<EmailValidationAnalysis>('/admin/email-validation/analysis', { params })
    .then((r) => r.data)
}

export function getEmailValidationStats(month?: string): Promise<EmailValidationStats> {
  return client
    .get<EmailValidationStats>('/admin/email-validation/stats', { params: { month } })
    .then((r) => r.data)
}

/** CSV of the CURRENT filtered view, not the whole table. */
export function exportEmailValidationLogs(params?: Omit<EmailValidationFilters, 'page'>): Promise<Blob> {
  return client
    .get('/admin/email-validation/export', { params, responseType: 'blob' })
    .then((r) => r.data as Blob)
}

/**
 * Validate ONE address on demand.
 *
 * Spends a real credit unless the verdict is already cached, so the UI must not
 * fire this on keystroke or on mount — only on an explicit click.
 */
export function checkEmailAddress(email: string, siteId: number): Promise<EmailValidationCheckResult> {
  return client
    .post<EmailValidationCheckResult>('/admin/email-validation/check', { email, site_id: siteId })
    .then((r) => r.data)
}
