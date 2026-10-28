<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import * as api from '@/api/warmupEmails'
import RecordCount from '@/components/RecordCount.vue'
import { pageWindow, pagerMeta } from '@/utils/pagination'
import { useSitesStore } from '@/stores/sitesStore'
import type {
  WarmupEmail,
  WarmupHistoryEntry,
  WarmupImportSummary,
  WarmupLastSend,
  WarmupRecipientPreview,
  WarmupTemplate,
} from '@shared/types/warmupEmail'
import type { ErrorResponse } from '@shared/types/api'

const toast = useToast()
const router = useRouter()
const sitesStore = useSitesStore()

// Cooldown bounds. Fallbacks only — the live values come from the recipients
// preview, which reads WarmupSend::MIN/MAX_COOLDOWN_DAYS on the server, so the
// rule is defined once and this file never drifts from the validator.
const MIN_COOLDOWN_DAYS = 1
const MAX_COOLDOWN_DAYS = 365
const DEFAULT_COOLDOWN_DAYS = 1

const items = ref<WarmupEmail[]>([])
const loading = ref(false)
const selected = ref<WarmupEmail[]>([])
const selectedIds = computed(() => selected.value.map((w) => w.id))

// ── Server-side pagination ────────────────────────────────────────────────────
// The table is `lazy`: it renders exactly the rows the API returned. Paginating
// client-side would cap the list at whatever one API page contained.
const page = ref(1)
const perPage = ref(50)
const totalRecords = computed(() => meta.value?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)
const meta = ref<{ total: number; last_page: number } | null>(null)

// Total from the dedicated COUNT endpoint — never from the listing response.
const recordTotal = ref<number | null>(null)

const search = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined

function activeFilters(): { search?: string } {
  const term = search.value.trim()
  return term === '' ? {} : { search: term }
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    // One filter object drives both calls, so the badge can never disagree with
    // the rows on screen. They run concurrently — the count never delays the list.
    const [list, count] = await Promise.all([
      api.listWarmupEmails({ page: page.value, per_page: perPage.value, ...activeFilters() }),
      // Never fatal: a failed count must not take the listing down with it.
      api.countWarmupEmails(activeFilters()).catch(() => null),
    ])
    items.value = list.data
    // The listing carries no total (simple-paginated); the COUNT sizes the pager.
    meta.value = pagerMeta(pageWindow(list), count)
    perPage.value = list.meta.per_page
    recordTotal.value = count
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load warmup list.', life: 4000 })
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
  selected.value = [] // selection is per page — never carry it across
  await reload()
}

watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(reloadFromFirstPage, 400)
})

// ── Last run ─────────────────────────────────────────────────────────────────
// "How many went out last time?" — the question on opening this screen the
// morning after a run. Answered from `warmup_sends`, which has recorded every
// run since the feature shipped; nothing new is written to produce it.
const lastSend = ref<WarmupLastSend | null>(null)

/**
 * Re-read while a run is still landing, so the banner is not frozen on a
 * partial count. 8s: batches are paced, and this is a passive display.
 */
const IN_PROGRESS_POLL_MS = 8000
let lastSendTimer: ReturnType<typeof setTimeout> | undefined

async function loadLastSend(): Promise<void> {
  try {
    lastSend.value = await api.getLastWarmupSend()
  } catch {
    // Silent on purpose. This is a supplementary read; a toast here would fire
    // on every poll tick and bury the list's own errors.
    return
  }

  clearTimeout(lastSendTimer)

  // Poll ONLY while the server says batches are still landing. The server
  // bounds that state by the run lock's TTL, so this cannot poll forever.
  if (lastSend.value?.in_progress) {
    lastSendTimer = setTimeout(() => void loadLastSend(), IN_PROGRESS_POLL_MS)
  }
}

// Leaving the screen must stop the timer, or it keeps firing requests against a
// component that no longer exists.
onUnmounted(() => clearTimeout(lastSendTimer))

