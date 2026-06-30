<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import axios from 'axios'
import * as sitesApi from '@/api/sites'
import type { SiteRegistrationResponse } from '@shared/types/site'
import type { ErrorResponse } from '@shared/types/api'

interface SiteFormData {
  name: string
  slug: string
  domain: string
  revalidation_url: string
}

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  registered: [response: SiteRegistrationResponse]
}>()

function defaultForm(): SiteFormData {
  return { name: '', slug: '', domain: '', revalidation_url: '' }
}

const form = reactive<SiteFormData>(defaultForm())
const loading = ref(false)
const fieldErrors = ref<Record<string, string>>({})
const globalError = ref<string | null>(null)

watch(
  () => props.visible,
  (val) => {
    if (val) {
      Object.assign(form, defaultForm())
      fieldErrors.value = {}
      globalError.value = null
    }
  },
)

function autoSlug(): void {
  if (!form.slug) {
    form.slug = form.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }
}

async function submit(): Promise<void> {
  fieldErrors.value = {}
  globalError.value = null
  loading.value = true

  try {
    const response = await sitesApi.createSite({
      name: form.name,
      slug: form.slug,
      domain: form.domain,
      revalidation_url: form.revalidation_url.trim() || null,
    })
    emit('registered', response.data)
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
      globalError.value = data?.message ?? 'Failed to register site.'
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
    header="Register Domain"
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
        <InputText
          v-model="form.name"
          fluid
          required
          placeholder="Crystal Dice"
          @input="autoSlug"
        />
        <p v-if="fieldErrors.name" class="mt-1 text-xs text-red-600">{{ fieldErrors.name }}</p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">
          Slug <span class="text-red-500">*</span>
        </label>
        <InputText v-model="form.slug" fluid required placeholder="crystal-dice" />
        <p class="mt-1 text-xs text-gray-500">Used in API paths. Lowercase, hyphens only.</p>
        <p v-if="fieldErrors.slug" class="mt-1 text-xs text-red-600">{{ fieldErrors.slug }}</p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">
          Domain <span class="text-red-500">*</span>
        </label>
        <InputText v-model="form.domain" fluid required placeholder="crystaldice.net" />
        <p v-if="fieldErrors.domain" class="mt-1 text-xs text-red-600">{{ fieldErrors.domain }}</p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Revalidation URL</label>
        <InputText
          v-model="form.revalidation_url"
          fluid
          placeholder="https://crystaldice.net/api/revalidate"
        />
        <p class="mt-1 text-xs text-gray-500">Next.js ISR webhook. Optional.</p>
        <p v-if="fieldErrors.revalidation_url" class="mt-1 text-xs text-red-600">
          {{ fieldErrors.revalidation_url }}
        </p>
      </div>
    </form>

    <template #footer>
      <Button label="Cancel" text @click="emit('update:visible', false)" />
      <Button label="Register Domain" :loading="loading" @click="submit" />
    </template>
  </Dialog>
</template>
