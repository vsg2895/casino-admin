<script setup lang="ts">
import BylineFields from '@/components/BylineFields.vue'
import type { BylineValue } from '@/components/BylineFields.vue'
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import RichTextEditor from '@/components/RichTextEditor.vue'
import ImageDropzone from '@/components/ImageDropzone.vue'
import { STORAGE_BASE_URL } from '@/config/urls'
import * as articlesApi from '@/api/articles'
import { handPageWindow, pagerMeta } from '@/utils/pagination'
import type { ArticleType } from '@/api/articles'
import * as sitesApi from '@/api/sites'
import type { Article, ArticleRewriteFilter, UpsertArticlePayload } from '@shared/types/article'
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
const publishedCount = ref(0)

/**
 * The two curated rails, counted server-side like the one above.
 *
 * Both are VISIBLE-and-flagged rather than merely flagged: a draft with the box
 * ticked is on no rail, and a number that counted it would send an editor
 * looking for a post the site is not showing.
 */
const mostPopularCount = ref(0)
const featuredCount = ref(0)

// ── paging ───────────────────────────────────────────────────────────────────
//
// SERVER-SIDE, because this list grows without anybody editing it: news is
// ingested from feeds on a schedule. One site was already 120 rows / 111 KB in
// a single response, and at the collector's rate that becomes megabytes.
const page = ref(1)
const perPage = ref(15)
const totalRecords = ref(0)
// The section's exact size, from the dedicated COUNT — null if it failed. The
// "All" tile shows this; `totalRecords` only sizes the paginator.
const entryTotal = ref<number | null>(null)
// PrimeVue's paginator works in row offsets, not page numbers.
const first = computed(() => (page.value - 1) * perPage.value)

// ── rewrite filter (news only) ───────────────────────────────────────────────
//
// Scraped posts in one state with `news:rewrite`. Applied server-side to the
// rows AND to the count that sizes the paginator; the stat tiles above the
// table stay over the whole section.
const rewriteFilter = ref<ArticleRewriteFilter | null>(null)

const REWRITE_FILTER_OPTIONS: { label: string; value: ArticleRewriteFilter | null }[] = [
  { label: 'All posts', value: null },
  { label: 'Rewritten', value: 'rewritten' },
  { label: 'Not rewritten', value: 'not_rewritten' },
  { label: 'Not rewritten — never tried', value: 'not_attempted' },
  { label: 'Not rewritten — tried, failed', value: 'attempt_failed' },
]

async function onRewriteFilter(value: ArticleRewriteFilter | null): Promise<void> {
  rewriteFilter.value = value
  page.value = 1
  await reload()
}

/**
 * The line under a news post's title: whether news:rewrite wrote it, and — when
 * it did not — whether it ever tried, and why the last try produced no copy.
 * Null for posts written here, which were never anything to rewrite.
 */
