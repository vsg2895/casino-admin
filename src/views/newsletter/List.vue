<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import { useNewsletterStore } from '@/stores/newsletterStore'
import { useSitesStore } from '@/stores/sitesStore'
import { exportNewsletters, importNewsletters, getImportStatus, countNewsletters } from '@/api/newsletter'
import RecordCount from '@/components/RecordCount.vue'
import type { Newsletter } from '@shared/types/newsletter'
import type { NewsletterImportProgress } from '@shared/types/newsletterImport'

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

// Verification filter. Tri-state, so null must mean "all" — sending `false`
// for the unfiltered case would silently narrow the list to unverified only.
type VerifiedFilter = boolean | null
const verifiedFilter = ref<VerifiedFilter>(null)
const verifiedOptions: { label: string; value: VerifiedFilter }[] = [
  { label: 'All', value: null },
  { label: 'Verified', value: true },
  { label: 'Unverified', value: false },
]

const email = ref('')
const adding = ref(false)
const exporting = ref(false)
const importing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const pendingFile = ref<File | null>(null)
const showImportModal = ref(false)
const importVerified = ref(false)

const selected = ref<Newsletter[]>([])
const selectedIds = computed(() => selected.value.map((n) => n.id))

const siteOptions = computed(() => sitesStore.sites.map((s) => ({ label: `${s.name} (${s.domain})`, value: s.id })))
const currentSiteLabel = computed(() => sitesStore.sites.find((s) => s.id === siteId.value)?.name ?? 'this site')

function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

// ── Server-side pagination ────────────────────────────────────────────────────
// The table is `lazy`: it renders exactly the rows the API returned and asks us
// for the next page. Paginating client-side instead would silently cap the list
// at whatever one API page contained — 50 rows looking like a complete list of
// three pages, however many subscribers actually exist.
const page = ref(1)
const perPage = ref(50)
const totalRecords = computed(() => store.meta?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)

// Total from the dedicated COUNT endpoint — never from the listing response,
// so the paginated query stays free of counting work as the list grows.
const recordTotal = ref<number | null>(null)

// One definition of "what is the admin looking at", shared by the listing and
// the count so the badge can never disagree with the rows on screen.
function activeFilters(): { site_id?: number; trashed: boolean; verified?: boolean } {
  return {
    site_id: siteId.value ?? undefined,
    trashed: isTrash.value,
    // Omitted entirely when null, so the server sees no ?verified at all.
    ...(verifiedFilter.value === null ? {} : { verified: verifiedFilter.value }),
  }
}

function fetchPage(): Promise<void> {
  return store.fetchNewsletters({
    page: page.value,
    per_page: perPage.value,
    ...activeFilters(),
  })
}

// Same filters as the listing, issued independently and concurrently.
// Never fatal — a failed count must not take the listing down with it.
async function fetchCount(): Promise<void> {
  try {
    recordTotal.value = await countNewsletters(activeFilters())
  } catch {
    recordTotal.value = null
  }
}

async function reload(): Promise<void> {
  await Promise.all([fetchPage(), fetchCount()])

  // A bulk delete can leave the current page past the end of the list. Step
  // back to the last real page rather than showing an empty table.
  const lastPage = store.meta?.last_page ?? 1
  if (page.value > lastPage) {
    page.value = lastPage
    await fetchPage()
  }
}

async function onPage(event: { page: number; rows: number }): Promise<void> {
  page.value = event.page + 1 // PrimeVue is 0-based, Laravel is 1-based
  perPage.value = event.rows
  selected.value = [] // selection is per page — never carry it across
  await reload()
}