// ── Last run's failures ──────────────────────────────────────────────────────
// The banner says "2 failed"; this answers "which, and why". Read from the
// per-address history narrowed to that run and `status=failed`, so it lists
// exactly the rows `failed_count` counted. Loaded only when opened, a page at a
// time — a bad run can fail thousands.
const FAILED_PER_PAGE = 20
const failedOpen = ref(false)
const failedRows = ref<WarmupHistoryEntry[]>([])
const failedPage = ref(0)
const failedHasMore = ref(false)
const failedLoading = ref(false)
const failedError = ref(false)
/** Bumped on every reset, so a page requested before it is dropped on arrival. */
let failedGeneration = 0

async function loadFailed(): Promise<void> {
  if (!lastSend.value) return
  const sendId = lastSend.value.id
  const generation = failedGeneration
  failedLoading.value = true
  failedError.value = false
  try {
    const res = await api.listWarmupHistory({
      send_id: sendId,
      status: 'failed',
      page: failedPage.value + 1,
      per_page: FAILED_PER_PAGE,
    })
    // The list was reset (a newer run, or more failures) while this was in flight.
    if (generation !== failedGeneration) return
    failedRows.value.push(...res.data)
    failedPage.value = res.meta.current_page
    failedHasMore.value = res.links.next !== null
  } catch {
    if (generation === failedGeneration) failedError.value = true
  } finally {
    if (generation === failedGeneration) failedLoading.value = false
  }
}

function toggleFailed(): void {
  failedOpen.value = !failedOpen.value
  if (failedOpen.value && failedPage.value === 0) void loadFailed()
}

// A different run, or more failures landing while it runs: start over, and
// re-read if the list is open so it never shows another run's rows.
watch(
  () => [lastSend.value?.id, lastSend.value?.failed_count] as const,
  ([id], [prevId]) => {
    failedGeneration++
    failedLoading.value = false
    failedError.value = false
    failedRows.value = []
    failedPage.value = 0
    failedHasMore.value = false
    if (id !== prevId) failedOpen.value = false
    if (failedOpen.value) void loadFailed()
  },
)

function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function extractError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as ErrorResponse | undefined
    return data?.errors?.email?.[0] ?? data?.message ?? fallback
  }
  return fallback
}

// ── Create / edit ─────────────────────────────────────────────────────────────
const showForm = ref(false)
const editingId = ref<number | null>(null)
const formEmail = ref('')
const saving = ref(false)

function openCreate(): void {
  editingId.value = null
  formEmail.value = ''
  showForm.value = true
}

function openEdit(row: WarmupEmail): void {
  editingId.value = row.id
  formEmail.value = row.email
  showForm.value = true
}

async function save(): Promise<void> {
  if (formEmail.value.trim() === '') return
  saving.value = true
  try {
    if (editingId.value === null) {
      await api.createWarmupEmail(formEmail.value.trim())
      toast.add({ severity: 'success', summary: 'Added', detail: 'Address added.', life: 2500 })
    } else {
      await api.updateWarmupEmail(editingId.value, formEmail.value.trim())
      toast.add({ severity: 'success', summary: 'Saved', detail: 'Address updated.', life: 2500 })
    }
    showForm.value = false
    await reload()
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: 'Error', detail: extractError(e, 'Could not save the address.'), life: 5000 })
  } finally {
    saving.value = false
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
const deleting = ref<WarmupEmail | null>(null)
const showBulkDelete = ref(false)
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
    await api.deleteWarmupEmail(deleting.value.id)
    deleting.value = null
    selected.value = []
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Address removed.', life: 2500 })
  })
}

function confirmBulkDelete(): Promise<void> {
  return run(async () => {
    const { deleted } = await api.bulkDeleteWarmupEmails(selectedIds.value)
    selected.value = []
    showBulkDelete.value = false
    toast.add({ severity: 'success', summary: 'Deleted', detail: `${deleted} address(es) removed.`, life: 2500 })
  })
}

// ── Excel / CSV import ────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const summary = ref<WarmupImportSummary | null>(null)

