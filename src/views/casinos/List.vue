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

// ── Init ──────────────────────────────────────────────────────────────────────
onMounted(() => {
  store.fetchCasinos()
  sitesStore.fetchSites()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Casinos</h2>
        <p class="text-sm text-gray-500">Manage casino master data and site attachments.</p>
      </div>
      <Button
        label="New Casino"
        icon="pi pi-plus"
        @click="router.push({ name: 'casinos-create' })"
      />
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
</template>
