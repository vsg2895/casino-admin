import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as categoriesApi from '@/api/categories'
import type { UpsertCategoryPayload } from '@/api/categories'
import type { Category } from '@shared/types/category'

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref<Category[]>([])
  const loading = ref(false)

  /**
   * The SERVER's order, reproduced exactly: `sort_order` first, name only as
   * the tie-break — the same rule as Category::scopeOrdered().
   *
   * This used to sort by name alone, which quietly contradicted the API: the
   * list arrived in display order and was immediately rearranged
   * alphabetically, so the admin table and the public chip row disagreed the
   * moment anything was added or renamed. With positions now editable here,
   * that disagreement would read as the position feature being broken.
   */
  function inDisplayOrder(rows: Category[]): Category[] {
    return [...rows].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
    )
  }

  async function fetchCategories(): Promise<void> {
    loading.value = true
    try {
      const response = await categoriesApi.listCategories()
      categories.value = inDisplayOrder(response.data)
    } finally {
      loading.value = false
    }
  }

  async function add(payload: UpsertCategoryPayload): Promise<void> {
    const response = await categoriesApi.createCategory(payload)
    categories.value = inDisplayOrder([...categories.value, response.data])
  }

  /**
   * Replaces the row in place rather than refetching the list.
   *
   * The response is the saved category, so the table shows exactly what the
   * server stored — including a logo the admin just attached.
   */
  async function update(id: number, payload: UpsertCategoryPayload): Promise<void> {
    const response = await categoriesApi.updateCategory(id, payload)
    const index = categories.value.findIndex((c) => c.id === id)
    if (index !== -1) categories.value[index] = response.data
    categories.value = inDisplayOrder(categories.value)
  }

  /**
   * Move a category to a new position, 0-based, and persist the whole order.
   *
   * The list is reordered LOCALLY first so the table does not jump while the
   * request is in flight, then replaced with the server's answer — which is
   * authoritative and carries the renumbered `sort_order` on every row.
   * A failure restores the previous order rather than leaving the screen
   * showing something that was never saved.
   */
  async function move(id: number, toIndex: number): Promise<void> {
    const previous = [...categories.value]
    const from = categories.value.findIndex((c) => c.id === id)
    if (from === -1) return

    const next = [...categories.value]
    const [row] = next.splice(from, 1)
    next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, row)
    categories.value = next

    try {
      const response = await categoriesApi.reorderCategories(next.map((c) => c.id))
      categories.value = inDisplayOrder(response.data)
    } catch (e) {
      categories.value = previous
      throw e
    }
  }

  async function remove(id: number): Promise<void> {
    await categoriesApi.deleteCategory(id)
    categories.value = categories.value.filter((c) => c.id !== id)
  }

  return { categories, loading, fetchCategories, add, update, move, remove }
})
