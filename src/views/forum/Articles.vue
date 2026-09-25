<script setup lang="ts">
/**
 * Discussions — admin CRUD for forum articles.
 *
 * Visitors never reach this screen and never create an article: the API's
 * `user_id` column points at the ADMIN users table, so "only admins write
 * articles" is enforced by the foreign key rather than by a policy someone has
 * to remember.
 *
 * The list carries the denormalised counters straight off the row — posts,
 * views and last activity are columns, never COUNT()s.
 */
import { ref, computed, onMounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import DatePicker from 'primevue/datepicker'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/forum'
import { useSitesStore } from '@/stores/sitesStore'
import type { ForumAdminSection, ForumArticle, ForumArticleStatus } from '@shared/types/community-forum'

const toast = useToast()
const sitesStore = useSitesStore()

const siteId = ref<number | null>(null)

// ── replying as the editorial team ───────────────────────────────────────────
//
// The backend takes the author from the token, so nothing about who wrote it is
// sent from here. The team NAME is derived from the site for the same reason it
// is on the server: one admin writes for several domains.
const replyDialog = ref(false)
const replyTo = ref<ForumArticle | null>(null)
const replyBody = ref('')
const replySaving = ref(false)

const teamName = computed(() => {
  const name = sitesStore.sites.find((s) => s.id === siteId.value)?.name
  return name ? `${name} Team` : 'the editorial team'
})

function openReply(article: ForumArticle): void {
  replyTo.value = article
  replyBody.value = ''
  replyDialog.value = true
}

async function saveReply(): Promise<void> {
  if (siteId.value === null || replyTo.value === null) return

  replySaving.value = true
  try {
    await api.createArticlePost(siteId.value, replyTo.value.id, replyBody.value.trim())
    toast.add({ severity: 'success', summary: 'Posted', detail: `Published as ${teamName.value}.`, life: 3000 })
    replyDialog.value = false
    // The reply moves the discussion's own counters, so the row is refetched
    // rather than patched locally.
    await load()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not post the reply.', life: 4000 })
  } finally {
    replySaving.value = false
  }
}
const items = ref<ForumArticle[]>([])
const sections = ref<ForumAdminSection[]>([])
const loading = ref(false)

const page = ref(1)
const perPage = ref(20)
const meta = ref<{ total: number; last_page: number } | null>(null)
const totalRecords = computed(() => meta.value?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)

// ── filters (Apply-driven, like Reviews) ─────────────────────────────────────
const fCategory = ref<number | null>(null)
const fStatus = ref<ForumArticleStatus | null>(null)
const fPinned = ref<boolean | null>(null)
const fFrom = ref<Date | null>(null)
const fTo = ref<Date | null>(null)
const fSearch = ref('')

const statusOptions = [
  { label: 'All statuses', value: null },
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Archived', value: 'archived' },
]
const pinnedOptions = [
  { label: 'Pinned or not', value: null },
  { label: 'Pinned only', value: true },
  { label: 'Not pinned', value: false },
]

/** Every board on this site, flattened for the filter and the editor. */
const categoryOptions = computed(() => [
  { label: 'All boards', value: null },
  ...sections.value.flatMap((s) => s.categories.map((c) => ({ label: `${s.name} → ${c.name}`, value: c.id }))),
])

// ── editor ───────────────────────────────────────────────────────────────────
const dialog = ref(false)
const saving = ref(false)
const editing = ref<ForumArticle | null>(null)
const slugTouched = ref(false)

const form = ref({
  forum_category_id: 0,
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  cover_image_path: '',
  status: 'draft' as ForumArticleStatus,
  pinned: false,
  locked: false,
  published_at: null as Date | null,
})

/**
 * Slug follows the title until the operator edits it.
 *
 * Once touched it is left alone forever — the slug is in the public URL, and
 * silently rewriting it on a title tweak would break every inbound link to a
 * live discussion.
 */
watch(() => form.value.title, (title) => {
  if (slugTouched.value || editing.value) return
  form.value.slug = title.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 220)
})

async function load(): Promise<void> {
  if (siteId.value === null) return
  loading.value = true
  try {
    const res = await api.listArticles(siteId.value, {
      page: page.value,
      per_page: perPage.value,
      category_id: fCategory.value,
      status: fStatus.value,
      pinned: fPinned.value,
      from: fFrom.value ? fFrom.value.toISOString().slice(0, 10) : null,
      to: fTo.value ? fTo.value.toISOString().slice(0, 10) : null,
      search: fSearch.value.trim() || null,
    })
    items.value = res.data
    meta.value = { total: res.meta.total, last_page: res.meta.last_page }
  } catch {
    toast.add({ severity: 'error', summary: 'Could not load discussions', life: 4000 })
  } finally {
    loading.value = false
  }
}

