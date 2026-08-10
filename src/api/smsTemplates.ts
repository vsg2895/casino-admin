import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type {
  SmsTemplate,
  SmsTemplatePayload,
  SmsTemplateStatus,
} from '@shared/types/smsTemplate'

// Not paginated — templates are a small hand-curated set, and the send dialog
// wants them all in one call.

export function listSmsTemplates(params?: {
  status?: SmsTemplateStatus
}): Promise<{ data: SmsTemplate[] }> {
  return client.get<{ data: SmsTemplate[] }>('/admin/sms-templates', { params }).then((r) => r.data)
}

export function createSmsTemplate(payload: SmsTemplatePayload): Promise<ApiResponse<SmsTemplate>> {
  return client.post<ApiResponse<SmsTemplate>>('/admin/sms-templates', payload).then((r) => r.data)
}

// Editing here is the whole feature: the next send starts from the new text.
// Runs already queued keep their own copy of the body and are unaffected.
export function updateSmsTemplate(
  id: number,
  payload: SmsTemplatePayload,
): Promise<ApiResponse<SmsTemplate>> {
  return client
    .put<ApiResponse<SmsTemplate>>(`/admin/sms-templates/${id}`, payload)
    .then((r) => r.data)
}

export function deleteSmsTemplate(id: number): Promise<void> {
  return client.delete(`/admin/sms-templates/${id}`).then(() => undefined)
}

// Retire a template without deleting it: it drops out of the send dialog but
// stays available to reactivate.
export function toggleSmsTemplate(id: number): Promise<ApiResponse<SmsTemplate>> {
  return client
    .patch<ApiResponse<SmsTemplate>>(`/admin/sms-templates/${id}/toggle`)
    .then((r) => r.data)
}