function triggerImport(): void {
  fileInput.value?.click()
}

async function onFileSelected(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-picking the same file
  if (!file) return

  importing.value = true
  summary.value = null
  try {
    summary.value = await api.importWarmupEmails(file)
    toast.add({ severity: 'success', summary: 'Import complete', detail: summary.value.message, life: 6000 })
    await reloadFromFirstPage()
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: 'Import failed', detail: extractError(e, 'The file could not be imported.'), life: 6000 })
  } finally {
    importing.value = false
  }
}

// ── Send ──────────────────────────────────────────────────────────────────────
// The message is not typed here: a run renders one of the SITE's own email
// templates, so warmup traffic looks like the operator's real mail rather than
// hand-written prose — which is what actually teaches a receiving server to trust
// the sending mailbox.
const showSend = ref(false)
const sending = ref(false)
const sendTemplate = ref<string | null>(null)
const templates = ref<WarmupTemplate[]>([])

// null = every address on the list; a number takes that many, MOST RECENTLY
// ADDED first, minus anything inside the cooldown window below.
const sendAll = ref(true)
const sendCount = ref<number | null>(null)

// Skip addresses successfully contacted within this many days. Only meaningful
// for a limited run — "send to everyone" and "skip recent" are contradictory, and
// the server discards the value in that case.
const sendCooldownDays = ref<number>(DEFAULT_COOLDOWN_DAYS)

// The pinned warmup site, resolved by the server from config('warmup.site_slug').
const warmupSiteName = computed(() => preview.value?.site_name ?? null)

// The endpoint already excludes anything warmup forbids, so the dropdown can
// never offer an option the send would reject.
const templateOptions = computed(() =>
  templates.value.map((t) => ({ label: t.label, value: t.value, description: t.description })),
)

const selectedTemplate = computed(() =>
  templates.value.find((t) => t.value === sendTemplate.value) ?? null,
)

// ── Audience preview ──────────────────────────────────────────────────────────
// Runs the same query as the send, so what the dialog promises is what gets
// mailed. It also carries the cooldown bounds, so min/max are not duplicated here.
const preview = ref<WarmupRecipientPreview | null>(null)
const previewLoading = ref(false)
let previewTimer: ReturnType<typeof setTimeout> | undefined

// The WHOLE list, never the search-filtered count. `recordTotal` reflects the
// table's active search box, and a send always targets the entire list — reading
// it here made the cap and the "(N)" label wrong whenever a search was typed.
const listTotal = computed(() => preview.value?.total ?? 0)

// What this run would actually reach, once the cooldown has been applied.
const willReach = computed(() => preview.value?.recipients ?? 0)

const minCooldown = computed(() => preview.value?.min_cooldown_days ?? MIN_COOLDOWN_DAYS)
const maxCooldown = computed(() => preview.value?.max_cooldown_days ?? MAX_COOLDOWN_DAYS)

const canSend = computed(
  () =>
    warmupSiteName.value !== null &&
    sendTemplate.value !== null &&
    willReach.value > 0 &&
    (sendAll.value ||
      (sendCount.value !== null && sendCount.value >= 1 && sendCount.value <= listTotal.value)),
)

// ── Batch preview: the addresses themselves ──────────────────────────────────
//
// The counts above answer "how many"; this answers "which ones" — the question
// an operator actually has before pressing Send. It calls a read-only endpoint
// that walks the SAME selection the send walks, so the list shown is the list
// that gets mailed, in that order. Nothing is written by looking.
//
// Not loaded with the dialog: it is a deliberate check, and a whole-list run
// would otherwise fetch hundreds of rows every time the dialog opens.
const batch = ref<api.WarmupBatchPreview | null>(null)
const batchLoading = ref(false)

async function loadBatch(): Promise<void> {
  batchLoading.value = true
  try {
    batch.value = await api.previewWarmupBatch({
      count: sendAll.value ? null : sendCount.value,
      cooldown_days: sendAll.value ? null : sendCooldownDays.value,
    })
  } catch {
    batch.value = null
  } finally {
    batchLoading.value = false
  }
}

