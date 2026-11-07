import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { SimplePaginatedResponse } from '@shared/types/pagination'
import type { ScheduleAudience, ScheduleProvider } from '@shared/types/emailSchedule'
import type {
  ScheduleHistorySchedule,
  ScheduleSendHistory,
  ScheduleSendStatus,
} from '@shared/types/scheduleSendHistory'

/** Email History → Schedules. Every filter is optional and ignored when unknown. */
export interface ScheduleHistoryFilters {
  page?: number
  per_page?: number
  schedule_id?: number
  site_id?: number
  audience?: ScheduleAudience
  provider?: ScheduleProvider
  status?: ScheduleSendStatus
  /** Inclusive `YYYY-MM-DD` bounds on the send date, in `tz`. */
  from?: string
  to?: string
  /** The operator's IANA zone, so a "day" is their day. Set from the browser. */
  tz?: string
  /** Email prefix. */
  search?: string
}

export function listScheduleHistory(
  params?: ScheduleHistoryFilters,
): Promise<SimplePaginatedResponse<ScheduleSendHistory>> {
  return client
    .get<SimplePaginatedResponse<ScheduleSendHistory>>('/admin/schedule-history', { params })
    .then((r) => r.data)
}

/** Dedicated COUNT with the same filters, so the badge and pager never ride on the listing. */
export function countScheduleHistory(params?: Omit<ScheduleHistoryFilters, 'page' | 'per_page'>): Promise<number> {
  return client.get<{ total: number }>('/admin/schedule-history/count', { params }).then((r) => r.data.total)
}

/** The schedules that appear in the history — deleted ones included, by name. */
export function listScheduleHistorySchedules(): Promise<ScheduleHistorySchedule[]> {
  return client
    .get<ApiResponse<ScheduleHistorySchedule[]>>('/admin/schedule-history/schedules')
    .then((r) => r.data.data)
}

export function deleteScheduleHistory(id: number): Promise<void> {
  return client.delete(`/admin/schedule-history/${id}`).then(() => undefined)
}
