import client from './client'
import type { Category } from '@shared/types/category'
import type { ApiResponse } from '@shared/types/api'

export function listCategories(): Promise<ApiResponse<Category[]>> {
  return client.get<ApiResponse<Category[]>>('/admin/categories').then((r) => r.data)
}

export function createCategory(name: string): Promise<ApiResponse<Category>> {
  return client.post<ApiResponse<Category>>('/admin/categories', { name }).then((r) => r.data)
}

export function deleteCategory(id: number): Promise<void> {
  return client.delete(`/admin/categories/${id}`).then(() => undefined)
}
