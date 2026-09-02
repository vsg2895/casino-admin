<script setup lang="ts">
/**
 * Warmup delivery history — which address was mailed, from which site, with
 * which template, and when.
 *
 * Read-only by design: this is the audit trail the cooldown filter is judged
 * against, so nothing here edits it. A row exists for every ATTEMPT, delivered or
 * not — a batch never aborts on one bad address, so a failed row is the only
 * place a partial failure is visible afterwards.
 *
 * Follows the same shape as Promotion History and the phone SMS history: lazy
 * DataTable, server-side filters, and a dedicated COUNT endpoint for the badge.
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/warmupEmails'
import RecordCount from '@/components/RecordCount.vue'
import { useSitesStore } from '@/stores/sitesStore'
import type { WarmupHistoryEntry, WarmupSendStatus, WarmupTemplate } from '@shared/types/warmupEmail'

const toast = useToast()
const router = useRouter()
const sitesStore = useSitesStore()

const items = ref<WarmupHistoryEntry[]>([])
const loading = ref(false)

// ── Server-side pagination ────────────────────────────────────────────────────
// The table is `lazy`: it renders exactly the rows the API returned. Paginating
// client-side would cap the list at whatever one API page contained.
const page = ref(1)
const perPage = ref(50)
const meta = ref<{ total: number; last_page: number } | null>(null)
const totalRecords = computed(() => meta.value?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)

// Total from the dedicated COUNT endpoint — never from the listing response.
const recordTotal = ref<number | null>(null)

// ── Filters ───────────────────────────────────────────────────────────────────
// These inputs are a DRAFT. Nothing reaches the API until Apply is pressed, so
// a half-typed address or a half-picked date range never fires a query.
const search = ref('')
const siteId = ref<number | null>(null)
const template = ref<string | null>(null)
const status = ref<WarmupSendStatus | null>(null)
// `sent_at` range, as YYYY-MM-DD strings straight from <input type="date">.
const sentFrom = ref('')
const sentTo = ref('')
const templates = ref<WarmupTemplate[]>([])

const siteOptions = computed(() => [
  { label: 'All sites', value: null },
  ...sitesStore.sites.map((s) => ({ label: s.name, value: s.id as number | null })),
])

const templateOptions = computed(() => [
  { label: 'All templates', value: null },
  ...templates.value.map((t) => ({ label: t.label, value: t.value as string | null })),
])

const statusOptions: { label: string; value: WarmupSendStatus | null }[] = [
  { label: 'All outcomes', value: null },
  { label: 'Sent', value: 'sent' },
  { label: 'Failed', value: 'failed' },
]

type HistoryFilters = Omit<api.WarmupHistoryFilters, 'page' | 'per_page'>

/** The draft as it WOULD be sent — read from the inputs, not yet committed. */
function draftFilters(): HistoryFilters {
  const filters: HistoryFilters = {}
  const term = search.value.trim()
  if (term !== '') filters.search = term
  if (siteId.value !== null) filters.site_id = siteId.value
  if (template.value !== null) filters.template = template.value
  if (status.value !== null) filters.status = status.value
  if (sentFrom.value !== '') filters.sent_from = sentFrom.value
  if (sentTo.value !== '') filters.sent_to = sentTo.value
  return filters
}

/**
 * The COMMITTED filters — the only thing the API is ever given.
 *
 * Held separately from the inputs on purpose. Paging must not pick up edits the
 * admin has typed but not applied, which is exactly what would happen if each
 * request rebuilt its query from the refs at call time.
 */
const applied = ref<HistoryFilters>({})

/** One filter object drives the listing and the count, so they cannot disagree. */
function activeFilters(): HistoryFilters {
  return applied.value
}

/** Order-independent compare, so key order can never fake a difference. */
function sameFilters(a: HistoryFilters, b: HistoryFilters): boolean {
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const ka = Object.keys(ra).sort()
  const kb = Object.keys(rb).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && ra[k] === rb[k])
}

/** Unapplied edits are pending — drives the Apply button's enabled state. */
const isDirty = computed(() => !sameFilters(draftFilters(), applied.value))

/** Clear is offered whenever there is something to clear, drafted or applied. */
const hasFilters = computed(
  () => Object.keys(draftFilters()).length > 0 || Object.keys(applied.value).length > 0,
)

async function reload(): Promise<void> {
  loading.value = true
  try {
    const [list, count] = await Promise.all([
      api.listWarmupHistory({ page: page.value, per_page: perPage.value, ...activeFilters() }),
      // Never fatal: a failed count must not take the listing down with it.
      api.countWarmupHistory(activeFilters()).catch(() => null),
    ])
    items.value = list.data
    meta.value = { total: list.meta.total, last_page: list.meta.last_page }
    perPage.value = list.meta.per_page
    recordTotal.value = count
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to load the warmup history.',
      life: 4000,
    })
  } finally {
    loading.value = false
  }
}

async function reloadFromFirstPage(): Promise<void> {
  page.value = 1
  await reload()
}

async function onPage(event: { page: number; rows: number }): Promise<void> {
  page.value = event.page + 1 // PrimeVue is 0-based, Laravel is 1-based
  perPage.value = event.rows
  await reload()
}

/** Commit the draft and reload from page 1. */
async function applyFilters(): Promise<void> {
  applied.value = draftFilters()
  await reloadFromFirstPage()
}

