import client from './client'
import type { Category } from '@shared/types/category'
import type { ApiResponse } from '@shared/types/api'

/** The fields an admin may set on a category. */
export interface UpsertCategoryPayload {
  name: string
  /** Stored path from uploadCategoryLogo(). Explicit null clears the logo. */
  logo_path?: string | null
  sort_order?: number | null
}

export function listCategories(): Promise<ApiResponse<Category[]>> {
  return client.get<ApiResponse<Category[]>>('/admin/categories').then((r) => r.data)
}

export function createCategory(payload: UpsertCategoryPayload): Promise<ApiResponse<Category>> {
  return client.post<ApiResponse<Category>>('/admin/categories', payload).then((r) => r.data)
}

export function updateCategory(
  id: number,
  payload: UpsertCategoryPayload,
): Promise<ApiResponse<Category>> {
  return client.put<ApiResponse<Category>>(`/admin/categories/${id}`, payload).then((r) => r.data)
}

export function deleteCategory(id: number): Promise<void> {
  return client.delete(`/admin/categories/${id}`).then(() => undefined)
}

/**
 * Upload one SVG logo and get back its stored path.
 *
 * Its OWN request, separate from saving the category: a validation error on the
 * name then never throws away a file the admin already picked, and the same
 * uploaded path can be reused if the save is retried.
 */
export function uploadCategoryLogo(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)

  return client
    .post<{ path: string; url: string }>('/admin/uploads/category-logo', form)
    .then((r) => r.data.path)
}
