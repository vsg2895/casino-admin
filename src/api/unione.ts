import client from './client'
import type {
  UniOneApiKey,
  UniOneImportSummary,
  UniOneSendTemplate,
  UniOneDomain,
  UniOneReceiver,
  UniOneReceiverStats,
  UniOneReceiverStatus,
  UniOneSend,
  UniOneSendPreview,
  UpsertUniOneApiKeyPayload,
  UpsertUniOneReceiverPayload,
} from '@shared/types/unione'

/**
 * UniOne admin API.
 *
 * Its own file under its own prefix. Nothing here touches the SendGrid, Mailgun,
 * Warmup or newsletter clients, and none of those reference this.
 */

const BASE = '/admin/unione'

interface Paginated<T> {
  data: T[]
  meta: { current_page: number; last_page: number; total: number; per_page?: number }
}

// ── keys ─────────────────────────────────────────────────────────────────────

export interface UniOneKeyFilters {
  key_type?: string | null
  region?: string | null
  is_active?: boolean | null
}

export function listKeys(params?: UniOneKeyFilters): Promise<UniOneApiKey[]> {
  return client.get<{ data: UniOneApiKey[] }>(`${BASE}/keys`, { params }).then((r) => r.data.data)
}

export function createKey(payload: UpsertUniOneApiKeyPayload): Promise<UniOneApiKey> {
  return client.post<{ data: UniOneApiKey }>(`${BASE}/keys`, payload).then((r) => r.data.data)
}

export function updateKey(id: number, payload: UpsertUniOneApiKeyPayload): Promise<UniOneApiKey> {
  return client.put<{ data: UniOneApiKey }>(`${BASE}/keys/${id}`, payload).then((r) => r.data.data)
}

export function deleteKey(id: number): Promise<void> {
  return client.delete(`${BASE}/keys/${id}`).then(() => undefined)
}

export function toggleKey(id: number): Promise<UniOneApiKey> {
  return client.patch<{ data: UniOneApiKey }>(`${BASE}/keys/${id}/toggle`).then((r) => r.data.data)
}

/** Calls /system/ping.json then /system/info.json and stores the result. */
export function verifyKey(id: number): Promise<{ ok: boolean; status: string; info: Record<string, unknown> | null; key: UniOneApiKey }> {
  return client.post<{ data: { ok: boolean; status: string; info: Record<string, unknown> | null; key: UniOneApiKey } }>(
    `${BASE}/keys/${id}/verify`,
  ).then((r) => r.data.data)
}

export function makeKeyDefault(id: number): Promise<UniOneApiKey> {
  return client.patch<{ data: UniOneApiKey }>(`${BASE}/keys/${id}/default`).then((r) => r.data.data)
}

interface Passthrough<T> { ok: boolean; data: T; message: string | null; code: number | null }

export function listDomains(keyId: number): Promise<Passthrough<{ domains?: UniOneDomain[] }>> {
  return client.get<Passthrough<{ domains?: UniOneDomain[] }>>(`${BASE}/keys/${keyId}/domains`).then((r) => r.data)
}

export function domainDns(keyId: number, domain: string): Promise<Passthrough<Record<string, string>>> {
  return client.post<Passthrough<Record<string, string>>>(`${BASE}/keys/${keyId}/domains/dns`, { domain }).then((r) => r.data)
}

export function recheckDomain(keyId: number, domain: string, check: 'dkim' | 'verification'): Promise<Passthrough<Record<string, string>>> {
  return client.post<Passthrough<Record<string, string>>>(`${BASE}/keys/${keyId}/domains/recheck`, { domain, check }).then((r) => r.data)
}

export function listSuppressions(keyId: number, params?: Record<string, unknown>): Promise<Passthrough<{ suppressions?: Array<Record<string, string>>; cursor?: string }>> {
  return client
    .get<Passthrough<{ suppressions?: Array<Record<string, string>>; cursor?: string }>>(`${BASE}/keys/${keyId}/suppressions`, { params })
    .then((r) => r.data)
}

// ── receivers ────────────────────────────────────────────────────────────────

export interface UniOneReceiverFilters {
  page?: number
  per_page?: number
  status?: UniOneReceiverStatus | null
  consent_source?: string | null
  from?: string | null
  to?: string | null
  search?: string | null
}

export function listReceivers(params?: UniOneReceiverFilters): Promise<Paginated<UniOneReceiver>> {
  return client.get<Paginated<UniOneReceiver>>(`${BASE}/receivers`, { params }).then((r) => r.data)
}

export function receiverStats(): Promise<UniOneReceiverStats> {
  return client.get<{ data: UniOneReceiverStats }>(`${BASE}/receivers/stats`).then((r) => r.data.data)
}

export function createReceiver(payload: UpsertUniOneReceiverPayload): Promise<UniOneReceiver> {
  return client.post<{ data: UniOneReceiver }>(`${BASE}/receivers`, payload).then((r) => r.data.data)
}

export function updateReceiver(id: number, payload: UpsertUniOneReceiverPayload): Promise<UniOneReceiver> {
  return client.put<{ data: UniOneReceiver }>(`${BASE}/receivers/${id}`, payload).then((r) => r.data.data)
}

export function deleteReceiver(id: number): Promise<void> {
  return client.delete(`${BASE}/receivers/${id}`).then(() => undefined)
}

export function bulkReceivers(
  ids: number[],
  action: 'suppress' | 'delete' | 'status',
  status?: UniOneReceiverStatus,
): Promise<{ affected: number }> {
  return client.post<{ data: { affected: number } }>(`${BASE}/receivers/bulk`, { ids, action, status }).then((r) => r.data.data)
}

/**
 * Spreadsheet import — the same shape as the Warmup receivers import.
 *
 * multipart/form-data with an .xlsx or .csv, and nothing else.
 */
export function importReceivers(file: File): Promise<UniOneImportSummary> {
  const body = new FormData()
  body.append('file', file)

  return client
    .post<UniOneImportSummary>(`${BASE}/receivers/import`, body, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)
}

export function receiversExportUrl(): string {
  return `${BASE}/receivers/export`
}

// ── sending ──────────────────────────────────────────────────────────────────

export function previewSend(count: number, cooldownHours: number | null): Promise<UniOneSendPreview> {
  return client
    .post<{ data: UniOneSendPreview }>(`${BASE}/sends/preview`, { count, cooldown_hours: cooldownHours })
    .then((r) => r.data.data)
}

export function sendTest(payload: Record<string, unknown>): Promise<{ ok: boolean; message: string | null; job_id: string | null }> {
  return client.post<{ ok: boolean; message: string | null; job_id: string | null }>(`${BASE}/sends/test`, payload).then((r) => r.data)
}

export function startSend(payload: Record<string, unknown>): Promise<UniOneSend> {
  return client.post<{ data: UniOneSend }>(`${BASE}/sends`, payload).then((r) => r.data.data)
}

export function listSends(params?: Record<string, unknown>): Promise<Paginated<UniOneSend>> {
  return client.get<Paginated<UniOneSend>>(`${BASE}/sends`, { params }).then((r) => r.data)
}

export function getSend(id: number): Promise<UniOneSend> {
  return client.get<{ data: UniOneSend }>(`${BASE}/sends/${id}`).then((r) => r.data.data)
}

/** Templates a run may use — crogambline's promotion template. */
export function listSendTemplates(): Promise<{
  data: UniOneSendTemplate[]
  site: string
  suggested_subject: string
}> {
  return client
    .get<{ data: UniOneSendTemplate[]; site: string; suggested_subject: string }>(`${BASE}/sends/templates`)
    .then((r) => r.data)
}