async function loadSections(): Promise<void> {
  if (siteId.value === null) return
  try {
    sections.value = await api.listSections(siteId.value)
  } catch { /* the filter simply stays empty */ }
}

function apply(): void {
  page.value = 1
  void load()
}

function onPage(e: { page: number; rows: number }): void {
  page.value = e.page + 1
  perPage.value = e.rows
  void load()
}

async function open(article: ForumArticle | null): Promise<void> {
  slugTouched.value = false
  editing.value = article

  if (article && siteId.value !== null) {
    // The listing deliberately omits the body, so the editor fetches the row it
    // is about to edit rather than opening with an empty textarea.
    const full = await api.getArticle(siteId.value, article.id)
    form.value = {
      forum_category_id: full.category?.id ?? 0,
      title: full.title,
      slug: full.slug,
      excerpt: full.excerpt ?? '',
      body: full.body ?? '',
      cover_image_path: full.cover_image_path ?? '',
      status: full.status ?? 'draft',
      pinned: full.pinned,
      locked: full.locked,
      published_at: full.published_at ? new Date(full.published_at) : null,
    }
  } else {
    form.value = {
      forum_category_id: sections.value[0]?.categories[0]?.id ?? 0,
      title: '', slug: '', excerpt: '', body: '', cover_image_path: '',
      status: 'draft', pinned: false, locked: false, published_at: null,
    }
  }

  dialog.value = true
}

async function save(): Promise<void> {
  if (siteId.value === null) return
  saving.value = true
  try {
    const payload = {
      forum_category_id: form.value.forum_category_id,
      title: form.value.title,
      slug: form.value.slug || null,
      excerpt: form.value.excerpt || null,
      body: form.value.body,
      cover_image_path: form.value.cover_image_path || null,
      status: form.value.status,
      pinned: form.value.pinned,
      locked: form.value.locked,
      published_at: form.value.published_at ? form.value.published_at.toISOString() : null,
    }
    if (editing.value) await api.updateArticle(siteId.value, editing.value.id, payload)
    else await api.createArticle(siteId.value, payload)
    dialog.value = false
    await load()
    toast.add({ severity: 'success', summary: 'Discussion saved', life: 2500 })
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    toast.add({ severity: 'error', summary: msg ?? 'Could not save that discussion', life: 5000 })
  } finally {
    saving.value = false
  }
}

/** Inline toggles issue a full PUT — the API has no PATCH for these. */
async function quickToggle(row: ForumArticle, field: 'pinned' | 'locked'): Promise<void> {
  if (siteId.value === null) return
  try {
    const full = await api.getArticle(siteId.value, row.id)
    await api.updateArticle(siteId.value, row.id, {
      forum_category_id: full.category?.id ?? 0,
      title: full.title,
      slug: full.slug,
      excerpt: full.excerpt ?? null,
      body: full.body ?? '',
      cover_image_path: full.cover_image_path ?? null,
      status: full.status ?? 'draft',
      pinned: field === 'pinned' ? !row.pinned : full.pinned,
      locked: field === 'locked' ? !row.locked : full.locked,
      published_at: full.published_at,
    })
    await load()
  } catch {
    toast.add({ severity: 'error', summary: `Could not change ${field}`, life: 4000 })
  }
}

