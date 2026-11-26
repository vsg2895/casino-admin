<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import Paginator, { type PageState } from 'primevue/paginator'
import { useToast } from 'primevue/usetoast'
import RecordCount from '@/components/RecordCount.vue'
import VisitDetailDialog from './VisitDetailDialog.vue'
import { countryFlag, IP_TYPE_OPTIONS } from './labels'
import { useSitesStore } from '@/stores/sitesStore'
import { pageWindow, pagerMeta } from '@/utils/pagination'
import {
  countSpecialOfferVisits,
  getSpecialOfferVisit,
  listSpecialOfferVisits,
  resolveSpecialOfferVisitGeo,
  specialOfferVisitStats,
} from '@/api/specialOfferVisits'
import { listSpecialOffers } from '@/api/specialOffers'
import { listCasinos } from '@/api/casinos'
import type {
  SpecialOfferVisit,
  SpecialOfferVisitFilters,
  SpecialOfferVisitStats,
  VisitIpType,
} from '@shared/types/specialOfferVisit'

const toast = useToast()
const sitesStore = useSitesStore()

const items = ref<SpecialOfferVisit[]>([])
const selected = ref<SpecialOfferVisit[]>([])
const loading = ref(false)
const resolving = ref(false)

const first = ref(0)
const perPage = ref(50)
const total = ref(0)
/** The REAL total, from /count. Never the paginator's estimate. */
const recordTotal = ref<number | null>(null)

const stats = ref<SpecialOfferVisitStats | null>(null)

const detailVisible = ref(false)
const detailVisit = ref<SpecialOfferVisit | null>(null)

const offers = ref<Array<{ id: number; title: string }>>([])
const casinos = ref<Array<{ id: number; name: string }>>([])

// Draft vs applied: typing in a filter must not refetch on every keystroke,
// and the badge must describe the rows actually shown.
const draft = ref<SpecialOfferVisitFilters>({})
const applied = ref<SpecialOfferVisitFilters>({})

const dateFrom = ref<Date | null>(null)
const dateTo = ref<Date | null>(null)

const isDirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(applied.value))

const siteOptions = computed(() =>
  sitesStore.sites.map((s) => ({ value: s.id, label: s.name })),
)

function isoDay(d: Date | null): string | undefined {
  if (!d) return undefined
  // Local calendar day, not UTC: an operator filtering "today" means their
  // today, and toISOString() would shift it for anyone east or west of UTC.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDateTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

async function copyIp(ip: string | null): Promise<void> {
  if (!ip) return
  try {
    await navigator.clipboard.writeText(ip)
    toast.add({ severity: 'success', summary: 'Copied', detail: ip, life: 2000 })
  } catch {
    toast.add({ severity: 'warn', summary: 'Could not copy', life: 2000 })
  }
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    const page = Math.floor(first.value / perPage.value) + 1
    const filters = applied.value

    const [res, count, statsRes] = await Promise.all([
      listSpecialOfferVisits({ page, per_page: perPage.value, ...filters }),
      // Never fatal: the badge falls back to "—" and the pager steps on.
      countSpecialOfferVisits(filters).catch(() => null),
      specialOfferVisitStats(filters).catch(() => null),
    ])

    items.value = res.data
    total.value = pagerMeta(pageWindow(res), count).total
    perPage.value = res.meta.per_page
    recordTotal.value = count
    stats.value = statsRes
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load visitor records.', life: 4000 })
  } finally {
    loading.value = false
  }
}

function applyFilters(): void {
  draft.value.date_from = isoDay(dateFrom.value)
  draft.value.date_to = isoDay(dateTo.value)
  applied.value = { ...draft.value }
  first.value = 0
  void reload()
}

function resetFilters(): void {
  draft.value = {}
  applied.value = {}
  dateFrom.value = null
  dateTo.value = null
  first.value = 0
  void reload()
}

function onPage(state: PageState): void {
  first.value = state.first
  perPage.value = state.rows
  void reload()
}

async function openDetail(visit: SpecialOfferVisit): Promise<void> {
  // Refetched rather than reused: the list response omits headers_raw and
  // geo_raw, so the row in hand cannot fill the dialog.
  try {
    const res = await getSpecialOfferVisit(visit.id)
    detailVisit.value = res.data
    detailVisible.value = true
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load the visit.', life: 4000 })
  }
}

