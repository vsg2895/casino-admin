<script setup lang="ts">
/**
 * Email Validation Log — the analysis screen.
 *
 * Built for one decision: are the rules too strict? Every filter and every
 * aggregate here exists to answer that. The combination that matters most is
 * "verdict = Risky AND not disposable AND is a role address" — if those turn
 * out to be real mailboxes on real company domains, the answer is to widen
 * ALLOWED_VERDICTS, and that is an .env change with no deploy.
 *
 * READ-ONLY: no editing, no deleting, and no re-run — re-running would spend a
 * paid credit from the page that explains where the credits went.
 */
import { ref, computed, onMounted } from 'vue'
import DataTable, { type DataTableSortEvent } from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import Paginator, { type PageState } from 'primevue/paginator'
import { useToast } from 'primevue/usetoast'
import { useSitesStore } from '@/stores/sitesStore'
import {
  listEmailValidationLogs,
  countEmailValidationLogs,
  getEmailValidationAnalysis,
  exportEmailValidationLogs,
  type EmailValidationFilters,
} from '@/api/emailValidation'
import type {
  EmailValidationAnalysis,
  EmailValidationCheckFlags,
  EmailValidationLog,
} from '@shared/types/emailValidation'

const sitesStore = useSitesStore()
const toast = useToast()

const items = ref<EmailValidationLog[]>([])
const analysis = ref<EmailValidationAnalysis | null>(null)
const loading = ref(false)
const total = ref(0)
const perPage = ref(25)
const first = ref(0)
const detail = ref<EmailValidationLog | null>(null)
const showRaw = ref(false)

const sort = ref<'created_at' | 'score'>('created_at')
const direction = ref<'asc' | 'desc'>('desc')

const siteId = ref<number | null>(null)
const verdict = ref<string | null>(null)
const outcome = ref<string | null>(null)
const reasonCode = ref<string | null>(null)
const cached = ref<boolean | null>(null)
const minScore = ref<number | null>(null)
const maxScore = ref<number | null>(null)
const search = ref('')
const searchMode = ref<'contains' | 'exact' | 'domain'>('contains')
const from = ref<Date | null>(null)
const to = ref<Date | null>(null)

/** Each check is tri-state: true / false / any (null). */
const CHECKS: { key: keyof EmailValidationCheckFlags; label: string; short: string }[] = [
  { key: 'has_valid_address_syntax', label: 'Valid address syntax', short: 'Syntax' },
  { key: 'has_mx_or_a_record', label: 'Domain has MX or A record', short: 'MX/A' },
  { key: 'is_suspected_disposable_address', label: 'Suspected disposable address', short: 'Disp.' },
  { key: 'is_suspected_role_address', label: 'Suspected role address (info@, support@)', short: 'Role' },
  { key: 'has_known_bounces', label: 'Known bounces', short: 'Bounced' },
  { key: 'has_suspected_bounces', label: 'Suspected bounces', short: 'Susp.' },
]
const checkFilters = ref<Record<string, boolean | null>>(
  Object.fromEntries(CHECKS.map((c) => [c.key, null])),
)

const verdictOptions = ['Valid', 'Risky', 'Invalid'].map((v) => ({ label: v, value: v }))
const outcomeOptions = [
  { label: 'Allowed', value: 'allowed' },
  { label: 'Hard rejected', value: 'hard_rejected' },
  { label: 'Soft rejected', value: 'soft_rejected' },
  { label: 'Failed open', value: 'failed_open' },
]
const reasonOptions = [
  'invalid_verdict', 'bad_syntax', 'no_mx_record', 'low_score', 'known_bounces',
  'disposable', 'role_address', 'verdict_not_allowed',
  'missing_key', 'quota_exhausted', 'email_cooldown', 'disabled', 'pending_resend', 'transport_error',
].map((r) => ({ label: r.replace(/_/g, ' '), value: r }))
const triOptions = [
  { label: 'Any', value: null },
  { label: 'Yes', value: true },
  { label: 'No', value: false },
]
const modeOptions = [
  { label: 'Contains', value: 'contains' },
  { label: 'Exact', value: 'exact' },
  { label: 'Domain', value: 'domain' },
]
const siteOptions = computed(() => sitesStore.sites.map((s) => ({ label: s.name, value: s.id })))

