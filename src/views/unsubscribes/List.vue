<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Paginator, { type PageState } from 'primevue/paginator'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { useSitesStore } from '@/stores/sitesStore'
import { listUnsubscribes, exportUnsubscribes, deleteUnsubscribe } from '@/api/unsubscribes'
import type { Unsubscribe, UnsubscribeType } from '@shared/types/unsubscribe'

const sitesStore = useSitesStore()
const toast = useToast()

const items = ref<Unsubscribe[]>([])
const loading = ref(false)
const total = ref(0)
const perPage = ref(50)
const first = ref(0) // paginator offset

const siteId = ref<number | null>(null)
const type = ref<UnsubscribeType | null>(null)
const search = ref('')

const exporting = ref(false)
const deleting = ref<Unsubscribe | null>(null)
const actionLoading = ref(false)

const siteOptions = computed(() => [
  { label: 'All sites', value: null },
  ...sitesStore.sites.map((s) => ({ label: `${s.name} (${s.domain})`, value: s.id })),
])

const typeOptions: { label: string; value: UnsubscribeType | null }[] = [
  { label: 'All', value: null },
  { label: 'Subscription', value: 'subscription' },
  { label: 'Promotion', value: 'promotion' },
]

function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    const page = Math.floor(first.value / perPage.value) + 1
    const res = await listUnsubscribes({
      page,
      site_id: siteId.value ?? undefined,
      type: type.value ?? undefined,
      search: search.value.trim() || undefined,
    })
    items.value = res.data
    total.value = res.meta.total
    perPage.value = res.meta.per_page
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load unsubscribes.', life: 4000 })
  } finally {
    loading.value = false
  }
}

function onPage(state: PageState): void {
  first.value = state.first
  reload()
}

async function doExport(): Promise<void> {
  exporting.value = true
  try {
    await exportUnsubscribes({ site_id: siteId.value ?? undefined, type: type.value ?? undefined })
  } finally {
    exporting.value = false
  }
}

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  actionLoading.value = true
  try {
    await deleteUnsubscribe(deleting.value.id)
    toast.add({ severity: 'success', summary: 'Cleared', detail: 'Opt-out removed — the address may receive this stream again.', life: 3000 })
    deleting.value = null
    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to clear opt-out.', life: 4000 })
  } finally {
    actionLoading.value = false
  }
}

// Reset to first page whenever a filter changes; debounce the search box.
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch([siteId, type], () => {
  first.value = 0
  reload()
})
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    first.value = 0
    reload()
  }, 400)
})

onMounted(async () => {
  await sitesStore.fetchSites()
  await reload()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div>
      <h2 class="text-lg font-semibold text-gray-900">Unsubscribes</h2>
      <p class="text-sm text-gray-500">
        Addresses that opted out of a stream. Clearing a row lets that address receive the stream again.
      </p>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <Select v-model="siteId" :options="siteOptions" option-label="label" option-value="value" placeholder="Site" class="w-56" />
        <SelectButton v-model="type" :options="typeOptions" option-label="label" option-value="value" :allow-empty="false" />
        <span class="p-input-icon-left">
          <InputText v-model="search" placeholder="Search email…" class="w-64" />
        </span>
      </div>
      <Button label="Export CSV" icon="pi pi-download" outlined size="small" :loading="exporting" :disabled="total === 0" @click="doExport" />
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable
        :value="items"
        :loading="loading"
        data-key="id"
        striped-rows
        :pt="{ root: { class: 'text-sm' } }"
      >
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No unsubscribes match these filters.</div>
        </template>

        <Column field="email" header="Email address">
          <template #body="{ data }: { data: Unsubscribe }">
            <span class="text-gray-900">{{ data.email }}</span>
          </template>
        </Column>

        <Column header="Stream" :style="{ width: '150px' }">
          <template #body="{ data }: { data: Unsubscribe }">
            <Tag
              :severity="data.type === 'promotion' ? 'warn' : 'info'"
              :value="data.type === 'promotion' ? 'Promotion' : 'Subscription'"
            />
          </template>
        </Column>

        <Column header="Site" :style="{ width: '200px' }">
          <template #body="{ data }: { data: Unsubscribe }">
            <span class="text-gray-700">{{ data.site?.name ?? '—' }}</span>
          </template>
        </Column>

        <Column header="Unsubscribed at" :style="{ width: '200px' }">
          <template #body="{ data }: { data: Unsubscribe }">
            <span class="text-gray-600">{{ formatDate(data.unsubscribed_at) }}</span>
          </template>
        </Column>

        <Column header="Actions" :style="{ width: '110px' }">
          <template #body="{ data }: { data: Unsubscribe }">
            <Button icon="pi pi-times-circle" text severity="danger" size="small" v-tooltip="'Clear opt-out'" @click="deleting = data" />
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

    <!-- Clear opt-out confirm -->
    <Dialog :visible="deleting !== null" modal header="Clear opt-out" :style="{ width: '440px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">
        Clear the <strong>{{ deleting?.type }}</strong> opt-out for <strong>{{ deleting?.email }}</strong>?
        They will be able to receive this stream again.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Clear opt-out" severity="danger" :loading="actionLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
