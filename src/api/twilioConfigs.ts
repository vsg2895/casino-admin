import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type {
  TwilioConfig,
  TwilioConfigPayload,
  TwilioConfigStatus,
  TwilioTestResult,
} from '@shared/types/twilioConfig'

// Same contract as sendgridKeys.ts / mailgunKeys.ts — CRUD, toggle, test — so
// the credential screens are interchangeable.

export function listTwilioConfigs(params?: {
  status?: TwilioConfigStatus
}): Promise<{ data: TwilioConfig[] }> {
  return client.get<{ data: TwilioConfig[] }>('/admin/twilio-configs', { params }).then((r) => r.data)
}

export function createTwilioConfig(
  payload: TwilioConfigPayload,
): Promise<ApiResponse<TwilioConfig>> {
  return client.post<ApiResponse<TwilioConfig>>('/admin/twilio-configs', payload).then((r) => r.data)
}

// Leave `auth_token` out of the payload to keep the stored token.
export function updateTwilioConfig(
  id: number,
  payload: TwilioConfigPayload,
): Promise<ApiResponse<TwilioConfig>> {
  return client
    .put<ApiResponse<TwilioConfig>>(`/admin/twilio-configs/${id}`, payload)
    .then((r) => r.data)
}

export function deleteTwilioConfig(id: number): Promise<void> {
  return client.delete(`/admin/twilio-configs/${id}`).then(() => undefined)
}

export function toggleTwilioConfig(id: number): Promise<ApiResponse<TwilioConfig>> {
  return client
    .patch<ApiResponse<TwilioConfig>>(`/admin/twilio-configs/${id}/toggle`)
    .then((r) => r.data)
}

// Sends ONE real SMS through the stored credential to prove it works. Worth
// spending a message on before trusting a credential with a bulk run — a wrong
// token, an unowned sender or a geo-permission block all surface here.
export function testTwilioConfig(
  id: number,
  payload: { to: string; body: string },
): Promise<TwilioTestResult> {
  return client
    .post<TwilioTestResult>(`/admin/twilio-configs/${id}/test`, payload)
    .then((r) => r.data)
}
