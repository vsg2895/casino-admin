import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as offersApi from '@/api/specialOffers'
import type { SpecialOffer } from '@shared/types/specialOffer'

export const useSpecialOffersStore = defineStore('specialOffers', () => {
  const offers = ref<SpecialOffer[]>([])
  const loading = ref(false)

  async function fetchOffers(): Promise<void> {
    loading.value = true
    try {
      const response = await offersApi.listSpecialOffers()
      offers.value = response.data
    } finally {
      loading.value = false
    }
  }

  function upsert(offer: SpecialOffer): void {
    const idx = offers.value.findIndex((o) => o.id === offer.id)
    if (idx !== -1) offers.value[idx] = offer
    else offers.value.unshift(offer)
  }

  function remove(id: number): void {
    offers.value = offers.value.filter((o) => o.id !== id)
  }

  return { offers, loading, fetchOffers, upsert, remove }
})
