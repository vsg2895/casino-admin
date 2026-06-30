import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as cmsApi from '@/api/cmsPages'
import type { CmsPageAdmin } from '@shared/types/cmsPage'
import type { PaginatedResponse } from '@shared/types/api'

export const useCmsPagesStore = defineStore('cmsPages', () => {
  const pages = ref<CmsPageAdmin[]>([])
  const loading = ref(false)
  const meta = ref<PaginatedResponse<CmsPageAdmin>['meta'] | null>(null)

  async function fetchPages(params?: { page?: number; site_id?: number }): Promise<void> {
    loading.value = true
    try {
      const response = await cmsApi.listCmsPages(params)
      pages.value = response.data
      meta.value = response.meta
    } finally {
      loading.value = false
    }
  }

  function upsert(page: CmsPageAdmin): void {
    const idx = pages.value.findIndex((p) => p.id === page.id)
    if (idx !== -1) pages.value[idx] = page
    else pages.value.unshift(page)
  }

  function remove(id: number): void {
    pages.value = pages.value.filter((p) => p.id !== id)
  }

  return { pages, loading, meta, fetchPages, upsert, remove }
})
