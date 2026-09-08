import client from './client'
import { downloadFile } from './download'
import type { ApiResponse } from '@shared/types/api'
import type { CasinoDetail, UpsertCasinoDetailPayload } from '@shared/types/casinoDetail'

// The casino's factual profile, on its own endpoints so the existing casino
// CRUD is untouched. `show` never 404s — a casino with no profile yet returns an
// all-null shell for the form to bind to, because "not filled in" is the normal
// starting state rather than an error.

export function getCasinoDetail(casinoId: number): Promise<CasinoDetail> {
  return client
    .get<ApiResponse<CasinoDetail>>(`/admin/casinos/${casinoId}/details`)
    .then((r) => r.data.data)
}

export function saveCasinoDetail(
  casinoId: number,
  payload: UpsertCasinoDetailPayload,
): Promise<CasinoDetail> {
  return client
    .put<ApiResponse<CasinoDetail>>(`/admin/casinos/${casinoId}/details`, payload)
    .then((r) => r.data.data)
}

// ── Bulk spreadsheet round-trip ──────────────────────────────────────────────
// Filling ~30 fields per casino one form at a time does not scale. Export gives
// one row per casino (including casinos with no profile yet, so the file doubles
// as the work list), and import applies the edited sheet.


export function exportCasinoProfiles(): Promise<void> {
  return downloadFile('/admin/casino-profiles/export', 'casino-operator-profiles.csv')
}

export interface CasinoProfileImportResult {
  /** Rows whose stored profile actually changed. */
  updated: number
  /** Rows that matched a casino but held nothing new — the normal case on a re-import. */
  unchanged: number
  /** Rows that could not be applied, each naming the row number and why. */
  errors: string[]
}

export function importCasinoProfiles(file: File): Promise<CasinoProfileImportResult> {
  const form = new FormData()
  form.append('file', file)

  return client
    .post<CasinoProfileImportResult>('/admin/casino-profiles/import', form)
    .then((r) => r.data)
}
