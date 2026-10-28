<script setup lang="ts">
/**
 * Verify-email send history — the double opt-in confirmations.
 *
 * The first email a subscriber ever receives, and the one that decides whether
 * they are verified at all. Until this log existed, "I never got the
 * confirmation" could only be answered from the application log — so this
 * screen answers it instead: which address, for which site, accepted by the
 * transport or refused with which error.
 *
 * Read-only apart from the per-row delete, like every other history here: a row
 * records an ATTEMPT, and the public subscribe flow never aborts on one bad
 * address, so a failed row is the only place that failure is visible afterwards.
 *
 * Rows from the Verify Email screen's "Send test" button are tagged, because a
 * test is not evidence that a subscriber was asked to verify anything.
 */
import { ref, computed, onMounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/verifyEmailSends'
import HistoryDeleteButton from '@/components/HistoryDeleteButton.vue'
import RecordCount from '@/components/RecordCount.vue'
import { pageWindow, pagerMeta } from '@/utils/pagination'
import { useSitesStore } from '@/stores/sitesStore'
import type { VerifyEmailSend, VerifyEmailSendStatus } from '@shared/types/verifyEmailSend'

/** Rendered inside Email History; the tab already names the log. */
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const toast = useToast()
const sitesStore = useSitesStore()

const items = ref<VerifyEmailSend[]>([])
const loading = ref(false)

// ── Server-side pagination ────────────────────────────────────────────────────
// The table is `lazy`: it renders exactly the rows the API returned.
const page = ref(1)
const perPage = ref(50)
const meta = ref<{ total: number; last_page: number } | null>(null)
const totalRecords = computed(() => meta.value?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)

// From the dedicated COUNT endpoint, never from the listing response — the
// screen only ever holds one page.
const recordTotal = ref<number | null>(null)
const failedTotal = ref<number | null>(null)

// ── Filters ───────────────────────────────────────────────────────────────────
const search = ref('')
const siteId = ref<number | null>(null)
const status = ref<VerifyEmailSendStatus | null>(null)

const statusOptions: { label: string; value: VerifyEmailSendStatus | null }[] = [
  { label: 'All outcomes', value: null },
  { label: 'Sent', value: 'success' },
  { label: 'Failed', value: 'failed' },
]

const siteOptions = computed(() => [
  { label: 'All sites', value: null },
  ...sitesStore.sites.map((s) => ({ label: s.name, value: s.id as number | null })),
])

function activeFilters(): Record<string, unknown> {
  const filters: Record<string, unknown> = {}
  const term = search.value.trim()
  if (term !== '') filters.search = term
  if (siteId.value !== null) filters.site_id = siteId.value
  if (status.value !== null) filters.status = status.value
  return filters
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    const [list, counts] = await Promise.all([
      api.listVerifyEmailSends({ page: page.value, per_page: perPage.value, ...activeFilters() }),
      // Never fatal: a failed count must not take the listing down with it.
      api.countVerifyEmailSends(activeFilters()).catch(() => null),
    ])
    items.value = list.data
    // The listing carries no total (simple-paginated); the COUNT sizes the pager.
    meta.value = pagerMeta(pageWindow(list), counts?.total ?? null)
    perPage.value = list.meta.per_page
    recordTotal.value = counts?.total ?? null
    failedTotal.value = counts?.failed ?? null
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to load the verify-email history.',
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

// A changed filter always returns to page 1: staying on page 7 of a narrower
// result set shows an empty table under a paginator that claims otherwise.
watch([search, siteId, status], () => {
  page.value = 1
  void reload()
})

function formatDate(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })
    : '—'
}

onMounted(() => {
  void reload()
  // Never fatal: without the site list the filter falls back to "All sites".
  void sitesStore.fetchSites()
})
/**
 * Deleting one history row, wrapped for the template.
 *
 * The template cannot call `api.deleteVerifyEmailSend()` directly. `api` is a
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
const removeHistoryRow = (id: number) => api.deleteVerifyEmailSend(id)
</script>

<template>
  <div class="space-y-3">
    <div v-if="!props.embedded">
      <h2 class="text-lg font-semibold text-gray-900">Verify email history</h2>
      <p class="text-sm text-gray-500">
        Every confirmation email: the address, the site, and the failure when the transport
        refused it.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <InputText v-model="search" placeholder="Search by address" class="w-56" />
      <Select
        v-model="siteId"
        :options="siteOptions"
        option-label="label"
        option-value="value"
        class="w-48"
      />
      <Select
        v-model="status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        class="w-40"
      />
      <!-- Two numbers, because "how many failed" is the question this screen
           exists for and it must describe the FILTERED set, not the page. -->
      <div class="ml-auto flex items-center gap-3">
        <span v-if="failedTotal" class="text-sm font-semibold text-red-600">
          {{ failedTotal }} failed
        </span>
        <RecordCount label="Total Sends" :total="recordTotal" :loading="loading" />
      </div>
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
      :rows-per-page-options="[20, 50, 100]"
      current-page-report-template="{first}–{last} of {totalRecords}"
      :pt="{ root: { class: 'text-sm' } }"
      @page="onPage"
    >
      <template #empty>
        <div class="py-8 text-center text-sm text-gray-400">No verification emails sent yet.</div>
      </template>

      <Column field="email" header="Address">
        <template #body="{ data }: { data: VerifyEmailSend }">
          <span class="font-mono text-gray-900">{{ data.email }}</span>
          <!-- A "Send test", not a subscriber's confirmation. -->
          <Tag v-if="data.is_test" value="Test" severity="secondary" class="ml-2 align-middle" />
        </template>
      </Column>

      <Column header="Site" :style="{ width: '170px' }">
        <template #body="{ data }: { data: VerifyEmailSend }">
          <span class="text-gray-600">{{ data.site?.name ?? '—' }}</span>
        </template>
      </Column>

      <Column field="status" header="Result" :style="{ width: '110px' }">
        <template #body="{ data }: { data: VerifyEmailSend }">
          <Tag
            :severity="data.status === 'success' ? 'success' : 'danger'"
            :value="data.status === 'success' ? 'Sent' : 'Failed'"
          />
        </template>
      </Column>

      <Column header="Detail">
        <template #body="{ data }: { data: VerifyEmailSend }">
          <span v-if="data.status === 'failed'" class="text-red-700">{{ data.error }}</span>
          <!-- A deleted subscriber nulls the FK; the address above is the
               denormalised copy that keeps the row readable. -->
          <span v-else-if="data.newsletter_id === null" class="text-xs text-gray-400">
            subscriber removed
          </span>
          <span v-else class="text-gray-400">—</span>
        </template>
      </Column>

      <Column field="sent_at" header="When" :style="{ width: '180px' }">
        <template #body="{ data }: { data: VerifyEmailSend }">
          <span class="text-gray-600">{{ formatDate(data.sent_at) }}</span>
        </template>
      </Column>

      <Column header="" :style="{ width: '56px' }">
        <template #body="{ data }: { data: VerifyEmailSend }">
          <HistoryDeleteButton
            :label="data.email"
            :remove="() => removeHistoryRow(data.id)"
            @deleted="reload"
          />
        </template>
      </Column>
    </DataTable>
  </div>
</template>
