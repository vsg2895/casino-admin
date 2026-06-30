import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as categoriesApi from '@/api/categories'
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

  async function add(name: string): Promise<void> {
    const response = await categoriesApi.createCategory(name)
    categories.value.push(response.data)
    categories.value.sort((a, b) => a.name.localeCompare(b.name))
  }

  async function remove(id: number): Promise<void> {
    await categoriesApi.deleteCategory(id)
    categories.value = categories.value.filter((c) => c.id !== id)
  }

  return { categories, loading, fetchCategories, add, remove }
})
