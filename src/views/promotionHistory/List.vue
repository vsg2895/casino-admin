<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Paginator, { type PageState } from 'primevue/paginator'
import { useToast } from 'primevue/usetoast'
import { useSitesStore } from '@/stores/sitesStore'
import {
  listPromotionHistory,
  countPromotionHistory,
  type PromotionHistoryFilters,
} from '@/api/promotionHistory'
import RecordCount from '@/components/RecordCount.vue'
import type { PromotionEmailHistory, PromotionEmailStatus } from '@shared/types/promotionEmailHistory'

const sitesStore = useSitesStore()
const toast = useToast()

const items = ref<PromotionEmailHistory[]>([])
const loading = ref(false)
const total = ref(0)
const perPage = ref(50)
const first = ref(0)

const siteId = ref<number | null>(null)
const from = ref('')
const to = ref('')
const search = ref('')
const status = ref<PromotionEmailStatus | null>(null)

const statusOptions = [
  { label: 'All statuses', value: null },
  { label: 'Success', value: 'success' },
  { label: 'Failed', value: 'failed' },
  { label: 'Skipped', value: 'skipped' },
]

const statusSeverity: Record<PromotionEmailStatus, string> = {
  success: 'success',
  failed: 'danger',
  skipped: 'secondary',
}

const siteOptions = computed(() => [
  { label: 'All sites', value: null },
  ...sitesStore.sites.map((s) => ({ label: `${s.name} (${s.domain})`, value: s.id })),
])

function formatDateTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

// Total from the dedicated COUNT endpoint — never from the listing response.
// This table reaches millions of rows, so counting is kept off the paginated
// query entirely.
const recordTotal = ref<number | null>(null)

type HistoryFilters = Omit<PromotionHistoryFilters, 'page'>

/** The draft as it WOULD be sent — read from the inputs, not yet committed. */
function draftFilters(): HistoryFilters {
  return {
    site_id: siteId.value ?? undefined,
    from: from.value || undefined,
    to: to.value || undefined,
    search: search.value.trim() || undefined,
    status: status.value ?? undefined,
  }
}

/**
 * The COMMITTED filters — the only thing the API is ever given.
 *
 * Held separately from the inputs on purpose. Paging must not pick up edits the
 * admin has typed but not applied, which is exactly what would happen if each
 * request rebuilt its query from the refs at call time.
 */
const applied = ref<HistoryFilters>({})

/** Order-independent compare, so key order can never fake a difference. */
function sameFilters(a: HistoryFilters, b: HistoryFilters): boolean {
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined).sort()
  const kb = Object.keys(rb).filter((k) => rb[k] !== undefined).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && ra[k] === rb[k])
}

/** Unapplied edits are pending — drives the Apply button's enabled state. */
const isDirty = computed(() => !sameFilters(draftFilters(), applied.value))

/** Clear is offered whenever there is something to clear, drafted or applied. */
const hasFilters = computed(
  () =>
    Object.values(draftFilters()).some((v) => v !== undefined) ||
    Object.values(applied.value).some((v) => v !== undefined),
)

async function reload(): Promise<void> {
  loading.value = true
  try {
    const page = Math.floor(first.value / perPage.value) + 1
    // One filter object drives both calls, so the badge can never disagree with
    // the rows on screen. They run concurrently — the count never delays the list.
    const filters = applied.value
    const [res, count] = await Promise.all([
      listPromotionHistory({ page, ...filters }),
      // Never fatal: a COUNT over millions of history rows is the slowest thing
      // on this page, and it failing must not take the listing down with it —
      // the badge just falls back to "—".
      countPromotionHistory(filters).catch(() => null),
    ])
    items.value = res.data
    total.value = res.meta.total
    perPage.value = res.meta.per_page
    recordTotal.value = count
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load history.', life: 4000 })
  } finally {
    loading.value = false
  }
}

function onPage(state: PageState): void {
  first.value = state.first
  reload()
}

