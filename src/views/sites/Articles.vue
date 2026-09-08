<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import RichTextEditor from '@/components/RichTextEditor.vue'
import ImageDropzone from '@/components/ImageDropzone.vue'
import * as articlesApi from '@/api/articles'
import * as sitesApi from '@/api/sites'
import type { Article, UpsertArticlePayload } from '@shared/types/article'
import type { Site } from '@shared/types/site'
import type { ErrorResponse } from '@shared/types/api'

/**
 * Editorial guides for one site.
 *
 * Publication is a DATE, not a switch: empty is a draft, a past date is live, a
 * future date is scheduled. One field, three states, no way for them to
 * contradict each other.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()

const siteId = Number(route.params.id)
const site = ref<Site | null>(null)
const items = ref<Article[]>([])
const loading = ref(false)

const publishedCount = computed(
  () => items.value.filter((a) => a.published_at && new Date(a.published_at) <= new Date()).length,
)

function status(a: Article): { label: string; severity: string } {
  if (!a.published_at) return { label: 'Draft', severity: 'secondary' }
  return new Date(a.published_at) > new Date()
    ? { label: 'Scheduled', severity: 'warn' }
    : { label: 'Published', severity: 'success' }
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '—'
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    items.value = await articlesApi.listArticles(siteId)
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load guides.', life: 4000 })
  } finally {
    loading.value = false
  }
}

// ── Create / edit ───────────────────────────────────────────────────────────
const showDialog = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const fieldErrors = ref<Record<string, string>>({})
const editingPublished = ref(false)

const blank = (): ArticleForm => ({
  title: '',
  slug: null,
  excerpt: null,
  body: null,
  hero_image_path: null,
  published_at: null,
  meta_title: null,
  meta_description: null,
  noindex: false,
})

/**
 * The form model uses `string | null` where the payload allows `undefined` too.
 * ImageDropzone and RichTextEditor bind to `string | null`, and letting
 * `undefined` reach them means "prop absent" rather than "no value" — a
 * distinction that shows up as an uncontrolled input.
 */
type ArticleForm = UpsertArticlePayload & {
  slug: string | null
  excerpt: string | null
  body: string | null
  hero_image_path: string | null
  published_at: string | null
  meta_title: string | null
  meta_description: string | null
}

const form = ref<ArticleForm>(blank() as ArticleForm)

function openCreate(): void {
  editingId.value = null
  editingPublished.value = false
  form.value = blank()
  fieldErrors.value = {}
  showDialog.value = true
}

async function openEdit(a: Article): Promise<void> {
  editingId.value = a.id
  editingPublished.value = a.published_at !== null
  fieldErrors.value = {}
  try {
    const full = await articlesApi.getArticle(siteId, a.id)
    form.value = {
      title: full.title,
      slug: full.slug,
      excerpt: full.excerpt,
      body: full.body ?? null,
      hero_image_path: full.hero_image_path,
      // <input type="date"> wants YYYY-MM-DD; the API stores a full timestamp.
      published_at: full.published_at ? full.published_at.slice(0, 10) : null,
      meta_title: full.meta_title,
      meta_description: full.meta_description,
      noindex: full.noindex,
    }
    showDialog.value = true
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not open that guide.', life: 4000 })
  }
}

async function save(): Promise<void> {
  saving.value = true
  fieldErrors.value = {}
  try {
    if (editingId.value === null) {
      await articlesApi.createArticle(siteId, form.value)
    } else {
      await articlesApi.updateArticle(siteId, editingId.value, form.value)
    }
    showDialog.value = false
    await reload()
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Guide saved.', life: 2500 })
  } catch (e: unknown) {
    const data = axios.isAxiosError(e) ? (e.response?.data as ErrorResponse | undefined) : undefined
    if (data?.errors) {
      fieldErrors.value = Object.fromEntries(
        Object.entries(data.errors).map(([k, v]) => [k, v[0] ?? '']),
      )
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save.', life: 4000 })
    }
  } finally {
    saving.value = false
  }
}

