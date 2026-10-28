<script setup lang="ts">
/**
 * UniOne send history — every run, what it was told to send, and what the API
 * actually accepted.
 *
 * The fifth log in Email History, and the only one whose unit is a RUN rather
 * than a recipient: UniOne takes batches of up to 500 addresses, so one row
 * here is a campaign and the numbers on it are totals. The per-chunk detail —
 * which batch failed, with which HTTP status and which API error code — is one
 * request away, behind the Detail button, because it is what an operator needs
 * exactly once per failed run and never otherwise.
 *
 * Read-only, like every other history here.
 *
 * ── Why there is no separate COUNT request ──────────────────────────────────
 *
 * The other four logs count rows that grow one per message, so their badge
 * comes from a dedicated COUNT endpoint rather than from the page in hand. A
 * run is a far rarer row — tens, not millions — so the paginator's own `total`
 * is both accurate and already paid for. One request, not two.
 */
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/unione'
import { handPageWindow, pagerMeta } from '@/utils/pagination'
import HistoryDeleteButton from '@/components/HistoryDeleteButton.vue'
import RecordCount from '@/components/RecordCount.vue'
import type { UniOneApiKey, UniOneSend } from '@shared/types/unione'

/**
 * Rendered inside the combined Email History section rather than on its own
 * route — the tab already names this log, so the screen drops its heading.
 */
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const toast = useToast()

const items = ref<UniOneSend[]>([])
const loading = ref(false)
const keys = ref<UniOneApiKey[]>([])

// ── Server-side pagination ────────────────────────────────────────────────────
// The table is `lazy`: it renders exactly the rows the API returned.
const page = ref(1)
const perPage = ref(25)
const meta = ref<{ total: number; last_page: number } | null>(null)
const totalRecords = computed(() => meta.value?.total ?? 0)
// The exact COUNT, for the badge — null while loading or if it failed, so the
// badge never quotes the paginator's estimate.
const recordTotal = ref<number | null>(null)
const first = computed(() => (page.value - 1) * perPage.value)

// ── Filters ───────────────────────────────────────────────────────────────────
// Applied on change rather than behind an Apply button: there are three of
// them, the result set is small, and the backend filters all three in one
// indexed query.
const search = ref('')
const status = ref<string | null>(null)
const keyId = ref<number | null>(null)

/** Taken from the rows the API actually returns, so an unexpected status from
 *  UniOne can still be filtered rather than silently missing from the list. */
const statusOptions = [
  { label: 'All outcomes', value: null },
  { label: 'Queued', value: 'queued' },
  { label: 'Sending', value: 'sending' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' },
]

const keyOptions = computed(() => [
  { label: 'All keys', value: null },
  ...keys.value.map((k) => ({ label: k.name, value: k.id as number | null })),
])

function activeFilters(): Record<string, unknown> {
  const filters: Record<string, unknown> = {}
  const term = search.value.trim()
  if (term !== '') filters.search = term
  if (status.value !== null) filters.status = status.value
  if (keyId.value !== null) filters.key_id = keyId.value
  return filters
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    // The listing carries no total (simple-paginated); the dedicated COUNT,
    // requested beside it, sizes the paginator and the badge. Never fatal.
    const [list, count] = await Promise.all([
      api.listSends({ page: page.value, per_page: perPage.value, ...activeFilters() }),
      api.countSends(activeFilters()).catch(() => null),
    ])
    items.value = list.data
    recordTotal.value = count
    meta.value = pagerMeta(handPageWindow(list), count)
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to load the UniOne send history.',
      life: 4000,
    })
  } finally {
    loading.value = false
  }
}

async function applyFilters(): Promise<void> {
  // A changed filter always returns to page 1: staying on page 7 of a narrower
  // result set shows an empty table under a paginator that claims otherwise.
  page.value = 1
  await reload()
}

async function onPage(event: { page: number; rows: number }): Promise<void> {
  page.value = event.page + 1 // PrimeVue is 0-based, Laravel is 1-based
  perPage.value = event.rows
  await reload()
}