function resetToFirstAndReload(): void {
  first.value = 0
  reload()
}

/** Commit the draft and reload from page 1. */
function applyFilters(): void {
  applied.value = draftFilters()
  resetToFirstAndReload()
}

/**
 * Reset the inputs AND commit that reset.
 *
 * Clearing then applies straight away: a Clear that left the old results on
 * screen until a second click would read as broken.
 */
function clearFilters(): void {
  siteId.value = null
  from.value = ''
  to.value = ''
  search.value = ''
  status.value = null
  applyFilters()
}

onMounted(async () => {
  await sitesStore.fetchSites()
  await reload()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Promotion History</h2>
        <p class="text-sm text-gray-500">
          Every promotion email attempt — sent, failed, or skipped. Filter by site, date, and status, or search by the start of an email address.
        </p>
      </div>
      <RecordCount label="Total Promotion Histories" :total="recordTotal" :loading="loading" />
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-wrap items-end gap-2">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500">Site</label>
          <Select v-model="siteId" :options="siteOptions" option-label="label" option-value="value" placeholder="Site" class="w-52" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500">From</label>
          <input type="date" v-model="from" class="h-10 rounded-md border border-gray-300 px-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500">To</label>
          <input type="date" v-model="to" class="h-10 rounded-md border border-gray-300 px-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500">Status</label>
          <Select v-model="status" :options="statusOptions" option-label="label" option-value="value" placeholder="Status" class="w-40" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500">Email starts with</label>
          <InputText
            v-model="search"
            placeholder="e.g. john"
            class="w-56"
            @keyup.enter="applyFilters"
          />
        </div>
      </div>
      <!-- Apply is the ONLY thing that commits the draft. Disabled while the
           inputs match what is already on screen, so the button cannot be used
           to fire a redundant identical query. -->
      <Button
        label="Apply"
        icon="pi pi-filter"
        size="small"
        :disabled="!isDirty"
        :loading="loading"
        @click="applyFilters"
      />
      <Button
        v-if="hasFilters"
        label="Clear"
        icon="pi pi-filter-slash"
        text
        size="small"
        @click="clearFilters"
      />
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable :value="items" :loading="loading" striped-rows data-key="id" :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No delivery history matches these filters.</div>
        </template>

        <Column field="email" header="Email address">
          <template #body="{ data }: { data: PromotionEmailHistory }">
            <span class="text-gray-900">{{ data.email }}</span>
          </template>
        </Column>

        <Column header="Site" :style="{ width: '220px' }">
          <template #body="{ data }: { data: PromotionEmailHistory }">
            <span class="text-gray-700">{{ data.site?.name ?? '—' }}</span>
          </template>
        </Column>

        <Column header="Status" :style="{ width: '120px' }">
          <template #body="{ data }: { data: PromotionEmailHistory }">
            <Tag :value="data.status" :severity="statusSeverity[data.status]" class="capitalize" />
          </template>
        </Column>

        <Column header="Error" :style="{ width: '280px' }">
          <template #body="{ data }: { data: PromotionEmailHistory }">
            <span
              v-if="data.error"
              :title="data.error"
              class="block max-w-[16rem] truncate text-red-600"
            >{{ data.error }}</span>
            <span v-else class="text-gray-300">—</span>
          </template>
        </Column>

        <Column header="Sent date" :style="{ width: '160px' }">
          <template #body="{ data }: { data: PromotionEmailHistory }">
            <span class="text-gray-600">{{ data.sent_date }}</span>
          </template>
        </Column>

        <Column header="Recorded" :style="{ width: '180px' }">
          <template #body="{ data }: { data: PromotionEmailHistory }">
            <span class="text-gray-400">{{ formatDateTime(data.created_at) }}</span>
          </template>
        </Column>
      </DataTable>

      <Paginator
        v-if="total > perPage"
        :first="first"
        :rows="perPage"
        :total-records="total"
        @page="onPage"
      />
    </div>
  </div>
</template>
