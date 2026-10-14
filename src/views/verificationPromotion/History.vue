<script setup lang="ts">
/**
 * Post-verification promotion history — who was mailed after confirming their
 * address, from which site's template, and whether it arrived.
 *
 * Read-only by design: this is the audit trail for a stream that sends with no
 * human pressing anything, so it is the only place a partial failure is ever
 * visible. A row exists for every ATTEMPT — the job never aborts a run on one
 * bad address.
 *
 * Deliberately the same shape as Warmup History: lazy DataTable, server-side
 * filters held as a DRAFT until Apply, and a dedicated COUNT endpoint so the
 * badge never rides on the paginated query.
 *
 * It reads the stream's own log rather than Promotion History. That shared table
 * is what the 24-hour dedup consults, but it has no stream column and merges a
 * campaign send with a post-verification send that reach one address on one day,
 * so it cannot answer the question this screen exists for.
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
import * as api from '@/api/verificationPromotion'
import RecordCount from '@/components/RecordCount.vue'
import { useSitesStore } from '@/stores/sitesStore'
import type {
  VerificationPromotionHistoryEntry,
  VerificationPromotionSendStatus,
} from '@shared/types/verificationPromotionEmail'

/**
 * Rendered inside the combined Email History section rather than on its own
 * route.
 *
 * Embedded, the tab already names this log and provides the way back, so the
 * screen drops its own heading and "Back" button. Everything else — the
 * filters, the paging, the counts — is identical, because this is the SAME
 * component rather than a copy of it.
 */
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const toast = useToast()
const router = useRouter()
const sitesStore = useSitesStore()

const items = ref<VerificationPromotionHistoryEntry[]>([])
const loading = ref(false)

// ── Server-side pagination ────────────────────────────────────────────────────
// The table is `lazy`: it renders exactly the rows the API returned. Paginating
// client-side would cap the list at whatever one API page contained.
const page = ref(1)
const perPage = ref(50)
const meta = ref<{ total: number; last_page: number } | null>(null)
const totalRecords = computed(() => meta.value?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)

// From the dedicated COUNT endpoint — never from the listing response, which
// only ever describes one page.
const recordTotal = ref<number | null>(null)
const failedTotal = ref<number | null>(null)

// ── Filters ───────────────────────────────────────────────────────────────────
// These inputs are a DRAFT. Nothing reaches the API until Apply is pressed, so a
// half-typed address or a half-picked date range never fires a query.
const search = ref('')
const siteId = ref<number | null>(null)
const status = ref<VerificationPromotionSendStatus | null>(null)
const sentFrom = ref('')
const sentTo = ref('')

const siteOptions = computed(() => [
  { label: 'All sites', value: null },
  ...sitesStore.sites.map((s) => ({ label: s.name, value: s.id as number | null })),
])

const statusOptions: { label: string; value: VerificationPromotionSendStatus | null }[] = [
  { label: 'All outcomes', value: null },
  { label: 'Sent', value: 'success' },
  { label: 'Failed', value: 'failed' },
]

type HistoryFilters = Omit<api.VerificationPromotionHistoryFilters, 'page' | 'per_page'>

/** The draft as it WOULD be sent — read from the inputs, not yet committed. */
function draftFilters(): HistoryFilters {
  const filters: HistoryFilters = {}
  const term = search.value.trim()
  if (term !== '') filters.search = term
  if (siteId.value !== null) filters.site_id = siteId.value
  if (status.value !== null) filters.status = status.value
  if (sentFrom.value !== '') filters.sent_from = sentFrom.value
  if (sentTo.value !== '') filters.sent_to = sentTo.value
  return filters
}

/**
 * The COMMITTED filters — the only thing the API is ever given.
 *
 * Held separately from the inputs on purpose: paging must not pick up edits the
 * admin has typed but not applied, which is what would happen if every request
 * rebuilt its query from the refs at call time.
 */
const applied = ref<HistoryFilters>({})

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
      api.listVerificationPromotionHistory({
        page: page.value,
        per_page: perPage.value,
        ...applied.value,
      }),
      // Never fatal: a failed count must not take the listing down with it.
      api.countVerificationPromotionHistory(applied.value).catch(() => null),
    ])
    items.value = list.data
    meta.value = { total: list.meta.total, last_page: list.meta.last_page }
    perPage.value = list.meta.per_page
    recordTotal.value = count?.total ?? null
    failedTotal.value = count?.failed ?? null
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to load the send history.',
      life: 4000,
    })
  } finally {
    loading.value = false
  }
}

