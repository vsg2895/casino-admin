<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import CmsPageFormFields from '@/components/CmsPageFormFields.vue'
import type { CmsPageFormModel } from '@/components/CmsPageFormFields.vue'
import BylineFields from '@/components/BylineFields.vue'
import type { BylineValue } from '@/components/BylineFields.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import * as cmsApi from '@/api/cmsPages'
import { useCmsPagesStore } from '@/stores/cmsPagesStore'
import { useSitesStore } from '@/stores/sitesStore'
import type { ErrorResponse } from '@shared/types/api'
import type { CmsPageAdmin } from '@shared/types/cmsPage'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const store = useCmsPagesStore()
const sitesStore = useSitesStore()

const pageId = Number(route.params.id)
const loaded = ref(false)
const saving = ref(false)
const publishing = ref(false)
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
  noindex: false,
})

const byline = ref<BylineValue>({ author_id: null, reviewed_by_id: null, last_reviewed_at: null })

/**
 * A revision waiting for review. Kept in its own columns so the live page keeps
 * serving while it is worked on; "Publish draft" makes it the live page.
 */
const draft = reactive({ title: '', content: null as string | null, meta_title: '', meta_description: '' })
const draftOpen = ref(false)
const draftSavedAt = ref<string | null>(null)

function fill(data: CmsPageAdmin): void {
  Object.assign(form, {
    site_id: data.site_id,
    slug: data.slug,
    title: data.title,
    content: data.content,
    meta_title: data.meta_title,
    meta_description: data.meta_description,
    status: data.status,
    noindex: data.noindex ?? false,
  })
  byline.value = {
    author_id: data.author_id ?? null,
    reviewed_by_id: data.reviewed_by_id ?? null,
    last_reviewed_at: data.last_reviewed_at ?? null,
  }
  Object.assign(draft, {
    title: data.draft_title ?? '',
    content: data.draft_content,
    meta_title: data.draft_meta_title ?? '',
    meta_description: data.draft_meta_description ?? '',
  })
  draftSavedAt.value = data.draft_updated_at ?? null
  draftOpen.value = draftSavedAt.value !== null
}

onMounted(async () => {
  sitesStore.fetchSites()
  const { data } = await cmsApi.getCmsPage(pageId)
  fill(data)
  loaded.value = true
})

function startDraft(): void {
  Object.assign(draft, { title: form.title, content: form.content, meta_title: form.meta_title ?? '', meta_description: form.meta_description ?? '' })
  draftOpen.value = true
}

function discardDraft(): void {
  Object.assign(draft, { title: '', content: null, meta_title: '', meta_description: '' })
  draftOpen.value = false
}

function draftPayload(): cmsApi.UpdateCmsPagePayload {
  const hasBody = !!draft.content && draft.content.replace(/<[^>]*>/g, '').trim() !== ''
  return {
    draft_title: draft.title.trim() || null,
    draft_content: hasBody ? draft.content : null,
    draft_meta_title: draft.meta_title.trim() || null,
    draft_meta_description: draft.meta_description.trim() || null,
  }
}

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
      noindex: form.noindex,
      status: form.status,
      ...byline.value,
      ...draftPayload(),
    })
    store.upsert(res.data)
    fill(res.data)
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

async function publishDraft(): Promise<void> {
  // Save first, so what is published is what is on screen.
  await save()
  if (formError.value) return
  publishing.value = true
  try {
    const res = await cmsApi.publishCmsPageDraft(pageId)
    store.upsert(res.data)
    fill(res.data)
    toast.add({ severity: 'success', summary: 'Published', detail: 'The draft is now the live page.', life: 4000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not publish the draft.', life: 4000 })
  } finally {
    publishing.value = false
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

    <template v-if="loaded">
      <div class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 class="mb-3 text-sm font-semibold text-gray-800">Live page</h3>
        <CmsPageFormFields :form="form" :errors="errors" :slug-locked="true" :site-locked="true" :sites="sitesStore.sites" />
        <p class="mt-3 text-xs text-gray-400">
          Legal details can be written as tokens filled from the site's settings:
          <code v-pre>{{legal_entity_name}}</code>, <code v-pre>{{registered_address}}</code>,
          <code v-pre>{{company_number}}</code>, <code v-pre>{{governing_law}}</code>,
          <code v-pre>{{contact_email}}</code>, <code v-pre>{{support_email}}</code>,
          <code v-pre>{{privacy_email}}</code>. A sentence whose token is empty is hidden on the site.
        </p>
      </div>

      <div class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 class="mb-3 text-sm font-semibold text-gray-800">Byline</h3>
        <BylineFields v-model="byline" :site-id="form.site_id" />
      </div>

      <div class="rounded-xl border p-6 shadow-sm" :class="draftOpen ? 'border-amber-200 bg-amber-50/40' : 'border-gray-100 bg-white'">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-gray-800">Pending draft</h3>
            <p class="text-xs text-gray-500">
              Not public. The live page above keeps serving until you publish the draft.
              <span v-if="draftSavedAt">Last saved {{ new Date(draftSavedAt).toLocaleString() }}.</span>
            </p>
          </div>
          <div class="flex gap-2">
            <Button v-if="!draftOpen" label="Start a draft" icon="pi pi-file-edit" severity="secondary" @click="startDraft" />
            <template v-else>
              <Button label="Discard draft" icon="pi pi-trash" text severity="danger" @click="discardDraft" />
              <Button label="Publish draft" icon="pi pi-send" severity="warn" :loading="publishing"
                      :disabled="!draftSavedAt && !draftPayload().draft_content" @click="publishDraft" />
            </template>
          </div>
        </div>

        <div v-if="draftOpen" class="mt-4 space-y-4">
          <Message v-if="draft.content?.includes('TODO')" severity="warn" :closable="false" class="text-sm">
            This draft still contains <strong>TODO</strong> notes. Resolve them before publishing.
          </Message>
          <p class="text-xs text-gray-500">Discarding takes effect when you press Update.</p>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Draft title</label>
            <InputText v-model="draft.title" fluid :invalid="!!errors.draft_title" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Draft content</label>
            <RichTextEditor v-model="draft.content" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Draft meta title</label>
              <InputText v-model="draft.meta_title" fluid />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Draft meta description</label>
              <Textarea v-model="draft.meta_description" rows="2" fluid auto-resize />
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