// ── Detail ────────────────────────────────────────────────────────────────────
// Fetched per run, never with the listing: a run carries its chunks and up to
// 2000 failed addresses, and loading those for 25 rows nobody opened would be
// the whole page's cost spent on nothing.
const detail = ref<UniOneSend | null>(null)
const detailLoading = ref(false)

async function openDetail(row: UniOneSend): Promise<void> {
  detailLoading.value = true
  try {
    detail.value = await api.getSend(row.id)
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load that run.', life: 4000 })
  } finally {
    detailLoading.value = false
  }
}

function severityFor(value: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
  if (value === 'completed') return 'success'
  if (value === 'sending' || value === 'queued') return 'info'
  if (value === 'failed') return 'danger'
  if (value === 'cancelled') return 'secondary'
  return 'warn'
}

function formatDate(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
    : '—'
}

onMounted(async () => {
  await Promise.all([
    reload(),
    // Never fatal: without the key list the filter falls back to "All keys".
    api.listKeys().then((rows) => (keys.value = rows)).catch(() => undefined),
  ])
})

/** The dialog reopens on an existing instance, so it asks for a fresh page 1. */
defineExpose({
  refresh: async (): Promise<void> => {
    page.value = 1
    await reload()
  },
})
/**
 * Deleting one history row, wrapped for the template.
 *
 * The template cannot call `api.deleteSend()` directly. `api` is a
 * NAMESPACE import, and the SFC compiler treats a namespace binding used in a
 * template as a possible ref — so it emits an unwrap and the type-checker then
 * looks for `.value` on a module object:
 *
 *     Property 'value' does not exist on type 'typeof import(".../api/...")'
 *
 * A plain function declared in `<script setup>` is never unwrapped, so routing
 * the call through one keeps the namespace import for script code (where it
 * reads well) and gives the template something it can type.
 *
 * This surfaced only in the production Docker build: that image resolves
 * `vue-tsc` fresh, and the newer build classifies the binding differently from
 * the version in the local node_modules. See admin/README for the lockfile that
 * stops local and CI disagreeing about a toolchain version again.
 */
const removeHistoryRow = (id: number) => api.deleteSend(id)
</script>