async function onPage(event: { page: number; rows: number }): Promise<void> {
  page.value = event.page + 1 // PrimeVue is 0-based, Laravel is 1-based
  perPage.value = event.rows
  await reload()
}

/** Commit the draft and reload from page 1. */
async function applyFilters(): Promise<void> {
  applied.value = draftFilters()
  page.value = 1
  await reload()
}

/**
 * Reset the inputs AND commit that reset.
 *
 * Clearing applies straight away: a Clear that left the old results on screen
 * until a second click would read as broken.
 */
async function clearFilters(): Promise<void> {
  search.value = ''
  siteId.value = null
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
  await Promise.all([reload(), sitesStore.fetchSites()])
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header. Hidden when embedded: the tab is the title. -->
    <div v-if="!props.embedded" class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Post-verification history</h2>
        <p class="text-sm text-gray-500">
          Every promotion sent after a subscriber confirmed their address: who it went to, which
          site's template was used, and whether it arrived. Nobody presses send for this stream,
          so this log is the only place a failure shows up.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <RecordCount label="Total Sends" :total="recordTotal" :loading="loading" />
        <Button
          label="Back to settings"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          @click="router.push({ name: 'promotion-after-verification' })"
        />
      </div>
    </div>

    <!-- Failures, stated rather than left to be noticed. Counted over the whole
         filtered set, not the page. -->
    <div
      v-if="failedTotal !== null && failedTotal > 0"
      class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
    >
      <strong>{{ failedTotal }}</strong> of these attempts did not arrive. Filter by
      <strong>Failed</strong> to read the errors — each row carries what the transport said.
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
        v-model="status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        class="w-44"
        placeholder="All outcomes"
      />
      <!-- Native date inputs rather than a PrimeVue DatePicker: they emit exactly
           the YYYY-MM-DD the API expects, with no parsing or locale round-trip in
           between. `max`/`min` cross-bind the two so the range cannot be inverted
           into a query that can never match. -->
      <div class="flex items-center gap-2">
        <label class="text-xs font-medium text-gray-500" for="vp-sent-from">Sent from</label>
        <input
          id="vp-sent-from"
          v-model="sentFrom"
          type="date"
          :max="sentTo || undefined"
          class="h-10 rounded-md border border-gray-300 px-3 text-sm"
        />
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs font-medium text-gray-500" for="vp-sent-to">to</label>
        <input
          id="vp-sent-to"
          v-model="sentTo"
          type="date"
          :min="sentFrom || undefined"
          class="h-10 rounded-md border border-gray-300 px-3 text-sm"
        />
      </div>
      <!-- Apply is the ONLY thing that commits the draft. Disabled while the
           inputs match what is already on screen, so it cannot fire a redundant
           identical query. -->
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
                ? 'No sends match these filters.'
                : 'No post-verification promotions have been sent yet.'
            }}
          </div>
        </template>

        <Column field="email" header="Email address">
          <template #body="{ data }: { data: VerificationPromotionHistoryEntry }">
            <span class="text-gray-900">{{ data.email }}</span>
            <!-- The subscriber row is gone but the audit row survives it, which
                 is exactly what the denormalised email column is for. -->
            <span v-if="data.newsletter_id === null" class="ml-2 text-xs text-gray-400">
              (subscriber deleted)
            </span>
          </template>
        </Column>

        <Column header="Site" :style="{ width: '220px' }">
          <template #body="{ data }: { data: VerificationPromotionHistoryEntry }">
            <span v-if="data.site" class="text-gray-700">{{ data.site.name }}</span>
            <span v-else class="text-xs text-gray-400">Site deleted</span>
          </template>
        </Column>

        <Column header="Outcome" :style="{ width: '260px' }">
          <template #body="{ data }: { data: VerificationPromotionHistoryEntry }">
            <Tag
              :value="data.status === 'success' ? 'Sent' : 'Failed'"
              :severity="data.status === 'success' ? 'success' : 'danger'"
            />
            <!-- Truncated server-side; the title carries the rest. -->
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
          <template #body="{ data }: { data: VerificationPromotionHistoryEntry }">
            <span class="text-gray-600">{{ formatDate(data.sent_at) }}</span>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>
