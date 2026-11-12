<script setup lang="ts">
/**
 * Per-site content for one casino or special offer.
 *
 * The record's own fields are the DEFAULT content — the default site's text,
 * and every other site's fallback. Picking "Default" leaves the parent's
 * normal form in charge (v-model:site = null). Picking a site shows ONLY that
 * site's override fields here; the parent hides its shared fields.
 *
 * Saving writes that one site's row and nothing else. An all-empty, Inherit
 * save removes the row (the server decides, see SiteContentEditor), so a site
 * is either "Custom" or "Uses default" — never an empty override.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import SelectButton from 'primevue/selectbutton'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import RichTextEditor from '@/components/RichTextEditor.vue'
import * as siteContentsApi from '@/api/siteContents'
import type { SiteContentEntity } from '@/api/siteContents'
import { similarTo, normaliseWords } from '@/utils/similarity'
import type { SiteContentFields, SiteContentOverview, SiteContentSite } from '@shared/types/siteContent'
import type { ErrorResponse } from '@shared/types/api'

const props = defineProps<{
  entity: SiteContentEntity
  entityId: number
  /** Selected site slug; null = Default. */
  site: string | null
}>()

const emit = defineEmits<{ 'update:site': [slug: string | null] }>()

const TITLE_LIMIT = 60
const DESCRIPTION_LIMIT = 160

const toast = useToast()
const overview = ref<SiteContentOverview | null>(null)
const saving = ref(false)
const clearing = ref(false)
const error = ref<string | null>(null)

const fields = reactive<SiteContentFields>({ description: null, meta_title: null, meta_description: null, noindex: null })
const snapshot = ref('')

const current = computed<SiteContentSite | null>(() => overview.value?.sites.find((s) => s.slug === props.site) ?? null)

interface SiteOption { label: string; value: string | null; badge: string | null; attached: boolean }

const options = computed<SiteOption[]>(() => {
  const o = overview.value
  if (!o) return []
  const domain = o.default_site?.domain ?? 'the default site'
  return [
    { label: `Default — ${domain} (used as fallback for all sites)`, value: null, badge: null, attached: true },
    ...o.sites.map((s) => ({ label: s.name, value: s.slug, badge: s.content ? 'Custom' : 'Uses default', attached: s.attached })),
  ]
})

// String keys for the control: SelectButton treats a `null` value as "nothing
// selected", so Inherit could never show as chosen.
type IndexChoice = 'inherit' | 'index' | 'noindex'
const noindexOptions: { label: string; value: IndexChoice }[] = [
  { label: 'Inherit', value: 'inherit' },
  { label: 'Index', value: 'index' },
  { label: 'Noindex', value: 'noindex' },
]
const indexChoice = computed<IndexChoice>({
  get: () => (fields.noindex === null ? 'inherit' : fields.noindex ? 'noindex' : 'index'),
  set: (choice) => {
    fields.noindex = choice === 'inherit' ? null : choice === 'noindex'
  },
})

function load(site: SiteContentSite | null): void {
  fields.description = site?.content?.description ?? null
  fields.meta_title = site?.content?.meta_title ?? null
  fields.meta_description = site?.content?.meta_description ?? null
  fields.noindex = site?.content?.noindex ?? null
  snapshot.value = JSON.stringify(normalised())
  error.value = null
}

/** Field values as the server would store them, for the dirty check. */
function normalised(): SiteContentFields {
  const words = normaliseWords(fields.description).length
  return {
    description: words === 0 ? null : fields.description,
    meta_title: fields.meta_title?.trim() || null,
    meta_description: fields.meta_description?.trim() || null,
    noindex: fields.noindex,
  }
}

// Only once a site's values are loaded; before that there is nothing to lose.
const dirty = computed(() => current.value !== null && JSON.stringify(normalised()) !== snapshot.value)

async function fetchOverview(): Promise<void> {
  overview.value = (await siteContentsApi.getSiteContents(props.entity, props.entityId)).data
  // A ?site= slug that is not an editable site falls back to Default.
  if (props.site !== null && !current.value) emit('update:site', null)
  load(current.value)
}

onMounted(fetchOverview)
watch(() => props.site, () => load(current.value))

