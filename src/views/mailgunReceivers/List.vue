<script setup lang="ts">
/**
 * Mailgun Receivers — the address list every Mailgun credential sends to.
 *
 * Follows the Newsletters section's shape: lazy DataTable, server-side filters,
 * a dedicated COUNT endpoint for the badge, and a queued import polled through
 * its own row. It is a SEPARATE list from Newsletters and shares none of its
 * state — the two sections do not interact.
 *
 * Every row on this list is active and gets mailed. There is no per-receiver
 * on/off: an address is on the list and reached, or it is deleted. The only
 * things that take an address out of a send are the person's own unsubscribe and
 * the shared suppression list — neither of which an admin can set from here,
 * which is why both remain visible as filters.
 *
 * Consent source is still recorded on every write path; it simply is not a
 * column, because it never varies within a list an operator is scanning.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/mailgunReceivers'
import RecordCount from '@/components/RecordCount.vue'
import type { MailgunReceiver, MailgunReceiverImport } from '@shared/types/mailgunReceiver'

const toast = useToast()

const items = ref<MailgunReceiver[]>([])
const loading = ref(false)
const selected = ref<MailgunReceiver[]>([])

// ── Server-side pagination ───────────────────────────────────────────────────
const page = ref(1)
const perPage = ref(50)
const meta = ref<{ total: number; last_page: number } | null>(null)
const totalRecords = computed(() => meta.value?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)
const recordTotal = ref<number | null>(null)

// ── Filters (Apply-driven, matching the other list screens) ──────────────────
const search = ref('')
const status = ref<string | null>(null)

// Active/Inactive are gone: every receiver is active. What remains are the two
// states that genuinely remove someone from a send, and that an admin cannot set.
const statusOptions = [
  { label: 'All receivers', value: null },
  { label: 'Unsubscribed', value: 'unsubscribed' },
  { label: 'Suppressed', value: 'suppressed' },
]

type Filters = Omit<api.MailgunReceiverFilters, 'page' | 'per_page'>

function activeFilters(): Filters {
  const f: Filters = {}
  const term = search.value.trim()
  if (term !== '') f.search = term
  if (status.value === 'unsubscribed') f.unsubscribed = true
  if (status.value === 'suppressed') f.suppressed = true
  return f
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    const [list, count] = await Promise.all([
      api.listMailgunReceivers({ page: page.value, per_page: perPage.value, ...activeFilters() }),
      // Never fatal: a failed count must not take the listing down with it.
      api.countMailgunReceivers(activeFilters()).catch(() => null),
    ])
    items.value = list.data
    meta.value = { total: list.meta.total, last_page: list.meta.last_page }
    perPage.value = list.meta.per_page
    recordTotal.value = count
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load receivers.', life: 4000 })
  } finally {
    loading.value = false
  }
}

async function applyFilters(): Promise<void> {
  page.value = 1
  await reload()
}

async function clearFilters(): Promise<void> {
  search.value = ''
  status.value = null
  await applyFilters()
}

async function onPage(e: { page: number; rows: number }): Promise<void> {
  page.value = e.page + 1 // PrimeVue is 0-based, Laravel is 1-based
  perPage.value = e.rows
  await reload()
}

// ── Add / edit ───────────────────────────────────────────────────────────────
const showForm = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const fieldErrors = ref<Record<string, string>>({})
const form = ref({ email: '', name: '', consent_source: '' })

function err(field: string): string {
  return fieldErrors.value[field] ?? ''
}

function openCreate(): void {
  form.value = { email: '', name: '', consent_source: '' }
  editingId.value = null
  fieldErrors.value = {}
  showForm.value = true
}

function openEdit(r: MailgunReceiver): void {
  form.value = {
    email: r.email,
    name: r.name ?? '',
    consent_source: r.consent_source ?? '',
  }
  editingId.value = r.id
  fieldErrors.value = {}
  showForm.value = true
}

async function save(): Promise<void> {
  fieldErrors.value = {}
  saving.value = true
  try {
    const payload = {
      email: form.value.email.trim(),
      name: form.value.name.trim() || null,
      consent_source: form.value.consent_source.trim(),
    }
    if (editingId.value === null) await api.createMailgunReceiver(payload)
    else await api.updateMailgunReceiver(editingId.value, payload)
    showForm.value = false
    await reload()
    toast.add({ severity: 'success', summary: 'Saved', life: 2500 })
  } catch (e: unknown) {
    const errors = (e as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors
    if (errors) {
      fieldErrors.value = Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v[0] ?? '']))
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save.', life: 4000 })
    }
  } finally {
    saving.value = false
  }
}

async function remove(r: MailgunReceiver): Promise<void> {
  if (!window.confirm(`Delete ${r.email}?`)) return
  await api.deleteMailgunReceiver(r.id)
  await reload()
}

async function bulkDelete(): Promise<void> {
  if (selected.value.length === 0) return
  if (!window.confirm(`Delete ${selected.value.length} receivers?`)) return
  const affected = await api.bulkMailgunReceivers(selected.value.map((r) => r.id))
  selected.value = []
  await reload()
  toast.add({ severity: 'success', summary: `${affected} deleted`, life: 2500 })
}

// ── Import ───────────────────────────────────────────────────────────────────
const showImport = ref(false)
const importFile = ref<File | null>(null)
const importConsent = ref('')
const importing = ref(false)
const importRow = ref<MailgunReceiverImport | null>(null)
let pollTimer: ReturnType<typeof setInterval> | undefined

function onFile(e: Event): void {
  importFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

const canImport = computed(() => importFile.value !== null && importConsent.value.trim() !== '')

async function startImport(): Promise<void> {
  if (!canImport.value || importFile.value === null) return
  importing.value = true
  try {
    const res = await api.importMailgunReceivers(importFile.value, importConsent.value.trim())
    importRow.value = res.data
    poll(res.data.id)
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Upload failed.', life: 4000 })
    importing.value = false
  }
}

/** Poll the import row until it finishes — real numbers rather than a spinner. */
function poll(id: number): void {
  clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    try {
      const res = await api.getMailgunReceiverImport(id)
      importRow.value = res.data
      if (res.data.finished_at !== null || res.data.status === 'failed') {
        clearInterval(pollTimer)
        importing.value = false
        await reload()
      }
    } catch {
      clearInterval(pollTimer)
      importing.value = false
    }
  }, 1200)
}