async function remove(row: ForumArticle): Promise<void> {
  if (siteId.value === null) return
  if (!confirm(`Delete “${row.title}” and its ${row.posts_count} post(s)?`)) return
  try {
    const res = await api.deleteArticle(siteId.value, row.id)
    await load()
    toast.add({ severity: 'success', summary: res.message, life: 4000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Could not delete that discussion', life: 4000 })
  }
}

function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

function severityFor(status: string | undefined): string {
  return status === 'published' ? 'success' : status === 'archived' ? 'secondary' : 'warn'
}

watch(siteId, async () => { await loadSections(); page.value = 1; await load() })

onMounted(async () => {
  if (sitesStore.sites.length === 0) await sitesStore.fetchSites?.()
  siteId.value = sitesStore.sites[0]?.id ?? null
})
</script>

<template>
  <div class="p-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-gray-900">Forum Discussions</h1>
        <p class="mt-1 text-sm text-gray-500">Topics you publish. Visitors reply; they never create these.</p>
      </div>
      <div class="flex items-end gap-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Site</label>
          <Select v-model="siteId" :options="sitesStore.sites" option-label="name" option-value="id" class="w-44" />
        </div>
        <Button label="New discussion" icon="pi pi-plus" @click="open(null)" />
      </div>
    </div>

    <div class="mb-4 flex flex-wrap items-stretch gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div class="filter-field">
        <label class="mb-1 block text-xs font-medium text-gray-700">Board</label>
        <Select v-model="fCategory" :options="categoryOptions" option-label="label" option-value="value" class="w-56" />
      </div>
      <div class="filter-field">
        <label class="mb-1 block text-xs font-medium text-gray-700">Status</label>
        <Select v-model="fStatus" :options="statusOptions" option-label="label" option-value="value" class="w-40" />
      </div>
      <div class="filter-field">
        <label class="mb-1 block text-xs font-medium text-gray-700">Pinned</label>
        <Select v-model="fPinned" :options="pinnedOptions" option-label="label" option-value="value" class="w-36" />
      </div>
      <div class="filter-field">
        <label class="mb-1 block text-xs font-medium text-gray-700">From</label>
        <DatePicker v-model="fFrom" date-format="yy-mm-dd" show-icon class="w-40" />
      </div>
      <div class="filter-field">
        <label class="mb-1 block text-xs font-medium text-gray-700">To</label>
        <DatePicker v-model="fTo" date-format="yy-mm-dd" show-icon class="w-40" />
      </div>
      <!-- The FLEXIBLE field. Five fixed-width controls plus the button came to
           a few pixels more than the row, so Apply wrapped to a line of its
           own; letting the search box give and take that slack keeps the whole
           bar on one line without shrinking anything a user reads. -->
      <div class="filter-field min-w-[12rem] flex-1">
        <label class="mb-1 block text-xs font-medium text-gray-700">Search title</label>
        <InputText v-model="fSearch" class="w-full" @keyup.enter="apply" />
      </div>
      <Button label="Apply" icon="pi pi-filter" class="self-end" @click="apply" />
    </div>

    <DataTable
      :value="items" :loading="loading" data-key="id"
      lazy paginator :rows="perPage" :first="first" :total-records="totalRecords"
      :rows-per-page-options="[20, 50, 100]" @page="onPage"
    >
      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-comments mb-3 text-3xl text-gray-400" />
          <p class="font-medium text-gray-900">No discussions yet.</p>
          <p class="mt-1 text-sm text-gray-500">Publish one and visitors can start replying.</p>
        </div>
      </template>

      <Column header="Title" style="min-width:22rem">
        <template #body="{ data }: { data: ForumArticle }">
          <div class="flex items-center gap-2">
            <i v-if="data.pinned" class="pi pi-thumbtack text-xs text-indigo-500" />
            <i v-if="data.locked" class="pi pi-lock text-xs text-gray-400" />
            <span class="font-medium text-gray-900">{{ data.title }}</span>
          </div>
          <p class="text-xs text-gray-400">
            <code class="rounded bg-gray-100 px-1">/{{ data.slug }}</code>
            <span v-if="data.category"> · {{ data.category.name }}</span>
          </p>
        </template>
      </Column>

      <Column header="Status" style="width:8rem">
        <template #body="{ data }: { data: ForumArticle }">
          <Tag :value="data.status" :severity="severityFor(data.status)" />
        </template>
      </Column>

      <Column header="Posts" style="width:6rem">
        <template #body="{ data }: { data: ForumArticle }">
          <span class="tabular-nums">{{ data.posts_count }}</span>
        </template>
      </Column>

      <Column header="Views" style="width:6rem">
        <template #body="{ data }: { data: ForumArticle }">
          <span class="tabular-nums">{{ data.views_count }}</span>
        </template>
      </Column>

      <Column header="Last activity" style="width:10rem">
        <template #body="{ data }: { data: ForumArticle }">
          <span class="text-sm text-gray-600">{{ formatDate(data.last_post_at) }}</span>
        </template>
      </Column>

      <Column header="Pin" style="width:5rem">
        <template #body="{ data }: { data: ForumArticle }">
          <ToggleSwitch :model-value="data.pinned" @update:model-value="quickToggle(data, 'pinned')" />
        </template>
      </Column>

      <Column header="Lock" style="width:5rem">
        <template #body="{ data }: { data: ForumArticle }">
          <ToggleSwitch :model-value="data.locked" @update:model-value="quickToggle(data, 'locked')" />
        </template>
      </Column>

      <Column header="" style="width:7rem">
        <template #body="{ data }: { data: ForumArticle }">
          <div class="flex gap-1">
            <Button size="small" text icon="pi pi-comment" v-tooltip.top="'Reply as the team'" @click="openReply(data)" />
            <Button size="small" text icon="pi pi-pencil" @click="open(data)" />
            <Button size="small" text severity="danger" icon="pi pi-trash" @click="remove(data)" />
          </div>
        </template>
      </Column>
    </DataTable>

    <!-- Replying as the team. The post is stored against the signed-in admin's
         real user account and published under the site's team name; nothing
         writes that name to the database. Members post from the public site
         and are unaffected. -->
    <Dialog v-model:visible="replyDialog" modal header="Reply as the editorial team" :style="{ width: '42rem' }">
      <p v-if="replyTo" class="mb-3 text-sm text-gray-500">
        Replying to <span class="font-medium text-gray-800">{{ replyTo.title }}</span>
      </p>
      <Textarea v-model="replyBody" rows="8" fluid autoResize placeholder="Write the reply…" />
      <p class="mt-2 text-xs text-gray-500">
        Posted publicly as <span class="font-medium">{{ teamName }}</span>, approved immediately.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="replyDialog = false" />
        <Button label="Post reply" icon="pi pi-check" :loading="replySaving" :disabled="!replyBody.trim()" @click="saveReply" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialog" modal :header="editing ? 'Edit discussion' : 'New discussion'" :style="{ width: '50rem' }">
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">
          <label class="mb-1 block text-xs font-medium text-gray-700">Title</label>
          <InputText v-model="form.title" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Slug</label>
          <InputText v-model="form.slug" class="w-full" @input="slugTouched = true" />
          <p class="mt-1 text-xs text-gray-400">Auto-filled from the title until you edit it. It is the public URL.</p>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Board</label>
          <Select
            v-model="form.forum_category_id"
            :options="categoryOptions.filter(o => o.value !== null)"
            option-label="label" option-value="value" class="w-full"
          />
        </div>
        <div class="col-span-2">
          <label class="mb-1 block text-xs font-medium text-gray-700">Excerpt</label>
          <Textarea v-model="form.excerpt" rows="2" class="w-full" />
        </div>
        <div class="col-span-2">
          <label class="mb-1 block text-xs font-medium text-gray-700">Body</label>
          <Textarea v-model="form.body" rows="12" class="w-full font-mono text-sm" />
          <p class="mt-1 text-xs text-gray-400">
            Basic HTML is allowed and filtered server-side against a short allow-list
            (headings, lists, links, emphasis, code). Scripts, styles and event handlers are stripped.
          </p>
        </div>
        <div class="col-span-2">
          <label class="mb-1 block text-xs font-medium text-gray-700">Cover image path</label>
          <InputText v-model="form.cover_image_path" class="w-full" placeholder="forum/covers/example.jpg" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Status</label>
          <Select
            v-model="form.status"
            :options="statusOptions.filter(o => o.value !== null)"
            option-label="label" option-value="value" class="w-full"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Published at</label>
          <DatePicker v-model="form.published_at" show-time hour-format="24" date-format="yy-mm-dd" show-icon class="w-full" />
          <p class="mt-1 text-xs text-gray-400">Leave empty to stamp now when you publish.</p>
        </div>
        <div class="col-span-2 flex gap-8">
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-700">Pinned</label>
            <ToggleSwitch v-model="form.pinned" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-700">Locked</label>
            <ToggleSwitch v-model="form.locked" />
            <p class="mt-1 text-xs text-gray-400">Readable, but closed to new replies.</p>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="dialog = false" />
        <Button label="Save" :loading="saving" :disabled="!form.title || !form.body || !form.forum_category_id" @click="save" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
/*
 * Alignment WITHOUT resizing the controls.
 *
 * PrimeVue's Select renders shorter than InputText and DatePicker under Aura.
 * With `items-end` the boxes bottom-aligned but their tops and labels did not,
 * which is the stagger this bar had. Pinning a fixed height fixed the
 * alignment but shrank every control, so instead the row lets the SHORTEST
 * control grow to the tallest one's natural height:
 *
 *   - the row is `items-stretch`, so every field is as tall as the tallest
 *   - each field is a column: label at its natural height, control takes the
 *     rest with flex:1
 *
 * The tallest control therefore still sets the height — nothing is made
 * smaller, and no magic number is hardcoded. It also survives a label wrapping
 * to two lines at a narrow width.
 */
.filter-field {
  display: flex;
  flex-direction: column;
}

/*
 * Fixed line-height, so every label is EXACTLY one line tall.
 * The controls below are aligned by absorbing "row height minus label
 * height" — if one label rendered a fraction taller, its control would be a
 * fraction shorter and the row would be subtly off again.
 */
.filter-field > label {
  flex: 0 0 auto;
  line-height: 1rem;
}

/* The control is the field's other child; grow it into the leftover space. */
.filter-field > :deep(.p-select),
.filter-field > :deep(.p-datepicker),
.filter-field > :deep(.p-inputtext) {
  flex: 1 1 auto;
}

/* DatePicker is a wrapper around its own input — the input has to follow. */
.filter-field :deep(.p-datepicker-input) {
  height: 100%;
}

/* Select's value is top-aligned once the box is taller than its content. */
.filter-field :deep(.p-select) {
  align-items: center;
}
</style>
