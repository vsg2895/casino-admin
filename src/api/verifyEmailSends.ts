import client from './client'
import type { SimplePaginatedResponse } from '@shared/types/pagination'
import type { VerifyEmailSend, VerifyEmailSendFilters } from '@shared/types/verifyEmailSend'

/**
 * The verify-email send log — the double opt-in confirmations.
 *
 * Same surface as the post-verification history it sits beside: a filtered
 * listing, a dedicated COUNT for the badge (which also carries `failed`), and a
 * single-row delete. There is no create or update, because a row records
 * something that already happened.
 */

const BASE = '/admin/verify-email-sends'

export function listVerifyEmailSends(
  params?: VerifyEmailSendFilters,
): Promise<SimplePaginatedResponse<VerifyEmailSend>> {
  return client.get<SimplePaginatedResponse<VerifyEmailSend>>(BASE, { params }).then((r) => r.data)
}

/**
 * Totals for the current filters — how many attempts match, and how many of
 * those failed. Counted over the whole filtered set, never the page in hand.
 */
export function countVerifyEmailSends(
  params?: Omit<VerifyEmailSendFilters, 'page' | 'per_page'>,
): Promise<{ total: number; failed: number }> {
  return client
    .get<{ total: number; failed: number }>(`${BASE}/count`, { params })
    .then((r) => r.data)
}

/** Remove ONE row. Bulk removal is the artisan commands, never this screen. */
export function deleteVerifyEmailSend(id: number): Promise<void> {
  return client.delete(`${BASE}/${id}`).then(() => undefined)
}
