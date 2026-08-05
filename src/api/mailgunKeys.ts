import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type {
  MailgunKey,
  MailgunKeyStatus,
  UpsertMailgunKeyPayload,
} from '@shared/types/mailgunKey'

// The index is a flat (non-paginated) collection, optionally filtered by status.
export function listMailgunKeys(status?: MailgunKeyStatus): Promise<ApiResponse<MailgunKey[]>> {
  return client
    .get<ApiResponse<MailgunKey[]>>('/admin/mailgun-keys', {
      params: status ? { status } : {},
    })
    .then((r) => r.data)
}

export function createMailgunKey(
  payload: UpsertMailgunKeyPayload,
): Promise<ApiResponse<MailgunKey>> {
  return client.post<ApiResponse<MailgunKey>>('/admin/mailgun-keys', payload).then((r) => r.data)
}

export function updateMailgunKey(
  id: number,
  payload: UpsertMailgunKeyPayload,
): Promise<ApiResponse<MailgunKey>> {
  return client
    .put<ApiResponse<MailgunKey>>(`/admin/mailgun-keys/${id}`, payload)
    .then((r) => r.data)
}

export interface MailgunKeyTestPayload {
  to: string
  site_id: number // which website's content to render
  template: string // catalog value, e.g. 'promotion'
}

// Render the chosen template for the chosen site and send it THROUGH the stored
// key, verifying the key authenticates. Resolves on success; a failing key
// rejects with a 502 carrying the transport's reason.
export function testMailgunKey(
  id: number,
  payload: MailgunKeyTestPayload,
): Promise<{ ok: boolean; message: string }> {
  return client
    .post<{ ok: boolean; message: string }>(`/admin/mailgun-keys/${id}/test`, payload)
    .then((r) => r.data)
}

export function deleteMailgunKey(id: number): Promise<void> {
  return client.delete(`/admin/mailgun-keys/${id}`).then(() => undefined)
}

// Flip active ⇄ inactive without touching the stored key value.
export function toggleMailgunKey(id: number): Promise<ApiResponse<MailgunKey>> {
  return client
    .patch<ApiResponse<MailgunKey>>(`/admin/mailgun-keys/${id}/toggle`)
    .then((r) => r.data)
}