const deleting = ref<Article | null>(null)

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  try {
    await articlesApi.deleteArticle(siteId, deleting.value.id)
    deleting.value = null
    await reload()
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Guide removed.', life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not delete.', life: 4000 })
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
        Guides<span v-if="site" class="text-gray-400"> — {{ site.name }}</span>
      </h2>
      <Button label="New guide" icon="pi pi-plus" @click="openCreate" />
    </div>

    <!-- The threshold is stated here rather than left as a surprise: an editor
         who publishes one guide and cannot find it on the site deserves to know
         why before they go looking. -->
    <div
      class="rounded-lg px-3 py-2 text-xs"
      :class="publishedCount >= 3 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'"
    >
      <strong>{{ publishedCount }}</strong> published.
      <template v-if="publishedCount < 3">
        The guides section stays hidden on the site until there are <strong>3</strong> — a section
        with one post reads as abandoned, which costs more trust than having none. It is not linked
        in the menu or the sitemap until then.
      </template>
      <template v-else>
        The guides section is live: linked in the menu and included in the sitemap.
      </template>
      <span v-if="!site?.guides_enabled" class="ml-1 font-semibold">
        Guides are also switched OFF for this site — turn them on in the site settings.
      </span>
    </div>

    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable :value="items" :loading="loading" striped-rows data-key="id" :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No guides yet.</div>
        </template>

        <Column header="Title">
          <template #body="{ data }">
            <span class="font-medium text-gray-900">{{ data.title }}</span>
            <p class="font-mono text-xs text-gray-400">/guides/{{ data.slug }}</p>
          </template>
        </Column>

        <Column header="Status" :style="{ width: '120px' }">
          <template #body="{ data }">
            <Tag :value="status(data).label" :severity="status(data).severity" />
          </template>
        </Column>

        <Column header="Date" :style="{ width: '140px' }">
          <template #body="{ data }">
            <span class="text-gray-600">{{ formatDate(data.published_at) }}</span>
          </template>
        </Column>

        <Column header="Actions" :style="{ width: '110px' }">
          <template #body="{ data }">
            <Button icon="pi pi-pencil" text severity="secondary" size="small" @click="openEdit(data)" />
            <Button icon="pi pi-trash" text severity="danger" size="small" @click="deleting = data" />
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog v-model:visible="showDialog" modal :header="editingId ? 'Edit guide' : 'New guide'" :style="{ width: '780px' }">
      <div class="space-y-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Title</label>
          <InputText v-model="form.title" fluid />
          <p v-if="fieldErrors['title']" class="mt-1 text-xs text-red-600">{{ fieldErrors['title'] }}</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Slug</label>
          <InputText v-model="form.slug" fluid :disabled="editingPublished" placeholder="Generated from the title" />
          <p class="mt-1 text-xs" :class="editingPublished ? 'text-amber-700' : 'text-gray-400'">
            <template v-if="editingPublished">
              Locked — this guide is published and its URL may already be linked or ranking. To
              change it, create a new guide and add a redirect from the old path.
            </template>
            <template v-else>Lowercase words separated by hyphens.</template>
          </p>
          <p v-if="fieldErrors['slug']" class="mt-1 text-xs text-red-600">{{ fieldErrors['slug'] }}</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Excerpt</label>
          <Textarea v-model="form.excerpt" rows="2" fluid />
          <p class="mt-1 text-xs text-gray-400">Shown on the guides index and used as the meta description fallback.</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Hero image</label>
          <ImageDropzone v-model="form.hero_image_path" />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Body</label>
          <RichTextEditor v-model="form.body" />
        </div>

        <div class="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Publish date</label>
            <InputText v-model="form.published_at" type="date" fluid />
            <p class="mt-1 text-xs text-gray-400">
              Empty = draft. A future date schedules it — the site will not show it until then.
            </p>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Meta title</label>
            <InputText v-model="form.meta_title" fluid placeholder="Defaults to the title" />
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Meta description</label>
          <Textarea v-model="form.meta_description" rows="2" fluid placeholder="Defaults to the excerpt" />
        </div>

        <div class="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div>
            <label class="text-sm text-gray-700">Keep out of search results</label>
            <p class="text-xs text-gray-400">Sets noindex. The page stays reachable by direct link.</p>
          </div>
          <ToggleSwitch v-model="form.noindex" />
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="showDialog = false" />
        <Button :label="editingId ? 'Save' : 'Create guide'" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <Dialog :visible="deleting !== null" modal header="Delete guide" :style="{ width: '420px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">
        Delete <strong>{{ deleting?.title }}</strong>?
      </p>
      <p v-if="deleting?.published_at" class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        This guide is published. Its URL will start returning 404 — add a redirect first if anything
        links to it.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" severity="danger" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
