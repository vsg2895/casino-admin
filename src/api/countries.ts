import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { Continent, Country, UpsertCountryPayload } from '@shared/types/country'

/**
 * Countries are global master data attached to casinos through a bare pivot —
 * the same shape as categories. There is no per-site variant of this list.
 */
export function listCountries(): Promise<ApiResponse<Country[]>> {
  return client.get<ApiResponse<Country[]>>('/admin/countries').then((r) => r.data)
}

/** Options for the continent picker. Read-only: continents are fixed reference data. */
export function listContinents(): Promise<ApiResponse<Continent[]>> {
  return client.get<ApiResponse<Continent[]>>('/admin/countries/continents').then((r) => r.data)
}

export function createCountry(payload: UpsertCountryPayload): Promise<ApiResponse<Country>> {
  return client.post<ApiResponse<Country>>('/admin/countries', payload).then((r) => r.data)
}

export function updateCountry(
  id: number,
  payload: UpsertCountryPayload,
): Promise<ApiResponse<Country>> {
  return client.put<ApiResponse<Country>>(`/admin/countries/${id}`, payload).then((r) => r.data)
}

export function deleteCountry(id: number): Promise<void> {
  return client.delete(`/admin/countries/${id}`).then(() => undefined)
}

// ── Whole-list casino attachment ─────────────────────────────────────────────
// The per-casino country picker on the casino form handles one operator. These
// two act on the entire pivot at once.

export interface BulkAttachResult {
  ok: boolean
  casinos?: number
  countries?: number
  attached?: number
  removed?: number
  total?: number
  message: string
}

/** Attach every ACTIVE casino to every ACTIVE country. Idempotent. */
export function attachAllCasinosToCountries(): Promise<BulkAttachResult> {
  return client
    .post<BulkAttachResult>('/admin/casino-countries/attach-all')
    .then((r) => r.data)
}

/**
 * Remove EVERY casino/country attachment.
 *
 * `confirm` is required by the API — it clears hand-curated market lists as
 * readily as bulk-attached ones and there is no undo, so it must not be
 * reachable by a stray request.
 */
export function detachAllCasinosFromCountries(): Promise<BulkAttachResult> {
  return client
    .post<BulkAttachResult>('/admin/casino-countries/detach-all', { confirm: true })
    .then((r) => r.data)
}