<template>
  <div class="space-y-3">
    <div v-if="!props.embedded">
      <h2 class="text-lg font-semibold text-gray-900">UniOne send history</h2>
      <p class="text-sm text-gray-500">
        Every run: what it was asked to send, what UniOne accepted, and what failed.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <InputText
        v-model="search"
        placeholder="Search by subject"
        class="w-56"
        @keyup.enter="applyFilters"
      />
      <Select
        v-model="status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        class="w-44"
        @change="applyFilters"
      />
      <Select
        v-model="keyId"
        :options="keyOptions"
        option-label="label"
        option-value="value"
        class="w-48"
        @change="applyFilters"
      />
      <Button label="Apply" size="small" :loading="loading" @click="applyFilters" />
      <RecordCount label="Total Runs" :total="recordTotal" :loading="loading" class="ml-auto" />
    </div>

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
      :rows-per-page-options="[25, 50, 100]"
      current-page-report-template="{first}–{last} of {totalRecords}"
      :pt="{ root: { class: 'text-sm' } }"
      @page="onPage"
    >
      <template #empty>
        <div class="py-8 text-center text-sm text-gray-400">Nothing sent yet.</div>
      </template>

      <Column header="Subject">
        <template #body="{ data }: { data: UniOneSend }">
          <span class="font-medium text-gray-900">{{ data.subject }}</span>
          <!-- A run of one from the Send test button, not a campaign. -->
          <Tag v-if="data.is_test" value="Test" severity="secondary" class="ml-2 align-middle" />
          <p class="text-xs text-gray-400">{{ data.from_email }}</p>
        </template>
      </Column>

      <Column header="Key" :style="{ width: '150px' }">
        <template #body="{ data }: { data: UniOneSend }">
          <span class="text-gray-700">{{ data.key?.name ?? '—' }}</span>
          <p v-if="data.key" class="text-xs uppercase text-gray-400">{{ data.key.region }}</p>
        </template>
      </Column>

      <Column header="Status" :style="{ width: '120px' }">
        <template #body="{ data }: { data: UniOneSend }">
          <Tag :severity="severityFor(data.status)" :value="data.status" />
        </template>
      </Column>

      <!-- Accepted / failed out of eligible. Three numbers, because "sent 500"
           answers nothing on its own: the gap between requested and eligible is
           the cooldown doing its job, and the gap between eligible and accepted
           is UniOne refusing something. -->
      <Column header="Recipients" :style="{ width: '190px' }">
        <template #body="{ data }: { data: UniOneSend }">
          <span class="tabular-nums text-gray-700">
            {{ data.accepted_count }} / {{ data.eligible_count }}
          </span>
          <span v-if="data.failed_count > 0" class="ml-2 text-xs font-semibold text-red-600">
            {{ data.failed_count }} failed
          </span>
          <p class="text-xs text-gray-400">
            requested {{ data.requested_count }} · {{ data.chunk_count }} chunk(s)
          </p>
        </template>
      </Column>

      <Column header="When" :style="{ width: '150px' }">
        <template #body="{ data }: { data: UniOneSend }">
          <span class="text-gray-600">{{ formatDate(data.created_at) }}</span>
          <p v-if="data.completed_at" class="text-xs text-gray-400">
            done {{ formatDate(data.completed_at) }}
          </p>
        </template>
      </Column>

      <Column header="" :style="{ width: '140px' }">
        <template #body="{ data }: { data: UniOneSend }">
          <Button label="Detail" text size="small" @click="openDetail(data)" />
          <!-- Deleting a run takes its chunks and recipient rows with it. -->
          <HistoryDeleteButton
            :label="data.subject"
            :remove="() => removeHistoryRow(data.id)"
            @deleted="reload"
          />
        </template>
      </Column>
    </DataTable>

    <Dialog
      :visible="detail !== null"
      modal
      :header="detail?.subject ?? ''"
      :style="{ width: '760px' }"
      @update:visible="detail = null"
    >
      <div v-if="detail" class="space-y-4 text-sm">
        <div class="flex flex-wrap gap-4 text-gray-600">
          <span>Status: <Tag :severity="severityFor(detail.status)" :value="detail.status" /></span>
          <span>Accepted: <strong class="tabular-nums">{{ detail.accepted_count }}</strong></span>
          <span>Failed: <strong class="tabular-nums">{{ detail.failed_count }}</strong></span>
          <span>Cooldown: {{ detail.cooldown_days }} day(s)</span>
        </div>

        <p v-if="detail.error" class="rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {{ detail.error }}
        </p>

        <div v-if="detail.chunks?.length">
          <h3 class="mb-1 font-semibold text-gray-900">Chunks</h3>
          <DataTable :value="detail.chunks" data-key="chunk_index" striped-rows :pt="{ root: { class: 'text-xs' } }">
            <Column field="chunk_index" header="#" :style="{ width: '50px' }" />
            <Column field="status" header="Status" :style="{ width: '100px' }" />
            <Column field="recipient_count" header="Sent to" :style="{ width: '80px' }" />
            <Column field="accepted_count" header="Accepted" :style="{ width: '90px' }" />
            <Column field="failed_count" header="Failed" :style="{ width: '80px' }" />
            <Column field="http_status" header="HTTP" :style="{ width: '70px' }" />
            <Column field="api_error_code" header="API code" :style="{ width: '90px' }" />
            <Column field="error" header="Error" />
          </DataTable>
        </div>

        <div v-if="detail.failed_emails?.length">
          <h3 class="mb-1 font-semibold text-gray-900">
            Refused addresses ({{ detail.failed_emails.length }})
          </h3>
          <!-- Capped server-side at 2000; the list scrolls rather than growing
               the dialog past the viewport. -->
          <ul class="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 text-xs">
            <li v-for="row in detail.failed_emails" :key="row.email" class="flex justify-between gap-3">
              <span class="font-mono text-gray-700">{{ row.email }}</span>
              <span class="text-red-600">{{ row.reason ?? '—' }}</span>
            </li>
          </ul>
        </div>
      </div>

      <template #footer>
        <Button label="Close" text :loading="detailLoading" @click="detail = null" />
      </template>
    </Dialog>
  </div>
</template>