async function loadPreview(): Promise<void> {
  previewLoading.value = true
  try {
    preview.value = await api.previewWarmupRecipients({
      count: sendAll.value ? null : sendCount.value,
      cooldown_days: sendAll.value ? null : sendCooldownDays.value,
    })
  } catch {
    preview.value = null
  } finally {
    previewLoading.value = false
  }
}

function schedulePreview(): void {
  // A stale batch list beside changed settings is worse than no list: it would
  // show the audience of the PREVIOUS settings under the current numbers.
  batch.value = null
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => void loadPreview(), 300)
}

async function loadTemplates(): Promise<void> {
  try {
    const { data } = await api.listWarmupTemplates()
    templates.value = data
    // Drop a selection the list no longer offers.
    if (sendTemplate.value && !data.some((t) => t.value === sendTemplate.value)) {
      sendTemplate.value = null
    }
  } catch {
    templates.value = []
  }
}

// ── Stop a run ────────────────────────────────────────────────────────────────
// The escape hatch for a wedged run: a failure between taking the run lock and
// queueing the fan-out used to strand the lock, leaving "already running" for the
// full 15-minute TTL with no way back.
const showCancel = ref(false)
const cancelling = ref(false)

async function confirmCancel(): Promise<void> {
  cancelling.value = true
  try {
    const res = await api.cancelWarmupRun()
    // The lock is what unblocks the operator; stopping queued batches is a bonus.
    // Report them separately so a partial success does not read as a failure.
    toast.add({
      severity: res.queued_work_stopped ? 'success' : 'warn',
      summary: res.queued_work_stopped ? 'Stopped' : 'Lock cleared',
      detail: res.message,
      life: 8000,
    })
    showCancel.value = false
    // A cancelled run must stop reading as in-flight.
    await Promise.all([reload(), loadLastSend()])
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Could not reach the server to stop the run. Please try again.',
      life: 5000,
    })
  } finally {
    cancelling.value = false
  }
}

async function openSend(): Promise<void> {
  showSend.value = true
  sendAll.value = true
  sendCount.value = null
  await Promise.all([loadTemplates(), loadPreview()])
  // Adopt the server's configured defaults once they are known. The site comes
  // from config('warmup.default_site_slug') rather than a slug hard-coded here,
  // and falls back to the first registered site when it names none.
  sendCooldownDays.value = preview.value?.default_cooldown_days ?? DEFAULT_COOLDOWN_DAYS
}

// Any change to the audience settings re-runs the preview, debounced so typing a
// three-digit number issues one request rather than three.
watch([sendAll, sendCount, sendCooldownDays], () => {
  if (showSend.value) schedulePreview()
})

async function send(): Promise<void> {
  if (!canSend.value) return
  sending.value = true
  try {
    const res = await api.sendWarmupEmails({
      template: sendTemplate.value as string,
      count: sendAll.value ? null : sendCount.value,
      cooldown_days: sendAll.value ? null : sendCooldownDays.value,
    })
    toast.add({ severity: 'success', summary: 'Queued', detail: res.message, life: 7000 })
    showSend.value = false
    // The banner starts in its "sending now" state and polls itself from here.
    await Promise.all([reload(), loadLastSend()])
  } catch (e: unknown) {
    // 409 means a run is already in flight — an expected outcome, not a fault.
    const conflict = axios.isAxiosError(e) && e.response?.status === 409
    toast.add({
      severity: conflict ? 'warn' : 'error',
      summary: conflict ? 'Already running' : 'Not queued',
      detail: extractError(e, 'Could not queue the warmup run.'),
      life: 7000,
    })
  } finally {
    sending.value = false
  }
}

