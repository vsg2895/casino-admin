<script setup lang="ts">
/**
 * Reviews — moderation for visitor-written casino reviews.
 *
 * Three actions and no more: show, hide, delete permanently. There is no edit,
 * because a moderator rewriting someone's words and leaving their name attached
 * is not moderation.
 *
 * Filters follow the Apply-driven pattern used by Warmup and Promotion History:
 * typing changes a DRAFT, and nothing is refetched until Apply is pressed, so a
 * half-typed search never triggers a query.
 */
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/casinoReviews'
import RecordCount from '@/components/RecordCount.vue'
import { useSitesStore } from '@/stores/sitesStore'
import type { CasinoReview, CasinoReviewStatus } from '@shared/types/casinoReview'

const toast = useToast()
const sitesStore = useSitesStore()

const items = ref<CasinoReview[]>([])
const loading = ref(false)
const selected = ref<CasinoReview[]>([])
const pending = ref(0)

// ── Server-side pagination ───────────────────────────────────────────────────
const page = ref(1)
const perPage = ref(25)
const meta = ref<{ total: number; last_page: number } | null>(null)
const totalRecords = computed(() => meta.value?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)
const recordTotal = ref<number | null>(null)

// ── Filters: draft vs applied ────────────────────────────────────────────────
type Filters = Omit<api.CasinoReviewFilters, 'page' | 'per_page'>

const search = ref('')
const status = ref<CasinoReviewStatus | null>(null)
const siteId = ref<number | null>(null)
const rating = ref<number | null>(null)

const applied = ref<Filters>({})

const statusOptions = [
  { label: 'All statuses', value: null },
  { label: 'Pending', value: 'pending' },
  { label: 'Published', value: 'published' },
  { label: 'Hidden', value: 'hidden' },
]

const ratingOptions = [
  { label: 'Any rating', value: null },
  ...[5, 4, 3, 2, 1].map((n) => ({ label: `${n} ★`, value: n })),
]

const siteOptions = computed(() => [
  { label: 'All sites', value: null },
  ...sitesStore.sites.map((s) => ({ label: s.name, value: s.id })),
])

function draftFilters(): Filters {
  const f: Filters = {}
  const term = search.value.trim()
  if (term !== '') f.search = term
  if (status.value !== null) f.status = status.value
  if (siteId.value !== null) f.site_id = siteId.value
  if (rating.value !== null) f.rating = rating.value
  return f
}

const isDirty = computed(
  () => JSON.stringify(draftFilters()) !== JSON.stringify(applied.value),
)

async function reload(): Promise<void> {
  loading.value = true
  try {
    const [list, count] = await Promise.all([
      api.listReviews({ page: page.value, per_page: perPage.value, ...applied.value }),
      // Never fatal: a failed count must not take the listing down with it.
      api.countReviews(applied.value).catch(() => null),
    ])
    items.value = list.data
    meta.value = { total: list.meta.total, last_page: list.meta.last_page }
    perPage.value = list.meta.per_page
    recordTotal.value = count
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load reviews.', life: 4000 })
  } finally {
    loading.value = false
  }
}

async function refreshPending(): Promise<void> {
  pending.value = await api.countPendingReviews().catch(() => pending.value)
}

async function applyFilters(): Promise<void> {
  applied.value = draftFilters()
  page.value = 1
  selected.value = []
  await reload()
}

async function clearFilters(): Promise<void> {
  search.value = ''
  status.value = null
  siteId.value = null
  rating.value = null
  await applyFilters()
}

async function onPage(e: { page: number; rows: number }): Promise<void> {
  page.value = e.page + 1 // PrimeVue is 0-based, Laravel is 1-based
  perPage.value = e.rows
  await reload()
}

// ── Moderation ───────────────────────────────────────────────────────────────
const busyId = ref<number | null>(null)

