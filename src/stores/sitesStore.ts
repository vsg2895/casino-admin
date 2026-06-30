import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as sitesApi from '@/api/sites'
import type { Site } from '@shared/types/site'

export const useSitesStore = defineStore('sites', () => {
  const sites = ref<Site[]>([])
  const loading = ref(false)
  let fetched = false

  async function fetchSites(force = false): Promise<void> {
    if (fetched && !force) return
    loading.value = true
    try {
      const response = await sitesApi.listSites()
      sites.value = response.data
      fetched = true
    } finally {
      loading.value = false
    }
  }

  function upsert(site: Site): void {
    const idx = sites.value.findIndex((s) => s.id === site.id)
    if (idx !== -1) {
      sites.value[idx] = site
    } else {
      sites.value.unshift(site)
    }
  }

  function remove(id: number): void {
    sites.value = sites.value.filter((s) => s.id !== id)
  }

  function invalidate(): void {
    fetched = false
  }

  return { sites, loading, fetchSites, upsert, remove, invalidate }
})
