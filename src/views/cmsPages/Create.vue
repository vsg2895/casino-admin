<script setup lang="ts">
import { reactive, ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import CmsPageFormFields from '@/components/CmsPageFormFields.vue'
import type { CmsPageFormModel } from '@/components/CmsPageFormFields.vue'
import * as cmsApi from '@/api/cmsPages'
import { useCmsPagesStore } from '@/stores/cmsPagesStore'
import { useSitesStore } from '@/stores/sitesStore'
import type { ErrorResponse } from '@shared/types/api'

const router = useRouter()
const toast = useToast()
const store = useCmsPagesStore()
const sitesStore = useSitesStore()

onMounted(() => sitesStore.fetchSites())

const form = reactive<CmsPageFormModel>({
  site_id: null,
  slug: '',
  title: '',
  content: null,
  meta_title: null,
  meta_description: null,
  status: 'draft',
})

const loading = ref(false)
const errors = ref<Record<string, string>>({})
const formError = ref<string | null>(null)

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
}

// Keep the slug in sync with the title until the user types a custom slug.
let lastAuto = ''
watch(() => form.title, (title) => {
  if (form.slug === '' || form.slug === lastAuto) {
    lastAuto = slugify(title)
    form.slug = lastAuto
  }
})

async function create(): Promise<void> {
  errors.value = {}
  formError.value = null
  if (form.site_id == null) {
    errors.value.site_id = 'Please select a site.'
    return
  }
  loading.value = true
  try {
    const res = await cmsApi.createCmsPage({ ...form, site_id: form.site_id })
    store.upsert(res.data)
    toast.add({ severity: 'success', summary: 'Created', detail: `${res.data.title} created.`, life: 3000 })
    router.push({ name: 'pages-edit', params: { id: res.data.id } })
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as ErrorResponse
      formError.value = data.message
      for (const [field, messages] of Object.entries(data.errors ?? {})) errors.value[field] = messages[0] ?? ''
    } else {
      formError.value = 'Failed to create page.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <Button label="Cancel" icon="pi pi-arrow-left" text severity="secondary" @click="router.push({ name: 'pages' })" />
      <h2 class="text-lg font-semibold text-gray-900">New Page</h2>
      <Button label="Create" icon="pi pi-plus" :loading="loading" @click="create" />
    </div>

    <div v-if="formError" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{{ formError }}</div>

    <div class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <CmsPageFormFields :form="form" :errors="errors" :sites="sitesStore.sites" />
    </div>
  </div>
</template>
