import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type {
  SendgridKey,
  SendgridKeyStatus,
  UpsertSendgridKeyPayload,
} from '@shared/types/sendgridKey'

// The index is a flat (non-paginated) collection, optionally filtered by status.
export function listSendgridKeys(status?: SendgridKeyStatus): Promise<ApiResponse<SendgridKey[]>> {
  return client
    .get<ApiResponse<SendgridKey[]>>('/admin/sendgrid-keys', {
      params: status ? { status } : {},
    })
    .then((r) => r.data)
}

export function createSendgridKey(
  payload: UpsertSendgridKeyPayload,
): Promise<ApiResponse<SendgridKey>> {
  return client.post<ApiResponse<SendgridKey>>('/admin/sendgrid-keys', payload).then((r) => r.data)
}

export function updateSendgridKey(
  id: number,
  payload: UpsertSendgridKeyPayload,
): Promise<ApiResponse<SendgridKey>> {
  return client
    .put<ApiResponse<SendgridKey>>(`/admin/sendgrid-keys/${id}`, payload)
    .then((r) => r.data)
}

export interface SendgridKeyTestPayload {
  to: string
  site_id: number // which website's content to render
  template: string // catalog value, e.g. 'promotion'
}

// Render the chosen template for the chosen site and send it THROUGH the stored
// key, verifying the key authenticates. Resolves on success; a failing key
// rejects with a 502 carrying the transport's reason.
export function testSendgridKey(
  id: number,
  payload: SendgridKeyTestPayload,
): Promise<{ ok: boolean; message: string }> {
  return client
    .post<{ ok: boolean; message: string }>(`/admin/sendgrid-keys/${id}/test`, payload)
    .then((r) => r.data)
}

export function deleteSendgridKey(id: number): Promise<void> {
  return client.delete(`/admin/sendgrid-keys/${id}`).then(() => undefined)
}

// Flip active ⇄ inactive without touching the stored key value.
export function toggleSendgridKey(id: number): Promise<ApiResponse<SendgridKey>> {
  return client
    .patch<ApiResponse<SendgridKey>>(`/admin/sendgrid-keys/${id}/toggle`)
    .then((r) => r.data)
}
