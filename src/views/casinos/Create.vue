<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import CasinoFormFields from '@/components/CasinoFormFields.vue'
import type { CasinoFormModel } from '@/components/CasinoFormFields.vue'
import * as casinosApi from '@/api/casinos'
import { useCasinosStore } from '@/stores/casinosStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import type { ErrorResponse } from '@shared/types/api'

const router = useRouter()
const toast = useToast()
const store = useCasinosStore()
const categoriesStore = useCategoriesStore()

const form = reactive<CasinoFormModel>({
  name: '',
  image_path: null,
  banner_image: null,
  bonuses: null,
  affiliate_url: null,
  description: null,
  rating: 0,
  sort_order: 0,
  featured_special_offer_id: null,
  meta_title: null,
  meta_description: null,
  active: false,
  category_ids: [],
})

const loading = ref(false)
const errors = ref<Record<string, string>>({})
const formError = ref<string | null>(null)

onMounted(() => {
  void categoriesStore.fetchCategories()
})

async function create(): Promise<void> {
  errors.value = {}
  formError.value = null
  loading.value = true
  try {
    const response = await casinosApi.createCasino({ ...form })
    store.upsert(response.data)
    toast.add({ severity: 'success', summary: 'Created', detail: `${response.data.name} created.`, life: 3000 })
    router.push({ name: 'casinos-edit', params: { id: response.data.id } })
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as ErrorResponse
      formError.value = data.message
      for (const [field, messages] of Object.entries(data.errors ?? {})) {
        errors.value[field] = messages[0] ?? ''
      }
    } else {
      formError.value = 'Failed to create product.'
    }
  } finally {
    loading.value = false
  }
}

function clearForm(): void {
  Object.assign(form, {
    name: '', image_path: null, banner_image: null, bonuses: null, affiliate_url: null,
    description: null, rating: 0, sort_order: 0, featured_special_offer_id: null,
    meta_title: null, meta_description: null, active: false, category_ids: [],
  })
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <Button label="Cancel" icon="pi pi-arrow-left" text severity="secondary" @click="router.push({ name: 'casinos' })" />
      <h2 class="text-lg font-semibold text-gray-900">Create Product</h2>
      <div class="flex gap-2">
        <Button label="Clear" icon="pi pi-trash" severity="danger" outlined @click="clearForm" />
        <Button label="Create" icon="pi pi-plus" :loading="loading" @click="create" />
      </div>
    </div>

    <div v-if="formError" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{{ formError }}</div>

    <div class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <CasinoFormFields :form="form" :categories="categoriesStore.categories" :offers="[]" :errors="errors" />
    </div>
  </div>
</template>
