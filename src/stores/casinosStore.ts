import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as casinosApi from '@/api/casinos'
import type { Casino } from '@shared/types/casino'
import type { PaginatedResponse } from '@shared/types/api'

export const useCasinosStore = defineStore('casinos', () => {
  const casinos = ref<Casino[]>([])
  const loading = ref(false)
  const meta = ref<PaginatedResponse<Casino>['meta'] | null>(null)

  async function fetchCasinos(params?: { page?: number; per_page?: number }): Promise<void> {
    loading.value = true
    try {
      const response = await casinosApi.listCasinos(params)
      casinos.value = response.data
      meta.value = response.meta
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

  return { casinos, loading, meta, fetchCasinos, upsert, remove }
})
