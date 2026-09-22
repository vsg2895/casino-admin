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
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import RichTextEditor from '@/components/RichTextEditor.vue'
import ImageDropzone from '@/components/ImageDropzone.vue'
import * as articlesApi from '@/api/articles'
import * as newsCategoriesApi from '@/api/newsCategories'
import type { NewsCategory } from '@shared/types/newsCategory'
import type { ArticleType } from '@/api/articles'
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

/**
 * Which section this screen is editing.
 *
 * Guides and News are the same rows in the same table, told apart by `type`, and
 * they differ only in wording, which feature flag gates them, and whether the
 * three-post minimum applies. One component with a config beats two components
 * that start identical and drift.
 */
const articleType = (route.meta['articleType'] as ArticleType) ?? 'guide'

const SECTIONS = {
  guide: {
    plural: 'Guides',
    one: 'guide',
    newLabel: 'New guide',
    urlPrefix: '/guides/',
    flag: 'guides_enabled' as const,
    // A guides section with one evergreen post reads as abandoned.
    minToPublish: 3,
  },
  news: {
    plural: 'News',
    one: 'post',
    newLabel: 'New post',
    urlPrefix: '/news/',
    flag: 'news_enabled' as const,
    // No minimum: a news feed with one post reads as new, which is true.
    minToPublish: 0,
  },
} as const

const section = computed(() => SECTIONS[articleType])
const sectionEnabled = computed(() => Boolean(site.value?.[section.value.flag]))
const site = ref<Site | null>(null)
const items = ref<Article[]>([])
const loading = ref(false)

/**
 * How many entries are actually ON the site.
 *
 * Both conditions, matching Article::scopeVisible() on the server. Counting the
 * publish date alone made the banner claim "6 published" while one of them was
 * switched off — a number an editor would reasonably check against the live
 * section and find wrong.
 */
const publishedCount = computed(
  () => items.value.filter(
    (a) => a.active !== false && a.published_at && new Date(a.published_at) <= new Date(),
  ).length,
)

function status(a: Article): { label: string; severity: string } {
  // Checked first: a hidden post is hidden whatever its date says, and showing
  // "Published" beside an off switch is the contradiction an editor has to
  // resolve in their head every time they scan the list.
  if (a.active === false) return { label: 'Hidden', severity: 'warn' }
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
    items.value = await articlesApi.listArticles(siteId, articleType)
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load this section.', life: 4000 })
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
  position: 0,
  active: true,
  featured: false,
  news_category_id: null as number | null,
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
  position: number
  active: boolean
  featured: boolean
  news_category_id: number | null
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
    const full = await articlesApi.getArticle(siteId, a.id, articleType)
    form.value = {
      title: full.title,
      slug: full.slug,
      excerpt: full.excerpt,
      body: full.body ?? null,
      hero_image_path: full.hero_image_path,
      // <input type="date"> wants YYYY-MM-DD; the API stores a full timestamp.
      published_at: full.published_at ? full.published_at.slice(0, 10) : null,
      position: full.position ?? 0,
      active: full.active ?? true,
      featured: full.featured ?? false,
      news_category_id: full.news_category_id ?? null,
      meta_title: full.meta_title,
      meta_description: full.meta_description,
      noindex: full.noindex,
    }
    showDialog.value = true
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not open that entry.', life: 4000 })
  }
}

/**
 * Inline edits from the list.
 *
 * Both send a FULL update, because the endpoint is a PUT — a partial body would
 * blank every field it omitted. The row is patched locally on success rather
 * than refetching the list: a reload would reorder the table under the cursor
 * the instant a position changes, which is exactly when the editor is still
 * looking at it.
 */
const busyId = ref<number | null>(null)

/** Sections for the pickers. News only; guides have none. */
const categories = ref<NewsCategory[]>([])

