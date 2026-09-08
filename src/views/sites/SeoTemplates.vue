<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import * as seoApi from '@/api/seoTemplates'
import * as sitesApi from '@/api/sites'
import type { SeoTemplate, SeoEntity } from '@shared/types/seo'
import type { Site } from '@shared/types/site'

/**
 * Per-site title and description patterns.
 *
 * These are DEFAULTS. A record with its own meta title always wins — the
 * pattern only fills the gap, and a site with no pattern keeps the wording built
 * into its own code. Nothing here can silently overwrite something an editor
 * typed on a record.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()

const siteId = Number(route.params.id)
const site = ref<Site | null>(null)
const templates = ref<SeoTemplate[]>([])
const loading = ref(false)
const saving = ref(false)

const LABELS: Record<SeoEntity, string> = {
  casino: 'Casino review pages',
  special_offer: 'Special offer pages',
  category: 'Category pages',
  page: 'CMS / legal pages',
  listing: 'Listing pages (casinos, offers, categories)',
}

const TOKENS = ['{{name}}', '{{site_name}}', '{{year}}', '{{month}}']

// Held as a constant because a nested {{ … }} literal cannot be written inline
// in a Vue template — the parser closes the mustache at the first }}.
const SITE_NAME_TOKEN = '{{site_name}}'

// Rendered by the server, so what is shown is exactly what a real page emits —
// including a mistyped token, which survives visibly rather than vanishing.
const previews = ref<Record<string, string>>({})

async function reload(): Promise<void> {
  loading.value = true
  try {
    templates.value = await seoApi.getSeoTemplates(siteId)
    await Promise.all(templates.value.map((t) => refreshPreview(t)))
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load the patterns.', life: 4000 })
  } finally {
    loading.value = false
  }
}

async function refreshPreview(t: SeoTemplate): Promise<void> {
  const pattern = (t.title_pattern ?? '').trim()
  if (pattern === '') {
    previews.value[t.entity] = ''
    return
  }
  try {
    previews.value[t.entity] = await seoApi.previewSeoPattern(siteId, pattern)
  } catch {
    previews.value[t.entity] = ''
  }
}

async function save(): Promise<void> {
  saving.value = true
  try {
    templates.value = await seoApi.saveSeoTemplates(siteId, templates.value)
    await Promise.all(templates.value.map((t) => refreshPreview(t)))
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Patterns saved. Pages rebuild shortly.', life: 3000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save the patterns.', life: 4000 })
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    reload(),
    sitesApi.getSite(siteId).then((r) => (site.value = r.data)).catch(() => (site.value = null)),
  ])
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <Button label="Back to sites" icon="pi pi-arrow-left" text severity="secondary" @click="router.push({ name: 'sites' })" />
      <h2 class="text-lg font-semibold text-gray-900">
        SEO patterns<span v-if="site" class="text-gray-400"> — {{ site.name }}</span>
      </h2>
      <Button label="Save patterns" icon="pi pi-check" :loading="saving" @click="save" />
    </div>

    <div class="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
      <p>
        These are <strong>defaults</strong>. A record with its own meta title or description always
        wins; the pattern only fills the gap. Leave a pattern empty and this site keeps the wording
        built into its code.
      </p>
      <p class="mt-1">
        Tokens:
        <code v-for="t in TOKENS" :key="t" class="mr-1 rounded bg-white/70 px-1">{{ t }}</code>
      </p>
      <p class="mt-1 text-amber-800">
        <strong>Do not put <code>{{ SITE_NAME_TOKEN }}</code> in a title pattern.</strong>
        The site already appends its own name to every page title, so including it here prints it
        twice. It is fine in a description pattern, which has no such suffix.
      </p>
    </div>

    <div v-if="loading" class="py-8 text-center text-sm text-gray-400">Loading…</div>

    <div v-else class="space-y-3">
      <div
        v-for="t in templates"
        :key="t.entity"
        class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <h3 class="text-sm font-semibold text-gray-800">{{ LABELS[t.entity] }}</h3>

        <div class="mt-3 space-y-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Title pattern</label>
            <InputText
              v-model="t.title_pattern"
              fluid
              placeholder="{{name}} Review {{year}} | {{site_name}}"
              @blur="refreshPreview(t)"
            />
            <p v-if="previews[t.entity]" class="mt-1 text-xs text-gray-500">
              Preview: <span class="font-medium text-gray-700">{{ previews[t.entity] }}</span>
            </p>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Description pattern</label>
            <Textarea v-model="t.description_pattern" rows="2" fluid placeholder="Leave empty to keep the site's own wording." />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
