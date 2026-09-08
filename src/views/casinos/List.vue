<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import { useCasinosStore } from '@/stores/casinosStore'
import { useSitesStore } from '@/stores/sitesStore'
import * as casinosApi from '@/api/casinos'
import * as attachmentsApi from '@/api/casinoAttachments'
import * as profilesApi from '@/api/casinoDetails'
import RecordCount from '@/components/RecordCount.vue'
import type { Casino } from '@shared/types/casino'
import type { ErrorResponse } from '@shared/types/api'

const router = useRouter()
const store = useCasinosStore()
const sitesStore = useSitesStore()
const toast = useToast()

// ── Selection ─────────────────────────────────────────────────────────────────
const selected = ref<Casino[]>([])
const hasSelection = computed(() => selected.value.length > 0)

// ── Delete single ─────────────────────────────────────────────────────────────
const showDeleteConfirm = ref(false)
const deletingCasino = ref<Casino | null>(null)
const deleteLoading = ref(false)

function openDelete(casino: Casino): void {
  deletingCasino.value = casino
  showDeleteConfirm.value = true
}

async function confirmDelete(): Promise<void> {
  if (!deletingCasino.value) return
  deleteLoading.value = true
  try {
    await casinosApi.deleteCasino(deletingCasino.value.id)
    store.remove(deletingCasino.value.id)
    void refreshCount()
    selected.value = selected.value.filter((c) => c.id !== deletingCasino.value!.id)
    showDeleteConfirm.value = false
    toast.add({ severity: 'success', summary: 'Deleted', detail: `${deletingCasino.value.name} deleted.`, life: 3000 })
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: 'Error', detail: extractError(e, 'Failed to delete.'), life: 5000 })
  } finally {
    deleteLoading.value = false
  }
}

// ── Bulk delete ───────────────────────────────────────────────────────────────
const showBulkDeleteConfirm = ref(false)
const bulkDeleteLoading = ref(false)

async function confirmBulkDelete(): Promise<void> {
  bulkDeleteLoading.value = true
  const ids = selected.value.map((c) => c.id)
  try {
    await Promise.all(ids.map((id) => casinosApi.deleteCasino(id)))
    ids.forEach((id) => store.remove(id))
    void refreshCount()
    selected.value = []
    showBulkDeleteConfirm.value = false
    toast.add({ severity: 'success', summary: 'Deleted', detail: `${ids.length} casino(s) deleted.`, life: 3000 })
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: 'Error', detail: extractError(e, 'Failed to delete.'), life: 5000 })
  } finally {
    bulkDeleteLoading.value = false
  }
}

// ── Bulk attach to sites ──────────────────────────────────────────────────────
const showBulkAttach = ref(false)
const bulkAttachLoading = ref(false)
const bulkAttachSiteIds = ref<number[]>([])
const bulkAttachForm = ref({
  affiliate_url: '',
  position: 1,
  featured: false,
})

const siteOptions = computed(() =>
  sitesStore.sites.map((s) => ({ label: `${s.name} (${s.domain})`, value: s.id })),
)

function openBulkAttach(): void {
  bulkAttachSiteIds.value = []
  bulkAttachForm.value = { affiliate_url: '', position: 1, featured: false }
  showBulkAttach.value = true
}

async function confirmBulkAttach(): Promise<void> {
  if (!bulkAttachSiteIds.value.length) return
  bulkAttachLoading.value = true
  try {
    await Promise.all(
      selected.value.map(async (casino) => {
        const existing = await attachmentsApi.getCasinoAttachments(casino.id)
        const merged = [...existing.data]
        for (const siteId of bulkAttachSiteIds.value) {
          if (!merged.find((a) => a.site_id === siteId)) {
            merged.push({
              site_id: siteId,
              affiliate_url: bulkAttachForm.value.affiliate_url,
              position: bulkAttachForm.value.position,
              featured: bulkAttachForm.value.featured,
            })
          }
        }
        await attachmentsApi.syncCasinoAttachments(casino.id, merged)
      }),
    )
    showBulkAttach.value = false
    selected.value = []
    toast.add({
      severity: 'success',
      summary: 'Attached',
      detail: `Casinos attached to the selected sites.`,
      life: 3000,
    })
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: 'Error', detail: extractError(e, 'Failed to attach.'), life: 5000 })
  } finally {
    bulkAttachLoading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    return (e.response?.data as ErrorResponse | undefined)?.message ?? fallback
  }
  return 'An unexpected error occurred.'
}

