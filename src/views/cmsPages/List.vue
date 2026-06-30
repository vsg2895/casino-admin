<script setup lang="ts">
import { ref, onMounted } from 'vue'
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

function reload(): void {
  store.fetchPages(siteFilter.value ? { site_id: siteFilter.value } : undefined)
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
          @change="reload"
        />
        <Button label="New Page" icon="pi pi-plus" @click="router.push({ name: 'pages-create' })" />
      </div>
    </div>

    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable :value="store.pages" :loading="store.loading" striped-rows paginator :rows="20" :pt="{ root: { class: 'text-sm' } }">
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