function rewriteInfo(a: Article): { tag: string; severity: string; detail: string; error: string | null } | null {
  const r = a.rewrite
  if (!r || r.state === 'written_here') return null

  const when = r.last_attempt_at ? formatDateTime(r.last_attempt_at) : null
  const tries = `${r.attempts} ${r.attempts === 1 ? 'attempt' : 'attempts'}`

  if (r.state === 'rewritten') {
    // A later `news:rewrite --all` that did not take keeps the earlier copy;
    // say so rather than hide it.
    const lastFailed = r.last_result === 'rejected' || r.last_result === 'failed'
    return {
      tag: 'Rewritten',
      severity: 'success',
      detail: lastFailed
        ? `Rewritten earlier · last re-write ${r.last_result}${when ? ` ${when}` : ''}`
        : `Rewritten${when ? ` ${when}` : ''}`,
      error: lastFailed ? r.last_error : null,
    }
  }

  if (r.state === 'not_attempted') {
    return {
      tag: 'Not rewritten',
      severity: 'danger',
      detail: 'Not tried yet — waiting for the next news:rewrite run',
      error: null,
    }
  }

  return {
    tag: 'Not rewritten',
    severity: 'danger',
    detail: `Tried, ${r.last_result ?? 'failed'} · ${tries}${when ? ` · last ${when}` : ''}`,
    error: r.last_error,
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

async function onPage(event: { page: number; rows: number }): Promise<void> {
  page.value = event.page + 1
  perPage.value = event.rows
  await reload()
}

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

/** The rewrite filter applies to News only; Guides never send it. */
function filterForRequest(): ArticleRewriteFilter | null {
  return articleType === 'news' ? rewriteFilter.value : null
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    // The listing carries no total (simple-paginated); the dedicated COUNT,
    // requested beside it, sizes the paginator. Never fatal.
    const [res, count] = await Promise.all([
      articlesApi.listArticles(siteId, articleType, page.value, perPage.value, filterForRequest()),
      articlesApi.countArticles(siteId, articleType, filterForRequest()).catch(() => null),
    ])
    const pager = pagerMeta(handPageWindow(res), count)
    items.value = res.data
    entryTotal.value = count
    totalRecords.value = pager.total
    perPage.value = res.meta.per_page
    // Counted server-side over the whole section, not over the page in hand.
    publishedCount.value = res.meta.published_count
    mostPopularCount.value = res.meta.most_popular_count
    featuredCount.value = res.meta.featured_count

    // A deletion can empty the last page. Stepping back beats showing an empty
    // table under a paginator that says there are results.
    if (res.data.length === 0 && page.value > 1) {
      page.value = pager.last_page
      await reload()
    }
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

/**
 * The entry open in the dialog is a scraped draft that was hidden when it was
 * opened. The server refuses to switch one on until it has a body (see
 * UpdateArticleRequest::after()); the switch mirrors that rule instead of
 * letting the editor find out from a failed save.
 */
const editingIngestedDraft = ref(false)

const NOT_REWRITTEN_HINT = 'Not rewritten yet. Run php artisan news:rewrite first, then approve it.'

/** Tags stripped: an editor's empty `<p></p>` is still no body. */
const formHasBody = computed(() => (form.value.body ?? '').replace(/<[^>]*>/g, '').trim() !== '')

const approvalBlocked = computed(() => editingIngestedDraft.value && !formHasBody.value)

const blank = (): ArticleForm => ({
  title: '',
  slug: null,
  excerpt: null,
  body: null,
  editor_note: null,
  hero_image_path: null,
  published_at: null,
  active: true,
  featured: false,
  to_be_most_popular: false,
  meta_title: null,
  meta_description: null,
  // News starts out of search: it is indexed only once it clears the bar
  // below the switch (NewsIndexGate on the server).
  noindex: articleType === 'news',
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
  editor_note: string | null
  hero_image_path: string | null
  published_at: string | null
  active: boolean
  featured: boolean
  to_be_most_popular: boolean
  meta_title: string | null
  meta_description: string | null
}

const form = ref<ArticleForm>(blank() as ArticleForm)

/*
 * The hero's pixel width, measured in the browser. A cover under 1200px wide
 * cannot be the page's share image or a large Google preview, so the site
 * falls back to its generic card; the editor is told before saving.
 * null = no image, not loaded yet, or an SVG (never a share image).
 */
const SHARE_IMAGE_MIN_WIDTH = 1200

/*
 * The bar a news post must clear before it may be indexed. Mirrors
 * NewsIndexGate on the server, which is what actually enforces it.
 */
const INDEX_MIN_WORDS = 300
const EDITOR_NOTE_MAX = 2000
// What a results page shows; the site cuts longer ones at a word (lib/seo/meta.ts).
const META_TITLE_MAX = 60
const META_DESCRIPTION_MAX = 155
/** Body and editor's note together: the note is the site's own writing too. */
const bodyWords = computed(() => {
  const text = `${form.value.body ?? ''} ${form.value.editor_note ?? ''}`
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim()
  return text === '' ? 0 : text.split(/\s+/).length
})
const hasInternalLink = computed(() => {
  const domain = (site.value?.domain ?? '').toLowerCase().replace(/^www\./, '')
  const hrefs = [...(form.value.body ?? '').matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1] ?? '')
  return hrefs.some((href) => {
    let path = href
    if (/^https?:\/\//i.test(href)) {
      try {
        const url = new URL(href)
        if (url.hostname.toLowerCase().replace(/^www\./, '') !== domain) return false
        path = url.pathname
      } catch {
        return false
      }
    } else if (!href.startsWith('/')) {
      return false
    }
    return /^\/(casinos|bonuses|categories|special-offers)\/[a-z0-9-]+\/?$/i.test(path)
  })
})
const indexReady = computed(() => bodyWords.value >= INDEX_MIN_WORDS && hasInternalLink.value)
const heroWidth = ref<number | null>(null)
const heroIsSvg = computed(() => /\.svg(\?|$)/i.test(form.value.hero_image_path ?? ''))

watch(
  () => form.value.hero_image_path,
  (path) => {
    heroWidth.value = null
    if (!path || heroIsSvg.value) return
    const url = /^https?:\/\//.test(path) ? path : `${STORAGE_BASE_URL}/storage/${path.replace(/^\/+/, '')}`
    const img = new Image()
    img.onload = () => {
      if (form.value.hero_image_path === path) heroWidth.value = img.naturalWidth
    }
    img.src = url
  },
)

/** Who wrote and who checked the entry. Sent with every save from the dialog. */
const byline = ref<BylineValue>({ author_id: null, reviewed_by_id: null, last_reviewed_at: null })

/**
 * The publish timestamp exactly as the server holds it, for the entry being
 * edited.
 *
 * The form's date input can only carry a DAY, so opening an entry truncated
 * `2026-09-28T14:32:00Z` to `2026-09-28` and saving wrote midnight back. The
 * list is ordered by `published_at DESC, id DESC`, so an edit that changed
 * nothing an editor could see still moved the row below every entry
 * published later that same day — which is the "it jumps after I save" report.
 *
 * Keeping the original here lets the save put the time back when the day has
 * not changed, so editing a title leaves the row exactly where it was.
 */
const originalPublishedAt = ref<string | null>(null)

function openCreate(): void {
  editingId.value = null
  editingPublished.value = false
  editingIngestedDraft.value = false
  originalPublishedAt.value = null
  form.value = blank()
  byline.value = { author_id: null, reviewed_by_id: null, last_reviewed_at: null }
  fieldErrors.value = {}
  showDialog.value = true
}

async function openEdit(a: Article): Promise<void> {
  editingId.value = a.id
  editingPublished.value = a.published_at !== null
  fieldErrors.value = {}
  try {
    const full = await articlesApi.getArticle(siteId, a.id, articleType)
    originalPublishedAt.value = full.published_at ?? null
    // Hand-written posts have no source; only feed items need the rewrite.
    editingIngestedDraft.value = full.source_url !== null && full.active === false
    form.value = {
      title: full.title,
      slug: full.slug,
      excerpt: full.excerpt,
      body: full.body ?? null,
      editor_note: full.editor_note ?? null,
      hero_image_path: full.hero_image_path,
      // <input type="date"> wants YYYY-MM-DD; the API stores a full timestamp.
      published_at: full.published_at ? full.published_at.slice(0, 10) : null,
      active: full.active ?? true,
      featured: full.featured ?? false,
      to_be_most_popular: full.to_be_most_popular ?? false,
      meta_title: full.meta_title,
      meta_description: full.meta_description,
      noindex: full.noindex,
    }
    byline.value = {
      author_id: full.author_id ?? null,
      reviewed_by_id: full.reviewed_by_id ?? null,
      last_reviewed_at: full.last_reviewed_at ?? null,
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
 * the instant a date changes, which is exactly when the editor is still
 * looking at it.
 */
const busyId = ref<number | null>(null)

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
        editor_note: full.editor_note ?? null,
        hero_image_path: full.hero_image_path,
        published_at: full.published_at,
        active: full.active ?? true,
        featured: full.featured ?? false,
        to_be_most_popular: full.to_be_most_popular ?? false,
        meta_title: full.meta_title,
        meta_description: full.meta_description,
        canonical_url: full.canonical_url,
        noindex: full.noindex,
        ...changes,
      },
      articleType,
    )

    Object.assign(row, changes)
  } catch (e: unknown) {
    // The server's own reason when it gave one — "not rewritten yet" is
    // something the editor can act on; "could not save" is not.
    const data = axios.isAxiosError(e) ? (e.response?.data as ErrorResponse | undefined) : undefined
    const reason = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
    toast.add({ severity: 'error', summary: 'Error', detail: reason ?? 'Could not save that change.', life: 5000 })
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

function toggleMostPopular(row: Article, value: boolean): void {
  void patchRow(row, { to_be_most_popular: value })
}

/**
 * The form's `YYYY-MM-DD` put back onto a full timestamp.
 *
 * Same day as before → the ORIGINAL instant, untouched, so the row keeps its
 * place in a list ordered by `published_at`. A different day → that day at the
 * original time, so an entry moved to another date keeps its place among
 * whatever else was published then rather than landing at midnight behind all
 * of it. Cleared, or set on an entry that never had one → passed through as
 * the form holds it and the server applies its own meaning.
 */
function resolvePublishedAt(): string | null {
  const picked = form.value.published_at

  if (picked === null || picked === '' || originalPublishedAt.value === null) {
    return picked
  }

  if (originalPublishedAt.value.slice(0, 10) === picked) {
    return originalPublishedAt.value
  }

  // Keep the time of day, swap the date.
  return picked + originalPublishedAt.value.slice(10)
}

async function save(): Promise<void> {
  saving.value = true
  fieldErrors.value = {}
  try {
    const payload = { ...form.value, ...byline.value, published_at: resolvePublishedAt() }

    if (editingId.value === null) {
      await articlesApi.createArticle(siteId, payload, articleType)
    } else {
      await articlesApi.updateArticle(siteId, editingId.value, payload, articleType)
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
    toast.add({ severity: 'success', summary: 'Deleted', detail: articleType === 'news' ? 'News post deleted.' : 'Guide removed.', life: 2500 })
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
        {{ section.plural }}<span v-if="site" class="text-gray-400"> — {{ site.name }}</span>
      </h2>
      <div class="flex items-center gap-2">
        <Button :label="section.newLabel" icon="pi pi-plus" @click="openCreate" />
      </div>

    </div>

    <!-- The section at a glance, before the table.
         Four numbers an editor otherwise had to work out by paging through the
         list and counting ticks: how much exists, how much a visitor can
         actually reach, and how many of those sit on each of the two curated
         rails. All four are counted server-side over the WHOLE section — the
         screen only ever holds one page, so counting what is in hand would be
         wrong the moment there is a second one. -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-lg border border-gray-200 bg-white px-3 py-2">
        <p class="text-xs text-gray-500">All {{ section.plural.toLowerCase() }}</p>
        <p class="text-xl font-semibold tabular-nums text-gray-900">{{ entryTotal ?? '—' }}</p>
        <p class="text-[11px] text-gray-400">drafts included</p>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white px-3 py-2">
        <p class="text-xs text-gray-500">Published</p>
        <p class="text-xl font-semibold tabular-nums text-emerald-700">{{ publishedCount }}</p>
        <p class="text-[11px] text-gray-400">live on the site</p>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white px-3 py-2">
        <p class="text-xs text-gray-500">Most popular</p>
        <p class="text-xl font-semibold tabular-nums text-gray-900">{{ mostPopularCount }}</p>
        <p class="text-[11px] text-gray-400">published &amp; on the rail</p>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white px-3 py-2">
        <p class="text-xs text-gray-500">Home strip</p>
        <p class="text-xl font-semibold tabular-nums text-gray-900">{{ featuredCount }}</p>
        <p class="text-[11px] text-gray-400">published &amp; featured</p>
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

    <!-- News only: narrow the list to scraped posts by where they stand with
         news:rewrite. Counts above stay over the whole section. -->
    <div v-if="articleType === 'news'" class="flex flex-wrap items-center gap-3">
      <label for="rewrite-filter" class="text-sm text-gray-600">Rewrite</label>
      <Select
        input-id="rewrite-filter"
        :model-value="rewriteFilter"
        :options="REWRITE_FILTER_OPTIONS"
        option-label="label"
        option-value="value"
        class="w-72"
        @update:model-value="onRewriteFilter"
      />
      <span v-if="rewriteFilter && entryTotal !== null" class="text-sm text-gray-500">
        {{ entryTotal }} matching
      </span>
    </div>

    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable
        :value="items"
        :loading="loading"
        striped-rows
        data-key="id"
        lazy
        paginator
        :rows="perPage"
        :first="first"
        :total-records="totalRecords"
        :rows-per-page-options="[15, 30, 50, 100]"
        current-page-report-template="{first}-{last} of {totalRecords}"
        paginator-template="FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink RowsPerPageDropdown"
        @page="onPage"
        :pt="{ root: { class: 'text-sm' } }"
      >
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">
            {{ rewriteFilter && articleType === 'news' ? 'No posts match this rewrite filter.' : `No ${section.plural.toLowerCase()} yet.` }}
          </div>
        </template>

        <Column header="Title">
          <template #body="{ data }">
            <span class="font-medium text-gray-900">{{ data.title }}</span>
            <!-- Scraped and not rewritten yet: the title and excerpt are still the
                 SOURCE's words. Shown so nobody publishes them by mistake;
                 `news:rewrite` clears it. -->
            <!-- News: rewritten, or not — and if not, whether news:rewrite
                 ever tried and why the last try produced no copy. -->
            <template v-if="articleType === 'news' && rewriteInfo(data)">
              <Tag
                :value="rewriteInfo(data)!.tag"
                :severity="rewriteInfo(data)!.severity"
                class="ml-2 align-middle !text-[0.65rem]"
                :title="data.awaiting_rewrite ? 'Still the source\'s headline and teaser. Run news:rewrite before publishing.' : undefined"
              />
              <p class="text-xs" :class="rewriteInfo(data)!.severity === 'success' ? 'text-emerald-700' : 'text-red-600'">
                {{ rewriteInfo(data)!.detail }}
              </p>
              <p v-if="rewriteInfo(data)!.error" class="text-xs text-gray-500">
                Why: {{ rewriteInfo(data)!.error }}
              </p>
            </template>
            <Tag
              v-else-if="data.awaiting_rewrite"
              value="Not rewritten"
              severity="danger"
              class="ml-2 align-middle !text-[0.65rem]"
              title="Still the source's headline and teaser. Run news:rewrite before publishing."
            />
            <p class="font-mono text-xs text-gray-400">{{ section.urlPrefix }}{{ data.slug }}</p>
          </template>
        </Column>

        <!-- Where the FACTS came from. Blank for anything written here, which
             is how an editor tells the two apart at a glance. The copy is
             always original either way — only the facts are borrowed. -->
        <Column v-if="articleType === 'news'" header="Source" :style="{ width: '170px' }">
          <template #body="{ data }">
            <a
              v-if="data.source_url"
              :href="data.source_url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm text-emerald-700 hover:underline"
            >{{ data.source_name || 'source' }}</a>
            <span v-else class="text-sm text-gray-400">Written here</span>
          </template>
        </Column>

        <!-- Shown, and editable right here. Hiding a post is the one action an
             editor needs in a hurry, and making them open a dialog for it is how
             things end up DELETED instead. -->
        <Column header="Shown" :style="{ width: '90px' }">
          <template #body="{ data }">
            <!-- A hidden draft that is not rewritten cannot be switched on; a
                 live one can still be switched off. -->
            <ToggleSwitch
              :model-value="data.active"
              :disabled="busyId === data.id || (data.awaiting_rewrite === true && !data.active)"
              :title="data.awaiting_rewrite && !data.active ? NOT_REWRITTEN_HINT : undefined"
              @update:model-value="(v) => toggleShown(data, v)"
            />
          </template>
        </Column>

        <!-- TWO picks, not one. Only news has either surface, so both columns
             are hidden on the guides screen rather than shown and inert.
             Both are the editor's CHOICE — the site has no view tracking, so
             "popular" here means chosen, not measured. -->
        <Column v-if="articleType === 'news'" header="Home strip" :style="{ width: '110px' }">
          <template #body="{ data }">
            <ToggleSwitch
              :model-value="data.featured"
              :disabled="busyId === data.id"
              @update:model-value="(v) => toggleFeatured(data, v)"
            />
          </template>
        </Column>

        <Column v-if="articleType === 'news'" header="Most popular" :style="{ width: '110px' }">
          <template #body="{ data }">
            <ToggleSwitch
              :model-value="data.to_be_most_popular"
              :disabled="busyId === data.id"
              @update:model-value="(v) => toggleMostPopular(data, v)"
            />
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
          <p v-if="heroIsSvg && articleType === 'news'" class="mt-1 text-xs text-amber-600">
            A drawn SVG cover shows on the page, but shares use the site card. Upload a JPG/PNG/WebP at least
            {{ SHARE_IMAGE_MIN_WIDTH }}px wide for a large preview.
          </p>
          <p v-else-if="heroWidth !== null && heroWidth < SHARE_IMAGE_MIN_WIDTH" class="mt-1 text-xs text-amber-600">
            This image is {{ heroWidth }}px wide. Under {{ SHARE_IMAGE_MIN_WIDTH }}px it is not used as the share image
            or for large Google previews; 1600×900 (16:9) is recommended.
          </p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Body</label>
          <RichTextEditor v-model="form.body" />
        </div>

        <div v-if="articleType === 'news'">
          <label class="mb-1 block text-xs font-medium text-gray-600">Editor's note</label>
          <Textarea v-model="form.editor_note" rows="3" fluid :maxlength="EDITOR_NOTE_MAX"
                    placeholder="What this story means for our players, in your own words." />
          <p class="mt-1 text-xs text-gray-400">
            Shown on the page under the article, signed by the author. Plain text; a blank line starts a new
            paragraph. news:rewrite never changes it, and its words count toward the 300 needed to index.
            {{ (form.editor_note ?? '').length }}/{{ EDITOR_NOTE_MAX }}
          </p>
          <p v-if="fieldErrors['editor_note']" class="mt-1 text-xs text-red-600">{{ fieldErrors['editor_note'] }}</p>
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
            <p class="mt-1 text-xs" :class="(form.meta_title ?? '').length > META_TITLE_MAX ? 'text-amber-600' : 'text-gray-400'">
              {{ (form.meta_title ?? '').length }}/{{ META_TITLE_MAX }}<template v-if="articleType === 'news'"> · news:rewrite fills it</template>
            </p>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Meta description</label>
          <Textarea v-model="form.meta_description" rows="2" fluid placeholder="Defaults to the excerpt" />
          <p class="mt-1 text-xs" :class="(form.meta_description ?? '').length > META_DESCRIPTION_MAX ? 'text-amber-600' : 'text-gray-400'">
            {{ (form.meta_description ?? '').length }}/{{ META_DESCRIPTION_MAX }}
          </p>
        </div>

        <div class="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-3">
          <div>
            <label class="text-sm text-gray-700">Shown on the site</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Off hides it immediately and keeps everything else — the publish date is not
              touched, so switching it back on restores the post exactly as it was.
            </p>
            <p v-if="approvalBlocked" class="mt-1 text-xs text-red-600">{{ NOT_REWRITTEN_HINT }}</p>
            <p v-else-if="fieldErrors['active']" class="mt-1 text-xs text-red-600">{{ fieldErrors['active'] }}</p>
          </div>
          <ToggleSwitch v-model="form.active" :disabled="approvalBlocked" />
        </div>

        <div v-if="articleType === 'news'" class="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-3">
          <div>
            <label class="text-sm text-gray-700">Home page strip</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Promotes this post to the news strip on the home page, under Bonus.
              Picks beyond the strip's size wait their turn, newest first.
            </p>
          </div>
          <ToggleSwitch v-model="form.featured" />
        </div>

        <div v-if="articleType === 'news'" class="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-3">
          <div>
            <label class="text-sm text-gray-700">Most popular</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Puts this post in the Most Popular rail on the news page. Independent of the
              home page strip — the rail holds the eight most recent picks, newest first.
            </p>
          </div>
          <ToggleSwitch v-model="form.to_be_most_popular" />
        </div>

        <div class="border-t border-gray-100 pt-3">
          <label class="mb-2 block text-sm text-gray-700">Byline</label>
          <BylineFields v-model="byline" :site-id="siteId" />
        </div>

        <div class="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div>
            <label class="text-sm text-gray-700">Keep out of search results</label>
            <p class="text-xs text-gray-400">Sets noindex. The page stays reachable by direct link.</p>
            <!-- News is indexed only once it adds value; the server enforces
                 the same bar (NewsIndexGate) and refuses the untick otherwise. -->
            <p v-if="articleType === 'news'" class="mt-1 text-xs" :class="indexReady ? 'text-emerald-600' : 'text-amber-600'">
              To index: {{ bodyWords }}/{{ INDEX_MIN_WORDS }} words (body + note) · link to a casino, bonus or category page:
              {{ hasInternalLink ? 'yes' : 'no' }}
            </p>
            <p v-if="fieldErrors['noindex']" class="mt-1 text-xs text-red-600">{{ fieldErrors['noindex'] }}</p>
          </div>
          <ToggleSwitch v-model="form.noindex" />
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="showDialog = false" />
        <Button :label="editingId ? 'Save' : section.newLabel" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <Dialog :visible="deleting !== null" modal :header="articleType === 'news' ? 'Delete news post' : 'Delete guide'" :style="{ width: '420px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">
        Delete <strong>{{ deleting?.title }}</strong>?
      </p>
      <!-- News is deleted for good; the backend keeps only its URL, which
           answers 410 Gone, and unwraps links to it (NewsRemovalService). -->
      <p v-if="articleType === 'news'" class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        This is permanent and cannot be undone. Its URL will answer 410 Gone, links to it from
        other articles become plain text, and it leaves the sitemaps. Add a redirect first if
        other websites link to it.
      </p>
      <p v-else-if="deleting?.published_at" class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
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
