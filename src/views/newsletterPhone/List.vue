<script setup lang="ts">
/**
 * Newsletters Based on Phone — a STANDALONE admin section.
 *
 * Backed entirely by `newsletters_based_on_phone`. It shares no query, no store
 * and no endpoint with the email Newsletter section, and nothing here reads
 * client data.
 *
 * The date filters, the recipient preview and the send all speak to the same
 * server-side resolver, so the number in the send dialog is the number that
 * actually gets messaged rather than a separate estimate.
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import type { DataTableSortEvent } from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import InputNumber from 'primevue/inputnumber'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import * as api from '@/api/newsletterPhones'
import { listTwilioConfigs } from '@/api/twilioConfigs'
import { listSmsTemplates } from '@/api/smsTemplates'
import { segmentCount, segmentSummary } from '@/utils/smsSegments'
import RecordCount from '@/components/RecordCount.vue'
import type { SmsTemplate } from '@shared/types/smsTemplate'
import type {
  NewsletterPhone,
  PhoneDateMode,
  PhoneImportProgress,
  PhoneRecipientPreview,
  PhoneSmsHistory,
} from '@shared/types/newsletterPhone'
import type { TwilioConfig } from '@shared/types/twilioConfig'
import type { ErrorResponse } from '@shared/types/api'

const toast = useToast()

const items = ref<NewsletterPhone[]>([])
const loading = ref(false)
const selected = ref<NewsletterPhone[]>([])
const selectedIds = computed(() => selected.value.map((p) => p.id))

// ── Server-side pagination ────────────────────────────────────────────────────
// The table is `lazy`: it renders exactly the rows the API returned. Paginating
// client-side would cap the list at whatever one API page contained — the bug
// that made a 50k email import look like three pages.
const page = ref(1)
const perPage = ref(50)
const meta = ref<{ total: number; last_page: number } | null>(null)
const totalRecords = computed(() => meta.value?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)

// Totals from the dedicated COUNT endpoint — never derived from the listing
// response, which only ever describes one page.
const recordTotal = ref<number | null>(null)

// How many of those a send would actually reach: the same filters, minus anyone
// opted out. Shown next to the total because the gap between the two is the
// thing an admin needs to see BEFORE opening the send dialog — "12,480 numbers,
// 11,902 sendable" answers a question the raw total cannot.
const sendableTotal = ref<number | null>(null)

// ── Filters ───────────────────────────────────────────────────────────────────
const search = ref('')
const dateMode = ref<PhoneDateMode | null>(null)
const dateFrom = ref<string | null>(null)
const dateTo = ref<string | null>(null)
// Tri-state: '' = all, 'false' = subscribed only, 'true' = opted out only.
const optedOut = ref<'' | 'true' | 'false'>('')
const sortBy = ref<'created_at' | 'phone' | 'opted_out'>('created_at')
const sortDir = ref<'asc' | 'desc'>('desc')

let searchTimer: ReturnType<typeof setTimeout> | undefined

const dateModeOptions: Array<{ label: string; value: PhoneDateMode | null }> = [
  { label: 'Any time', value: null },
  { label: 'Added today', value: 'today' },
  { label: 'Added yesterday', value: 'yesterday' },
  { label: 'Added last week', value: 'last_week' },
  { label: 'Added last month', value: 'last_month' },
  { label: 'Added last quarter', value: 'last_quarter' },
  { label: 'Added last year', value: 'last_year' },
  { label: 'Added on…', value: 'on' },
  { label: 'Added before…', value: 'before' },
  { label: 'Added after…', value: 'after' },
  { label: 'Added between…', value: 'range' },
]

const optedOutOptions = [
  { label: 'All numbers', value: '' },
  { label: 'Subscribed only', value: 'false' },
  { label: 'Opted out only', value: 'true' },
]

// Which date inputs the selected mode needs.
const needsDateFrom = computed(() =>
  dateMode.value !== null && ['on', 'before', 'after', 'range'].includes(dateMode.value),
)
const needsDateTo = computed(() => dateMode.value === 'range')

/**
 * The active filters, as the query object every request shares.
 *
 * One builder for the listing, the count, the export and the send preview, so a
 * badge can never disagree with the rows on screen. Empty values are omitted
 * rather than sent as null — `opted_out=false` means "subscribed only" on the
 * server, which is not the same as "all".
 */
