<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import CmsPageFormFields from '@/components/CmsPageFormFields.vue'
import type { CmsPageFormModel } from '@/components/CmsPageFormFields.vue'
import * as cmsApi from '@/api/cmsPages'
import { useCmsPagesStore } from '@/stores/cmsPagesStore'
import { useSitesStore } from '@/stores/sitesStore'
import type { ErrorResponse } from '@shared/types/api'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const store = useCmsPagesStore()
const sitesStore = useSitesStore()

const pageId = Number(route.params.id)
const loaded = ref(false)
const saving = ref(false)
const errors = ref<Record<string, string>>({})
const formError = ref<string | null>(null)

const form = reactive<CmsPageFormModel>({
  site_id: null,
  slug: '',
  title: '',
  content: null,
  meta_title: null,
  meta_description: null,
  status: 'draft',
})

onMounted(async () => {
  sitesStore.fetchSites()
  const { data } = await cmsApi.getCmsPage(pageId)
  Object.assign(form, {
    site_id: data.site_id,
    slug: data.slug,
    title: data.title,
    content: data.content,
    meta_title: data.meta_title,
    meta_description: data.meta_description,
    status: data.status,
  })
  loaded.value = true
})

async function save(): Promise<void> {
  errors.value = {}
  formError.value = null
  saving.value = true
  try {
    // site_id is immutable on update — send everything except it.
    const res = await cmsApi.updateCmsPage(pageId, {
      slug: form.slug,
      title: form.title,
      content: form.content,
      meta_title: form.meta_title,
      meta_description: form.meta_description,
      status: form.status,
    })
    store.upsert(res.data)
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Page updated.', life: 3000 })
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as ErrorResponse
      formError.value = data.message
      for (const [field, messages] of Object.entries(data.errors ?? {})) errors.value[field] = messages[0] ?? ''
    } else {
      formError.value = 'Failed to update page.'
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <Button label="Cancel" icon="pi pi-arrow-left" text severity="secondary" @click="router.push({ name: 'pages' })" />
      <h2 class="text-lg font-semibold text-gray-900">Edit Page</h2>
      <Button label="Update" icon="pi pi-check" :loading="saving" @click="save" />
    </div>

    <div v-if="formError" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{{ formError }}</div>

    <div v-if="loaded" class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <CmsPageFormFields :form="form" :errors="errors" :slug-locked="true" :site-locked="true" :sites="sitesStore.sites" />
    </div>
  </div>
</template>
