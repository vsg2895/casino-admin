<script setup lang="ts">
/**
 * SMS send history — what went to which number, through which Twilio
 * configuration, and the exact failure when Twilio refused it.
 *
 * Extracted from the dialog on the Newsletter Phones screen so it can be the
 * SMS tab of Email History as well. ONE implementation rendered in two places:
 * the dialog passes nothing, the tab passes `embedded`. Duplicating it would
 * have left two tables that drift the first time a column changes.
 *
 * Read-only, like every other history here: a row records an ATTEMPT, and a
 * bulk send never aborts on one bad number, so a failed row is the only place a
 * partial failure is visible afterwards.
 *
 * Filters apply AS TYPED rather than behind an Apply button — the behaviour the
 * dialog has always had, and the reason it keeps a short debounce-free pair of
 * controls: there are only two, and the result set is small enough that a
 * keystroke-driven reload is honest here.
 */
import { ref, computed, onMounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/newsletterPhones'
import RecordCount from '@/components/RecordCount.vue'
import type { PhoneSmsHistory } from '@shared/types/newsletterPhone'

/**
 * Rendered inside the combined Email History section rather than in the dialog
 * on the Newsletter Phones screen.
 *
 * The only difference is the heading: the tab already names this log, and the
 * dialog carries its own title bar.
 */
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const toast = useToast()

const items = ref<PhoneSmsHistory[]>([])
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

// ── Filters ───────────────────────────────────────────────────────────────────
const search = ref('')
const status = ref<'' | 'sent' | 'failed'>('')

const statusOptions = [
  { label: 'All outcomes', value: '' },
  { label: 'Sent', value: 'sent' },
  { label: 'Failed', value: 'failed' },
]

function activeFilters(): { search?: string; status?: 'sent' | 'failed' } {
  const params: { search?: string; status?: 'sent' | 'failed' } = {}
  const term = search.value.trim()
  if (term !== '') params.search = term
  if (status.value !== '') params.status = status.value
  return params
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    const [list, count] = await Promise.all([
      api.listSmsHistory({ page: page.value, per_page: perPage.value, ...activeFilters() }),
      // Never fatal: a failed count must not take the listing down with it.
      api.countSmsHistory(activeFilters()).catch(() => null),
    ])
    items.value = list.data
    meta.value = { total: list.meta.total, last_page: list.meta.last_page }
    perPage.value = list.meta.per_page
    recordTotal.value = count
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

// A changed filter always returns to page 1: staying on page 7 of a narrower
// result set shows an empty table under a paginator that claims otherwise.
watch([status, search], () => {
  page.value = 1
  void reload()
})

function formatDate(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })
    : '—'
}

onMounted(reload)

/** The dialog reopens on an existing instance, so it asks for a fresh page 1. */
defineExpose({
  refresh: async (): Promise<void> => {
    page.value = 1
    await reload()
  },
})
</script>

<template>
  <div class="space-y-3">
    <!-- Heading. Hidden when embedded: the tab is the title, and the dialog has
         its own header bar. -->
    <div v-if="!props.embedded" class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">SMS send history</h2>
        <p class="text-sm text-gray-500">
          Every SMS attempt: the number, whether Twilio accepted it, and the failure when it
          did not.
        </p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <InputText v-model="search" placeholder="Search by number" class="w-56" />
      <Select
        v-model="status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        class="w-40"
      />
      <RecordCount label="Total Attempts" :total="recordTotal" :loading="loading" class="ml-auto" />
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
        <div class="py-8 text-center text-sm text-gray-400">Nothing sent yet.</div>
      </template>

      <Column field="phone" header="Number" :style="{ width: '160px' }">
        <template #body="{ data }: { data: PhoneSmsHistory }">
          <span class="font-mono text-gray-900">{{ data.phone }}</span>
        </template>
      </Column>

      <Column field="status" header="Result" :style="{ width: '110px' }">
        <template #body="{ data }: { data: PhoneSmsHistory }">
          <Tag
            :severity="data.status === 'sent' ? 'success' : 'danger'"
            :value="data.status === 'sent' ? 'Sent' : 'Failed'"
          />
        </template>
      </Column>

      <Column header="Detail">
        <template #body="{ data }: { data: PhoneSmsHistory }">
          <span v-if="data.status === 'failed'" class="text-red-700">
            <span v-if="data.error_code" class="font-mono text-xs">{{ data.error_code }}</span>
            {{ data.error }}
          </span>
          <span v-else class="font-mono text-xs text-gray-500">{{ data.message_sid ?? '—' }}</span>
        </template>
      </Column>

      <Column header="Sent via" :style="{ width: '150px' }">
        <template #body="{ data }: { data: PhoneSmsHistory }">
          <span class="text-gray-600">{{ data.twilio_config?.name ?? '—' }}</span>
        </template>
      </Column>

      <Column field="created_at" header="When" :style="{ width: '170px' }">
        <template #body="{ data }: { data: PhoneSmsHistory }">
          <span class="text-gray-600">{{ formatDate(data.created_at) }}</span>
        </template>
      </Column>
    </DataTable>
  </div>
</template>
