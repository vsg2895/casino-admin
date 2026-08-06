<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import * as api from '@/api/warmupEmails'
import RecordCount from '@/components/RecordCount.vue'
import type { WarmupEmail, WarmupImportSummary } from '@shared/types/warmupEmail'
import type { ErrorResponse } from '@shared/types/api'

const toast = useToast()

const items = ref<WarmupEmail[]>([])
const loading = ref(false)
const selected = ref<WarmupEmail[]>([])
const selectedIds = computed(() => selected.value.map((w) => w.id))

// ── Server-side pagination ────────────────────────────────────────────────────
// The table is `lazy`: it renders exactly the rows the API returned. Paginating
// client-side would cap the list at whatever one API page contained.
const page = ref(1)
const perPage = ref(50)
const totalRecords = computed(() => meta.value?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)
const meta = ref<{ total: number; last_page: number } | null>(null)

// Total from the dedicated COUNT endpoint — never from the listing response.
const recordTotal = ref<number | null>(null)

const search = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined

function activeFilters(): { search?: string } {
  const term = search.value.trim()
  return term === '' ? {} : { search: term }
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    // One filter object drives both calls, so the badge can never disagree with
    // the rows on screen. They run concurrently — the count never delays the list.
    const [list, count] = await Promise.all([
      api.listWarmupEmails({ page: page.value, per_page: perPage.value, ...activeFilters() }),
      // Never fatal: a failed count must not take the listing down with it.
      api.countWarmupEmails(activeFilters()).catch(() => null),
    ])
    items.value = list.data
    meta.value = { total: list.meta.total, last_page: list.meta.last_page }
    perPage.value = list.meta.per_page
    recordTotal.value = count
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load warmup list.', life: 4000 })
  } finally {
    loading.value = false
  }
}

async function reloadFromFirstPage(): Promise<void> {
  page.value = 1
  await reload()
}

async function onPage(event: { page: number; rows: number }): Promise<void> {
  page.value = event.page + 1 // PrimeVue is 0-based, Laravel is 1-based
  perPage.value = event.rows
  selected.value = [] // selection is per page — never carry it across
  await reload()
}

watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(reloadFromFirstPage, 400)
})

function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function extractError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as ErrorResponse | undefined
    return data?.errors?.email?.[0] ?? data?.message ?? fallback
  }
  return fallback
}

// ── Create / edit ─────────────────────────────────────────────────────────────
const showForm = ref(false)
const editingId = ref<number | null>(null)
const formEmail = ref('')
const saving = ref(false)

function openCreate(): void {
  editingId.value = null
  formEmail.value = ''
  showForm.value = true
}

function openEdit(row: WarmupEmail): void {
  editingId.value = row.id
  formEmail.value = row.email
  showForm.value = true
}

async function save(): Promise<void> {
  if (formEmail.value.trim() === '') return
  saving.value = true
  try {
    if (editingId.value === null) {
      await api.createWarmupEmail(formEmail.value.trim())
      toast.add({ severity: 'success', summary: 'Added', detail: 'Address added.', life: 2500 })
    } else {
      await api.updateWarmupEmail(editingId.value, formEmail.value.trim())
      toast.add({ severity: 'success', summary: 'Saved', detail: 'Address updated.', life: 2500 })
    }
    showForm.value = false
    await reload()
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: 'Error', detail: extractError(e, 'Could not save the address.'), life: 5000 })
  } finally {
    saving.value = false
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
const deleting = ref<WarmupEmail | null>(null)
const showBulkDelete = ref(false)
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

function confirmDelete(): Promise<void> {
  return run(async () => {
    if (!deleting.value) return
    await api.deleteWarmupEmail(deleting.value.id)
    deleting.value = null
    selected.value = []
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Address removed.', life: 2500 })
  })
}

function confirmBulkDelete(): Promise<void> {
  return run(async () => {
    const { deleted } = await api.bulkDeleteWarmupEmails(selectedIds.value)
    selected.value = []
    showBulkDelete.value = false
    toast.add({ severity: 'success', summary: 'Deleted', detail: `${deleted} address(es) removed.`, life: 2500 })
  })
}

// ── Excel / CSV import ────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const summary = ref<WarmupImportSummary | null>(null)

function triggerImport(): void {
  fileInput.value?.click()
}

async function onFileSelected(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-picking the same file
  if (!file) return

  importing.value = true
  summary.value = null
  try {
    summary.value = await api.importWarmupEmails(file)
    toast.add({ severity: 'success', summary: 'Import complete', detail: summary.value.message, life: 6000 })
    await reloadFromFirstPage()
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: 'Import failed', detail: extractError(e, 'The file could not be imported.'), life: 6000 })
  } finally {
    importing.value = false
  }
}

// ── Send ──────────────────────────────────────────────────────────────────────
const showSend = ref(false)
const sendSubject = ref('')
const sendBody = ref('')
const sending = ref(false)

