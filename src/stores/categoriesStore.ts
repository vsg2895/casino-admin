import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as categoriesApi from '@/api/categories'
import type { UpsertCategoryPayload } from '@/api/categories'
import type { Category } from '@shared/types/category'

export const useCategoriesStore = defineStore('categories', () => {
  const categories = ref<Category[]>([])
  const loading = ref(false)

  async function fetchCategories(): Promise<void> {
    loading.value = true
    try {
      const response = await categoriesApi.listCategories()
      categories.value = response.data
    } finally {
      loading.value = false
    }
  }

  async function add(payload: UpsertCategoryPayload): Promise<void> {
    const response = await categoriesApi.createCategory(payload)
    categories.value.push(response.data)
    categories.value.sort((a, b) => a.name.localeCompare(b.name))
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
    categories.value.sort((a, b) => a.name.localeCompare(b.name))
  }

  async function remove(id: number): Promise<void> {
    await categoriesApi.deleteCategory(id)
    categories.value = categories.value.filter((c) => c.id !== id)
  }

  return { categories, loading, fetchCategories, add, update, remove }
})