onMounted(async () => {
  await Promise.all([reload(), sitesStore.fetchSites(), loadLastSend()])
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Warmup</h2>
        <p class="text-sm text-gray-500">
          Addresses used to warm up the sending mailbox. Sent over the SMTP credentials in
          <code>.env</code> — the same transport the admin test buttons use.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <RecordCount label="Total Warmup Emails" :total="recordTotal" :loading="loading" />
        <Button label="History" icon="pi pi-history" severity="secondary" outlined @click="router.push({ name: 'email-history', query: { tab: 'warmup' } })" />
        <Button label="Import" icon="pi pi-upload" severity="secondary" outlined :loading="importing" @click="triggerImport" />
        <Button label="Send warmup" icon="pi pi-send" severity="secondary" outlined @click="openSend" />
        <Button label="Stop run" icon="pi pi-ban" severity="danger" outlined @click="showCancel = true" />
        <Button label="Add email" icon="pi pi-plus" @click="openCreate" />
      </div>
    </div>

    <input ref="fileInput" type="file" accept=".xlsx,.csv" class="hidden" @change="onFileSelected" />

    <!-- Last run ────────────────────────────────────────────────────────────
         Above the import banner because it answers the question this screen is
         opened with. The SENT count leads and is the only figure given weight:
         "I sent 250 yesterday" means 250 left the building, and the requested
         and queued figures only earn a line when they disagree with it. -->
    <div
      v-if="lastSend"
      class="rounded-lg border px-4 py-3 text-sm"
      :class="lastSend.in_progress
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : lastSend.failed_count > 0
          ? 'border-orange-200 bg-orange-50 text-orange-900'
          : 'border-emerald-200 bg-emerald-50 text-emerald-900'"
    >
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span class="font-medium">
          {{ lastSend.in_progress ? 'Sending now:' : 'Last send:' }}
        </span>
        <span class="text-base font-semibold tabular-nums">
          {{ lastSend.sent_count.toLocaleString() }}
        </span>
        <span>email(s) sent</span>

        <!-- Only while the number is still moving. Without this the partial
             count reads as the run's total. -->
        <span v-if="lastSend.in_progress" class="italic">
          · still running, this figure is rising
        </span>
        <template v-else>
          <span>· {{ formatDate(lastSend.started_at) }}</span>
        </template>

        <span v-if="lastSend.cancelled_at" class="font-medium">· stopped by an operator</span>
      </div>

      <!-- The second line exists only when it has something to say. A clean run
           that sent exactly what it queued needs no explanation, and printing
           three identical numbers would train the eye to skip the banner. -->
      <div
        v-if="lastSend.failed_count > 0 || lastSend.queued_count !== lastSend.sent_count"
        class="mt-1 text-xs opacity-80"
      >
        <span v-if="lastSend.requested_count !== null">
          {{ lastSend.requested_count.toLocaleString() }} requested
        </span>
        <span v-else>whole list requested</span>
        · {{ lastSend.queued_count.toLocaleString() }} queued
        <span v-if="lastSend.failed_count > 0">
          · <span class="font-semibold">{{ lastSend.failed_count.toLocaleString() }} failed</span>
        </span>
        <button
          v-if="lastSend.failed_count > 0"
          type="button"
          class="ml-2 inline-flex items-center gap-1 rounded-md border border-current/30 px-2 py-0.5 font-medium hover:bg-white/60"
          :aria-expanded="failedOpen"
          aria-controls="warmup-last-send-failed"
          @click="toggleFailed"
        >
          {{ failedOpen ? 'Hide failed' : 'Show failed' }}
          <i class="pi text-[0.65rem]" :class="failedOpen ? 'pi-chevron-up' : 'pi-chevron-down'" />
        </button>
      </div>

      <!-- Which addresses failed, why, and when. -->
      <div
        v-if="failedOpen && lastSend.failed_count > 0"
        id="warmup-last-send-failed"
        class="mt-3 overflow-hidden rounded-md border border-orange-200 bg-white text-slate-700"
      >
        <div class="max-h-80 overflow-auto">
          <table class="w-full min-w-[36rem] text-left text-xs">
            <thead class="sticky top-0 bg-orange-50 text-orange-900">
              <tr>
                <th class="px-3 py-2 font-semibold">Email</th>
                <th class="px-3 py-2 font-semibold">Error</th>
                <th class="whitespace-nowrap px-3 py-2 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-orange-100">
              <tr v-for="row in failedRows" :key="row.id" class="align-top">
                <td class="whitespace-nowrap px-3 py-2 font-medium">{{ row.email }}</td>
                <td class="break-words px-3 py-2 text-red-700">{{ row.error ?? 'No error recorded' }}</td>
                <td class="whitespace-nowrap px-3 py-2 tabular-nums">{{ formatDate(row.sent_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-2 border-t border-orange-100 px-3 py-2 text-xs">
          <span class="opacity-70">
            Showing {{ failedRows.length.toLocaleString() }} of {{ lastSend.failed_count.toLocaleString() }}
          </span>
          <span v-if="failedLoading" class="italic opacity-70">Loading…</span>
          <button
            v-else-if="failedError"
            type="button"
            class="font-medium text-red-700 hover:underline"
            @click="loadFailed"
          >
            Couldn’t load — retry
          </button>
          <button
            v-else-if="failedHasMore"
            type="button"
            class="font-medium text-orange-800 hover:underline"
            @click="loadFailed"
          >
            Load more
          </button>
        </div>
      </div>

      <div class="mt-1 text-xs opacity-70">
        {{ lastSend.template_label }}
        <template v-if="lastSend.site_name"> · {{ lastSend.site_name }}</template>
        <template v-if="lastSend.cooldown_days !== null">
          · {{ lastSend.cooldown_days }}-day cooldown
        </template>
        <template v-if="lastSend.sent_by"> · by {{ lastSend.sent_by }}</template>
      </div>
    </div>

    <!-- Last import breakdown -->
    <div v-if="summary" class="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
      <span class="font-medium">Last import:</span>
      {{ summary.rows }} row(s) read ·
      <span class="font-semibold">{{ summary.imported }}</span> imported ·
      {{ summary.duplicates }} duplicate(s) ·
      {{ summary.invalid }} invalid
    </div>

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <InputText v-model="search" placeholder="Search by email" class="w-72" />
      <Button
        v-if="selectedIds.length > 0"
        :label="`Delete selected (${selectedIds.length})`"
        icon="pi pi-trash"
        severity="danger"
        outlined
        :loading="actionLoading"
        @click="showBulkDelete = true"
      />
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
        :pt="{ root: { class: 'text-sm' } }"
        @page="onPage"
      >
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">
            No warmup addresses yet. Add one or import a spreadsheet.
          </div>
        </template>

        <Column selection-mode="multiple" :style="{ width: '3rem' }" />

        <Column field="email" header="Email address">
          <template #body="{ data }: { data: WarmupEmail }">
            <span class="text-gray-900">{{ data.email }}</span>
          </template>
        </Column>

        <Column header="Added" :style="{ width: '190px' }">
          <template #body="{ data }: { data: WarmupEmail }">
            <span class="text-gray-600">{{ formatDate(data.created_at) }}</span>
          </template>
        </Column>

        <!-- What the cooldown filter actually reads, so a skipped address is
             explainable without opening the history. -->
        <Column header="Last sent" :style="{ width: '190px' }">
          <template #body="{ data }: { data: WarmupEmail }">
            <span v-if="data.last_sent_at" class="text-gray-600">
              {{ formatDate(data.last_sent_at) }}
            </span>
            <span v-else class="text-xs text-gray-400">Never contacted</span>
          </template>
        </Column>

        <Column header="Actions" :style="{ width: '140px' }">
          <template #body="{ data }: { data: WarmupEmail }">
            <div class="flex items-center gap-1">
              <Button icon="pi pi-pencil" text size="small" severity="secondary" @click="openEdit(data)" />
              <Button icon="pi pi-trash" text size="small" severity="danger" @click="deleting = data" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Create / edit -->
    <Dialog v-model:visible="showForm" modal :header="editingId ? 'Edit address' : 'Add address'" :style="{ width: '420px' }">
      <label class="mb-1 block text-xs font-medium text-gray-600">Email address</label>
      <InputText v-model="formEmail" fluid type="email" placeholder="user@example.com" @keyup.enter="save" />
      <template #footer>
        <Button label="Cancel" text @click="showForm = false" />
        <Button label="Save" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <!-- Single delete -->
    <Dialog :visible="deleting !== null" modal header="Remove address" :style="{ width: '420px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">
        Remove <strong>{{ deleting?.email }}</strong> from the warmup list?
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Remove" icon="pi pi-trash" severity="danger" :loading="actionLoading" @click="confirmDelete" />
      </template>
    </Dialog>

    <!-- Bulk delete -->
    <Dialog v-model:visible="showBulkDelete" modal header="Remove selected" :style="{ width: '420px' }">
      <p class="text-sm text-gray-700">
        Remove <strong>{{ selectedIds.length }}</strong> address(es) from the warmup list?
      </p>
      <template #footer>
        <Button label="Cancel" text @click="showBulkDelete = false" />
        <Button label="Remove" icon="pi pi-trash" severity="danger" :loading="actionLoading" @click="confirmBulkDelete" />
      </template>
    </Dialog>

    <!-- Stop the current run -->
    <Dialog v-model:visible="showCancel" modal header="Stop the current run" :style="{ width: '480px' }">
      <p class="text-sm text-gray-700">
        Cancels the run in progress and frees the lock so a new one can start.
      </p>
      <ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
        <li>Batches still queued will not send.</li>
        <li>Addresses already mailed stay mailed — their history is kept.</li>
        <li>Safe to use when nothing is running; it just clears the lock.</li>
      </ul>
      <template #footer>
        <Button label="Cancel" text @click="showCancel = false" />
        <Button
          label="Stop run"
          icon="pi pi-ban"
          severity="danger"
          :loading="cancelling"
          @click="confirmCancel"
        />
      </template>
    </Dialog>

    <!-- Send -->
    <Dialog v-model:visible="showSend" modal header="Send warmup emails" :style="{ width: '560px' }">
      <div class="space-y-4">
        <p class="text-sm text-gray-600">
          Sends one of a site's own email templates over the <code>.env</code> SMTP mailer —
          the same transport as before. Using a real template means warmup traffic looks like
          your genuine mail, which is what actually builds the mailbox's reputation.
        </p>

        <!-- Not a picker: warmup is pinned to one site server-side, so the send
             endpoint does not accept a site at all. Shown for confirmation only. -->
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Site</label>
          <div
            v-if="warmupSiteName"
            class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
          >
            {{ warmupSiteName }}
          </div>
          <div
            v-else
            class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            No active site matches the configured warmup slug
            <code class="font-mono">{{ preview?.site_slug || '(unset)' }}</code>.
            Set <code class="font-mono">WARMUP_SITE_SLUG</code> or reactivate that site.
          </div>
          <p class="mt-1 text-xs text-gray-500">
            Warmup always sends as this site. Change it with
            <code class="font-mono">WARMUP_SITE_SLUG</code>.
          </p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Email template</label>
          <Select
            v-model="sendTemplate"
            :options="templateOptions"
            option-label="label"
            option-value="value"
            fluid
            :disabled="warmupSiteName === null"
            placeholder="Select a template"
          />
          <p v-if="selectedTemplate" class="mt-1 text-xs text-gray-500">
            {{ selectedTemplate.description }}
          </p>
          <p v-else class="mt-1 text-xs text-gray-500">
            Rendered from the selected site's stored template. The verify email is excluded —
            its confirmation link means nothing for a warmup address.
          </p>
        </div>

        <div class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
          <div class="flex items-center gap-3">
            <ToggleSwitch v-model="sendAll" input-id="warmup-send-all" />
            <label for="warmup-send-all" class="cursor-pointer text-sm text-gray-700">
              Send to every address on the list
              <span class="text-gray-400">({{ listTotal.toLocaleString() }})</span>
            </label>
          </div>

          <div v-if="!sendAll" class="mt-3 space-y-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">How many recipients</label>
              <InputNumber
                v-model="sendCount"
                :min="1"
                :max="listTotal"
                fluid
                placeholder="e.g. 50"
              />
              <p class="mt-1 text-xs text-gray-500">
                Takes the most recently added addresses first. Max
                {{ listTotal.toLocaleString() }}.
              </p>
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">
                Skip addresses contacted in the last
              </label>
              <div class="flex items-center gap-2">
                <InputNumber
                  v-model="sendCooldownDays"
                  :min="minCooldown"
                  :max="maxCooldown"
                  :step="1"
                  show-buttons
                  class="w-40"
                />
                <span class="text-sm text-gray-600">
                  day{{ sendCooldownDays === 1 ? '' : 's' }}
                </span>
              </div>
              <p class="mt-1 text-xs text-gray-500">
                An address is skipped if it was successfully warmed inside this window, so
                successive runs walk further down the list instead of re-mailing the newest
                addresses. Between {{ minCooldown }} and {{ maxCooldown }} days.
              </p>
            </div>
          </div>

          <!-- Same query as the send itself, so this number is the audience. -->
          <div class="mt-3 border-t border-gray-200 pt-3 text-sm">
            <span class="text-gray-500">This run will reach</span>
            <span v-if="previewLoading" class="ml-1 text-gray-400">…</span>
            <template v-else>
              <span class="ml-1 font-semibold tabular-nums text-gray-900">
                {{ willReach.toLocaleString() }}
              </span>
              <span class="text-gray-500"> address{{ willReach === 1 ? '' : 'es' }}</span>
              <span v-if="!sendAll && preview" class="text-gray-400">
                · {{ preview.eligible.toLocaleString() }} eligible of
                {{ preview.total.toLocaleString() }} on the list
              </span>
            </template>
          </div>

          <!-- The addresses themselves. Same selection as the send, read-only:
               looking changes nothing, so this can be pressed as often as the
               settings are adjusted. -->
          <div v-if="willReach > 0" class="mt-3">
            <Button
              label="Preview batch"
              icon="pi pi-eye"
              size="small"
              outlined
              :loading="batchLoading"
              @click="loadBatch"
            />
            <div v-if="batch && batch.data.length" class="mt-2">
              <div class="max-h-44 overflow-auto rounded-lg border border-gray-200">
                <table class="w-full text-xs">
                  <tbody>
                    <tr
                      v-for="row in batch.data"
                      :key="row.id"
                      class="border-b border-gray-100 last:border-0"
                    >
                      <td class="px-3 py-1.5 text-gray-800">{{ row.email }}</td>
                      <td class="px-3 py-1.5 text-right text-gray-400">
                        {{ row.last_sent_at ? `last sent ${formatDate(row.last_sent_at)}` : 'never sent' }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="batch.meta.truncated" class="mt-1 text-xs text-gray-400">
                Showing the first {{ batch.meta.preview_count.toLocaleString() }} of
                {{ batch.meta.would_reach.toLocaleString() }} — the run sends to all of them.
              </p>
            </div>
            <p v-else-if="batch" class="mt-2 text-xs text-gray-400">
              No addresses match these settings.
            </p>
          </div>
        </div>

        <!-- Both guarded on `preview` so neither flashes before the first load. -->
        <p v-if="preview && listTotal === 0" class="text-sm text-amber-700">
          The warmup list is empty — add or import addresses first.
        </p>
        <p
          v-else-if="preview && !previewLoading && willReach === 0"
          class="text-sm text-amber-700"
        >
          Every address has been contacted within the last {{ sendCooldownDays }}
          day{{ sendCooldownDays === 1 ? '' : 's' }}. Lower the cooldown or add more addresses.
        </p>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="showSend = false" />
        <Button
          label="Queue send"
          icon="pi pi-send"
          :loading="sending"
          :disabled="!canSend"
          @click="send"
        />
      </template>
    </Dialog>
  </div>
</template>
