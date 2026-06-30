import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as socialLinksApi from '@/api/socialLinks'
import type { SocialLinkPayload } from '@/api/socialLinks'
import type { SocialLink } from '@shared/types/socialLink'

export const useSocialLinksStore = defineStore('socialLinks', () => {
  const items = ref<SocialLink[]>([])
  const loading = ref(false)

  function sort(): void {
    items.value.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  }

  async function fetchSocialLinks(siteId?: number): Promise<void> {
    loading.value = true
    try {
      const response = await socialLinksApi.listSocialLinks(siteId)
      items.value = response.data
      sort()
    } finally {
      loading.value = false
    }
  }

  async function add(payload: SocialLinkPayload): Promise<void> {
    const response = await socialLinksApi.createSocialLink(payload)
    items.value.push(response.data)
    sort()
  }

  async function update(id: number, payload: Partial<Omit<SocialLinkPayload, 'site_id'>>): Promise<void> {
    const response = await socialLinksApi.updateSocialLink(id, payload)
    const idx = items.value.findIndex((s) => s.id === id)
    if (idx !== -1) items.value[idx] = response.data
    sort()
  }

  async function remove(id: number): Promise<void> {
    await socialLinksApi.deleteSocialLink(id)
    items.value = items.value.filter((s) => s.id !== id)
  }

  return { items, loading, fetchSocialLinks, add, update, remove }
})