/**
 * Reset the inputs AND commit that reset.
 *
 * Clearing then applies straight away: a Clear that left the old results on
 * screen until a second click would read as broken.
 */
async function clearFilters(): Promise<void> {
  search.value = ''
  siteId.value = null
  template.value = null
  status.value = null
  sentFrom.value = ''
  sentTo.value = ''
  await applyFilters()
}

function formatDate(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })
    : '—'
}

onMounted(async () => {
  await Promise.all([
    reload(),
    sitesStore.fetchSites(),
    api
      .listWarmupTemplates()
      .then(({ data }) => {
        templates.value = data
      })
      .catch(() => {
        templates.value = []
      }),
  ])
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Warmup history</h2>
        <p class="text-sm text-gray-500">
          Every warmup delivery attempt: the address, the site whose template was used, and when
          it was sent. This log is what the send cooldown is measured against.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <RecordCount label="Total Sends" :total="recordTotal" :loading="loading" />
        <Button
          label="Back to list"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          @click="router.push({ name: 'warmup' })"
        />
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3">
      <InputText
        v-model="search"
        placeholder="Search by email"
        class="w-64"
        @keyup.enter="applyFilters"
      />
      <Select
        v-model="siteId"
        :options="siteOptions"
        option-label="label"
        option-value="value"
        class="w-52"
        placeholder="All sites"
      />
      <Select
        v-model="template"
        :options="templateOptions"
        option-label="label"
        option-value="value"
        class="w-52"
        placeholder="All templates"
      />
      <Select
        v-model="status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        class="w-44"
        placeholder="All outcomes"
      />
      <!-- `sent_at` range. Native date inputs rather than a PrimeVue DatePicker:
           they emit exactly the YYYY-MM-DD the API expects, with no parsing or
           locale round-trip in between. `max`/`min` cross-bind the two so the
           range cannot be inverted into a query that can never match. -->
      <div class="flex items-center gap-2">
        <label class="text-xs font-medium text-gray-500" for="sent-from">Sent from</label>
        <input
          id="sent-from"
          v-model="sentFrom"
          type="date"
          :max="sentTo || undefined"
          class="h-10 rounded-md border border-gray-300 px-3 text-sm"
        />
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs font-medium text-gray-500" for="sent-to">to</label>
        <input
          id="sent-to"
          v-model="sentTo"
          type="date"
          :min="sentFrom || undefined"
          class="h-10 rounded-md border border-gray-300 px-3 text-sm"
        />
      </div>
      <!-- Apply is the ONLY thing that commits the draft. Disabled while the
           inputs match what is already on screen, so the button cannot be used
           to fire a redundant identical query. -->
      <Button
        label="Apply"
        icon="pi pi-filter"
        :disabled="!isDirty"
        :loading="loading"
        @click="applyFilters"
      />
      <Button
        v-if="hasFilters"
        label="Clear"
        icon="pi pi-filter-slash"
        text
        severity="secondary"
        @click="clearFilters"
      />
    </div>

    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable
        :value="items"
        :loading="loading"
        data-key="id"
        striped-rows
        lazy
        paginator
        :rows="perPage"
        :first="first"
        :total-records="totalRecords"
        :rows-per-page-options="[20, 50, 100, 200]"
        current-page-report-template="{first}–{last} of {totalRecords}"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport"
        :pt="{ root: { class: 'text-sm' } }"
        @page="onPage"
      >
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">
            {{
              hasFilters
                ? 'No warmup sends match these filters.'
                : 'No warmup emails have been sent yet.'
            }}
          </div>
        </template>

        <Column field="email" header="Email address">
          <template #body="{ data }: { data: WarmupHistoryEntry }">
            <span class="text-gray-900">{{ data.email }}</span>
            <!-- The address row is gone but the audit row survives it, which is
                 exactly what the denormalised email column is for. -->
            <span v-if="data.warmup_email_id === null" class="ml-2 text-xs text-gray-400">
              (removed from list)
            </span>
          </template>
        </Column>

        <Column header="Site" :style="{ width: '190px' }">
          <template #body="{ data }: { data: WarmupHistoryEntry }">
            <span v-if="data.site" class="text-gray-700">{{ data.site.name }}</span>
            <span v-else class="text-xs text-gray-400">Site deleted</span>
          </template>
        </Column>

        <Column header="Template" :style="{ width: '190px' }">
          <template #body="{ data }: { data: WarmupHistoryEntry }">
            <span class="text-gray-700">{{ data.template_label }}</span>
          </template>
        </Column>

        <Column header="Outcome" :style="{ width: '150px' }">
          <template #body="{ data }: { data: WarmupHistoryEntry }">
            <Tag
              :value="data.status === 'sent' ? 'Sent' : 'Failed'"
              :severity="data.status === 'sent' ? 'success' : 'danger'"
            />
            <!-- Truncated server-side to 1000 chars; the title carries the rest. -->
            <p
              v-if="data.error"
              class="mt-1 max-w-[16rem] truncate text-xs text-red-600"
              :title="data.error"
            >
              {{ data.error }}
            </p>
          </template>
        </Column>

        <Column header="Sent at" :style="{ width: '200px' }">
          <template #body="{ data }: { data: WarmupHistoryEntry }">
            <span class="text-gray-600">{{ formatDate(data.sent_at) }}</span>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>
