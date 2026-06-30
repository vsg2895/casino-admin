import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as newsletterApi from '@/api/newsletter'
import type { Newsletter } from '@shared/types/newsletter'
import type { PaginatedResponse } from '@shared/types/api'

export const useNewsletterStore = defineStore('newsletter', () => {
  const items = ref<Newsletter[]>([])
  const loading = ref(false)
  const meta = ref<PaginatedResponse<Newsletter>['meta'] | null>(null)

  async function fetchNewsletters(params?: { page?: number; site_id?: number; trashed?: boolean }): Promise<void> {
    loading.value = true
    try {
      const response = await newsletterApi.listNewsletters(params)
      items.value = response.data
      meta.value = response.meta
    } finally {
      loading.value = false
    }
  }

  async function add(payload: { site_id: number; email: string }): Promise<void> {
    const response = await newsletterApi.createNewsletter(payload)
    const idx = items.value.findIndex((n) => n.id === response.data.id)
    if (idx === -1) items.value.unshift(response.data)
  }

  async function remove(id: number): Promise<void> {
    await newsletterApi.deleteNewsletter(id)
    items.value = items.value.filter((n) => n.id !== id)
  }

  async function removeMany(ids: number[]): Promise<number> {
    const { deleted } = await newsletterApi.bulkDeleteNewsletters(ids)
    const set = new Set(ids)
    items.value = items.value.filter((n) => !set.has(n.id))
    return deleted
  }

  async function removeAll(siteId?: number): Promise<number> {
    const { deleted } = await newsletterApi.deleteAllNewsletters(siteId)
    items.value = []
    return deleted
  }

  function drop(ids: number[]): void {
    const set = new Set(ids)
    items.value = items.value.filter((n) => !set.has(n.id))
  }

  async function restore(id: number): Promise<void> {
    await newsletterApi.restoreNewsletter(id)
    drop([id])
  }

  async function restoreMany(ids: number[]): Promise<number> {
    const { restored } = await newsletterApi.bulkRestoreNewsletters(ids)
    drop(ids)
    return restored
  }

  async function forceDelete(id: number): Promise<void> {
    await newsletterApi.forceDeleteNewsletter(id)
    drop([id])
  }

  async function forceDeleteMany(ids: number[]): Promise<number> {
    const { deleted } = await newsletterApi.bulkForceDeleteNewsletters(ids)
    drop(ids)
    return deleted
  }

  return {
    items,
    loading,
    meta,
    fetchNewsletters,
    add,
    remove,
    removeMany,
    removeAll,
    restore,
    restoreMany,
    forceDelete,
    forceDeleteMany,
  }
})
