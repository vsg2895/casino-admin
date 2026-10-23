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

/**
 * Set the order categories appear in, on every site at once.
 *
 * Takes the ids in the order they should be shown; the server writes
 * `sort_order` as the index, so the stored values are always contiguous and a
 * tie is impossible. It answers with the whole re-ordered list, which is what
 * the caller should trust rather than its own optimistic copy.
 *
 * Whole-list rather than one row's number because position is RELATIVE —
 * "second" is a statement about the row, not about one chip in it.
 */
export function reorderCategories(ids: number[]): Promise<{ reordered: number; data: Category[] }> {
  return client
    .post<{ reordered: number; data: Category[] }>('/admin/categories/reorder', { ids })
    .then((r) => r.data)
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
