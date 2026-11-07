<script setup lang="ts">
/**
 * Email History → Schedules: every address a Schedule Setting campaign sent to,
 * skipped or failed on — with the list it came from, the template and the
 * email config that carried it.
 *
 * The same shape as the other history tabs: draft filters committed by Apply,
 * a dedicated COUNT beside the simple-paginated listing, one-row delete.
 *
 * It replaced the old Promotion tab. That tab listed `promotion_email_histories`,
 * which knows only site + address; the table is still written for newsletter
 * sends, because the after-verification email's 24-hour dedup reads it, but it
 * no longer has a screen of its own.
 */
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Paginator, { type PageState } from 'primevue/paginator'
import { useToast } from 'primevue/usetoast'
import HistoryDeleteButton from '@/components/HistoryDeleteButton.vue'
import RecordCount from '@/components/RecordCount.vue'
import { useSitesStore } from '@/stores/sitesStore'
import { browserTimezone } from '@/utils/dayFilters'
import { pageWindow, pagerMeta } from '@/utils/pagination'
import {
  countScheduleHistory,
  deleteScheduleHistory,
  listScheduleHistory,
  listScheduleHistorySchedules,
  type ScheduleHistoryFilters,
} from '@/api/scheduleHistory'
import type { ScheduleAudience, ScheduleProvider } from '@shared/types/emailSchedule'
import type { ScheduleHistorySchedule, ScheduleSendHistory, ScheduleSendStatus } from '@shared/types/scheduleSendHistory'

const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const sitesStore = useSitesStore()
const toast = useToast()

const items = ref<ScheduleSendHistory[]>([])
const loading = ref(false)
const total = ref(0)
const perPage = ref(50)
const first = ref(0)
const recordTotal = ref<number | null>(null)
const schedules = ref<ScheduleHistorySchedule[]>([])

// ── Draft filters ────────────────────────────────────────────────────────────
const scheduleId = ref<number | null>(null)
const siteId = ref<number | null>(null)
const audience = ref<ScheduleAudience | null>(null)
const provider = ref<ScheduleProvider | null>(null)
const status = ref<ScheduleSendStatus | null>(null)
const from = ref('')
const to = ref('')
const search = ref('')

const scheduleOptions = computed(() => [
  { label: 'All schedules', value: null },
  ...schedules.value.map((s) => ({ label: s.name, value: s.id })),
])
const siteOptions = computed(() => [
  { label: 'All sites', value: null },
  ...sitesStore.sites.map((s) => ({ label: s.name, value: s.id })),
])
const audienceOptions: { label: string; value: ScheduleAudience | null }[] = [
  { label: 'All lists', value: null },
  { label: 'Newsletters', value: 'newsletters' },
  { label: 'Mailgun Receivers', value: 'mailgun_receivers' },
  { label: 'Sendgrid Receivers', value: 'sendgrid_receivers' },
  { label: 'Warmup', value: 'warmup' },
]
const providerOptions: { label: string; value: ScheduleProvider | null }[] = [
  { label: 'All configs', value: null },
  { label: 'SMTP (.env)', value: 'smtp' },
  { label: 'SendGrid', value: 'sendgrid' },
  { label: 'Mailgun', value: 'mailgun' },
]
const statusOptions: { label: string; value: ScheduleSendStatus | null }[] = [
  { label: 'All statuses', value: null },
  { label: 'Sent', value: 'sent' },
  { label: 'Failed', value: 'failed' },
  { label: 'Skipped', value: 'skipped' },
]
const statusSeverity: Record<ScheduleSendStatus, string> = {
  sent: 'success',
  failed: 'danger',
  skipped: 'secondary',
}

type Filters = Omit<ScheduleHistoryFilters, 'page' | 'per_page'>

function draftFilters(): Filters {
  return {
    schedule_id: scheduleId.value ?? undefined,
    site_id: siteId.value ?? undefined,
    audience: audience.value ?? undefined,
    provider: provider.value ?? undefined,
    status: status.value ?? undefined,
    from: from.value || undefined,
    to: to.value || undefined,
    search: search.value.trim() || undefined,
  }
}

/** The COMMITTED filters — paging never picks up edits that were not applied. */
const applied = ref<Filters>({})

function sameFilters(a: Filters, b: Filters): boolean {
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined).sort()
  const kb = Object.keys(rb).filter((k) => rb[k] !== undefined).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && ra[k] === rb[k])
}

const isDirty = computed(() => !sameFilters(draftFilters(), applied.value))
const hasFilters = computed(
  () =>
    Object.values(draftFilters()).some((v) => v !== undefined) ||
    Object.values(applied.value).some((v) => v !== undefined),
)

function formatDateTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    const page = Math.floor(first.value / perPage.value) + 1
    // The zone travels with both calls, so the day bounds — and the count —
    // are the operator's days.
    const filters = { ...applied.value, tz: browserTimezone() }
    const [res, count] = await Promise.all([
      listScheduleHistory({ page, per_page: perPage.value, ...filters }),
      // Never fatal: the badge falls back to "—" and the pager steps on.
      countScheduleHistory(filters).catch(() => null),
    ])
    items.value = res.data
    total.value = pagerMeta(pageWindow(res), count).total
    perPage.value = res.meta.per_page
    recordTotal.value = count
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load schedule history.', life: 4000 })
  } finally {
    loading.value = false
  }
}

