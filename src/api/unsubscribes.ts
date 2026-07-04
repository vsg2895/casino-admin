import client from './client'
import { downloadFile } from './download'
import type { PaginatedResponse } from '@shared/types/api'
import type { Unsubscribe, UnsubscribeType } from '@shared/types/unsubscribe'

export interface UnsubscribeFilters {
  page?: number
  site_id?: number
  type?: UnsubscribeType
  search?: string
}

export function listUnsubscribes(params?: UnsubscribeFilters): Promise<PaginatedResponse<Unsubscribe>> {
  return client.get<PaginatedResponse<Unsubscribe>>('/admin/unsubscribes', { params }).then((r) => r.data)
}

export function exportUnsubscribes(params?: Omit<UnsubscribeFilters, 'page' | 'search'>): Promise<void> {
  const query = new URLSearchParams()
  if (params?.site_id) query.set('site_id', String(params.site_id))
  if (params?.type) query.set('type', params.type)
  const qs = query.toString()
  return downloadFile(`/admin/unsubscribes/export${qs ? `?${qs}` : ''}`, 'unsubscribes.csv')
}

export function deleteUnsubscribe(id: number): Promise<void> {
  return client.delete(`/admin/unsubscribes/${id}`).then(() => undefined)
}