// ── Record counter ────────────────────────────────────────────────────────────
// Total from the dedicated COUNT endpoint — never from the listing response, so
// the paginated query keeps its eager loads and ordering without also paying to
// count. Refreshed after any mutation so the badge tracks create/delete.
const recordTotal = ref<number | null>(null)

async function refreshCount(): Promise<void> {
  try {
    recordTotal.value = await casinosApi.countCasinos()
  } catch {
    recordTotal.value = null
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
onMounted(() => {
  store.fetchCasinos()
  sitesStore.fetchSites()
  refreshCount()
})
// ── Operator profile spreadsheet ────────────────────────────────────────────
// Filling ~30 factual fields per casino one form at a time does not scale, so
// the profiles round-trip through a sheet. The export includes casinos with no
// profile yet, which makes the file double as the work list.
const profileExporting = ref(false)
const profileImporting = ref(false)
const profileFileInput = ref<HTMLInputElement | null>(null)
const importResult = ref<profilesApi.CasinoProfileImportResult | null>(null)
const showImportResult = ref(false)

async function exportProfiles(): Promise<void> {
  profileExporting.value = true
  try {
    await profilesApi.exportCasinoProfiles()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not export the profiles.', life: 4000 })
  } finally {
    profileExporting.value = false
  }
}

async function onProfileFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Reset immediately, so picking the SAME file again still fires a change event
  // after a failed import.
  input.value = ''
  if (!file) return

  profileImporting.value = true
  try {
    importResult.value = await profilesApi.importCasinoProfiles(file)
    showImportResult.value = true
  } catch (e: unknown) {
    const data = axios.isAxiosError(e) ? (e.response?.data as ErrorResponse | undefined) : undefined
    toast.add({
      severity: 'error',
      summary: 'Import failed',
      detail: data?.message ?? 'Could not read that file.',
      life: 5000,
    })
  } finally {
    profileImporting.value = false
  }
}

</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Casinos</h2>
        <p class="text-sm text-gray-500">Manage casino master data and site attachments.</p>
      </div>
      <div class="flex items-center gap-3">
        <RecordCount label="Total Casinos" :total="recordTotal" :loading="store.loading" />
        <Button
          label="Export profiles"
          icon="pi pi-download"
          outlined
          severity="secondary"
          :loading="profileExporting"
          v-tooltip.top="'One row per casino, every operator-profile field'"
          @click="exportProfiles"
        />
        <Button
          label="Import profiles"
          icon="pi pi-upload"
          outlined
          severity="secondary"
          :loading="profileImporting"
          v-tooltip.top="'Apply an edited profile sheet'"
          @click="profileFileInput?.click()"
        />
        <input
          ref="profileFileInput"
          type="file"
          accept=".csv,.xlsx"
          class="hidden"
          @change="onProfileFileChosen"
        />
        <Button
          label="New Casino"
          icon="pi pi-plus"
          @click="router.push({ name: 'casinos-create' })"
        />
      </div>
    </div>

    <!-- Bulk action bar -->
    <div
      v-if="hasSelection"
      class="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2"
    >
      <span class="text-sm font-medium text-indigo-700">
        {{ selected.length }} selected
      </span>
      <div class="ml-auto flex gap-2">
        <Button
          label="Attach to Sites"
          icon="pi pi-link"
          size="small"
          severity="secondary"
          @click="openBulkAttach"
        />
        <Button
          label="Delete Selected"
          icon="pi pi-trash"
          size="small"
          severity="danger"
          @click="showBulkDeleteConfirm = true"
        />
      </div>
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable
        v-model:selection="selected"
        :value="store.casinos"
        :loading="store.loading"
        striped-rows
        paginator
        :rows="20"
        :pt="{ root: { class: 'text-sm' } }"
      >
        <template #empty>
          <div class="py-12 text-center text-sm text-gray-400">
            No casinos yet. Click "New Casino" to add one.
          </div>
        </template>

        <Column selection-mode="multiple" :style="{ width: '48px' }" />

        <Column field="name" header="Name" sortable>
          <template #body="{ data: casino }: { data: Casino }">
            <span class="font-medium text-gray-900">{{ casino.name }}</span>
          </template>
        </Column>

        <Column field="slug" header="Slug">
          <template #body="{ data: casino }: { data: Casino }">
            <span class="font-mono text-xs text-gray-500">{{ casino.slug }}</span>
          </template>
        </Column>

        <Column field="rating" header="Rating" sortable :style="{ width: '90px' }">
          <template #body="{ data: casino }: { data: Casino }">
            <span class="font-medium">{{ casino.rating }}<span class="text-gray-400">/5</span></span>
          </template>
        </Column>

        <Column header="Status" :style="{ width: '90px' }">
          <template #body="{ data: casino }: { data: Casino }">
            <Tag
              :severity="casino.active ? 'success' : 'danger'"
              :value="casino.active ? 'Active' : 'Inactive'"
            />
          </template>
        </Column>

        <Column header="Actions" :style="{ width: '120px' }">
          <template #body="{ data: casino }: { data: Casino }">
            <div class="flex items-center gap-1">
              <Button
                icon="pi pi-pencil"
                size="small"
                text
                severity="secondary"
                v-tooltip="'Edit'"
                @click="router.push({ name: 'casinos-edit', params: { id: casino.id } })"
              />
              <Button
                icon="pi pi-trash"
                size="small"
                text
                severity="danger"
                v-tooltip="'Delete'"
                @click="openDelete(casino)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Delete single confirm -->
    <Dialog
      v-model:visible="showDeleteConfirm"
      modal
      header="Delete Casino"
      :style="{ width: '400px' }"
    >
      <p class="text-sm text-gray-700">
        Delete <strong>{{ deletingCasino?.name }}</strong>? This will remove all site attachments.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="showDeleteConfirm = false" />
        <Button label="Delete" severity="danger" :loading="deleteLoading" @click="confirmDelete" />
      </template>
    </Dialog>

    <!-- Bulk delete confirm -->
    <Dialog
      v-model:visible="showBulkDeleteConfirm"
      modal
      header="Delete Selected Casinos"
      :style="{ width: '400px' }"
    >
      <p class="text-sm text-gray-700">
        Delete <strong>{{ selected.length }}</strong> casino(s)? All site attachments will be removed.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="showBulkDeleteConfirm = false" />
        <Button
          label="Delete All"
          severity="danger"
          :loading="bulkDeleteLoading"
          @click="confirmBulkDelete"
        />
      </template>
    </Dialog>

    <!-- Bulk attach dialog -->
    <Dialog
      v-model:visible="showBulkAttach"
      modal
      header="Attach to Sites"
      :style="{ width: '480px' }"
    >
      <div class="space-y-4">
        <p class="text-sm text-gray-600">
          Attaching <strong>{{ selected.length }}</strong> casino(s). Existing attachments will be preserved.
        </p>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">
            Sites <span class="text-red-500">*</span>
          </label>
          <Select
            v-model="bulkAttachSiteIds"
            :options="siteOptions"
            option-label="label"
            option-value="value"
            multiple
            fluid
            placeholder="Select sites…"
          />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Affiliate URL</label>
          <InputText v-model="bulkAttachForm.affiliate_url" fluid placeholder="https://…" />
        </div>

        <div class="flex gap-4">
          <div class="flex-1">
            <label class="mb-1 block text-sm font-medium text-gray-700">Position</label>
            <InputNumber
              v-model="bulkAttachForm.position"
              :use-grouping="false"
              :min="1"
              input-class="w-full"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Featured</label>
            <div class="flex h-10 items-center">
              <Checkbox v-model="bulkAttachForm.featured" binary />
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="showBulkAttach = false" />
        <Button
          label="Attach"
          icon="pi pi-link"
          :disabled="!bulkAttachSiteIds.length"
          :loading="bulkAttachLoading"
          @click="confirmBulkAttach"
        />
      </template>
    </Dialog>
  </div>

    <!-- Import result. A dialog rather than a toast: the error list can run to
         several lines and a toast would time out before it is read. -->
    <Dialog v-model:visible="showImportResult" modal header="Profile import" :style="{ width: '520px' }">
      <div v-if="importResult" class="space-y-3 text-sm">
        <p class="text-gray-700">
          <strong class="tabular-nums">{{ importResult.updated }}</strong> profile(s) updated,
          <strong class="tabular-nums">{{ importResult.unchanged }}</strong> unchanged.
        </p>
        <p v-if="importResult.updated === 0 && importResult.errors.length === 0" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
          Nothing changed. If you expected edits, check you uploaded the edited file.
        </p>
        <div v-if="importResult.errors.length" class="rounded-lg bg-red-50 px-3 py-2 text-red-700">
          <p class="font-medium">Rows that could not be applied:</p>
          <ul class="mt-1 list-disc space-y-0.5 pl-5">
            <li v-for="(err, i) in importResult.errors" :key="i">{{ err }}</li>
          </ul>
        </div>
      </div>
      <template #footer>
        <Button label="Close" text @click="showImportResult = false" />
      </template>
    </Dialog>
  </template>