// Any filter change restarts at page one; staying on page 40 of a list that no
// longer has 40 pages would render an empty table.
async function reloadFromFirstPage(): Promise<void> {
  page.value = 1
  await reload()
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

// A file was picked → stage it and ask whether to import as verified before sending.
function onFileSelected(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-picking the same file
  if (!file || !siteId.value) return

  pendingFile.value = file
  importVerified.value = false // default: import as unverified
  showImportModal.value = true
}

// The import runs on the queue, so the upload call only tells us it was
// accepted. Progress is polled until the job reports itself finished.
const importProgress = ref<NewsletterImportProgress | null>(null)
const IMPORT_POLL_MS = 1500
const IMPORT_POLL_TIMEOUT_MS = 15 * 60 * 1000

async function runImport(): Promise<void> {
  if (!pendingFile.value || !siteId.value) return

  importing.value = true
  importProgress.value = null
  try {
    const queued = await importNewsletters(siteId.value, pendingFile.value, importVerified.value)
    importProgress.value = queued

    // A synchronous queue finishes before the response comes back; otherwise poll.
    const result = queued.finished ? queued : await waitForImport(queued.import_id)

    toast.add({
      severity: result.status === 'failed' ? 'error' : 'success',
      summary: result.status === 'failed' ? 'Import failed' : 'Import complete',
      detail: result.message,
      life: result.status === 'failed' ? 8000 : 5000,
    })

    closeImportModal()
    // Newest-first ordering puts the freshly imported rows on page one.
    await reloadFromFirstPage()
  } catch (err: unknown) {
    const detail =
      axios.isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message ?? 'Import failed. Check the file and try again.')
        : err instanceof Error
          ? err.message
          : 'Import failed. Check the file and try again.'
    toast.add({ severity: 'error', summary: 'Import failed', detail, life: 8000 })
  } finally {
    importing.value = false
  }
}

// Poll until the job finishes. The deadline only stops the polling — the import
// itself keeps running on the worker regardless.
async function waitForImport(importId: number): Promise<NewsletterImportProgress> {
  const deadline = Date.now() + IMPORT_POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, IMPORT_POLL_MS))
    const status = await getImportStatus(importId)
    importProgress.value = status

    if (status.finished) return status
  }

  throw new Error('The import is still running. Reopen this page shortly to see the result.')
}

function closeImportModal(): void {
  showImportModal.value = false
  pendingFile.value = null
  importProgress.value = null
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

watch([siteId, view, verifiedFilter], async () => {
  selected.value = []
  await reloadFromFirstPage()
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
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-xl font-semibold text-indigo-500">Newsletter list</h2>
          <SelectButton v-model="view" :options="viewOptions" option-label="label" option-value="value" :allow-empty="false" />
          <SelectButton
            v-model="verifiedFilter"
            :options="verifiedOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            aria-label="Filter by verification status"
          />
          <RecordCount
            :label="isTrash ? 'Total in Trash' : 'Total Newsletters'"
            :total="recordTotal"
            :loading="store.loading"
          />
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

    <!-- Import: confirm + choose verified state -->
    <Dialog
      :visible="showImportModal"
      modal
      header="Import subscribers"
      :style="{ width: '460px' }"
      @update:visible="(v: boolean) => { if (!v && !importing) closeImportModal() }"
    >
      <div class="space-y-4">
        <p class="text-sm text-gray-700">
          Import <strong>{{ pendingFile?.name }}</strong> into
          <strong>{{ currentSiteLabel }}</strong>.
        </p>
        <div class="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
          <Checkbox v-model="importVerified" :binary="true" input-id="import-verified" :disabled="importing" />
          <label for="import-verified" class="cursor-pointer text-sm text-gray-700">
            <span class="font-medium text-gray-900">Accept these subscribers as verified</span>
            <span class="mt-0.5 block text-xs text-gray-500">
              Leave unchecked to import them as <strong>unverified</strong> (default). Check only if
              these contacts have already confirmed their email elsewhere.
            </span>
          </label>
        </div>

        <!-- Live progress: the import runs on a queue worker, so the numbers
             climb here while the job works through the file. -->
        <div v-if="importing" class="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-800">
          <p class="flex items-center gap-2 font-medium">
            <i class="pi pi-spin pi-spinner text-xs" />
            {{ importProgress?.status === 'processing' ? 'Importing…' : 'Queued…' }}
          </p>
          <p v-if="importProgress && importProgress.total > 0" class="mt-1 text-xs">
            {{ importProgress.imported }} added, {{ importProgress.skipped }} already on the list
            ({{ importProgress.total }} read so far)
          </p>
          <p v-else class="mt-1 text-xs">
            Waiting for a worker to pick the file up. You can leave this open.
          </p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text :disabled="importing" @click="closeImportModal" />
        <Button label="Import" icon="pi pi-upload" :loading="importing" @click="runImport" />
      </template>
    </Dialog>

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
