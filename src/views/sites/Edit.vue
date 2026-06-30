<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import axios from 'axios'
import * as sitesApi from '@/api/sites'
import type { Site } from '@shared/types/site'
import type { ErrorResponse } from '@shared/types/api'

interface SiteEditForm {
  name: string
  domain: string
  revalidation_url: string
}

const props = defineProps<{
  visible: boolean
  site: Site | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  updated: [site: Site]
}>()

const form = reactive<SiteEditForm>({
  name: '',
  domain: '',
  revalidation_url: '',
})

const loading = ref(false)
const fieldErrors = ref<Record<string, string>>({})
const globalError = ref<string | null>(null)

watch(
  () => props.visible,
  (val) => {
    if (val && props.site) {
      form.name = props.site.name
      form.domain = props.site.domain
      form.revalidation_url = props.site.revalidation_url ?? ''
      fieldErrors.value = {}
      globalError.value = null
    }
  },
)

async function submit(): Promise<void> {
  if (!props.site) return
  fieldErrors.value = {}
  globalError.value = null
  loading.value = true

  try {
    const response = await sitesApi.updateSite(props.site.id, {
      name: form.name,
      domain: form.domain,
      revalidation_url: form.revalidation_url.trim() || null,
    })
    emit('updated', response.data)
    emit('update:visible', false)
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as ErrorResponse
      globalError.value = data.message
      if (data.errors) {
        for (const [field, messages] of Object.entries(data.errors)) {
          fieldErrors.value[field] = messages[0] ?? ''
        }
      }
    } else if (axios.isAxiosError(e)) {
      const data = e.response?.data as ErrorResponse | undefined
      globalError.value = data?.message ?? 'Failed to update site.'
    } else {
      globalError.value = 'An unexpected error occurred.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="site ? `Edit — ${site.name}` : 'Edit Site'"
    :style="{ width: '520px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="space-y-4" @submit.prevent="submit">
      <div
        v-if="globalError"
        class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
      >
        {{ globalError }}
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">
          Name <span class="text-red-500">*</span>
        </label>
        <InputText v-model="form.name" fluid required />
        <p v-if="fieldErrors.name" class="mt-1 text-xs text-red-600">{{ fieldErrors.name }}</p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Slug</label>
        <InputText :model-value="site?.slug ?? ''" fluid disabled />
        <p class="mt-1 text-xs text-gray-500">Slug cannot be changed after registration.</p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">
          Domain <span class="text-red-500">*</span>
        </label>
        <InputText v-model="form.domain" fluid required />
        <p v-if="fieldErrors.domain" class="mt-1 text-xs text-red-600">{{ fieldErrors.domain }}</p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Revalidation URL</label>
        <InputText v-model="form.revalidation_url" fluid placeholder="https://…/api/revalidate" />
        <p v-if="fieldErrors.revalidation_url" class="mt-1 text-xs text-red-600">
          {{ fieldErrors.revalidation_url }}
        </p>
      </div>
    </form>

    <template #footer>
      <Button label="Cancel" text @click="emit('update:visible', false)" />
      <Button label="Save Changes" :loading="loading" @click="submit" />
    </template>
  </Dialog>
</template>