// A poll left running after the view unmounts would keep hitting the API forever.
onBeforeUnmount(() => clearInterval(pollTimer))

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

onMounted(reload)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Mailgun Receivers</h2>
        <p class="text-sm text-gray-500">
          Addresses reachable through your Mailgun credentials. Each credential decides which of
          these it sends to, in its own Receivers settings.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <RecordCount :total="recordTotal" label="Receivers" />
        <Button label="Import Excel" icon="pi pi-upload" outlined @click="showImport = true" />
        <Button label="Add receiver" icon="pi pi-plus" @click="openCreate" />
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3">
      <InputText v-model="search" placeholder="Search email or name" class="w-64" @keyup.enter="applyFilters" />
      <Select v-model="status" :options="statusOptions" option-label="label" option-value="value" class="w-52" />
      <Button label="Apply" icon="pi pi-filter" :loading="loading" @click="applyFilters" />
      <Button label="Clear" icon="pi pi-filter-slash" text severity="secondary" @click="clearFilters" />

      <span v-if="selected.length" class="ml-auto flex items-center gap-2">
        <span class="text-sm text-gray-500">{{ selected.length }} selected</span>
        <Button label="Delete" size="small" outlined severity="danger" @click="bulkDelete" />
      </span>
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable
        v-model:selection="selected"
        :value="items"
        :loading="loading"
        lazy
        paginator
        :rows="perPage"
        :first="first"
        :total-records="totalRecords"
        :rows-per-page-options="[25, 50, 100, 200]"
        data-key="id"
        striped-rows
        @page="onPage"
      >
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No receivers match these filters.</div>
        </template>

        <Column selection-mode="multiple" :style="{ width: '44px' }" />

        <Column header="Email" class="font-medium">
          <template #body="{ data }: { data: MailgunReceiver }">
            <span class="text-gray-900">{{ data.email }}</span>
            <span v-if="data.name" class="ml-2 text-xs text-gray-400">{{ data.name }}</span>
          </template>
        </Column>

        <!-- Unsubscribed is the one state worth interrupting a scan for: those
             rows are excluded from every send and cannot be re-enabled here. -->
        <Column header="" :style="{ width: '140px' }">
          <template #body="{ data }: { data: MailgunReceiver }">
            <Tag v-if="data.unsubscribed_at" value="Unsubscribed" severity="danger" />
          </template>
        </Column>

        <Column header="Last sent" :style="{ width: '160px' }">
          <template #body="{ data }: { data: MailgunReceiver }">
            <span class="text-sm text-gray-600">{{ formatDate(data.last_sent_at) }}</span>
          </template>
        </Column>

        <Column header="Sent" :style="{ width: '80px' }">
          <template #body="{ data }: { data: MailgunReceiver }">
            <span class="text-sm tabular-nums text-gray-600">{{ data.sent_count }}</span>
          </template>
        </Column>

        <Column header="Actions" :style="{ width: '110px' }">
          <template #body="{ data }: { data: MailgunReceiver }">
            <Button icon="pi pi-pencil" text size="small" @click="openEdit(data)" />
            <Button icon="pi pi-trash" text severity="danger" size="small" @click="remove(data)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Add / edit -->
    <Dialog v-model:visible="showForm" modal :header="editingId ? 'Edit receiver' : 'Add receiver'" :style="{ width: '460px' }">
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Email</label>
          <InputText v-model="form.email" fluid type="email" />
          <p v-if="err('email')" class="mt-1 text-xs text-red-600">{{ err('email') }}</p>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Name <span class="font-normal text-gray-400">(optional)</span></label>
          <InputText v-model="form.name" fluid />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Consent source</label>
          <InputText v-model="form.consent_source" fluid placeholder="e.g. CRM export, signup form, contract" />
          <p class="mt-1 text-xs text-gray-400">
            Where this address came from. Required — a bulk send needs a record of why you may email
            each person.
          </p>
          <p v-if="err('consent_source')" class="mt-1 text-xs text-red-600">{{ err('consent_source') }}</p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="showForm = false" />
        <Button :label="editingId ? 'Save changes' : 'Add receiver'" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <!-- Import -->
    <Dialog v-model:visible="showImport" modal header="Import receivers" :style="{ width: '520px' }">
      <div class="space-y-4">
        <p class="text-sm text-gray-700">
          Upload an .xlsx or .csv file with an <strong>Email</strong> column. Duplicates, invalid
          addresses and anyone on the suppression list are skipped and reported.
        </p>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Consent source for this file</label>
          <InputText v-model="importConsent" fluid placeholder="e.g. CRM export 2026-09" />
          <p class="mt-1 text-xs text-gray-400">Applied to every row in the file. Required.</p>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">File</label>
          <input type="file" accept=".xlsx,.csv" class="text-sm" @change="onFile" />
        </div>

        <div v-if="importRow" class="rounded-lg bg-gray-50 p-3 text-sm">
          <p class="font-medium text-gray-800">{{ importRow.status }}</p>
          <div class="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-gray-600">
            <span>Rows read</span><span class="tabular-nums">{{ importRow.total }}</span>
            <span>Imported</span><span class="tabular-nums">{{ importRow.imported }}</span>
            <span>Duplicates</span><span class="tabular-nums">{{ importRow.duplicates }}</span>
            <span>Suppressed</span><span class="tabular-nums">{{ importRow.suppressed }}</span>
            <span>Rejected</span><span class="tabular-nums">{{ importRow.rejected }}</span>
          </div>
          <p v-if="importRow.error" class="mt-2 text-xs text-red-600">{{ importRow.error }}</p>
          <details v-if="importRow.rejected_rows" class="mt-2">
            <summary class="cursor-pointer text-xs text-gray-500">Rejected rows</summary>
            <pre class="mt-1 max-h-40 overflow-auto text-xs text-gray-600">{{ importRow.rejected_rows }}</pre>
          </details>
        </div>
      </div>
      <template #footer>
        <Button label="Close" text @click="showImport = false" />
        <Button label="Start import" icon="pi pi-upload" :disabled="!canImport" :loading="importing" @click="startImport" />
      </template>
    </Dialog>
  </div>
</template>