function audienceFilters(): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  const term = search.value.trim()

  if (term !== '') params.search = term
  if (dateMode.value !== null) params.mode = dateMode.value
  if (dateFrom.value) params.date_from = dateFrom.value
  if (needsDateTo.value && dateTo.value) params.date_to = dateTo.value

  return params
}

function listFilters(): Record<string, string | number> {
  const params = audienceFilters()
  if (optedOut.value !== '') params.opted_out = optedOut.value
  return params
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    // All three concurrent — neither count delays the list.
    const [list, count, sendable] = await Promise.all([
      api.listNewsletterPhones({
        page: page.value,
        per_page: perPage.value,
        sort_by: sortBy.value,
        sort_dir: sortDir.value,
        ...listFilters(),
      }),
      // Never fatal: a failed count must not take the listing down with it.
      api.countNewsletterPhones(listFilters()).catch(() => null),
      // Deliberately audienceFilters(), NOT listFilters(): the sendable figure
      // forces opted_out=false rather than inheriting whatever the Status filter
      // is set to, so it stays "who a send reaches" even while the admin is
      // looking at the opted-out rows.
      api.countNewsletterPhones({ ...audienceFilters(), opted_out: false }).catch(() => null),
    ])
    items.value = list.data
    meta.value = { total: list.meta.total, last_page: list.meta.last_page }
    perPage.value = list.meta.per_page
    recordTotal.value = count
    sendableTotal.value = sendable
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load the phone list.', life: 4000 })
  } finally {
    loading.value = false
  }
}

async function reloadFromFirstPage(): Promise<void> {
  page.value = 1
  selected.value = []
  await reload()
}

async function onPage(event: { page: number; rows: number }): Promise<void> {
  page.value = event.page + 1 // PrimeVue is 0-based, Laravel is 1-based
  perPage.value = event.rows
  selected.value = [] // selection is per page — never carry it across
  await reload()
}

/**
 * Sorting is server-side, so the whitelist here has to match the controller's.
 *
 * PrimeVue types `sortField` as `string | ((item) => string) | undefined`, since a
 * column may sort by a function. Narrowing to our three known columns handles
 * that and rejects anything the API would ignore anyway.
 */
async function onSort(event: DataTableSortEvent): Promise<void> {
  const field = event.sortField
  if (typeof field !== 'string') return
  if (field !== 'created_at' && field !== 'phone' && field !== 'opted_out') return

  sortBy.value = field
  sortDir.value = event.sortOrder === 1 ? 'asc' : 'desc'
  await reloadFromFirstPage()
}

watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(reloadFromFirstPage, 400)
})

watch([dateMode, dateFrom, dateTo, optedOut], () => {
  // A mode that needs a date does nothing until one is picked — reloading on
  // every keystroke of a half-typed date would just flicker the table.
  if (needsDateFrom.value && !dateFrom.value) return
  void reloadFromFirstPage()
})

function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function extractError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as ErrorResponse | undefined
    return data?.errors?.phone?.[0] ?? data?.errors?.body?.[0] ?? data?.message ?? fallback
  }
  return fallback
}

// ── Create / edit ─────────────────────────────────────────────────────────────
const showForm = ref(false)
const editingId = ref<number | null>(null)
const formPhone = ref('')
const formOptedOut = ref(false)
const saving = ref(false)

function openCreate(): void {
  editingId.value = null
  formPhone.value = ''
  formOptedOut.value = false
  showForm.value = true
}

function openEdit(row: NewsletterPhone): void {
  editingId.value = row.id
  formPhone.value = row.phone
  formOptedOut.value = row.opted_out
  showForm.value = true
}

