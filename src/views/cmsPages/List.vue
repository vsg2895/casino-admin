<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import { useCmsPagesStore } from '@/stores/cmsPagesStore'
import { useSitesStore } from '@/stores/sitesStore'
import * as cmsApi from '@/api/cmsPages'
import type { CmsPageAdmin } from '@shared/types/cmsPage'

const router = useRouter()
const store = useCmsPagesStore()
const sitesStore = useSitesStore()
const toast = useToast()

const siteFilter = ref<number | null>(null)

// ── Server-side pagination ────────────────────────────────────────────────────
//
// The API paginates this list, so the table is `lazy`: it renders exactly the
// rows the API returned and asks us for the next page.
//
// Previously it was a plain client-side `paginator` over one API page, which
// capped the list at whatever that page held while drawing a paginator that
// looked complete. Eleven legal pages per site hid it — the ceiling is only
// reached once the sites between them hold more pages than one response
// carries.
const page = ref(1)
const perPage = ref(50)
const totalRecords = computed(() => store.meta?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)

function fetchPage(): Promise<void> {
  return store.fetchPages({
    page: page.value,
    per_page: perPage.value,
    ...(siteFilter.value ? { site_id: siteFilter.value } : {}),
  })
}

async function reload(): Promise<void> {
  await fetchPage()

  // Deleting the last row of the last page leaves us past the end of the list.
  const lastPage = store.meta?.last_page ?? 1
  if (page.value > lastPage) {
    page.value = lastPage
    await fetchPage()
  }
}

async function onPage(event: { page: number; rows: number }): Promise<void> {
  page.value = event.page + 1 // PrimeVue counts from 0, Laravel from 1
  perPage.value = event.rows
  await fetchPage()
}

// A filter change restarts at page one: staying on page 4 of a list that no
// longer has four pages shows an empty table.
function onFilterChange(): void {
  page.value = 1
  void reload()
}

const deleting = ref<CmsPageAdmin | null>(null)
const deleteLoading = ref(false)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'medium' })
}

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  deleteLoading.value = true
  try {
    await cmsApi.deleteCmsPage(deleting.value.id)
    store.remove(deleting.value.id)
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Page deleted.', life: 2500 })
    deleting.value = null
    // Re-fetch: under server-side pagination the row that moves up from the
    // next page exists only on the server.
    void reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete page.', life: 4000 })
  } finally {
    deleteLoading.value = false
  }
}

onMounted(() => {
  sitesStore.fetchSites()
  reload()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Pages</h2>
        <p class="text-sm text-gray-500">Manage each site's legal &amp; informational pages.</p>
      </div>
      <div class="flex items-center gap-2">
        <Select
          v-model="siteFilter"
          :options="sitesStore.sites"
          option-label="name"
          option-value="id"
          placeholder="All sites"
          show-clear
          class="w-52"
          @change="onFilterChange"
        />
        <Button label="New Page" icon="pi pi-plus" @click="router.push({ name: 'pages-create' })" />
      </div>
    </div>

    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable
        :value="store.pages"
        :loading="store.loading"
        data-key="id"
        striped-rows
        lazy
        paginator
        :rows="perPage"
        :first="first"
        :total-records="totalRecords"
        :rows-per-page-options="[20, 50, 100]"
        current-page-report-template="{first}–{last} of {totalRecords}"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport"
        :pt="{ root: { class: 'text-sm' } }"
        @page="onPage"
      >
        <template #empty>
          <div class="py-12 text-center text-sm text-gray-400">No pages yet. Click "New Page" to add one.</div>
        </template>

        <Column field="title" header="Title">
          <template #body="{ data }: { data: CmsPageAdmin }">
            <span class="font-medium text-gray-900">{{ data.title }}</span>
          </template>
        </Column>

        <Column field="site_name" header="Site" :style="{ width: '150px' }">
          <template #body="{ data }: { data: CmsPageAdmin }">
            <span class="text-gray-600">{{ data.site_name ?? '—' }}</span>
          </template>
        </Column>

        <Column field="slug" header="Slug">
          <template #body="{ data }: { data: CmsPageAdmin }">
            <span class="font-mono text-xs text-gray-500">/{{ data.slug }}</span>
          </template>
        </Column>

        <Column header="Status" :style="{ width: '110px' }">
          <template #body="{ data }: { data: CmsPageAdmin }">
            <Tag :severity="data.status === 'published' ? 'success' : 'warn'" :value="data.status === 'published' ? 'Published' : 'Draft'" />
          </template>
        </Column>

        <Column header="Updated" :style="{ width: '140px' }">
          <template #body="{ data }: { data: CmsPageAdmin }">
            <span class="text-gray-500">{{ formatDate(data.updated_at) }}</span>
          </template>
        </Column>

        <Column header="Actions" :style="{ width: '110px' }">
          <template #body="{ data }: { data: CmsPageAdmin }">
            <div class="flex items-center gap-1">
              <Button icon="pi pi-pencil" size="small" text severity="secondary" v-tooltip="'Edit'" @click="router.push({ name: 'pages-edit', params: { id: data.id } })" />
              <Button icon="pi pi-trash" size="small" text severity="danger" v-tooltip="'Delete'" @click="deleting = data" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog :visible="deleting !== null" modal header="Delete Page" :style="{ width: '420px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">Delete <strong>{{ deleting?.title }}</strong> (<span class="font-mono">/{{ deleting?.slug }}</span>)<span v-if="deleting?.site_name"> from <strong>{{ deleting.site_name }}</strong></span>? This action cannot be undone.</p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" severity="danger" :loading="deleteLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