// ── Switching with unsaved changes ─────────────────────────────────────────
const pendingSite = ref<string | null | undefined>(undefined)

function choose(slug: string | null): void {
  if (slug === props.site) return
  if (dirty.value) {
    pendingSite.value = slug
    return
  }
  emit('update:site', slug)
}

async function resolvePending(action: 'save' | 'discard' | 'cancel'): Promise<void> {
  const target = pendingSite.value
  if (action === 'cancel' || target === undefined) {
    pendingSite.value = undefined
    return
  }
  if (action === 'save' && !(await save())) return
  pendingSite.value = undefined
  emit('update:site', target)
}

// ── Save / clear ───────────────────────────────────────────────────────────
async function save(): Promise<boolean> {
  const site = current.value
  if (!site) return false
  saving.value = true
  error.value = null
  try {
    const { data } = await siteContentsApi.saveSiteContent(props.entity, props.entityId, site.site_id, normalised())
    site.content = data.content
    load(site)
    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: data.content === null ? `${site.name} uses the default content.` : `Saved for ${site.name}.`,
      life: 3000,
    })
    return true
  } catch (e: unknown) {
    const body = axios.isAxiosError(e) ? (e.response?.data as ErrorResponse | undefined) : undefined
    error.value = body?.message ?? 'Failed to save.'
    return false
  } finally {
    saving.value = false
  }
}

async function clear(): Promise<void> {
  const site = current.value
  if (!site) return
  clearing.value = true
  try {
    await siteContentsApi.clearSiteContent(props.entity, props.entityId, site.site_id)
    site.content = null
    load(site)
    toast.add({ severity: 'success', summary: 'Cleared', detail: `${site.name} uses the default content.`, life: 3000 })
  } catch {
    error.value = 'Failed to clear the override.'
  } finally {
    clearing.value = false
  }
}

// ── Hints ──────────────────────────────────────────────────────────────────
const defaults = computed(() => overview.value?.default ?? { description: null, meta_title: null, meta_description: null, noindex: false })
const descriptionEmpty = computed(() => normaliseWords(fields.description).length === 0)
const inheritLabel = computed(() => (defaults.value.noindex ? 'Noindex — set on the default content' : 'Index'))

/** Other sites' saved overrides, for the near-duplicate warnings. */
function others(field: 'description' | 'meta_title' | 'meta_description'): { name: string; text: string | null }[] {
  const defaultName = overview.value?.default_site?.name ?? 'Default'
  return [
    { name: `${defaultName} (default)`, text: defaults.value[field] },
    ...(overview.value?.sites ?? [])
      .filter((s) => s.slug !== props.site && s.content?.[field])
      .map((s) => ({ name: s.name, text: s.content?.[field] ?? null })),
  ]
}

