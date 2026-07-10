<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import { useNewsletterStore } from '@/stores/newsletterStore'
import { useSitesStore } from '@/stores/sitesStore'
import { exportNewsletters, importNewsletters } from '@/api/newsletter'
import type { Newsletter } from '@shared/types/newsletter'

type View = 'active' | 'trash'

const store = useNewsletterStore()
const sitesStore = useSitesStore()
const toast = useToast()

const siteId = ref<number | null>(null)
const view = ref<View>('active')
const isTrash = computed(() => view.value === 'trash')
const viewOptions: { label: string; value: View }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Trash', value: 'trash' },
]

const email = ref('')
const adding = ref(false)
const exporting = ref(false)
const importing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const selected = ref<Newsletter[]>([])
const selectedIds = computed(() => selected.value.map((n) => n.id))

const siteOptions = computed(() => sitesStore.sites.map((s) => ({ label: `${s.name} (${s.domain})`, value: s.id })))
const currentSiteLabel = computed(() => sitesStore.sites.find((s) => s.id === siteId.value)?.name ?? 'this site')

function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

async function reload(): Promise<void> {
  await store.fetchNewsletters({ site_id: siteId.value ?? undefined, trashed: isTrash.value })
}

async function add(): Promise<void> {
  if (!siteId.value || !email.value.trim()) return
  adding.value = true
  try {
    await store.add({ site_id: siteId.value, email: email.value.trim() })
    email.value = ''
    toast.add({ severity: 'success', summary: 'Added', detail: 'Subscriber added.', life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to add subscriber.', life: 4000 })
  } finally {
    adding.value = false
  }
}

async function doExport(): Promise<void> {
  exporting.value = true
  try {
    await exportNewsletters(siteId.value ?? undefined)
  } finally {
    exporting.value = false
  }
}

// ── Excel / CSV import ────────────────────────────────────────────────────────
function triggerImport(): void {
  if (!siteId.value) {
    toast.add({ severity: 'warn', summary: 'Pick a site', detail: 'Choose a site to import subscribers into.', life: 4000 })
    return
  }
  fileInput.value?.click()
}

async function onFileSelected(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-picking the same file
  if (!file || !siteId.value) return

  importing.value = true
  try {
    const res = await importNewsletters(siteId.value, file)
    toast.add({ severity: 'success', summary: 'Import complete', detail: res.message, life: 5000 })
    await reload()
  } catch (err: unknown) {
    const detail =
      axios.isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message ?? 'Import failed. Check the file and try again.')
        : 'Import failed. Check the file and try again.'
    toast.add({ severity: 'error', summary: 'Import failed', detail, life: 6000 })
  } finally {
    importing.value = false
  }
}

// ── Dialog state ────────────────────────────────────────────────────────────
const deletingOne = ref<Newsletter | null>(null) // active: soft delete
const showBulkDelete = ref(false)
const showAllDelete = ref(false)
const forcingOne = ref<Newsletter | null>(null) // trash: permanent delete
const showBulkForce = ref(false)
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

function notify(detail: string): void {
  toast.add({ severity: 'success', summary: 'Done', detail, life: 2500 })
}

// Active view — soft delete
function confirmDeleteOne(): Promise<void> {
  return run(async () => {
    if (!deletingOne.value) return
    await store.remove(deletingOne.value.id)
    deletingOne.value = null
    selected.value = []
    notify('Subscriber moved to trash.')
  })
}

function confirmDeleteSelected(): Promise<void> {
  return run(async () => {
    const n = await store.removeMany(selectedIds.value)
    selected.value = []
    showBulkDelete.value = false
    notify(`${n} subscriber(s) moved to trash.`)
  })
}

function confirmDeleteAll(): Promise<void> {
  return run(async () => {
    const n = await store.removeAll(siteId.value ?? undefined)
    selected.value = []
    showAllDelete.value = false
    notify(`${n} subscriber(s) moved to trash.`)
  })
}

// Trash view — restore (immediate) + permanent delete (confirmed)
function restoreOne(n: Newsletter): Promise<void> {
  return run(async () => {
    await store.restore(n.id)
    selected.value = []
    notify('Subscriber restored.')
  })
}

function restoreSelected(): Promise<void> {
  return run(async () => {
    const n = await store.restoreMany(selectedIds.value)
    selected.value = []
    notify(`${n} subscriber(s) restored.`)
  })
}

function confirmForceOne(): Promise<void> {
  return run(async () => {
    if (!forcingOne.value) return
    await store.forceDelete(forcingOne.value.id)
    forcingOne.value = null
    selected.value = []
    notify('Subscriber permanently deleted.')
  })
}

function confirmForceSelected(): Promise<void> {
  return run(async () => {
    const n = await store.forceDeleteMany(selectedIds.value)
    selected.value = []
    showBulkForce.value = false
    notify(`${n} subscriber(s) permanently deleted.`)
  })
}

watch([siteId, view], async () => {
  selected.value = []
  await reload()
})

onMounted(async () => {
  await sitesStore.fetchSites()
  siteId.value = sitesStore.sites[0]?.id ?? null
  await reload()
})
</script>

<template>
  <div class="space-y-8">
    <section v-if="!isTrash">
      <h2 class="mb-4 text-xl font-semibold text-indigo-500">Add Newsletter</h2>
      <form class="flex flex-wrap gap-3" @submit.prevent="add">
        <Select v-model="siteId" :options="siteOptions" option-label="label" option-value="value" placeholder="Site" class="w-56" />
        <InputText v-model="email" type="email" class="flex-1" placeholder="user@gmail.com" />
        <Button type="submit" label="Send" :loading="adding" :disabled="!siteId || !email.trim()" />
      </form>
    </section>

    <section>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h2 class="text-xl font-semibold text-indigo-500">Newsletter list</h2>
          <SelectButton v-model="view" :options="viewOptions" option-label="label" option-value="value" :allow-empty="false" />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <!-- Active view actions -->
          <template v-if="!isTrash">
            <Button
              v-if="selectedIds.length > 0"
              :label="`Delete selected (${selectedIds.length})`"
              icon="pi pi-trash"
              severity="danger"
              size="small"
              @click="showBulkDelete = true"
            />
            <Button label="Delete all" icon="pi pi-trash" severity="danger" outlined size="small" :disabled="store.items.length === 0" @click="showAllDelete = true" />
            <Button label="Import Excel" icon="pi pi-upload" outlined size="small" :loading="importing" v-tooltip.top="'Upload an .xlsx or .csv with an Email column'" @click="triggerImport" />
            <Button label="Export CSV" icon="pi pi-download" outlined size="small" :loading="exporting" @click="doExport" />
            <input ref="fileInput" type="file" accept=".xlsx,.csv" class="hidden" @change="onFileSelected" />
          </template>

          <!-- Trash view actions -->
          <template v-else>
            <Button
              v-if="selectedIds.length > 0"
              :label="`Restore selected (${selectedIds.length})`"
              icon="pi pi-replay"
              severity="success"
              size="small"
              :loading="actionLoading"
              @click="restoreSelected"
            />
            <Button
              v-if="selectedIds.length > 0"
              :label="`Delete permanently (${selectedIds.length})`"
              icon="pi pi-times-circle"
              severity="danger"
              size="small"
              @click="showBulkForce = true"
            />
          </template>
        </div>
      </div>

      <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <DataTable
          v-model:selection="selected"
          :value="store.items"
          :loading="store.loading"
          data-key="id"
          striped-rows
          paginator
          :rows="20"
          :pt="{ root: { class: 'text-sm' } }"
        >
          <template #empty>
            <div class="py-10 text-center text-sm text-gray-400">
              {{ isTrash ? 'Trash is empty.' : 'No subscribers yet.' }}
            </div>
          </template>

          <Column selection-mode="multiple" :style="{ width: '3rem' }" />

          <Column field="email" header="Email address">
            <template #body="{ data }: { data: Newsletter }">
              <span class="text-gray-900">{{ data.email }}</span>
            </template>
          </Column>

          <Column header="Name" :style="{ width: '200px' }">
            <template #body="{ data }: { data: Newsletter }">
              <span v-if="data.full_name" class="text-gray-700">{{ data.full_name }}</span>
              <span v-else class="text-gray-300">—</span>
            </template>
          </Column>

          <Column header="Verified" :style="{ width: '120px' }">
            <template #body="{ data }: { data: Newsletter }">
              <span
                v-if="data.verified"
                class="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
              >
                <i class="pi pi-check-circle text-[11px]" /> Verified
              </span>
              <span
                v-else
                class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
              >
                <i class="pi pi-clock text-[11px]" /> Pending
              </span>
            </template>
          </Column>

          <Column :header="isTrash ? 'Deleted at' : 'Created at'" :style="{ width: '220px' }">
            <template #body="{ data }: { data: Newsletter }">
              <span class="text-gray-600">{{ formatDate(isTrash ? data.deleted_at : data.created_at) }}</span>
            </template>
          </Column>

          <Column header="Actions" :style="{ width: '130px' }">
            <template #body="{ data }: { data: Newsletter }">
              <template v-if="!isTrash">
                <Button icon="pi pi-trash" text severity="danger" size="small" v-tooltip="'Move to trash'" @click="deletingOne = data" />
              </template>
              <template v-else>
                <Button icon="pi pi-replay" text severity="success" size="small" v-tooltip="'Restore'" :loading="actionLoading" @click="restoreOne(data)" />
                <Button icon="pi pi-times-circle" text severity="danger" size="small" v-tooltip="'Delete permanently'" @click="forcingOne = data" />
              </template>
            </template>
          </Column>
        </DataTable>
      </div>
    </section>

    <!-- Active: single soft delete -->
    <Dialog :visible="deletingOne !== null" modal header="Move to trash" :style="{ width: '400px' }" @update:visible="deletingOne = null">
      <p class="text-sm text-gray-700">Move <strong>{{ deletingOne?.email }}</strong> to trash?</p>
      <template #footer>
        <Button label="Cancel" text @click="deletingOne = null" />
        <Button label="Move to trash" severity="danger" :loading="actionLoading" @click="confirmDeleteOne" />
      </template>
    </Dialog>

    <!-- Active: bulk soft delete -->
    <Dialog :visible="showBulkDelete" modal header="Delete selected" :style="{ width: '400px' }" @update:visible="showBulkDelete = false">
      <p class="text-sm text-gray-700">Move <strong>{{ selectedIds.length }}</strong> selected subscriber(s) to trash?</p>
      <template #footer>
        <Button label="Cancel" text @click="showBulkDelete = false" />
        <Button label="Move to trash" severity="danger" :loading="actionLoading" @click="confirmDeleteSelected" />
      </template>
    </Dialog>

    <!-- Active: delete all -->
    <Dialog :visible="showAllDelete" modal header="Delete all subscribers" :style="{ width: '420px' }" @update:visible="showAllDelete = false">
      <p class="text-sm text-gray-700">
        Move <strong>all</strong> subscribers for <strong>{{ currentSiteLabel }}</strong> to trash? You can restore them later from the Trash tab.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="showAllDelete = false" />
        <Button label="Move all to trash" severity="danger" :loading="actionLoading" @click="confirmDeleteAll" />
      </template>
    </Dialog>

    <!-- Trash: single permanent delete -->
    <Dialog :visible="forcingOne !== null" modal header="Delete permanently" :style="{ width: '420px' }" @update:visible="forcingOne = null">
      <p class="text-sm text-gray-700">
        Permanently delete <strong>{{ forcingOne?.email }}</strong>? This <strong>cannot be undone</strong>.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="forcingOne = null" />
        <Button label="Delete permanently" severity="danger" :loading="actionLoading" @click="confirmForceOne" />
      </template>
    </Dialog>

    <!-- Trash: bulk permanent delete -->
    <Dialog :visible="showBulkForce" modal header="Delete permanently" :style="{ width: '420px' }" @update:visible="showBulkForce = false">
      <p class="text-sm text-gray-700">
        Permanently delete <strong>{{ selectedIds.length }}</strong> selected subscriber(s)? This <strong>cannot be undone</strong>.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="showBulkForce = false" />
        <Button label="Delete permanently" severity="danger" :loading="actionLoading" @click="confirmForceSelected" />
      </template>
    </Dialog>
  </div>
</template>