async function patchRow(row: Article, changes: Partial<Article>): Promise<void> {
  busyId.value = row.id
  try {
    const full = await articlesApi.getArticle(siteId, row.id, articleType)

    await articlesApi.updateArticle(
      siteId,
      row.id,
      {
        title: full.title,
        slug: full.slug,
        excerpt: full.excerpt,
        body: full.body,
        hero_image_path: full.hero_image_path,
        published_at: full.published_at,
        position: full.position ?? 0,
        active: full.active ?? true,
        featured: full.featured ?? false,
        news_category_id: full.news_category_id ?? null,
        meta_title: full.meta_title,
        meta_description: full.meta_description,
        canonical_url: full.canonical_url,
        noindex: full.noindex,
        ...changes,
      },
      articleType,
    )

    Object.assign(row, changes)
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save that change.', life: 4000 })
    // Reload so the control cannot keep showing a value the server rejected.
    await reload()
  } finally {
    busyId.value = null
  }
}

function toggleShown(row: Article, value: boolean): void {
  void patchRow(row, { active: value })
}

function toggleFeatured(row: Article, value: boolean): void {
  void patchRow(row, { featured: value })
}

function savePosition(row: Article, value: number): void {
  if (value === row.position) return
  void patchRow(row, { position: value })
}

async function save(): Promise<void> {
  saving.value = true
  fieldErrors.value = {}
  try {
    if (editingId.value === null) {
      await articlesApi.createArticle(siteId, form.value, articleType)
    } else {
      await articlesApi.updateArticle(siteId, editingId.value, form.value, articleType)
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
    await articlesApi.deleteArticle(siteId, deleting.value.id, articleType)
    deleting.value = null
    await reload()
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Guide removed.', life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not delete.', life: 4000 })
  }
}