function onPage(state: PageState): void {
  first.value = state.first
  perPage.value = state.rows
  void reload()
}

function applyFilters(): void {
  applied.value = draftFilters()
  first.value = 0
  void reload()
}

function clearFilters(): void {
  scheduleId.value = null
  siteId.value = null
  audience.value = null
  provider.value = null
  status.value = null
  from.value = ''
  to.value = ''
  search.value = ''
  applyFilters()
}

onMounted(async () => {
  await Promise.all([
    sitesStore.fetchSites().catch(() => undefined),
    // Never fatal: the filter just offers "All schedules".
    listScheduleHistorySchedules()
      .then((rows) => (schedules.value = rows))
      .catch(() => (schedules.value = [])),
  ])
  await reload()
})
</script>

<template>
  <div class="space-y-4">
    <div v-if="!props.embedded" class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Schedule History</h2>
        <p class="text-sm text-gray-500">Every address a schedule sent to, skipped or failed on.</p>
      </div>
      <RecordCount label="Schedule sends" :total="recordTotal" :loading="loading" />
    </div>
    <div v-else class="flex justify-end">
      <RecordCount label="Schedule sends" :total="recordTotal" :loading="loading" />
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-2">
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-500">Schedule</label>
        <Select v-model="scheduleId" :options="scheduleOptions" option-label="label" option-value="value" filter class="w-52" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-500">Site</label>
        <Select v-model="siteId" :options="siteOptions" option-label="label" option-value="value" filter class="w-44" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-500">List</label>
        <Select v-model="audience" :options="audienceOptions" option-label="label" option-value="value" class="w-48" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-500">Email config</label>
        <Select v-model="provider" :options="providerOptions" option-label="label" option-value="value" class="w-40" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-500">Status</label>
        <Select v-model="status" :options="statusOptions" option-label="label" option-value="value" class="w-36" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-500">From</label>
        <input v-model="from" type="date" class="h-10 rounded-md border border-gray-300 px-3 text-sm" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-500">To</label>
        <input v-model="to" type="date" class="h-10 rounded-md border border-gray-300 px-3 text-sm" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-500">Email starts with</label>
        <InputText v-model="search" placeholder="e.g. john" class="w-48" @keyup.enter="applyFilters" />
      </div>
      <Button label="Apply" icon="pi pi-filter" size="small" :disabled="!isDirty" :loading="loading" @click="applyFilters" />
      <Button v-if="hasFilters" label="Clear" icon="pi pi-filter-slash" text size="small" @click="clearFilters" />
    </div>

    <!-- Table -->
    <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <DataTable :value="items" :loading="loading" striped-rows data-key="id" :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No schedule sends match these filters.</div>
        </template>

        <Column header="Email address">
          <template #body="{ data }: { data: ScheduleSendHistory }">
            <span class="text-gray-900">{{ data.email }}</span>
          </template>
        </Column>
        <Column header="Schedule" :style="{ width: '170px' }">
          <template #body="{ data }: { data: ScheduleSendHistory }">
            <span class="text-gray-700">{{ data.schedule_name || (data.email_schedule_id ? `#${data.email_schedule_id}` : 'deleted') }}</span>
          </template>
        </Column>
        <Column header="Site / template" :style="{ width: '170px' }">
          <template #body="{ data }: { data: ScheduleSendHistory }">
            <span class="text-gray-700">{{ data.site_name ?? `#${data.site_id}` }}</span>
            <span class="block text-xs capitalize text-gray-400">{{ data.template }}</span>
          </template>
        </Column>
        <Column header="List" :style="{ width: '150px' }">
          <template #body="{ data }: { data: ScheduleSendHistory }">
            <span class="text-gray-700">{{ data.audience_label }}</span>
          </template>
        </Column>
        <Column header="Email config" :style="{ width: '200px' }">
          <template #body="{ data }: { data: ScheduleSendHistory }">
            <span class="text-gray-700">{{ data.credential_label }}</span>
            <span v-if="data.from_address" class="block text-xs text-gray-400">{{ data.from_address }}</span>
          </template>
        </Column>
        <Column header="Status" :style="{ width: '110px' }">
          <template #body="{ data }: { data: ScheduleSendHistory }">
            <Tag :value="data.status" :severity="statusSeverity[data.status]" class="capitalize" />
            <span v-if="data.error" :title="data.error" class="mt-1 block max-w-[10rem] truncate text-xs text-red-600">{{ data.error }}</span>
          </template>
        </Column>
        <Column header="Sent" :style="{ width: '150px' }">
          <template #body="{ data }: { data: ScheduleSendHistory }">
            <span class="text-gray-600">{{ formatDateTime(data.sent_at) }}</span>
          </template>
        </Column>
        <Column header="" :style="{ width: '56px' }">
          <template #body="{ data }: { data: ScheduleSendHistory }">
            <HistoryDeleteButton :label="data.email" :remove="() => deleteScheduleHistory(data.id)" @deleted="reload" />
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