const ymd = (d: Date | null): string | undefined =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : undefined

/** One filter object for the listing, count, analysis AND export, so the
 *  histogram can never describe a different set than the table below it. */
const filters = computed<EmailValidationFilters>(() => {
  const checks: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(checkFilters.value)) if (v !== null) checks[k] = v

  return {
    site_id: siteId.value ?? undefined,
    verdict: (verdict.value as EmailValidationFilters['verdict']) ?? undefined,
    outcome: (outcome.value as EmailValidationFilters['outcome']) ?? undefined,
    reason_code: reasonCode.value ?? undefined,
    from: ymd(from.value),
    to: ymd(to.value),
    min_score: minScore.value ?? undefined,
    max_score: maxScore.value ?? undefined,
    cached: cached.value ?? undefined,
    search: search.value.trim() || undefined,
    search_mode: search.value.trim() ? searchMode.value : undefined,
    sort: sort.value,
    direction: direction.value,
    ...checks,
  }
})

async function load(): Promise<void> {
  loading.value = true
  try {
    const page = Math.floor(first.value / perPage.value) + 1
    const [list, count, agg] = await Promise.all([
      listEmailValidationLogs({ ...filters.value, page, per_page: perPage.value }),
      countEmailValidationLogs(filters.value),
      getEmailValidationAnalysis(filters.value),
    ])
    items.value = list.data
    total.value = count
    analysis.value = agg
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load the validation log.', life: 5000 })
  } finally {
    loading.value = false
  }
}

function applyFilters(): void {
  first.value = 0
  load()
}

function resetFilters(): void {
  siteId.value = null; verdict.value = null; outcome.value = null; reasonCode.value = null
  cached.value = null; minScore.value = null; maxScore.value = null
  search.value = ''; searchMode.value = 'contains'; from.value = null; to.value = null
  for (const c of CHECKS) checkFilters.value[c.key] = null
  applyFilters()
}

function onPage(e: PageState): void {
  first.value = e.first
  perPage.value = e.rows
  load()
}

function onSort(e: DataTableSortEvent): void {
  const field = typeof e.sortField === 'string' ? e.sortField : null
  // Allow-listed client-side too, matching the server: anything else is
  // ignored rather than sent and rejected.
  if (field !== 'created_at' && field !== 'score') return
  sort.value = field
  direction.value = e.sortOrder === 1 ? 'asc' : 'desc'
  load()
}

/** Jump straight from a histogram bar to the rows in it. */
function drillScore(bucket: string): void {
  const b = Number(bucket)
  minScore.value = Number((b / 10).toFixed(1))
  maxScore.value = Number(((b + 1) / 10).toFixed(1))
  applyFilters()
}

