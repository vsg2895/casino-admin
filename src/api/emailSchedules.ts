import client from './client'
import { downloadFile } from './download'
import type { ApiResponse, PaginatedResponse } from '@shared/types/api'
import type {
  EmailSchedule,
  ScheduleRecipientPreview,
  UpsertEmailSchedulePayload,
} from '@shared/types/emailSchedule'

export function listSchedules(page = 1): Promise<PaginatedResponse<EmailSchedule>> {
  return client
    .get<PaginatedResponse<EmailSchedule>>('/admin/schedules', { params: { page } })
    .then((r) => r.data)
}

export function createSchedule(payload: UpsertEmailSchedulePayload): Promise<ApiResponse<EmailSchedule>> {
  return client.post<ApiResponse<EmailSchedule>>('/admin/schedules', payload).then((r) => r.data)
}

export function updateSchedule(
  id: number,
  payload: UpsertEmailSchedulePayload,
): Promise<ApiResponse<EmailSchedule>> {
  return client.put<ApiResponse<EmailSchedule>>(`/admin/schedules/${id}`, payload).then((r) => r.data)
}

export function deleteSchedule(id: number): Promise<void> {
  return client.delete(`/admin/schedules/${id}`).then(() => undefined)
}

// Queue this campaign immediately, ignoring its cadence.
export function runSchedule(id: number): Promise<{ ok: boolean; message: string }> {
  return client.post<{ ok: boolean; message: string }>(`/admin/schedules/${id}/run`).then((r) => r.data)
}

// Who would receive this campaign right now — resolved by the same query the
// scheduled send uses, so the count matches what will actually be mailed.
export function previewScheduleRecipients(
  id: number,
  sample = 25,
): Promise<ApiResponse<ScheduleRecipientPreview>> {
  return client
    .get<ApiResponse<ScheduleRecipientPreview>>(`/admin/schedules/${id}/recipients`, {
      params: { sample },
    })
    .then((r) => r.data)
}

// Streams the full recipient list (email + created_at only) as CSV.
export function exportScheduleRecipients(id: number): Promise<void> {
  return downloadFile(`/admin/schedules/${id}/recipients/export`, `schedule-${id}-recipients.csv`)
}
