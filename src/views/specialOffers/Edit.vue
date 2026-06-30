<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import SpecialOfferFormFields from '@/components/SpecialOfferFormFields.vue'
import type { SpecialOfferFormModel } from '@/components/SpecialOfferFormFields.vue'
import * as offersApi from '@/api/specialOffers'
import { useSpecialOffersStore } from '@/stores/specialOffersStore'
import { useCasinosStore } from '@/stores/casinosStore'
import type { ErrorResponse } from '@shared/types/api'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const store = useSpecialOffersStore()
const casinosStore = useCasinosStore()

const offerId = Number(route.params.id)
const loaded = ref(false)
const saving = ref(false)
const errors = ref<Record<string, string>>({})
const formError = ref<string | null>(null)

const form = reactive<SpecialOfferFormModel>({
  casino_id: null, title: '', image_path: null, banner_image: null, bonuses: null,
  affiliate_url: null, description: null, rating: 0, sort_order: 0, active: true,
})

onMounted(async () => {
  await casinosStore.fetchCasinos({ per_page: 100 })
  const { data: offer } = await offersApi.getSpecialOffer(offerId)
  Object.assign(form, {
    casino_id: offer.casino_id, title: offer.title, image_path: offer.image_path,
    banner_image: offer.banner_image, bonuses: offer.bonuses, affiliate_url: offer.affiliate_url,
    description: offer.description, rating: offer.rating, sort_order: offer.sort_order, active: offer.active,
  })
  loaded.value = true
})

async function save(): Promise<void> {
  errors.value = {}
  formError.value = null
  saving.value = true
  try {
    const res = await offersApi.updateSpecialOffer(offerId, { ...form, casino_id: form.casino_id as number })
    store.upsert(res.data)
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Special offer updated.', life: 3000 })
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as ErrorResponse
      formError.value = data.message
      for (const [field, messages] of Object.entries(data.errors ?? {})) errors.value[field] = messages[0] ?? ''
    } else {
      formError.value = 'Failed to update special offer.'
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="loaded" class="space-y-4">
    <div class="flex items-center justify-between">
      <Button label="Cancel" icon="pi pi-arrow-left" text severity="secondary" @click="router.push({ name: 'special-offers' })" />
      <h2 class="text-lg font-semibold text-gray-900">Edit Offer</h2>
      <Button label="Update" icon="pi pi-check" :loading="saving" @click="save" />
    </div>

    <div v-if="formError" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{{ formError }}</div>

    <div class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <SpecialOfferFormFields :form="form" :casinos="casinosStore.casinos" :errors="errors" />
    </div>
  </div>
</template>