async function download(): Promise<void> {
  try {
    const blob = await exportEmailValidationLogs(filters.value)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `email-validation-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Export failed.', life: 5000 })
  }
}

const verdictSeverity = (v: string | null): string =>
  v === 'Valid' ? 'success' : v === 'Risky' ? 'warn' : v === 'Invalid' ? 'danger' : 'secondary'
const outcomeSeverity = (o: string): string =>
  o === 'allowed' ? 'success' : o === 'hard_rejected' ? 'danger' : o === 'soft_rejected' ? 'warn' : 'info'

const pct = (n: number): string =>
  analysis.value && analysis.value.total > 0 ? `${Math.round((n / analysis.value.total) * 100)}%` : '0%'

const histogramMax = computed(() =>
  Math.max(1, ...Object.values(analysis.value?.score_histogram ?? {})),
)

/** Checks flattened for the row detail, with plain-language labels. */
const detailChecks = computed(() => {
  if (!detail.value) return []
  return CHECKS.map((c) => ({ label: c.label, value: detail.value![c.key] }))
    .filter((r) => r.value !== null)
})

onMounted(async () => {
  try { await sitesStore.fetchSites() } catch { /* the filter stays empty */ }
  await load()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-gray-900">Email Validation Log</h1>
        <p class="mt-0.5 text-sm text-gray-500">
          Every validation attempt on the public subscribe forms. Read-only.
        </p>
      </div>
      <Button label="Export CSV" icon="pi pi-download" outlined @click="download" />
    </div>

    <!-- ── Analysis panel: aggregates over the CURRENT filters ── -->
    <div v-if="analysis" class="grid gap-3 lg:grid-cols-3">
      <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Verdicts</p>
        <ul class="mt-2 space-y-1 text-sm">
          <li v-for="v in ['Valid', 'Risky', 'Invalid']" :key="v" class="flex items-center justify-between">
            <Tag :value="v" :severity="verdictSeverity(v)" />
            <span class="text-gray-700">
              {{ analysis.verdicts[v] ?? 0 }}
              <span class="ml-1 text-xs text-gray-400">{{ pct(analysis.verdicts[v] ?? 0) }}</span>
            </span>
          </li>
        </ul>
        <p class="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
          {{ analysis.total }} attempts in this view
        </p>
      </div>

      <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Outcomes</p>
        <ul class="mt-2 space-y-1 text-sm">
          <li v-for="o in outcomeOptions" :key="o.value" class="flex items-center justify-between">
            <Tag :value="o.label" :severity="outcomeSeverity(o.value)" />
            <span class="text-gray-700">
              {{ analysis.outcomes[o.value] ?? 0 }}
              <span class="ml-1 text-xs text-gray-400">{{ pct(analysis.outcomes[o.value] ?? 0) }}</span>
            </span>
          </li>
        </ul>
      </div>

      <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Checks true</p>
        <ul class="mt-2 space-y-1 text-sm">
          <li v-for="c in CHECKS" :key="c.key" class="flex items-center justify-between">
            <span class="text-gray-600">{{ c.short }}</span>
            <span class="text-gray-700">{{ analysis.checks[c.key] ?? 0 }}</span>
          </li>
        </ul>
      </div>

      <!-- The histogram is what tells you whether 0.7 is the right threshold. -->
      <div class="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Score distribution <span class="font-normal normal-case text-gray-400">— click a bar to filter</span>
        </p>
        <!-- min-h keeps the chart readable when this panel is the shorter of the
             row; flex-1 lets it use the height its taller sibling forces. -->
        <div class="mt-3 flex min-h-40 flex-1 items-stretch gap-1">
          <button
            v-for="b in 10"
            :key="b"
            type="button"
            class="group flex h-full flex-1 flex-col items-center justify-end"
            :title="`${((b - 1) / 10).toFixed(1)}–${(b / 10).toFixed(1)}: ${analysis.score_histogram[String(b - 1)] ?? 0}`"
            @click="drillScore(String(b - 1))"
          >
            <span class="text-[10px] text-gray-400">{{ analysis.score_histogram[String(b - 1)] ?? 0 }}</span>
            <!-- The bar is a flex ITEM sized by flex-basis, not by a percentage
                 height: a % height inside a flex column has no definite basis to
                 resolve against and collapses to nothing, which is exactly what
                 it did. flex-basis against a stretched parent does resolve. -->
            <span
              class="w-full shrink-0 rounded-t bg-emerald-400 transition-colors group-hover:bg-emerald-600"
              :style="{ flexBasis: `${((analysis.score_histogram[String(b - 1)] ?? 0) / histogramMax) * 100}%`, minHeight: '2px' }"
            />
            <span class="mt-1 text-[10px] text-gray-400">{{ ((b - 1) / 10).toFixed(1) }}</span>
          </button>
        </div>
      </div>

      <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Top rejection reasons</p>
        <ul class="mt-2 space-y-1 text-sm">
          <li v-for="(n, r) in analysis.reasons" :key="r" class="flex items-center justify-between">
            <button type="button" class="truncate text-left text-gray-600 hover:text-emerald-700 hover:underline" @click="reasonCode = String(r); applyFilters()">
              {{ String(r).replace(/_/g, ' ') }}
            </button>
            <span class="ml-2 shrink-0 text-gray-700">{{ n }}</span>
          </li>
        </ul>
        <p class="mt-3 border-t border-gray-100 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Top rejected domains</p>
        <ul class="mt-1 space-y-1 text-sm">
          <li v-for="(n, d) in analysis.top_rejected_domains" :key="d" class="flex items-center justify-between">
            <button type="button" class="truncate text-left text-gray-600 hover:text-emerald-700 hover:underline" @click="search = '@' + String(d); searchMode = 'domain'; applyFilters()">
              {{ d }}
            </button>
            <span class="ml-2 shrink-0 text-gray-700">{{ n }}</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- ── Filters ── -->
    <div class="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
      <div class="flex flex-wrap items-end gap-2">
        <Select v-model="siteId" :options="siteOptions" option-label="label" option-value="value" placeholder="All sites" show-clear class="w-40" />
        <Select v-model="verdict" :options="verdictOptions" option-label="label" option-value="value" placeholder="All verdicts" show-clear class="w-36" />
        <Select v-model="outcome" :options="outcomeOptions" option-label="label" option-value="value" placeholder="All outcomes" show-clear class="w-40" />
        <Select v-model="reasonCode" :options="reasonOptions" option-label="label" option-value="value" placeholder="All reasons" show-clear class="w-44" />
        <Select v-model="cached" :options="triOptions" option-label="label" option-value="value" placeholder="Cached: any" class="w-32" />
        <DatePicker v-model="from" placeholder="From" date-format="yy-mm-dd" show-icon class="w-40" />
        <DatePicker v-model="to" placeholder="To" date-format="yy-mm-dd" show-icon class="w-40" />
        <InputNumber v-model="minScore" placeholder="Min score" :min-fraction-digits="0" :max-fraction-digits="5" class="w-28" />
        <InputNumber v-model="maxScore" placeholder="Max score" :min-fraction-digits="0" :max-fraction-digits="5" class="w-28" />
      </div>

      <div class="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-2">
        <!-- Tri-state per check. This row is what makes "Risky AND not
             disposable AND role address" reachable in the UI. -->
        <div v-for="c in CHECKS" :key="c.key" class="w-40">
          <label class="mb-0.5 block text-[11px] font-medium text-gray-500">{{ c.short }}</label>
          <!-- placeholder="Any" is load-bearing: PrimeVue treats a null model as
               "nothing selected" and falls back to the placeholder, so without
               one these six render BLANK rather than reading as "no filter". -->
          <Select
            v-model="checkFilters[c.key]"
            :options="triOptions"
            option-label="label"
            option-value="value"
            placeholder="Any"
            fluid
          />
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-2">
        <InputText v-model="search" placeholder="Search email" class="w-64" @keyup.enter="applyFilters" />
        <Select v-model="searchMode" :options="modeOptions" option-label="label" option-value="value" class="w-32" />
        <Button label="Filter" icon="pi pi-filter" @click="applyFilters" />
        <Button label="Reset" text severity="secondary" @click="resetFilters" />
      </div>
    </div>

    <DataTable
      :value="items"
      :loading="loading"
      data-key="id"
      size="small"
      striped-rows
      lazy
      removable-sort
      :sort-field="sort"
      :sort-order="direction === 'asc' ? 1 : -1"
      @sort="onSort"
    >
      <Column field="created_at" header="Date" sortable>
        <template #body="{ data }">
          <span class="whitespace-nowrap text-sm">{{ data.created_at?.replace('T', ' ').slice(0, 19) }}</span>
        </template>
      </Column>
      <Column field="site_name" header="Site" />
      <Column field="email" header="Email" />
      <Column header="Verdict">
        <template #body="{ data }">
          <Tag v-if="data.verdict" :value="data.verdict" :severity="verdictSeverity(data.verdict)" />
          <span v-else class="text-gray-400">—</span>
        </template>
      </Column>
      <Column field="score" header="Score" sortable>
        <template #body="{ data }">{{ data.score !== null ? data.score.toFixed(3) : '—' }}</template>
      </Column>
      <Column header="Outcome">
        <template #body="{ data }"><Tag :value="data.outcome.replace('_', ' ')" :severity="outcomeSeverity(data.outcome)" /></template>
      </Column>
      <Column header="Reason">
        <template #body="{ data }">
          <span class="text-xs text-gray-600">{{ data.reason_code?.replace(/_/g, ' ') ?? '—' }}</span>
        </template>
      </Column>
      <Column header="Checks">
        <template #body="{ data }">
          <span class="flex gap-1">
            <i
              v-for="c in CHECKS"
              :key="c.key"
              :title="c.label + ': ' + (data[c.key] === null ? 'unknown' : data[c.key] ? 'yes' : 'no')"
              class="text-[11px]"
              :class="data[c.key] === null ? 'pi pi-minus text-gray-300' : (data[c.key] ? 'pi pi-circle-fill text-emerald-500' : 'pi pi-circle text-gray-300')"
            />
          </span>
        </template>
      </Column>
      <Column header="Cached">
        <template #body="{ data }"><Tag v-if="data.was_cached" value="cached" severity="info" /><span v-else class="text-gray-300">—</span></template>
      </Column>
      <Column>
        <template #body="{ data }">
          <Button icon="pi pi-search" text rounded aria-label="Details" @click="detail = data; showRaw = false" />
        </template>
      </Column>
      <template #empty><span class="text-gray-500">No validation attempts match these filters.</span></template>
    </DataTable>

    <Paginator :first="first" :rows="perPage" :total-records="total" :rows-per-page-options="[25, 50, 100]" @page="onPage" />

    <Dialog :visible="detail !== null" modal header="Validation detail" :style="{ width: '34rem' }" @update:visible="detail = null">
      <div v-if="detail" class="space-y-3 text-sm">
        <div class="grid grid-cols-2 gap-2">
          <div><span class="text-gray-500">Email</span><p class="font-medium break-all">{{ detail.email }}</p></div>
          <div><span class="text-gray-500">Site</span><p class="font-medium">{{ detail.site_name }}</p></div>
          <div><span class="text-gray-500">Verdict</span><p class="mt-0.5"><Tag v-if="detail.verdict" :value="detail.verdict" :severity="verdictSeverity(detail.verdict)" /><span v-else>—</span></p></div>
          <div><span class="text-gray-500">Score</span><p class="font-medium">{{ detail.score ?? '—' }}</p></div>
          <div><span class="text-gray-500">Decision</span><p class="mt-0.5"><Tag :value="detail.outcome.replace('_', ' ')" :severity="outcomeSeverity(detail.outcome)" /></p></div>
          <div><span class="text-gray-500">Reason</span><p class="font-medium">{{ detail.reason_code?.replace(/_/g, ' ') ?? '—' }}</p></div>
          <div><span class="text-gray-500">HTTP</span><p class="font-medium">{{ detail.http_status ?? '—' }}</p></div>
          <div><span class="text-gray-500">Latency</span><p class="font-medium">{{ detail.latency_ms !== null ? detail.latency_ms + ' ms' : '—' }}</p></div>
          <div><span class="text-gray-500">Cached</span><p class="font-medium">{{ detail.was_cached ? 'yes' : 'no' }}</p></div>
          <div><span class="text-gray-500">Source</span><p class="font-medium">{{ detail.source }}</p></div>
        </div>

        <div v-if="detailChecks.length">
          <p class="mb-1 font-medium text-gray-700">Checks</p>
          <ul class="divide-y divide-gray-100 rounded-lg border border-gray-200">
            <li v-for="row in detailChecks" :key="row.label" class="flex items-center justify-between px-3 py-1.5">
              <span class="text-gray-600">{{ row.label }}</span>
              <i :class="row.value ? 'pi pi-check text-emerald-600' : 'pi pi-times text-gray-400'" />
            </li>
          </ul>
        </div>

        <div v-if="detail.suggestion" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
          SendGrid suggested the domain <strong>{{ detail.suggestion }}</strong> — likely a typo.
        </div>

        <div v-if="detail.error_message" class="rounded-lg bg-red-50 px-3 py-2 text-red-700">
          <p class="font-medium">Call failed</p>
          <p class="mt-0.5 break-all">{{ detail.error_message }}</p>
        </div>

        <div>
          <Button :label="showRaw ? 'Hide raw payload' : 'Show raw payload'" text size="small" @click="showRaw = !showRaw" />
          <pre v-if="showRaw" class="mt-1 max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">{{ JSON.stringify(detail.raw_checks, null, 2) }}</pre>
        </div>
      </div>
    </Dialog>
  </div>
</template>