const warnings = computed(() => ({
  description: similarTo(fields.description, others('description')),
  meta_title: similarTo(fields.meta_title, others('meta_title'), true),
  meta_description: similarTo(fields.meta_description, others('meta_description'), true),
}))
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <label class="text-sm font-medium text-gray-700">Site</label>
      <Select
        :model-value="site"
        :options="options"
        option-label="label"
        option-value="value"
        filter
        filter-placeholder="Find a site"
        class="w-full sm:w-[28rem]"
        :loading="overview === null"
        aria-label="Site whose content you are editing"
        @update:model-value="choose"
      >
        <template #option="{ option }">
          <span class="flex w-full items-center justify-between gap-3">
            <span class="truncate">{{ option.label }}</span>
            <span class="flex shrink-0 items-center gap-1.5">
              <span v-if="!option.attached" class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">Not attached</span>
              <span
                v-if="option.badge"
                class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                :class="option.badge === 'Custom' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'"
              >{{ option.badge }}</span>
            </span>
          </span>
        </template>
      </Select>
      <span v-if="dirty" class="text-xs font-medium text-amber-600">Unsaved changes</span>
    </div>

    <div v-if="current" class="space-y-5 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <p>
          Only <strong>{{ current.name }}</strong>'s own text is edited here. Name, slug, bonuses, terms,
          links and everything else are shared and edited in Default.
          <template v-if="!current.attached"> This site does not publish this item yet; the text applies once it does.</template>
        </p>
        <Button label="Edit in Default" size="small" text @click="choose(null)" />
      </div>

      <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{{ error }}</div>

      <!-- Description -->
      <div>
        <div class="mb-1 flex items-baseline justify-between gap-3">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <span class="text-xs text-gray-400">Empty = uses default</span>
        </div>
        <RichTextEditor v-model="fields.description" />
        <details v-if="descriptionEmpty && defaults.description" class="mt-2 rounded-lg border border-dashed border-gray-200 p-3">
          <summary class="cursor-pointer text-xs text-gray-400">Default text this site shows now</summary>
          <!-- Admin-authored HTML, shown read-only. -->
          <div class="prose prose-sm mt-2 max-h-64 max-w-none overflow-auto text-gray-400" v-html="defaults.description" />
        </details>
        <p v-if="warnings.description.length" class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Very similar to: {{ warnings.description.join(', ') }}. Search engines treat near-copies as duplicates — write this site's own text.
        </p>
      </div>

      <!-- Meta -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div class="mb-1 flex items-baseline justify-between gap-3">
            <label class="text-sm font-medium text-gray-700">Meta Title</label>
            <span class="text-xs" :class="(fields.meta_title?.length ?? 0) > TITLE_LIMIT ? 'font-medium text-amber-600' : 'text-gray-400'">
              {{ fields.meta_title?.length ?? 0 }}/{{ TITLE_LIMIT }}
            </span>
          </div>
          <InputText v-model="fields.meta_title" :placeholder="defaults.meta_title ?? ''" maxlength="255" class="placeholder:!text-gray-300" fluid />
          <p class="mt-1 text-xs text-gray-400">Empty = uses default</p>
          <p v-if="warnings.meta_title.length" class="mt-1 text-xs text-amber-700">Close to: {{ warnings.meta_title.join(', ') }}</p>
        </div>
        <div>
          <div class="mb-1 flex items-baseline justify-between gap-3">
            <label class="text-sm font-medium text-gray-700">Meta Description</label>
            <span class="text-xs" :class="(fields.meta_description?.length ?? 0) > DESCRIPTION_LIMIT ? 'font-medium text-amber-600' : 'text-gray-400'">
              {{ fields.meta_description?.length ?? 0 }}/{{ DESCRIPTION_LIMIT }}
            </span>
          </div>
          <Textarea v-model="fields.meta_description" :placeholder="defaults.meta_description ?? ''" maxlength="500" rows="2" auto-resize class="placeholder:!text-gray-300" fluid />
          <p class="mt-1 text-xs text-gray-400">Empty = uses default</p>
          <p v-if="warnings.meta_description.length" class="mt-1 text-xs text-amber-700">Close to: {{ warnings.meta_description.join(', ') }}</p>
        </div>
      </div>

      <!-- Indexing -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <label class="text-sm text-gray-700">Keep out of search results on this site</label>
          <p class="text-xs text-gray-400">Inherit = {{ inheritLabel }}. A noindex set on the default content always wins.</p>
        </div>
        <SelectButton v-model="indexChoice" :options="noindexOptions" option-label="label" option-value="value" :allow-empty="false" />
      </div>

      <div class="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
        <Button
          label="Clear override (use default)"
          severity="secondary"
          text
          :disabled="current.content === null"
          :loading="clearing"
          @click="clear"
        />
        <Button :label="`Save for ${current.name}`" icon="pi pi-check" :loading="saving" @click="save" />
      </div>
    </div>

    <Dialog :visible="pendingSite !== undefined" modal header="Unsaved changes" :style="{ width: '420px' }" @update:visible="resolvePending('cancel')">
      <p class="text-sm text-gray-700">{{ current?.name }} has unsaved changes.</p>
      <template #footer>
        <Button label="Cancel" text @click="resolvePending('cancel')" />
        <Button label="Discard" severity="secondary" @click="resolvePending('discard')" />
        <Button label="Save" icon="pi pi-check" :loading="saving" @click="resolvePending('save')" />
      </template>
    </Dialog>
  </div>
</template>