onMounted(async () => {
  if (articleType === 'news') {
    categories.value = await newsCategoriesApi.listNewsCategories(siteId).catch(() => [])
  }
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
        {{ section.plural }}<span v-if="site" class="text-gray-400"> — {{ site.name }}</span>
      </h2>
      <div class="flex items-center gap-2">
        <Button v-if="articleType === 'news'" label="Categories" icon="pi pi-tags" outlined severity="secondary"
                @click="router.push({ name: 'site-news-categories', params: { id: siteId } })" />
        <Button :label="section.newLabel" icon="pi pi-plus" @click="openCreate" />
      </div>

    </div>

    <!-- Stated here rather than left as a surprise: an editor who publishes one
         entry and cannot find it on the site deserves to know why before they go
         looking. -->
    <div
      class="rounded-lg px-3 py-2 text-xs"
      :class="publishedCount >= section.minToPublish && sectionEnabled
        ? 'bg-emerald-50 text-emerald-800'
        : 'bg-amber-50 text-amber-800'"
    >
      <strong>{{ publishedCount }}</strong> live on the site.
      <template v-if="section.minToPublish > 0 && publishedCount < section.minToPublish">
        The {{ section.plural.toLowerCase() }} section stays hidden on the site until there are
        <strong>{{ section.minToPublish }}</strong> — a section with one post reads as abandoned,
        which costs more trust than having none. It is not linked in the menu or the sitemap
        until then.
      </template>
      <template v-else-if="sectionEnabled">
        The {{ section.plural.toLowerCase() }} section is live: linked in the menu and included in
        the sitemap.
      </template>
      <span v-if="!sectionEnabled" class="ml-1 font-semibold">
        {{ section.plural }} are switched OFF for this site — turn them on in the site settings.
      </span>
    </div>

    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable :value="items" :loading="loading" striped-rows data-key="id" :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No {{ section.plural.toLowerCase() }} yet.</div>
        </template>

        <Column header="Title">
          <template #body="{ data }">
            <span class="font-medium text-gray-900">{{ data.title }}</span>
            <p class="font-mono text-xs text-gray-400">{{ section.urlPrefix }}{{ data.slug }}</p>
          </template>
        </Column>

        <!-- Shown, and editable right here. Hiding a post is the one action an
             editor needs in a hurry, and making them open a dialog for it is how
             things end up DELETED instead. -->
        <Column header="Shown" :style="{ width: '90px' }">
          <template #body="{ data }">
            <ToggleSwitch
              :model-value="data.active"
              :disabled="busyId === data.id"
              @update:model-value="(v) => toggleShown(data, v)"
            />
          </template>
        </Column>

        <!-- Section. News only: guides have no categories. -->
        <Column v-if="articleType === 'news'" header="Section" :style="{ width: '150px' }">
          <template #body="{ data }">
            <Select
              :model-value="data.news_category_id"
              :options="categories"
              option-label="name"
              option-value="id"
              placeholder="—"
              show-clear
              :disabled="busyId === data.id"
              :pt="{ root: { class: 'w-full text-xs' } }"
              @update:model-value="(v: number | null) => patchRow(data, { news_category_id: v })"
            />
          </template>
        </Column>

        <!-- Most popular. Only news has a home-page strip to be promoted INTO, so
             the column is hidden on the guides screen rather than shown and inert.
             The column is the editor's PICK — the site has no view tracking, so
             "popular" here means chosen, not measured. -->
        <Column v-if="articleType === 'news'" header="Most popular" :style="{ width: '110px' }">
          <template #body="{ data }">
            <ToggleSwitch
              :model-value="data.featured"
              :disabled="busyId === data.id"
              @update:model-value="(v) => toggleFeatured(data, v)"
            />
          </template>
        </Column>

        <Column header="Status" :style="{ width: '120px' }">
          <template #body="{ data }">
            <Tag :value="status(data).label" :severity="status(data).severity" />
          </template>
        </Column>

        <!-- Position drives the public order, so it belongs in the list where that
             order is visible — not buried in an edit dialog. -->
        <Column header="Position" :style="{ width: '120px' }">
          <template #body="{ data }">
            <InputNumber
              :model-value="data.position"
              :min="0"
              :max="9999"
              :allow-empty="false"
              :input-style="{ width: '3.5rem' }"
              :disabled="busyId === data.id"
              @update:model-value="(v) => savePosition(data, v)"
            />
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

    <Dialog v-model:visible="showDialog" modal :header="editingId ? `Edit ${section.one}` : section.newLabel" :style="{ width: '780px' }">
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
              Empty is a draft. A future date schedules it — off the site until then.
            </p>
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

        <div class="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-3">
          <div>
            <label class="text-sm text-gray-700">Shown on the site</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Off hides it immediately and keeps everything else — the publish date is not
              touched, so switching it back on restores the post exactly as it was.
            </p>
          </div>
          <ToggleSwitch v-model="form.active" />
        </div>

        <div v-if="articleType === 'news'">
          <label class="mb-1 block text-xs font-medium text-gray-600">Section</label>
          <Select v-model="form.news_category_id" :options="categories" option-label="name"
                  option-value="id" placeholder="No section" show-clear fluid />
          <p class="mt-1 text-xs text-gray-400">
            Shown as the label on the card and as a topic pill above the feed. Optional —
            a post without one still publishes.
          </p>
        </div>

        <div v-if="articleType === 'news'" class="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-3">
          <div>
            <label class="text-sm text-gray-700">Most popular</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Promotes this post to the Most Popular rail on the news page and the strip on the home page, under Bonus.
              The strip shows at most three — extra picks wait their turn by position.
            </p>
          </div>
          <ToggleSwitch v-model="form.featured" />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Position</label>
          <InputNumber v-model="form.position" :min="0" :max="9999" fluid />
          <p class="mt-1 text-xs text-gray-400">Lower shows first. Equal positions fall back to newest first.</p>
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
        <Button :label="editingId ? 'Save' : section.newLabel" icon="pi pi-check" :loading="saving" @click="save" />
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
