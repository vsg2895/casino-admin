<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Paginator, { type PageState } from 'primevue/paginator'
import { useToast } from 'primevue/usetoast'
import { useSitesStore } from '@/stores/sitesStore'
import { listPromotionHistory } from '@/api/promotionHistory'
import type { PromotionEmailHistory } from '@shared/types/promotionEmailHistory'

const sitesStore = useSitesStore()
const toast = useToast()

const items = ref<PromotionEmailHistory[]>([])
const loading = ref(false)
const total = ref(0)
const perPage = ref(50)
const first = ref(0)

const siteId = ref<number | null>(null)
const from = ref('')
const to = ref('')
const search = ref('')

const siteOptions = computed(() => [
  { label: 'All sites', value: null },
  ...sitesStore.sites.map((s) => ({ label: `${s.name} (${s.domain})`, value: s.id })),
])

function formatDateTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    const page = Math.floor(first.value / perPage.value) + 1
    const res = await listPromotionHistory({
      page,
      site_id: siteId.value ?? undefined,
      from: from.value || undefined,
      to: to.value || undefined,
      search: search.value.trim() || undefined,
    })
    items.value = res.data
    total.value = res.meta.total
    perPage.value = res.meta.per_page
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load history.', life: 4000 })
  } finally {
    loading.value = false
  }
}

function onPage(state: PageState): void {
  first.value = state.first
  reload()
}

function resetToFirstAndReload(): void {
  first.value = 0
  reload()
}

// Filters reset to page 1; search is debounced.
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch([siteId, from, to], resetToFirstAndReload)
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(resetToFirstAndReload, 400)
})

function clearFilters(): void {
  siteId.value = null
  from.value = ''
  to.value = ''
  search.value = ''
}

onMounted(async () => {
  await sitesStore.fetchSites()
  await reload()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div>
      <h2 class="text-lg font-semibold text-gray-900">Promotion History</h2>
      <p class="text-sm text-gray-500">
        Every promotion email delivered — filter by site and date, or search by the start of an email address.
      </p>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-wrap items-end gap-2">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500">Site</label>
          <Select v-model="siteId" :options="siteOptions" option-label="label" option-value="value" placeholder="Site" class="w-52" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500">From</label>
          <input type="date" v-model="from" class="h-10 rounded-md border border-gray-300 px-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500">To</label>
          <input type="date" v-model="to" class="h-10 rounded-md border border-gray-300 px-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500">Email starts with</label>
          <InputText v-model="search" placeholder="e.g. john" class="w-56" />
        </div>
      </div>
      <Button label="Clear" icon="pi pi-filter-slash" text size="small" @click="clearFilters" />
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable :value="items" :loading="loading" striped-rows data-key="id" :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No delivery history matches these filters.</div>
        </template>

        <Column field="email" header="Email address">
          <template #body="{ data }: { data: PromotionEmailHistory }">
            <span class="text-gray-900">{{ data.email }}</span>
          </template>
        </Column>

        <Column header="Site" :style="{ width: '220px' }">
          <template #body="{ data }: { data: PromotionEmailHistory }">
            <span class="text-gray-700">{{ data.site?.name ?? '—' }}</span>
          </template>
        </Column>

        <Column header="Sent date" :style="{ width: '160px' }">
          <template #body="{ data }: { data: PromotionEmailHistory }">
            <span class="text-gray-600">{{ data.sent_date }}</span>
          </template>
        </Column>

        <Column header="Recorded" :style="{ width: '180px' }">
          <template #body="{ data }: { data: PromotionEmailHistory }">
            <span class="text-gray-400">{{ formatDateTime(data.created_at) }}</span>
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
