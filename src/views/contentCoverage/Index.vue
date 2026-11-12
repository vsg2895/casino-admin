<script setup lang="ts">
/**
 * Which casinos / offers carry their own content on which site.
 *
 * Every cell links to the edit page opened on that site (?site=<slug>), so the
 * grid doubles as the to-do list for writing per-site texts.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SelectButton from 'primevue/selectbutton'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import * as siteContentsApi from '@/api/siteContents'
import type { SiteContentEntity } from '@/api/siteContents'
import type { ContentCoverage, CoverageStatus } from '@shared/types/siteContent'

const route = useRoute()
const router = useRouter()

const type = ref<SiteContentEntity>(route.query.type === 'offer' ? 'offer' : 'casino')
const coverage = ref<ContentCoverage | null>(null)
const loading = ref(false)
const search = ref('')
const siteFilter = ref<string | null>(null)
const statusFilter = ref<CoverageStatus | null>(null)

const typeOptions = [
  { label: 'Casinos', value: 'casino' },
  { label: 'Special offers', value: 'offer' },
]
const statusOptions = [
  { label: 'Any status', value: null },
  { label: 'Custom', value: 'custom' },
  { label: 'Uses default', value: 'default' },
  { label: 'Not attached', value: 'not_attached' },
]

const siteOptions = computed(() => [
  { label: 'All sites', value: null },
  ...(coverage.value?.sites ?? []).map((s) => ({ label: s.name, value: s.slug })),
])

const visibleSites = computed(() => (coverage.value?.sites ?? []).filter((s) => siteFilter.value === null || s.slug === siteFilter.value))

const rows = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (coverage.value?.rows ?? []).filter((row) => {
    if (term !== '' && !`${row.name} ${row.casino_name ?? ''}`.toLowerCase().includes(term)) return false
    if (statusFilter.value === null) return true
    return visibleSites.value.some((s) => row.cells[s.slug] === statusFilter.value)
  })
})

/** Custom cells / publishable cells, across the visible sites. */
const progress = computed(() => {
  let custom = 0
  let total = 0
  for (const row of coverage.value?.rows ?? []) {
    for (const s of visibleSites.value) {
      const cell = row.cells[s.slug]
      if (cell === 'not_attached') continue
      total++
      if (cell === 'custom') custom++
    }
  }
  return { custom, total }
})

const LABEL: Record<CoverageStatus, string> = { custom: 'Custom', default: 'Uses default', not_attached: '—' }
const CLASS: Record<CoverageStatus, string> = {
  custom: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  default: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
  not_attached: 'text-gray-300 hover:bg-gray-50',
}

function editRoute(id: number, slug: string) {
  return { name: type.value === 'casino' ? 'casinos-edit' : 'special-offers-edit', params: { id }, query: { site: slug } }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    coverage.value = (await siteContentsApi.getContentCoverage(type.value)).data
  } finally {
    loading.value = false
  }
}

watch(type, (value) => {
  void router.replace({ query: { ...route.query, type: value } })
  void load()
})
onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold text-indigo-500">Content Coverage</h2>
        <p class="text-xs text-gray-500">
          Which sites have their own description and meta.
          <template v-if="progress.total > 0">{{ progress.custom }} of {{ progress.total }} published items are custom.</template>
        </p>
      </div>
      <SelectButton v-model="type" :options="typeOptions" option-label="label" option-value="value" :allow-empty="false" />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <InputText v-model="search" :placeholder="type === 'casino' ? 'Search casinos' : 'Search offers or casinos'" class="w-64" />
      <Select v-model="siteFilter" :options="siteOptions" option-label="label" option-value="value" filter placeholder="All sites" class="w-56" aria-label="Site" />
      <Select v-model="statusFilter" :options="statusOptions" option-label="label" option-value="value" placeholder="Any status" class="w-44" aria-label="Status" />
    </div>

    <div v-if="loading && !coverage" class="py-12 text-center text-sm text-gray-400">Loading…</div>
    <div v-else-if="rows.length === 0" class="py-12 text-center text-sm text-gray-400">Nothing matches these filters.</div>

    <div v-else class="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="border-b border-gray-100 text-left text-xs text-gray-500">
            <th class="sticky left-0 z-10 bg-white px-3 py-2 font-medium">{{ type === 'casino' ? 'Casino' : 'Offer' }}</th>
            <th v-for="s in visibleSites" :key="s.slug" class="whitespace-nowrap px-2 py-2 text-center font-medium">{{ s.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" class="border-b border-gray-50 last:border-0">
            <td class="sticky left-0 z-10 bg-white px-3 py-2">
              <span class="block max-w-[18rem] truncate font-medium text-gray-800">{{ row.name }}</span>
              <span v-if="row.casino_name" class="block truncate text-xs text-gray-400">{{ row.casino_name }}</span>
            </td>
            <td v-for="s in visibleSites" :key="s.slug" class="px-1 py-1 text-center">
              <RouterLink
                :to="editRoute(row.id, s.slug)"
                class="block whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium"
                :class="CLASS[row.cells[s.slug] ?? 'not_attached']"
                :title="`${row.name} on ${s.name}`"
              >
                {{ LABEL[row.cells[s.slug] ?? 'not_attached'] }}
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
