<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import axios from 'axios'
import * as sitesApi from '@/api/sites'
import type { Site } from '@shared/types/site'
import type { ErrorResponse } from '@shared/types/api'

interface SiteEditForm {
  name: string
  domain: string
  positioning: string
  revalidation_url: string
  newsletter_emails_enabled: boolean
  countries_enabled: boolean
  reviews_enabled: boolean
  operator_profile_enabled: boolean
  byline_enabled: boolean
  guides_enabled: boolean
  author_name: string | null
  author_role: string | null
  author_bio: string | null
  methodology_page_slug: string | null
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
  positioning: '',
  revalidation_url: '',
  newsletter_emails_enabled: true,
  countries_enabled: false,
  reviews_enabled: false,
  operator_profile_enabled: false,
  byline_enabled: false,
  guides_enabled: false,
  author_name: null,
  author_role: null,
  author_bio: null,
  methodology_page_slug: null,
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
      form.positioning = props.site.positioning ?? ''
      form.revalidation_url = props.site.revalidation_url ?? ''
      form.newsletter_emails_enabled = props.site.newsletter_emails_enabled
      form.countries_enabled = props.site.countries_enabled
      form.reviews_enabled = props.site.reviews_enabled
      form.operator_profile_enabled = props.site.operator_profile_enabled
      form.byline_enabled = props.site.byline_enabled
      form.guides_enabled = props.site.guides_enabled
      form.author_name = props.site.author_name
      form.author_role = props.site.author_role
      form.author_bio = props.site.author_bio
      form.methodology_page_slug = props.site.methodology_page_slug
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
      positioning: form.positioning.trim() || null,
      revalidation_url: form.revalidation_url.trim() || null,
      newsletter_emails_enabled: form.newsletter_emails_enabled,
      countries_enabled: form.countries_enabled,
      reviews_enabled: form.reviews_enabled,
      operator_profile_enabled: form.operator_profile_enabled,
      byline_enabled: form.byline_enabled,
      guides_enabled: form.guides_enabled,
      author_name: form.author_name,
      author_role: form.author_role,
      author_bio: form.author_bio,
      methodology_page_slug: form.methodology_page_slug,
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

      <label class="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-3">
        <span>
          <span class="block text-sm font-medium text-gray-900">Send newsletter emails</span>
          <span class="block text-xs text-gray-500">
            Off, the signup form still works and subscribers are still recorded — only the
            outbound email stops. Those subscribers stay unverified, because they never get
            a link to click.
          </span>
        </span>
        <ToggleSwitch v-model="form.newsletter_emails_enabled" />
      </label>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Positioning</label>
        <InputText
          v-model="form.positioning"
          fluid
          maxlength="200"
          placeholder="Roulette and live table games, reviewed by players"
        />
        <p v-if="fieldErrors.positioning" class="mt-1 text-xs text-red-600">{{ fieldErrors.positioning }}</p>
        <p v-else class="mt-1 text-xs text-gray-500">
          One short sentence saying what makes this brand different. It is appended to the meta
          description of the eleven standard legal pages, which are otherwise generated from the
          same template on every domain and read as duplicate content. Keep it under ~60
          characters so it survives search-result truncation. Changing it here does not rewrite
          existing pages — run <code class="font-mono">php artisan cms:refresh-page-meta</code>.
        </p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Revalidation URL</label>
        <InputText v-model="form.revalidation_url" fluid placeholder="https://…/api/revalidate" />
        <p v-if="fieldErrors.revalidation_url" class="mt-1 text-xs text-red-600">
          {{ fieldErrors.revalidation_url }}
        </p>
      </div>

      <!-- Per-site feature switch. Off by default, and enforced server-side:
           the public /countries endpoints 404 while it is off. -->
      <div class="rounded-lg border border-gray-200 p-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700">Countries filter</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Publish the "browse casinos by country" pages on this site.
            </p>
          </div>
          <ToggleSwitch v-model="form.countries_enabled" />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div>
            <label class="block text-sm font-medium text-gray-700">Visitor reviews</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Show reviews on this site and accept new ones. Submissions are held for moderation.
            </p>
          </div>
          <ToggleSwitch v-model="form.reviews_enabled" />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div>
            <label class="block text-sm font-medium text-gray-700">Operator profile</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Show each casino's licence, payment, support and safer-play facts on its review
              page. Only the groups that have values are rendered.
            </p>
          </div>
          <ToggleSwitch v-model="form.operator_profile_enabled" />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div>
            <label class="block text-sm font-medium text-gray-700">Reviewer byline</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Name the person who checks the casinos. Only appears on a casino that also has a
              review date set — a byline without one would claim more than the record supports.
            </p>
          </div>
          <ToggleSwitch v-model="form.byline_enabled" />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div>
            <label class="block text-sm font-medium text-gray-700">Editorial guides</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Publish a /guides section. It stays hidden until three guides are published, and
              needs 1–2 new ones a week to stay credible.
            </p>
          </div>
          <ToggleSwitch v-model="form.guides_enabled" />
        </div>

        <div class="mt-3 space-y-3 border-t border-gray-100 pt-3">
          <p class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Only fill this in for a real person who genuinely does the checking, and only link a
            methodology page that describes what actually happens. A published process nobody
            follows is the same failure as a self-issued trust badge.
          </p>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Reviewer name</label>
              <InputText v-model="form.author_name" fluid placeholder="Required for the byline" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Role</label>
              <InputText v-model="form.author_role" fluid placeholder="e.g. Editor" />
            </div>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Short bio</label>
            <Textarea v-model="form.author_bio" rows="2" fluid />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Methodology page slug</label>
            <InputText v-model="form.methodology_page_slug" fluid placeholder="e.g. how-we-review" />
            <p class="mt-1 text-xs text-gray-400">
              One of this site's CMS pages. Leave empty and the byline links to nothing.
            </p>
          </div>
        </div>
      </div>
    </form>

    <template #footer>
      <Button label="Cancel" text @click="emit('update:visible', false)" />
      <Button label="Save Changes" :loading="loading" @click="submit" />
    </template>
  </Dialog>
</template>