async function reResolve(): Promise<void> {
  if (selected.value.length === 0) return
  resolving.value = true
  try {
    const queued = await resolveSpecialOfferVisitGeo(selected.value.map((v) => v.id))
    toast.add({
      severity: 'success',
      summary: 'Queued',
      // Says "queued", not "resolved": the work happens on the `low` queue and
      // the numbers here will not change until a worker picks it up.
      detail: `${queued} visit(s) queued for a fresh lookup. Results appear once the queue runs.`,
      life: 5000,
    })
    selected.value = []
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not queue the lookup.', life: 4000 })
  } finally {
    resolving.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    sitesStore.sites.length ? Promise.resolve() : sitesStore.fetchSites(),
    listSpecialOffers()
      .then((r) => { offers.value = r.data.map((o) => ({ id: o.id, title: o.title })) })
      .catch(() => { offers.value = [] }),
    listCasinos()
      .then((r) => { casinos.value = r.data.map((c) => ({ id: c.id, name: c.name })) })
      .catch(() => { casinos.value = [] }),
  ])
  await reload()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Special Offers Visitors Ip Info</h2>
        <p class="mt-0.5 text-sm text-gray-500">
          Addresses recorded on Special Offer pages, with their provenance. Read-only.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <RecordCount label="Total visits" :total="recordTotal" :loading="loading" />
        <Button
          label="Re-resolve geo"
          icon="pi pi-refresh"
          size="small"
          outlined
          :disabled="selected.length === 0"
          :loading="resolving"
          @click="reResolve"
        />
      </div>
    </div>

    <!-- Stat tiles. Each number comes from /stats under the SAME filters as
         the table, so the tiles and the rows always describe one set. -->
    <div v-if="stats" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <p class="text-xs text-gray-500">Today</p>
        <p class="text-xl font-semibold tabular-nums">{{ stats.visits_today.toLocaleString() }}</p>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <p class="text-xs text-gray-500">Last 7 days</p>
        <p class="text-xl font-semibold tabular-nums">{{ stats.visits_7d.toLocaleString() }}</p>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <p class="text-xs text-gray-500">Last 30 days</p>
        <p class="text-xl font-semibold tabular-nums">{{ stats.visits_30d.toLocaleString() }}</p>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <p class="text-xs text-gray-500">Unique addresses</p>
        <p class="text-xl font-semibold tabular-nums">{{ stats.unique_ips.toLocaleString() }}</p>
      </div>
      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <p class="text-xs text-gray-500">VPN suspected</p>
        <p class="text-xl font-semibold tabular-nums">
          {{ stats.vpn_percent }}%
          <span class="text-sm font-normal text-gray-500">({{ stats.vpn_suspected.toLocaleString() }})</span>
        </p>
      </div>
    </div>

    <div v-if="stats && stats.top_countries.length" class="flex flex-wrap items-center gap-2 text-sm">
      <span class="text-gray-500">Top countries:</span>
      <span v-for="c in stats.top_countries" :key="c.country_code" class="rounded bg-gray-100 px-2 py-0.5">
        {{ countryFlag(c.country_code) }} {{ c.country_code }}
        <span class="text-gray-500">{{ c.visits.toLocaleString() }}</span>
      </span>
    </div>

    <!-- Filters -->
    <div class="grid gap-3 rounded-lg border border-gray-200 bg-white p-3 md:grid-cols-4">
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700">From</label>
        <DatePicker v-model="dateFrom" date-format="yy-mm-dd" show-icon fluid />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700">To</label>
        <DatePicker v-model="dateTo" date-format="yy-mm-dd" show-icon fluid />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700">Site</label>
        <Select
          v-model="draft.site_id"
          :options="siteOptions"
          option-label="label"
          option-value="value"
          placeholder="Any site"
          show-clear
          fluid
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700">Offer</label>
        <Select
          v-model="draft.special_offer_id"
          :options="offers"
          option-label="title"
          option-value="id"
          placeholder="Any offer"
          filter
          show-clear
          fluid
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700">Casino</label>
        <Select
          v-model="draft.casino_id"
          :options="casinos"
          option-label="name"
          option-value="id"
          placeholder="Any casino"
          filter
          show-clear
          fluid
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700">Country</label>
        <InputText v-model="draft.country_code" placeholder="GB" maxlength="2" fluid />
      </div>
      <div>
        <!-- Searches EVERY address of a visit, not just the primary one. -->
        <label class="mb-1 block text-xs font-medium text-gray-700">IP contains</label>
        <InputText v-model="draft.ip" placeholder="203.0.113" fluid />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700">Seen as</label>
        <Select
          v-model="draft.ip_type as VisitIpType | undefined"
          :options="IP_TYPE_OPTIONS"
          option-label="label"
          option-value="value"
          placeholder="Any type"
          show-clear
          fluid
        />
      </div>

      <div class="flex items-center gap-2">
        <ToggleSwitch v-model="draft.mismatch_only as boolean" input-id="f-mismatch" />
        <label for="f-mismatch" class="text-sm text-gray-700">IP mismatch only</label>
      </div>
      <div class="flex items-center gap-2">
        <ToggleSwitch v-model="draft.vpn_only as boolean" input-id="f-vpn" />
        <label for="f-vpn" class="text-sm text-gray-700">VPN suspected only</label>
      </div>
      <div class="flex items-center gap-2">
        <ToggleSwitch v-model="draft.has_ipv6 as boolean" input-id="f-v6" />
        <label for="f-v6" class="text-sm text-gray-700">Has IPv6</label>
      </div>

      <div class="flex items-end gap-2">
        <Button label="Apply" icon="pi pi-filter" size="small" :disabled="!isDirty" :loading="loading" @click="applyFilters" />
        <Button label="Reset" icon="pi pi-times" size="small" outlined @click="resetFilters" />
      </div>
    </div>

    <DataTable
      v-model:selection="selected"
      :value="items"
      :loading="loading"
      striped-rows
      data-key="id"
      :pt="{ root: { class: 'text-sm' } }"
    >
      <template #empty>
        <div class="py-6 text-center text-gray-500">
          No visits recorded for these filters.
        </div>
      </template>

      <Column selection-mode="multiple" header-style="width:3rem" />

      <Column header="When">
        <template #body="{ data }">{{ formatDateTime(data.created_at) }}</template>
      </Column>

      <Column header="Offer">
        <template #body="{ data }">
          <RouterLink
            v-if="data.special_offer"
            :to="`/special-offers/${data.special_offer.id}/edit`"
            class="text-primary-600 hover:underline"
          >
            {{ data.special_offer.title }}
          </RouterLink>
          <span v-else class="text-gray-400">—</span>
        </template>
      </Column>

      <Column header="Casino">
        <template #body="{ data }">{{ data.special_offer?.casino?.name ?? '—' }}</template>
      </Column>

      <Column header="Site">
        <template #body="{ data }">{{ data.site?.name ?? '—' }}</template>
      </Column>

      <Column header="Primary IP">
        <template #body="{ data }">
          <button
            type="button"
            class="font-mono hover:underline"
            title="Copy"
            @click="copyIp(data.primary_ip)"
          >
            {{ data.primary_ip ?? '—' }}
          </button>
        </template>
      </Column>

      <Column header="Location">
        <template #body="{ data }">
          <span v-if="data.country_code">{{ countryFlag(data.country_code) }} {{ data.country_code }}</span>
          <span v-else class="text-gray-400">—</span>
          <div v-if="data.city" class="text-xs text-gray-500">{{ data.city }}</div>
        </template>
      </Column>

      <Column header="ISP">
        <template #body="{ data }">
          <span class="text-xs">{{ data.isp ?? '—' }}</span>
        </template>
      </Column>

      <Column header="IPv4 / IPv6">
        <template #body="{ data }">
          <div class="font-mono text-xs">{{ data.client_ipv4 ?? '—' }}</div>
          <div class="font-mono text-xs text-gray-500">{{ data.client_ipv6 ?? '—' }}</div>
        </template>
      </Column>

      <Column header="IPs">
        <template #body="{ data }">
          <span class="tabular-nums">{{ data.unique_ip_count }}</span>
        </template>
      </Column>

      <Column header="Flags">
        <template #body="{ data }">
          <div class="flex flex-wrap gap-1">
            <Tag v-if="data.ip_mismatch" value="IP mismatch" severity="danger" />
            <Tag v-if="data.vpn_suspected" value="VPN suspected" severity="warn" />
            <Tag v-if="data.is_proxy" value="Proxy" severity="danger" />
            <Tag v-if="data.is_hosting" value="Hosting" severity="info" />
            <span
              v-if="!data.ip_mismatch && !data.vpn_suspected && !data.is_proxy && !data.is_hosting"
              class="text-gray-400"
            >—</span>
          </div>
        </template>
      </Column>

      <Column header-style="width:5rem">
        <template #body="{ data }">
          <Button icon="pi pi-eye" text size="small" title="Detail" @click="openDetail(data)" />
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

    <VisitDetailDialog v-model:visible="detailVisible" :visit="detailVisit" />
  </div>
</template>
