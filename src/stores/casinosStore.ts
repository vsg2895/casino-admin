import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as casinosApi from '@/api/casinos'
import type { Casino } from '@shared/types/casino'
import { pageWindow, type PageWindow } from '@/utils/pagination'

export const useCasinosStore = defineStore('casinos', () => {
  const casinos = ref<Casino[]>([])
  const loading = ref(false)
  // Where the current page sits. No total: the listing is simple-paginated,
  // and the screen sizes its paginator from the separate COUNT.
  const pageInfo = ref<PageWindow | null>(null)

  async function fetchCasinos(params?: { page?: number; per_page?: number }): Promise<void> {
    loading.value = true
    try {
      const response = await casinosApi.listCasinos(params)
      casinos.value = response.data
      pageInfo.value = pageWindow(response)
    } finally {
      loading.value = false
    }
  }

  function upsert(casino: Casino): void {
    const idx = casinos.value.findIndex((c) => c.id === casino.id)
    if (idx !== -1) {
      casinos.value[idx] = casino
    } else {
      casinos.value.unshift(casino)
    }
  }

  function remove(id: number): void {
    casinos.value = casinos.value.filter((c) => c.id !== id)
  }

  return { casinos, loading, pageInfo, fetchCasinos, upsert, remove }
})
