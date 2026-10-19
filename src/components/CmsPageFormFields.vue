<script setup lang="ts">
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Select from 'primevue/select'
import RichTextEditor from '@/components/RichTextEditor.vue'
import type { CmsPageStatus } from '@shared/types/cmsPage'

export interface CmsPageFormModel {
  site_id: number | null
  slug: string
  title: string
  content: string | null
  meta_title: string | null
  meta_description: string | null
  status: CmsPageStatus
  noindex: boolean
}

defineProps<{
  form: CmsPageFormModel
  errors?: Record<string, string>
  slugLocked?: boolean
  siteLocked?: boolean
  sites?: Array<{ id: number; name: string }>
}>()

const statusOptions: Array<{ label: string; value: CmsPageStatus }> = [
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
]
</script>

<template>
  <div class="space-y-6">
    <div>
      <label class="mb-1 block text-sm font-medium text-gray-700">Site <span class="text-red-500">*</span></label>
      <Select
        v-model="form.site_id"
        :options="sites ?? []"
        option-label="name"
        option-value="id"
        :disabled="siteLocked"
        placeholder="Select a site"
        fluid
      />
      <p class="mt-1 text-xs text-gray-400">
        Each site has its own copy of this page.
        <span v-if="siteLocked"> The site cannot be changed after creation.</span>
      </p>
      <p v-if="errors?.site_id" class="mt-1 text-xs text-red-600">{{ errors.site_id }}</p>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div class="sm:col-span-2">
        <label class="mb-1 block text-sm font-medium text-gray-700">Title <span class="text-red-500">*</span></label>
        <InputText v-model="form.title" fluid />
        <p v-if="errors?.title" class="mt-1 text-xs text-red-600">{{ errors.title }}</p>
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Status</label>
        <Select v-model="form.status" :options="statusOptions" option-label="label" option-value="value" fluid />
      </div>
    </div>

    <div>
      <label class="mb-1 block text-sm font-medium text-gray-700">Slug <span class="text-red-500">*</span></label>
      <InputText v-model="form.slug" fluid class="font-mono" :disabled="slugLocked" placeholder="privacy-policy" />
      <p class="mt-1 text-xs text-gray-400">
        Public URL: <span class="font-mono">/{{ form.slug || 'slug' }}</span>. Lowercase letters, numbers and hyphens only.
        <span v-if="slugLocked"> Changing it would break existing links, so it is locked here.</span>
      </p>
      <p v-if="errors?.slug" class="mt-1 text-xs text-red-600">{{ errors.slug }}</p>
    </div>

    <div>
      <label class="mb-1 block text-sm font-medium text-gray-700">Content</label>
      <RichTextEditor v-model="form.content" />
    </div>

    <fieldset class="space-y-4 border-t border-gray-100 pt-4">
      <legend class="text-xs font-semibold uppercase tracking-wide text-gray-400">SEO</legend>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Meta Title</label>
        <InputText v-model="form.meta_title" fluid />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Meta Description</label>
        <Textarea v-model="form.meta_description" rows="2" fluid auto-resize />
      </div>

      <!-- A toggle rather than a hidden default, because the right answer
           differs per page AND per site: the six templated legal pages stay out
           of the index, while About and the other trust pages belong in it —
           and whether a trust page is READY to be indexed depends on whether
           anyone has rewritten it for this site yet. -->
      <div class="rounded-lg border border-gray-100 bg-gray-50 p-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700">Keep out of Google</label>
            <p class="mt-1 text-xs text-gray-500">
              Sets <span class="font-mono">noindex, follow</span>. The page stays reachable and keeps
              passing link value — it just will not appear in search results.
            </p>
            <p class="mt-1 text-xs text-gray-400">
              ON for the standard legal pages (Privacy Policy, Terms, Cookie Policy, Disclaimer, AML,
              KYC): every site in the network shares one template for them, so indexing them puts
              near-identical copies in competition with each other. Leave it OFF for About, Contact,
              Responsible Gambling, Affiliate Disclosure and Editorial Policy — Google weighs those when
              judging the whole domain. Turn it on if a trust page is still the untouched template here.
            </p>
          </div>
          <ToggleSwitch v-model="form.noindex" />
        </div>
      </div>
    </fieldset>
  </div>
</template>