async function toggleVisibility(review: CasinoReview): Promise<void> {
  const publish = review.status !== 'published'
  busyId.value = review.id
  try {
    const res = await api.setReviewVisibility(review.id, publish)
    const idx = items.value.findIndex((r) => r.id === review.id)
    if (idx !== -1) items.value[idx] = res.data
    await refreshPending()
    toast.add({ severity: 'success', summary: publish ? 'Published' : 'Hidden', life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not change visibility.', life: 4000 })
  } finally {
    busyId.value = null
  }
}

const deleting = ref<CasinoReview | null>(null)
const deleteLoading = ref(false)

async function confirmDelete(): Promise<void> {
  if (deleting.value === null) return
  deleteLoading.value = true
  try {
    await api.deleteReview(deleting.value.id)
    deleting.value = null
    await Promise.all([reload(), refreshPending()])
    toast.add({ severity: 'success', summary: 'Deleted', life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not delete.', life: 4000 })
  } finally {
    deleteLoading.value = false
  }
}

async function bulk(action: 'publish' | 'hide' | 'delete'): Promise<void> {
  if (selected.value.length === 0) return
  if (
    action === 'delete' &&
    !window.confirm(`Permanently delete ${selected.value.length} reviews? This cannot be undone.`)
  ) {
    return
  }
  try {
    const affected = await api.bulkReviews(action, selected.value.map((r) => r.id))
    selected.value = []
    await Promise.all([reload(), refreshPending()])
    toast.add({ severity: 'success', summary: `${affected} updated`, life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Bulk action failed.', life: 4000 })
  }
}

// ── Read one in full ─────────────────────────────────────────────────────────
const viewing = ref<CasinoReview | null>(null)

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function excerpt(body: string): string {
  return body.length > 140 ? `${body.slice(0, 140)}…` : body
}

function severityFor(s: CasinoReviewStatus): 'success' | 'warn' | 'secondary' {
  if (s === 'published') return 'success'
  if (s === 'pending') return 'warn'
  return 'secondary'
}

onMounted(async () => {
  await sitesStore.fetchSites()
  await Promise.all([reload(), refreshPending()])
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Reviews</h2>
        <p class="text-sm text-gray-500">
          Visitor-written casino reviews. Nothing is publicly visible until you publish it.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Tag v-if="pending > 0" severity="warn" :value="`${pending} awaiting review`" />
        <RecordCount :total="recordTotal" label="Reviews" />
      </div>
    </div>

    <!-- Filters. Nothing refetches until Apply. -->
    <div class="flex flex-wrap items-center gap-3">
      <InputText v-model="search" placeholder="Search name, title or text" class="w-64" @keyup.enter="applyFilters" />
      <Select v-model="status" :options="statusOptions" option-label="label" option-value="value" class="w-44" />
      <Select v-model="siteId" :options="siteOptions" option-label="label" option-value="value" class="w-48" />
      <Select v-model="rating" :options="ratingOptions" option-label="label" option-value="value" class="w-36" />
      <Button label="Apply" icon="pi pi-filter" :loading="loading" :severity="isDirty ? 'primary' : 'secondary'" @click="applyFilters" />
      <Button label="Clear" icon="pi pi-filter-slash" text severity="secondary" @click="clearFilters" />

      <span v-if="selected.length" class="ml-auto flex items-center gap-2">
        <span class="text-sm text-gray-500">{{ selected.length }} selected</span>
        <Button label="Publish" size="small" outlined @click="bulk('publish')" />
        <Button label="Hide" size="small" outlined severity="secondary" @click="bulk('hide')" />
        <Button label="Delete" size="small" outlined severity="danger" @click="bulk('delete')" />
      </span>
    </div>

    <!-- Table -->
    <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <DataTable
        v-model:selection="selected"
        :value="items"
        :loading="loading"
        lazy
        paginator
        :rows="perPage"
        :first="first"
        :total-records="totalRecords"
        :rows-per-page-options="[25, 50, 100]"
        data-key="id"
        striped-rows
        @page="onPage"
      >
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No reviews match these filters.</div>
        </template>

        <Column selection-mode="multiple" :style="{ width: '44px' }" />

        <Column header="Review">
          <template #body="{ data }: { data: CasinoReview }">
            <button type="button" class="block text-left" @click="viewing = data">
              <span v-if="data.title" class="block font-medium text-gray-900">{{ data.title }}</span>
              <span class="block text-sm text-gray-600">{{ excerpt(data.body) }}</span>
              <span class="mt-0.5 block text-xs text-gray-400">
                {{ data.author_name }}<span v-if="data.author_email"> · {{ data.author_email }}</span>
              </span>
            </button>
          </template>
        </Column>

        <Column header="Casino" :style="{ width: '160px' }">
          <template #body="{ data }: { data: CasinoReview }">
            <span class="text-sm text-gray-700">{{ data.casino_name ?? '—' }}</span>
          </template>
        </Column>

        <Column header="Site" :style="{ width: '150px' }">
          <template #body="{ data }: { data: CasinoReview }">
            <span class="text-sm text-gray-600">{{ data.site_name ?? '—' }}</span>
          </template>
        </Column>

        <Column header="Rating" :style="{ width: '100px' }">
          <template #body="{ data }: { data: CasinoReview }">
            <span class="text-sm tabular-nums text-gray-700">{{ data.rating }} ★</span>
          </template>
        </Column>

        <Column header="Added" :style="{ width: '150px' }">
          <template #body="{ data }: { data: CasinoReview }">
            <span class="text-sm text-gray-600">{{ formatDate(data.created_at) }}</span>
          </template>
        </Column>

        <Column header="Shown" :style="{ width: '150px' }">
          <template #body="{ data }: { data: CasinoReview }">
            <div class="flex items-center gap-2">
              <ToggleSwitch
                :model-value="data.status === 'published'"
                :disabled="busyId === data.id"
                @update:model-value="toggleVisibility(data)"
              />
              <Tag :severity="severityFor(data.status)" :value="data.status" />
            </div>
          </template>
        </Column>

        <Column header="Actions" :style="{ width: '80px' }">
          <template #body="{ data }: { data: CasinoReview }">
            <Button icon="pi pi-trash" text severity="danger" size="small" @click="deleting = data" />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Read one in full -->
    <Dialog
      :visible="viewing !== null"
      modal
      header="Review"
      :style="{ width: '600px' }"
      @update:visible="viewing = null"
    >
      <div v-if="viewing" class="space-y-3">
        <div class="flex items-center gap-2">
          <Tag :severity="severityFor(viewing.status)" :value="viewing.status" />
          <span class="text-sm tabular-nums text-gray-700">{{ viewing.rating }} ★</span>
          <span class="text-sm text-gray-400">{{ formatDate(viewing.created_at) }}</span>
        </div>
        <div class="text-sm text-gray-500">
          {{ viewing.casino_name }} · {{ viewing.site_name }}
        </div>
        <h3 v-if="viewing.title" class="text-base font-semibold text-gray-900">{{ viewing.title }}</h3>
        <p class="whitespace-pre-wrap text-sm text-gray-800">{{ viewing.body }}</p>
        <p class="text-xs text-gray-400">
          {{ viewing.author_name }}<span v-if="viewing.author_email"> · {{ viewing.author_email }}</span>
        </p>
      </div>
      <template #footer>
        <Button label="Close" text @click="viewing = null" />
      </template>
    </Dialog>

    <!-- Delete -->
    <Dialog
      :visible="deleting !== null"
      modal
      header="Delete review"
      :style="{ width: '440px' }"
      @update:visible="deleting = null"
    >
      <p class="text-sm text-gray-700">
        Permanently delete the review by <strong>{{ deleting?.author_name }}</strong
        >? This cannot be undone — there is no soft delete on reviews.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" severity="danger" :loading="deleteLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