async function send(): Promise<void> {
  if (sendSubject.value.trim() === '' || sendBody.value.trim() === '') return
  sending.value = true
  try {
    const res = await api.sendWarmupEmails(sendSubject.value.trim(), sendBody.value.trim())
    toast.add({ severity: 'success', summary: 'Queued', detail: res.message, life: 5000 })
    showSend.value = false
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: 'Not queued', detail: extractError(e, 'Could not queue the warmup send.'), life: 6000 })
  } finally {
    sending.value = false
  }
}

onMounted(reload)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Warmup</h2>
        <p class="text-sm text-gray-500">
          Addresses used to warm up the sending mailbox. Sent over the SMTP credentials in
          <code>.env</code> — the same transport the admin test buttons use.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <RecordCount label="Total Warmup Emails" :total="recordTotal" :loading="loading" />
        <Button label="Import" icon="pi pi-upload" severity="secondary" outlined :loading="importing" @click="triggerImport" />
        <Button label="Send warmup" icon="pi pi-send" severity="secondary" outlined @click="showSend = true" />
        <Button label="Add email" icon="pi pi-plus" @click="openCreate" />
      </div>
    </div>

    <input ref="fileInput" type="file" accept=".xlsx,.csv" class="hidden" @change="onFileSelected" />

    <!-- Last import breakdown -->
    <div v-if="summary" class="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
      <span class="font-medium">Last import:</span>
      {{ summary.rows }} row(s) read ·
      <span class="font-semibold">{{ summary.imported }}</span> imported ·
      {{ summary.duplicates }} duplicate(s) ·
      {{ summary.invalid }} invalid
    </div>

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <InputText v-model="search" placeholder="Search by email" class="w-72" />
      <Button
        v-if="selectedIds.length > 0"
        :label="`Delete selected (${selectedIds.length})`"
        icon="pi pi-trash"
        severity="danger"
        outlined
        :loading="actionLoading"
        @click="showBulkDelete = true"
      />
    </div>

    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable
        v-model:selection="selected"
        :value="items"
        :loading="loading"
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
            No warmup addresses yet. Add one or import a spreadsheet.
          </div>
        </template>

        <Column selection-mode="multiple" :style="{ width: '3rem' }" />

        <Column field="email" header="Email address">
          <template #body="{ data }: { data: WarmupEmail }">
            <span class="text-gray-900">{{ data.email }}</span>
          </template>
        </Column>

        <Column header="Added" :style="{ width: '220px' }">
          <template #body="{ data }: { data: WarmupEmail }">
            <span class="text-gray-600">{{ formatDate(data.created_at) }}</span>
          </template>
        </Column>

        <Column header="Actions" :style="{ width: '140px' }">
          <template #body="{ data }: { data: WarmupEmail }">
            <div class="flex items-center gap-1">
              <Button icon="pi pi-pencil" text size="small" severity="secondary" @click="openEdit(data)" />
              <Button icon="pi pi-trash" text size="small" severity="danger" @click="deleting = data" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Create / edit -->
    <Dialog v-model:visible="showForm" modal :header="editingId ? 'Edit address' : 'Add address'" :style="{ width: '420px' }">
      <label class="mb-1 block text-xs font-medium text-gray-600">Email address</label>
      <InputText v-model="formEmail" fluid type="email" placeholder="user@example.com" @keyup.enter="save" />
      <template #footer>
        <Button label="Cancel" text @click="showForm = false" />
        <Button label="Save" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <!-- Single delete -->
    <Dialog :visible="deleting !== null" modal header="Remove address" :style="{ width: '420px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">
        Remove <strong>{{ deleting?.email }}</strong> from the warmup list?
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Remove" icon="pi pi-trash" severity="danger" :loading="actionLoading" @click="confirmDelete" />
      </template>
    </Dialog>

    <!-- Bulk delete -->
    <Dialog v-model:visible="showBulkDelete" modal header="Remove selected" :style="{ width: '420px' }">
      <p class="text-sm text-gray-700">
        Remove <strong>{{ selectedIds.length }}</strong> address(es) from the warmup list?
      </p>
      <template #footer>
        <Button label="Cancel" text @click="showBulkDelete = false" />
        <Button label="Remove" icon="pi pi-trash" severity="danger" :loading="actionLoading" @click="confirmBulkDelete" />
      </template>
    </Dialog>

    <!-- Send -->
    <Dialog v-model:visible="showSend" modal header="Send warmup emails" :style="{ width: '520px' }">
      <div class="space-y-4">
        <p class="text-sm text-gray-600">
          Sends a plain-text message to every address on the list over the <code>.env</code> SMTP
          mailer. Keep the wording conversational — marketing-shaped mail is what gets a young
          sender filtered.
        </p>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Subject</label>
          <InputText v-model="sendSubject" fluid placeholder="e.g. Quick question" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Message</label>
          <Textarea v-model="sendBody" rows="6" auto-resize fluid placeholder="Write a short, ordinary message…" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="showSend = false" />
        <Button
          label="Queue send"
          icon="pi pi-send"
          :loading="sending"
          :disabled="sendSubject.trim() === '' || sendBody.trim() === ''"
          @click="send"
        />
      </template>
    </Dialog>
  </div>
</template>