async function save(): Promise<void> {
  if (formPhone.value.trim() === '') return
  saving.value = true
  try {
    if (editingId.value === null) {
      await api.createNewsletterPhone(formPhone.value.trim())
      toast.add({ severity: 'success', summary: 'Added', detail: 'Number added.', life: 2500 })
    } else {
      await api.updateNewsletterPhone(editingId.value, {
        phone: formPhone.value.trim(),
        opted_out: formOptedOut.value,
      })
      toast.add({ severity: 'success', summary: 'Saved', detail: 'Number updated.', life: 2500 })
    }
    showForm.value = false
    await reload()
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: 'Error', detail: extractError(e, 'Could not save the number.'), life: 6000 })
  } finally {
    saving.value = false
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
const deleting = ref<NewsletterPhone | null>(null)
const showBulkDelete = ref(false)
const showDeleteAll = ref(false)
const actionLoading = ref(false)

async function run(fn: () => Promise<void>): Promise<void> {
  actionLoading.value = true
  try {
    await fn()
    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Action failed. Please try again.', life: 4000 })
  } finally {
    actionLoading.value = false
  }
}

function confirmDelete(): Promise<void> {
  return run(async () => {
    if (!deleting.value) return
    await api.deleteNewsletterPhone(deleting.value.id)
    deleting.value = null
    selected.value = []
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Number removed.', life: 2500 })
  })
}

function confirmBulkDelete(): Promise<void> {
  return run(async () => {
    const { deleted } = await api.bulkDeleteNewsletterPhones(selectedIds.value)
    selected.value = []
    showBulkDelete.value = false
    toast.add({ severity: 'success', summary: 'Deleted', detail: `${deleted} number(s) removed.`, life: 2500 })
  })
}

function confirmDeleteAll(): Promise<void> {
  return run(async () => {
    const { deleted } = await api.deleteAllNewsletterPhones(listFilters())
    selected.value = []
    showDeleteAll.value = false
    toast.add({ severity: 'success', summary: 'Deleted', detail: `${deleted} number(s) removed.`, life: 3500 })
  })
}

// ── Excel / CSV import ────────────────────────────────────────────────────────
// Queued on the `high` queue, so the response is a status record and the panel
// polls until it finishes. A 50k-row file must never be parsed in the request.
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const importProgress = ref<PhoneImportProgress | null>(null)
const showImportModal = ref(false)
const pendingFile = ref<File | null>(null)
let pollTimer: ReturnType<typeof setTimeout> | undefined

function triggerImport(): void {
  fileInput.value?.click()
}

/**
 * Picking a file only STAGES it — the upload waits for a confirmation, matching
 * the subscriber import.
 *
 * Worth the extra click: this action adds tens of thousands of rows from whatever
 * was selected, and a mis-click in a file dialog is easy. The email import has the
 * same step because it also has settings to choose; here there is nothing to
 * configure, so the dialog is purely "is this the right file?".
 */
function onFileSelected(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-picking the same file
  if (!file) return

  pendingFile.value = file
  importProgress.value = null
  showImportModal.value = true
}

function closeImportModal(): void {
  if (importing.value) return // never abandon a run in flight
  showImportModal.value = false
  pendingFile.value = null
}

async function runImport(): Promise<void> {
  if (!pendingFile.value) return

  importing.value = true
  importProgress.value = null
  try {
    const staged = await api.importNewsletterPhones(pendingFile.value)
    importProgress.value = staged
    if (staged.finished) {
      await finishImport(staged)
    } else {
      pollImport(staged.import_id)
    }
  } catch (e: unknown) {
    importing.value = false
    toast.add({
      severity: 'error',
      summary: 'Import failed',
      detail: extractError(e, 'The file could not be imported.'),
      life: 6000,
    })
  }
}

function pollImport(importId: number): void {
  pollTimer = setTimeout(async () => {
    try {
      const progress = await api.getPhoneImportStatus(importId)
      importProgress.value = progress
      if (progress.finished) {
        await finishImport(progress)
      } else {
        pollImport(importId)
      }
    } catch {
      // A dropped poll is not a failed import — the job keeps running. Stop
      // polling rather than claiming something went wrong.
      importing.value = false
      closeImportModal()
      toast.add({
        severity: 'warn',
        summary: 'Lost track of the import',
        detail: 'It is still running on the server. Refresh the list in a moment.',
        life: 6000,
      })
    }
  }, 1500)
}

async function finishImport(progress: PhoneImportProgress): Promise<void> {
  importing.value = false
  closeImportModal()
  toast.add({
    severity: progress.status === 'failed' ? 'error' : 'success',
    summary: progress.status === 'failed' ? 'Import failed' : 'Import complete',
    detail: progress.message,
    life: 7000,
  })
  await reloadFromFirstPage()
}

onUnmounted(() => {
  clearTimeout(pollTimer)
  clearTimeout(searchTimer)
})

// ── Bulk SMS ──────────────────────────────────────────────────────────────────
const showSend = ref(false)
const sendBody = ref('')
const sendLimit = ref<number | null>(null)
const twilioConfigId = ref<number | null>(null)
const configs = ref<TwilioConfig[]>([])
const preview = ref<PhoneRecipientPreview | null>(null)
const previewLoading = ref(false)
const sending = ref(false)

const configOptions = computed(() =>
  configs.value.map((c) => ({
    label: c.has_sender ? `${c.name} (${c.sender})` : `${c.name} — no sender configured`,
    value: c.id,
    disabled: !c.has_sender,
  })),
)

// Cost feedback, from the shared rule the template editor also uses — the two
// screens must never disagree about what a message costs.
const segments = computed(() => segmentCount(sendBody.value))
const bodySummary = computed(() => segmentSummary(sendBody.value))

// ── Templates ─────────────────────────────────────────────────────────────────
// A template PREFILLS the compose box; it is not the payload. What is in the box
// when you press send is what gets transmitted and recorded, so editing a
// template later never alters a queued run or rewrites history.
const templates = ref<SmsTemplate[]>([])
const selectedTemplateId = ref<number | null>(null)

const templateOptions = computed(() =>
  templates.value.map((t) => ({
    label: t.segments > 1 ? `${t.name} (${t.segments} segments)` : t.name,
    value: t.id,
  })),
)

async function loadTemplates(): Promise<void> {
  try {
    // Active only: a deactivated template is retired from the picker without
    // being deleted.
    const { data } = await listSmsTemplates({ status: 'active' })
    templates.value = data
  } catch {
    // Non-fatal — the message can still be typed by hand.
    templates.value = []
  }
}

function applyTemplate(id: number | null): void {
  const template = templates.value.find((t) => t.id === id)
  if (template) sendBody.value = template.body
}

async function loadConfigs(): Promise<void> {
  try {
    const { data } = await listTwilioConfigs({ status: 'active' })
    configs.value = data
    // Preselect the only usable credential — with one account configured,
    // choosing it is not a decision.
    const usable = data.filter((c) => c.has_sender)
    if (usable.length === 1) twilioConfigId.value = usable[0].id
  } catch {
    toast.add({
      severity: 'warn',
      summary: 'Twilio',
      detail: 'Could not load Twilio configurations.',
      life: 4000,
    })
  }
}

/** Who the send would reach — the same query the send itself runs. */
async function refreshPreview(): Promise<void> {
  previewLoading.value = true
  try {
    const params = audienceFilters()
    if (sendLimit.value && sendLimit.value > 0) params.limit = sendLimit.value
    preview.value = await api.previewSmsRecipients(params)
  } catch {
    preview.value = null
  } finally {
    previewLoading.value = false
  }
}

async function openSend(): Promise<void> {
  showSend.value = true
  sendBody.value = ''
  sendLimit.value = null
  selectedTemplateId.value = null
  // Refetched on open, not just at mount: a template edited in the other tab
  // must be picked up without reloading the page — that is the whole point of
  // templates being editable.
  await Promise.all([refreshPreview(), loadTemplates()])
}

watch(sendLimit, () => {
  if (showSend.value) void refreshPreview()
})

async function send(): Promise<void> {
  if (twilioConfigId.value === null || sendBody.value.trim() === '') return
  sending.value = true
  try {
    const payload = {
      twilio_config_id: twilioConfigId.value,
      body: sendBody.value.trim(),
      ...audienceFilters(),
      ...(sendLimit.value && sendLimit.value > 0 ? { limit: sendLimit.value } : {}),
    }
    const res = await api.sendBulkSms(payload)
    toast.add({ severity: 'success', summary: 'Queued', detail: res.message, life: 7000 })
    showSend.value = false
  } catch (e: unknown) {
    // 409 means a run is already in flight — a real, expected outcome rather
    // than an error, so it reads as a warning.
    const conflict = axios.isAxiosError(e) && e.response?.status === 409
    toast.add({
      severity: conflict ? 'warn' : 'error',
      summary: conflict ? 'Already running' : 'Not queued',
      detail: extractError(e, 'Could not queue the SMS run.'),
      life: 7000,
    })
  } finally {
    sending.value = false
  }
}

// ── Send history ──────────────────────────────────────────────────────────────
const showHistory = ref(false)
const history = ref<PhoneSmsHistory[]>([])
const historyLoading = ref(false)
const historyPage = ref(1)
const historyPerPage = ref(50)
const historyMeta = ref<{ total: number; last_page: number } | null>(null)
const historyTotal = ref<number | null>(null)
const historyStatus = ref<'' | 'sent' | 'failed'>('')
const historySearch = ref('')

const historyFirst = computed(() => (historyPage.value - 1) * historyPerPage.value)
const historyRecords = computed(() => historyMeta.value?.total ?? 0)

const historyStatusOptions = [
  { label: 'All', value: '' },
  { label: 'Sent', value: 'sent' },
  { label: 'Failed', value: 'failed' },
]

function historyFilters(): { search?: string; status?: 'sent' | 'failed' } {
  const params: { search?: string; status?: 'sent' | 'failed' } = {}
  const term = historySearch.value.trim()
  if (term !== '') params.search = term
  if (historyStatus.value !== '') params.status = historyStatus.value
  return params
}

async function loadHistory(): Promise<void> {
  historyLoading.value = true
  try {
    const [list, count] = await Promise.all([
      api.listSmsHistory({
        page: historyPage.value,
        per_page: historyPerPage.value,
        ...historyFilters(),
      }),
      api.countSmsHistory(historyFilters()).catch(() => null),
    ])
    history.value = list.data
    historyMeta.value = { total: list.meta.total, last_page: list.meta.last_page }
    historyPerPage.value = list.meta.per_page
    historyTotal.value = count
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load the send history.', life: 4000 })
  } finally {
    historyLoading.value = false
  }
}

async function openHistory(): Promise<void> {
  showHistory.value = true
  historyPage.value = 1
  await loadHistory()
}

async function onHistoryPage(event: { page: number; rows: number }): Promise<void> {
  historyPage.value = event.page + 1
  historyPerPage.value = event.rows
  await loadHistory()
}

watch([historyStatus, historySearch], () => {
  if (!showHistory.value) return
  historyPage.value = 1
  void loadHistory()
})

onMounted(async () => {
  await Promise.all([reload(), loadConfigs(), loadTemplates()])
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Newsletters Based on Phone</h2>
        <p class="text-sm text-gray-500">
          A standalone SMS list. Numbers are stored in international (E.164) format and messaged
          through a Twilio configuration you choose at send time.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <RecordCount label="Total Numbers" :total="recordTotal" :loading="loading" />
        <RecordCount label="Sendable" :total="sendableTotal" :loading="loading" />
        <Button label="History" icon="pi pi-history" severity="secondary" outlined @click="openHistory" />
        <Button
          label="Import Excel"
          icon="pi pi-upload"
          severity="secondary"
          outlined
          :loading="importing"
          v-tooltip.top="'Upload an .xlsx or .csv with a Phone column'"
          @click="triggerImport"
        />
        <Button label="Send SMS" icon="pi pi-comment" severity="secondary" outlined @click="openSend" />
        <Button label="Add number" icon="pi pi-plus" @click="openCreate" />
      </div>
    </div>

    <input ref="fileInput" type="file" accept=".xlsx,.csv" class="hidden" @change="onFileSelected" />

    <!-- Import progress / result -->
    <div
      v-if="importProgress"
      class="rounded-lg border px-4 py-3 text-sm"
      :class="
        importProgress.status === 'failed'
          ? 'border-red-100 bg-red-50 text-red-800'
          : 'border-indigo-100 bg-indigo-50 text-indigo-800'
      "
    >
      <span class="font-medium">
        {{ importProgress.finished ? 'Last import:' : 'Importing…' }}
      </span>
      {{ importProgress.total }} row(s) read ·
      <span class="font-semibold">{{ importProgress.imported }}</span> imported ·
      {{ importProgress.skipped }} duplicate(s) ·
      {{ importProgress.invalid }} invalid
      <span v-if="importProgress.error" class="block mt-1">{{ importProgress.error }}</span>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">Search</label>
        <InputText v-model="search" placeholder="Any part of the number" class="w-56" />
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">Date added</label>
        <Select
          v-model="dateMode"
          :options="dateModeOptions"
          option-label="label"
          option-value="value"
          class="w-48"
        />
      </div>

      <div v-if="needsDateFrom">
        <label class="mb-1 block text-xs font-medium text-gray-600">
          {{ dateMode === 'range' ? 'From' : 'Date' }}
        </label>
        <input
          v-model="dateFrom"
          type="date"
          class="h-10 w-40 rounded-md border border-gray-300 px-3 text-sm"
        />
      </div>

      <div v-if="needsDateTo">
        <label class="mb-1 block text-xs font-medium text-gray-600">To</label>
        <input
          v-model="dateTo"
          type="date"
          class="h-10 w-40 rounded-md border border-gray-300 px-3 text-sm"
        />
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">Status</label>
        <Select
          v-model="optedOut"
          :options="optedOutOptions"
          option-label="label"
          option-value="value"
          class="w-44"
        />
      </div>

      <div class="ml-auto flex items-center gap-2">
        <Button
          v-if="selectedIds.length > 0"
          :label="`Delete selected (${selectedIds.length})`"
          icon="pi pi-trash"
          severity="danger"
          outlined
          :loading="actionLoading"
          @click="showBulkDelete = true"
        />
        <Button
          label="Delete filtered"
          icon="pi pi-trash"
          severity="danger"
          text
          :disabled="totalRecords === 0"
          @click="showDeleteAll = true"
        />
      </div>
    </div>

    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable
        v-model:selection="selected"
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
        :sort-field="sortBy"
        :sort-order="sortDir === 'asc' ? 1 : -1"
        :pt="{ root: { class: 'text-sm' } }"
        @page="onPage"
        @sort="onSort"
      >
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">
            No phone numbers match. Add one, or import a spreadsheet with a "Phone" column.
          </div>
        </template>

        <Column selection-mode="multiple" :style="{ width: '3rem' }" />

        <Column field="phone" header="Phone number" sortable>
          <template #body="{ data }: { data: NewsletterPhone }">
            <span class="font-mono text-gray-900">{{ data.phone }}</span>
          </template>
        </Column>

        <Column field="opted_out" header="Status" sortable :style="{ width: '160px' }">
          <template #body="{ data }: { data: NewsletterPhone }">
            <Tag
              :severity="data.opted_out ? 'danger' : 'success'"
              :value="data.opted_out ? 'Opted out' : 'Subscribed'"
            />
          </template>
        </Column>

        <Column field="created_at" header="Added" sortable :style="{ width: '200px' }">
          <template #body="{ data }: { data: NewsletterPhone }">
            <span class="text-gray-600">{{ formatDate(data.created_at) }}</span>
          </template>
        </Column>

        <Column header="Actions" :style="{ width: '120px' }">
          <template #body="{ data }: { data: NewsletterPhone }">
            <div class="flex items-center gap-1">
              <Button icon="pi pi-pencil" text size="small" severity="secondary" @click="openEdit(data)" />
              <Button icon="pi pi-trash" text size="small" severity="danger" @click="deleting = data" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Create / edit -->
    <Dialog
      v-model:visible="showForm"
      modal
      :header="editingId ? 'Edit number' : 'Add number'"
      :style="{ width: '440px' }"
    >
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Phone number</label>
          <InputText v-model="formPhone" fluid placeholder="+15551234567" @keyup.enter="save" />
          <p class="mt-1 text-xs text-gray-500">
            International format, including the country code.
          </p>
        </div>
        <div v-if="editingId !== null" class="flex items-center gap-3">
          <ToggleSwitch v-model="formOptedOut" />
          <span class="text-sm text-gray-700">Opted out (excluded from every send)</span>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="showForm = false" />
        <Button label="Save" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <!-- Single delete -->
    <Dialog
      :visible="deleting !== null"
      modal
      header="Remove number"
      :style="{ width: '440px' }"
      @update:visible="deleting = null"
    >
      <p class="text-sm text-gray-700">
        Remove <strong class="font-mono">{{ deleting?.phone }}</strong> from the list?
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Remove" icon="pi pi-trash" severity="danger" :loading="actionLoading" @click="confirmDelete" />
      </template>
    </Dialog>

    <!-- Bulk delete -->
    <Dialog v-model:visible="showBulkDelete" modal header="Remove selected" :style="{ width: '440px' }">
      <p class="text-sm text-gray-700">
        Remove <strong>{{ selectedIds.length }}</strong> number(s) from the list?
      </p>
      <template #footer>
        <Button label="Cancel" text @click="showBulkDelete = false" />
        <Button label="Remove" icon="pi pi-trash" severity="danger" :loading="actionLoading" @click="confirmBulkDelete" />
      </template>
    </Dialog>

    <!-- Delete everything matching the filters -->
    <Dialog v-model:visible="showDeleteAll" modal header="Delete filtered numbers" :style="{ width: '480px' }">
      <p class="text-sm text-gray-700">
        This permanently deletes <strong>{{ totalRecords.toLocaleString() }}</strong> number(s) —
        everything matching the filters currently applied, not just this page. There is no trash to
        restore from.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="showDeleteAll = false" />
        <Button label="Delete them" icon="pi pi-trash" severity="danger" :loading="actionLoading" @click="confirmDeleteAll" />
      </template>
    </Dialog>

    <!-- Import: confirm before uploading -->
    <Dialog
      :visible="showImportModal"
      modal
      header="Import phone numbers"
      :style="{ width: '520px' }"
      :closable="!importing"
      @update:visible="(v: boolean) => { if (!v) closeImportModal() }"
    >
      <div class="space-y-3">
        <p class="text-sm text-gray-700">
          Import <strong>{{ pendingFile?.name }}</strong> into the phone list.
        </p>
        <p class="text-sm text-gray-500">
          The <strong>Phone</strong> column is read; everything else is ignored. Without a
          recognised header, every cell is scanned instead. Numbers already on the list are
          skipped, so re-importing the same file adds nothing.
        </p>
        <p class="text-sm text-gray-500">
          Numbers must be in international format (<code>+15551234567</code>). Anything without a
          country code is reported as invalid rather than guessed at.
        </p>

        <!-- Live progress while the queued job runs -->
        <div
          v-if="importing && importProgress"
          class="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-800"
        >
          Importing… {{ importProgress.imported }} added so far
          <span v-if="importProgress.total > 0">of {{ importProgress.total }} row(s) read</span>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text :disabled="importing" @click="closeImportModal" />
        <Button
          label="Import"
          icon="pi pi-upload"
          :loading="importing"
          :disabled="pendingFile === null"
          @click="runImport"
        />
      </template>
    </Dialog>

    <!-- Bulk send -->
    <Dialog v-model:visible="showSend" modal header="Send bulk SMS" :style="{ width: '620px' }">
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Send through</label>
          <Select
            v-model="twilioConfigId"
            :options="configOptions"
            option-label="label"
            option-value="value"
            option-disabled="disabled"
            fluid
            placeholder="Select an active Twilio configuration"
          />
          <p v-if="configOptions.length === 0" class="mt-1 text-xs text-amber-700">
            No active Twilio configuration yet. Add one under Twilio Configs first.
          </p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Template</label>
          <Select
            v-model="selectedTemplateId"
            :options="templateOptions"
            option-label="label"
            option-value="value"
            fluid
            show-clear
            placeholder="Start from a saved template (optional)"
            @change="applyTemplate(selectedTemplateId)"
          />
          <p class="mt-1 text-xs text-gray-500">
            <span v-if="templateOptions.length === 0">
              No active templates yet — add them under SMS Templates to stop retyping this.
            </span>
            <span v-else>
              Fills the message below. You can still edit it for this run without changing the
              saved template.
            </span>
          </p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Message</label>
          <Textarea v-model="sendBody" rows="5" auto-resize fluid placeholder="Write the message…" />
          <p class="mt-1 text-xs" :class="segments > 1 ? 'text-amber-700' : 'text-gray-500'">
            {{ bodySummary }}
          </p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">
            Limit to the newest N numbers (optional)
          </label>
          <InputNumber v-model="sendLimit" :min="1" fluid placeholder="Leave empty for everyone matching" />
        </div>

        <!-- The audience, resolved by the same query the send runs -->
        <div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          <div v-if="previewLoading" class="text-gray-500">Resolving recipients…</div>
          <div v-else-if="preview">
            <p class="text-gray-800">
              This will message
              <strong class="tabular-nums">{{ preview.total.toLocaleString() }}</strong>
              number(s) — {{ preview.filters }}.
            </p>
            <p class="mt-1 text-xs text-gray-500">
              Opted-out numbers are always excluded, whatever the list filter shows.
            </p>
            <div v-if="preview.sample.length > 0" class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="row in preview.sample.slice(0, 8)"
                :key="row.phone"
                class="rounded bg-white px-2 py-0.5 font-mono text-xs text-gray-600 border border-gray-200"
              >
                {{ row.phone }}
              </span>
              <span v-if="preview.total > 8" class="px-2 py-0.5 text-xs text-gray-500">
                +{{ (preview.total - 8).toLocaleString() }} more
              </span>
            </div>
          </div>
          <div v-else class="text-gray-500">Could not resolve the recipient list.</div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="showSend = false" />
        <Button
          label="Queue send"
          icon="pi pi-send"
          :loading="sending"
          :disabled="
            twilioConfigId === null ||
            sendBody.trim() === '' ||
            preview === null ||
            preview.total === 0
          "
          @click="send"
        />
      </template>
    </Dialog>

    <!-- Send history -->
    <Dialog v-model:visible="showHistory" modal header="SMS send history" :style="{ width: '900px' }">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-3">
          <InputText v-model="historySearch" placeholder="Search by number" class="w-56" />
          <Select
            v-model="historyStatus"
            :options="historyStatusOptions"
            option-label="label"
            option-value="value"
            class="w-36"
          />
          <RecordCount label="Total Attempts" :total="historyTotal" :loading="historyLoading" class="ml-auto" />
        </div>

        <DataTable
          :value="history"
          :loading="historyLoading"
          data-key="id"
          striped-rows
          lazy
          paginator
          :rows="historyPerPage"
          :first="historyFirst"
          :total-records="historyRecords"
          :rows-per-page-options="[20, 50, 100]"
          current-page-report-template="{first}–{last} of {totalRecords}"
          :pt="{ root: { class: 'text-sm' } }"
          @page="onHistoryPage"
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
      <template #footer>
        <Button label="Close" text @click="showHistory = false" />
      </template>
    </Dialog>
  </div>
</template>
