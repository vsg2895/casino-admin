<script setup lang="ts">
/**
 * UniOne Receivers — its own list, plus the Warmup-style Send Emails flow.
 *
 * Unrelated to the newsletter subscribers: different table, different consent
 * record, no shared query anywhere.
 *
 * The send modal mirrors Warmup's shape — count, cooldown, a live audience
 * preview, a confirmation step — as new code. Warmup itself is untouched.
 */
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/unione'
import client from '@/api/client'
import FileUpload from 'primevue/fileupload'
import type {
  UniOneApiKey, UniOneImportSummary, UniOneReceiver,
  UniOneReceiverStats, UniOneReceiverStatus, UniOneSendPreview, UniOneTemplatePreview,
} from '@shared/types/unione'

const toast = useToast()

const items = ref<UniOneReceiver[]>([])
const selected = ref<UniOneReceiver[]>([])
const loading = ref(false)
const stats = ref<UniOneReceiverStats | null>(null)
const keys = ref<UniOneApiKey[]>([])

const page = ref(1)
const perPage = ref(25)
const meta = ref<{ total: number; last_page: number } | null>(null)
const totalRecords = computed(() => meta.value?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)

// ── filters ──────────────────────────────────────────────────────────────────
const fStatus = ref<UniOneReceiverStatus | null>(null)
const fFrom = ref<Date | null>(null)
const fTo = ref<Date | null>(null)
const fSearch = ref('')

const statusOptions = [
  { label: 'Any status', value: null },
  { label: 'Active', value: 'active' },
  { label: 'Unsubscribed', value: 'unsubscribed' },
  { label: 'Bounced', value: 'bounced' },
  { label: 'Complained', value: 'complained' },
  { label: 'Suppressed', value: 'suppressed' },
]

// ── editor ───────────────────────────────────────────────────────────────────
const dialog = ref(false)
const editing = ref<UniOneReceiver | null>(null)
const form = ref({ email: '', name: '', consent_source: '', consent_at: null as Date | null, notes: '' })

// ── import ──────────────────────────────────────────────────────────────────
// A FILE upload and nothing else, matching the Warmup receivers import:
// .xlsx or .csv with an Email column.
const importDialog = ref(false)
const importFile = ref<File | null>(null)
const importResult = ref<UniOneImportSummary | null>(null)
const importing = ref(false)

// ── send ─────────────────────────────────────────────────────────────────────
const sendDialog = ref(false)
const sendStep = ref<'compose' | 'confirm'>('compose')
const sending = ref(false)
const preview = ref<UniOneSendPreview | null>(null)
const previewLoading = ref(false)
const testEmail = ref('')
// The one template every run sends (viglinksi's promotion email), fetched
// rendered so the operator can look at it before sending. No picker: a test
// send and a real run go through the same renderer, so what the preview shows
// is what a receiver gets.
const templatePreview = ref<UniOneTemplatePreview | null>(null)
const templatePreviewOpen = ref(false)
const templatePreviewLoading = ref(false)
const send = ref({
  // Cooldown in DAYS, like Warmup: "2" skips anyone contacted in the last two days.
  key_id: null as number | null, count: 100, cooldown_days: 1,
  subject: '', from_email: '', from_name: '', reply_to: '',
})

const activeKeys = computed(() => keys.value.filter((k) => k.is_active))
const selectedKey = computed(() => keys.value.find((k) => k.id === send.value.key_id) ?? null)

async function load(): Promise<void> {
  loading.value = true
  try {
    const [list, s] = await Promise.all([
      api.listReceivers({
        page: page.value, per_page: perPage.value,
        status: fStatus.value,
        from: fFrom.value ? fFrom.value.toISOString().slice(0, 10) : null,
        to: fTo.value ? fTo.value.toISOString().slice(0, 10) : null,
        search: fSearch.value || null,
      }),
      // Never fatal — a failed stats call must not take the list down.
      api.receiverStats().catch(() => null),
    ])
    items.value = list.data
    meta.value = { total: list.meta.total, last_page: list.meta.last_page }
    stats.value = s
  } catch {
    toast.add({ severity: 'error', summary: 'Could not load receivers', life: 4000 })
  } finally {
    loading.value = false
  }
}

function apply(): void { page.value = 1; void load() }
function onPage(e: { page: number; rows: number }): void { page.value = e.page + 1; perPage.value = e.rows; void load() }

function openEditor(r: UniOneReceiver | null): void {
  editing.value = r
  form.value = r
    // `?? ''` because the form binds to an InputText: a null would render the
    // string "null" in the box. The empty string is converted back to null on
    // save, so an untouched field stays genuinely unset rather than blank.
    ? { email: r.email, name: r.name ?? '', consent_source: r.consent_source ?? '', consent_at: r.consent_at ? new Date(r.consent_at) : null, notes: r.notes ?? '' }
    // A new receiver starts with NO consent date. It used to default to today,
    // which would have stamped a consent record nobody actually collected.
    : { email: '', name: '', consent_source: '', consent_at: null, notes: '' }
  dialog.value = true
}

async function saveReceiver(): Promise<void> {
  try {
    const payload = {
      email: form.value.email,
      name: form.value.name || null,
      consent_source: form.value.consent_source || null,
      consent_at: form.value.consent_at ? form.value.consent_at.toISOString() : null,
      notes: form.value.notes || null,
    }
    if (editing.value) await api.updateReceiver(editing.value.id, payload)
    else await api.createReceiver(payload)
    dialog.value = false
    await load()
    toast.add({ severity: 'success', summary: 'Receiver saved', life: 2500 })
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: msg(e, 'Could not save that receiver'), life: 6000 })
  }
}

async function bulk(action: 'suppress' | 'delete'): Promise<void> {
  if (selected.value.length === 0) return
  if (!confirm(`${action === 'delete' ? 'Delete' : 'Suppress'} ${selected.value.length} receiver(s)?`)) return
  try {
    const res = await api.bulkReceivers(selected.value.map((r) => r.id), action)
    selected.value = []
    await load()
    toast.add({ severity: 'success', summary: `${res.affected} updated`, life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Bulk action failed', life: 4000 })
  }
}

function exportCsv(): void {
  client.get(api.receiversExportUrl(), { responseType: 'blob' }).then((r) => {
    const url = URL.createObjectURL(new Blob([r.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `unione-receivers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  })
}

function onFilePick(event: { files: File[] }): void {
  importFile.value = event.files[0] ?? null
  importResult.value = null
}

async function runImport(): Promise<void> {
  if (!importFile.value) return
  importing.value = true
  try {
    importResult.value = await api.importReceivers(importFile.value)
    await load()
    toast.add({ severity: 'success', summary: importResult.value.message, life: 7000 })
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: msg(e, 'Import failed'), life: 7000 })
  } finally {
    importing.value = false
  }
}

// ── sending ──────────────────────────────────────────────────────────────────

async function openSend(): Promise<void> {
  keys.value = await api.listKeys().catch(() => [])
  const def = keys.value.find((k) => k.is_default && k.is_active) ?? activeKeys.value[0] ?? null
  send.value.key_id = def?.id ?? null
  send.value.from_email = def?.default_from_email ?? ''
  send.value.from_name = def?.default_from_name ?? ''
  // The rendered template and its subject, so the modal opens ready to send
  // rather than ready to be filled in — and the preview button has something
  // to show without a second round-trip.
  void loadTemplatePreview()

  sendStep.value = 'compose'
  sendDialog.value = true
  void refreshPreview()
}

async function loadTemplatePreview(): Promise<void> {
  templatePreviewLoading.value = true
  try {
    templatePreview.value = await api.getTemplatePreview()
    if (!send.value.subject) send.value.subject = templatePreview.value.subject
  } catch (e: unknown) {
    templatePreview.value = null
    toast.add({ severity: 'warn', summary: msg(e, 'The template could not be rendered'), life: 7000 })
  } finally {
    templatePreviewLoading.value = false
  }
}

async function refreshPreview(): Promise<void> {
  previewLoading.value = true
  try {
    preview.value = await api.previewSend(send.value.count, send.value.cooldown_days)
  } catch {
    preview.value = null
  } finally {
    previewLoading.value = false
  }
}

async function sendTest(): Promise<void> {
  if (!send.value.key_id || !testEmail.value) return
  try {
    const res = await api.sendTest({
      unione_api_key_id: send.value.key_id, email: testEmail.value,
      subject: send.value.subject || null,
      from_email: send.value.from_email,
      from_name: send.value.from_name || null, reply_to: send.value.reply_to || null,
    })
    toast.add({
      severity: res.ok ? 'success' : 'warn',
      summary: res.ok ? 'Test sent' : 'Test rejected',
      detail: res.message ?? undefined, life: 7000,
    })
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: msg(e, 'Test failed'), life: 7000 })
  }
}

async function confirmSend(): Promise<void> {
  if (!send.value.key_id) return
  sending.value = true
  try {
    const run = await api.startSend({
      unione_api_key_id: send.value.key_id,
      count: send.value.count, cooldown_days: send.value.cooldown_days,
      subject: send.value.subject || null,
      from_email: send.value.from_email,
      from_name: send.value.from_name || null, reply_to: send.value.reply_to || null,
    })
    sendDialog.value = false
    await load()
    toast.add({
      severity: 'success',
      summary: `Queued run #${run.id}`,
      detail: `${run.eligible_count} recipients in ${run.chunk_count} request(s). Watch the send log — a run can still be refused by UniOne after it is queued.`,
      life: 9000,
    })
    // Poll once. A run that UniOne refuses outright fails within a second or
    // two, and telling the operator now is far better than letting them assume
    // it worked and discover the failure tomorrow.
    window.setTimeout(() => void reportOutcome(run.id), 4000)
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: msg(e, 'Could not start that send'), life: 8000 })
  } finally {
    sending.value = false
  }
}

/**
 * Check a just-queued run and surface a failure immediately.
 *
 * The queue reports the JOB as done even when UniOne refused the request — the
 * job did its work, which was to record the refusal. That is correct but
 * misleading at a glance, so the screen says what actually happened.
 */
async function reportOutcome(id: number): Promise<void> {
  try {
    const run = await api.getSend(id)
    if (run.status !== 'failed') return
    toast.add({
      severity: 'error',
      summary: `Run #${id} was refused by UniOne`,
      detail: run.error ?? 'See the send log for the reason.',
      life: 0,   // sticky: this needs acknowledging, not glancing at
    })
    await load()
  } catch {
    // Silent — the send log is the record either way.
  }
}

function msg(e: unknown, fallback: string): string {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

function statusSeverity(s: UniOneReceiverStatus): string {
  return s === 'active' ? 'success' : s === 'bounced' || s === 'complained' ? 'danger' : 'warn'
}

onMounted(() => void load())
</script>

<template>
  <div class="p-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-gray-900">UniOne Receivers</h1>
        <p class="mt-1 text-sm text-gray-500">
          <template v-if="stats">
            {{ stats.total.toLocaleString() }} on the list ·
            <span class="font-medium text-gray-700">{{ (stats.by_status.active ?? 0).toLocaleString() }}</span> active
          </template>
          <template v-else>A separate list from the newsletter subscribers.</template>
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button label="Import CSV" icon="pi pi-upload" outlined @click="importDialog = true" />
        <Button label="Export" icon="pi pi-download" outlined @click="exportCsv" />
        <Button label="Add" icon="pi pi-plus" outlined @click="openEditor(null)" />
        <Button label="Send Emails" icon="pi pi-send" @click="openSend" />
      </div>
    </div>

    <!-- One row, one control height. Compact fixed widths so the four
         controls and the button fit a single line on a laptop; the search
         box takes whatever is left. Labels are placeholders, like the
         Mailgun receivers filter, so the row stays one line tall. -->
    <div class="filters mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
      <Select v-model="fStatus" :options="statusOptions" option-label="label" option-value="value" placeholder="Status" class="w-32" size="small" />
      <DatePicker v-model="fFrom" date-format="yy-mm-dd" show-icon placeholder="From" class="w-36" size="small" />
      <DatePicker v-model="fTo" date-format="yy-mm-dd" show-icon placeholder="To" class="w-36" size="small" />
      <InputText v-model="fSearch" class="w-64" placeholder="Search email or name" size="small" @keyup.enter="apply" />
      <Button label="Apply" icon="pi pi-filter" size="small" class="filters-apply" @click="apply" />
    </div>

    <div v-if="selected.length" class="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 p-3">
      <span class="text-sm font-medium text-indigo-900">{{ selected.length }} selected</span>
      <Button size="small" severity="warn" label="Suppress" icon="pi pi-ban" @click="bulk('suppress')" />
      <Button size="small" severity="danger" outlined label="Delete" icon="pi pi-trash" @click="bulk('delete')" />
    </div>

    <DataTable
      v-model:selection="selected" :value="items" :loading="loading" data-key="id"
      lazy paginator :rows="perPage" :first="first" :total-records="totalRecords"
      :rows-per-page-options="[25, 50, 100]" @page="onPage"
    >
      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-users mb-3 text-3xl text-gray-400" />
          <p class="font-medium text-gray-900">No receivers yet.</p>
          <p class="mt-1 text-sm text-gray-500">Import a CSV or add an address — both need a recorded consent source and date.</p>
        </div>
      </template>

      <Column selection-mode="multiple" header-style="width:3rem" />

      <Column header="Receiver" style="min-width:16rem">
        <template #body="{ data }: { data: UniOneReceiver }">
          <div class="flex items-center gap-2">
            <span class="font-medium text-gray-900">{{ data.email }}</span>
            <Tag :value="data.status" :severity="statusSeverity(data.status)" />
          </div>
          <p v-if="data.name" class="text-xs text-gray-500">{{ data.name }}</p>
          <p class="text-xs text-gray-400">consent: {{ data.consent_source }} · {{ formatDate(data.consent_at) }}</p>
          <!-- A temporary-failure hold is the one thing that keeps an active address out of a run. -->
          <p v-if="data.retry_after" class="text-xs text-amber-600">held to {{ formatDate(data.retry_after) }}</p>
        </template>
      </Column>


      <Column header="Last sent" style="width:10rem">
        <template #body="{ data }: { data: UniOneReceiver }">
          <p class="text-sm text-gray-700">{{ formatDate(data.last_sent_at) }}</p>
          <p class="text-xs text-gray-400">{{ data.last_status ?? '—' }}</p>
        </template>
      </Column>

      <Column header="Counts" style="width:9rem">
        <template #body="{ data }: { data: UniOneReceiver }">
          <p class="text-xs tabular-nums text-gray-600">{{ data.send_count }} sent</p>
          <p class="text-xs tabular-nums text-gray-400">{{ data.bounce_count }} bounced · {{ data.complaint_count }} spam</p>
        </template>
      </Column>

      <Column header="" style="width:5rem">
        <template #body="{ data }: { data: UniOneReceiver }">
          <Button size="small" text icon="pi pi-pencil" @click="openEditor(data)" />
        </template>
      </Column>
    </DataTable>

    <!-- ── receiver editor ── -->
    <Dialog v-model:visible="dialog" modal :header="editing ? 'Edit receiver' : 'Add receiver'" :style="{ width: '32rem' }">
      <label class="mb-1 block text-xs font-medium text-gray-700">Email</label>
      <InputText v-model="form.email" class="mb-3 w-full" />
      <label class="mb-1 block text-xs font-medium text-gray-700">Name</label>
      <InputText v-model="form.name" class="mb-3 w-full" />
      <label class="mb-1 block text-xs font-medium text-gray-700">Consent source</label>
      <InputText v-model="form.consent_source" class="mb-1 w-full" placeholder="e.g. signup form, imported list 2026-01" />
      <p class="mb-3 text-xs text-gray-400">
        Optional. Not checked before sending — kept so you can record where an address came from.
      </p>
      <label class="mb-1 block text-xs font-medium text-gray-700">Consent date</label>
      <DatePicker v-model="form.consent_at" date-format="yy-mm-dd" show-icon class="mb-3 w-full" :max-date="new Date()" />
      <label class="mb-1 block text-xs font-medium text-gray-700">Notes</label>
      <Textarea v-model="form.notes" rows="2" class="w-full" />
      <template #footer>
        <Button label="Cancel" text @click="dialog = false" />
        <Button label="Save" :disabled="!form.email" @click="saveReceiver" />
      </template>
    </Dialog>

    <!-- ── import ── -->
    <Dialog v-model:visible="importDialog" modal header="Import receivers" :style="{ width: '38rem' }">
      <p class="mb-4 text-sm text-gray-600">
        Upload an <strong>.xlsx</strong> or <strong>.csv</strong> with an <code>Email</code> column —
        the same format the Warmup receivers import takes.
      </p>

      <label class="mb-1 block text-xs font-medium text-gray-700">File</label>
      <FileUpload
        mode="basic" name="file" accept=".xlsx,.csv,text/csv" :max-file-size="20971520"
        choose-label="Choose file" :auto="false" custom-upload class="mb-1 w-full"
        @select="onFilePick"
      />
      <p class="mb-4 text-xs text-gray-400">Up to 20 MB. The first column matching “Email” is used.</p>

      <div v-if="importResult" class="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p class="mb-2 text-sm font-medium text-gray-900">{{ importResult.message }}</p>
        <div class="flex flex-wrap gap-2">
          <Tag :value="`rows: ${importResult.rows}`" severity="secondary" />
          <Tag :value="`imported: ${importResult.imported}`" severity="success" />
          <Tag :value="`duplicates: ${importResult.duplicates}`" severity="warn" />
          <Tag :value="`invalid: ${importResult.invalid}`" :severity="importResult.invalid ? 'danger' : 'secondary'" />
        </div>
      </div>

      <template #footer>
        <Button label="Close" text @click="importDialog = false" />
        <Button
          label="Import" icon="pi pi-upload" :loading="importing"
          :disabled="!importFile"
          @click="runImport"
        />
      </template>
    </Dialog>

    <!-- ── send ── -->
    <Dialog v-model:visible="sendDialog" modal header="Send emails" :style="{ width: '50rem' }">
      <div v-if="activeKeys.length === 0" class="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
        No active UniOne key. Add one in the UniOne section and verify it before sending.
      </div>

      <template v-else-if="sendStep === 'compose'">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-700">Send with</label>
            <Select v-model="send.key_id" :options="activeKeys" option-label="name" option-value="id" class="w-full" />
            <p v-if="selectedKey" class="mt-1 text-xs text-gray-400">
              {{ selectedKey.key_type }} key · {{ selectedKey.region }}
              <span v-if="selectedKey.is_default"> · default</span>
            </p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">How many</label>
              <InputNumber v-model="send.count" :min="1" :max="100000" class="w-full" @update:model-value="refreshPreview" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Cooldown (days)</label>
              <InputNumber v-model="send.cooldown_days" :min="0" :max="365" class="w-full" @update:model-value="refreshPreview" />
            </div>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-gray-700">From email</label>
            <InputText v-model="send.from_email" class="w-full" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-700">From name</label>
            <InputText v-model="send.from_name" class="w-full" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-700">Reply-to</label>
            <InputText v-model="send.reply_to" class="w-full" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-700">Subject</label>
            <InputText v-model="send.subject" class="w-full" />
          </div>

          <div class="col-span-2 flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
            <div class="text-sm">
              <p class="font-medium text-gray-800">Template: Promotion offer — Viglinksi</p>
              <p class="mt-0.5 text-xs text-gray-400">
                Rendered per recipient from the <strong>viglinksi</strong> site's promotion template —
                edit the wording under Promotion Emails. The greeting is personalised from each
                receiver's name. A test send uses exactly this rendering.
              </p>
            </div>
            <Button
              label="Preview template" icon="pi pi-eye" outlined size="small"
              :loading="templatePreviewLoading" :disabled="!templatePreview && !templatePreviewLoading"
              @click="templatePreviewOpen = true"
            />
          </div>

          <div class="col-span-2 rounded-lg bg-gray-50 p-3">
            <p class="text-sm text-gray-700">
              <span v-if="previewLoading">Checking the audience…</span>
              <template v-else-if="preview">
                <span class="font-semibold">{{ preview.eligible.toLocaleString() }}</span> eligible ·
                will send to <span class="font-semibold">{{ preview.will_send.toLocaleString() }}</span> ·
                <span class="font-semibold">{{ preview.chunks }}</span> request(s) of up to {{ preview.chunk_size }}
              </template>
              <span v-else class="text-gray-400">Preview unavailable.</span>
            </p>
            <p class="mt-1 text-xs text-gray-400">
              Never-contacted addresses go first, then the least recently contacted; anyone
              contacted within the cooldown is skipped. UniOne appends its own unsubscribe
              footer to every message.
            </p>
          </div>

          <div class="col-span-2 flex items-end gap-2">
            <div class="flex-1">
              <label class="mb-1 block text-xs font-medium text-gray-700">Send a test to</label>
              <InputText v-model="testEmail" class="w-full" placeholder="you@example.com" />
            </div>
            <Button label="Send test" icon="pi pi-paper-plane" outlined
                    :disabled="!testEmail || !send.key_id || !send.from_email" @click="sendTest" />
          </div>
        </div>
      </template>

      <template v-else>
        <div class="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p class="font-semibold text-amber-900">Confirm this send</p>
          <ul class="mt-2 space-y-1 text-sm text-amber-900">
            <li>Key: <strong>{{ selectedKey?.name }}</strong> ({{ selectedKey?.region }})</li>
            <li>Recipients: <strong>{{ preview?.will_send?.toLocaleString() ?? '—' }}</strong> in {{ preview?.chunks ?? '—' }} request(s)</li>
            <li>Subject: <strong>{{ send.subject }}</strong></li>
            <li>Template: <strong>Promotion offer — Viglinksi</strong></li>
            <li>Cooldown: <strong>{{ send.cooldown_days }}</strong> day(s)</li>
            <li>From: <strong>{{ send.from_email }}</strong></li>
          </ul>
          <p class="mt-3 text-xs text-amber-800">
            This queues immediately and cannot be recalled once the first request leaves.
          </p>
        </div>
      </template>

      <template #footer>
        <Button label="Cancel" text @click="sendDialog = false" />
        <Button
          v-if="sendStep === 'compose'" label="Review" icon="pi pi-arrow-right"
          :disabled="!send.key_id || !send.from_email || !preview?.will_send"
          @click="sendStep = 'confirm'"
        />
        <template v-else>
          <Button label="Back" text @click="sendStep = 'compose'" />
          <Button label="Send now" icon="pi pi-send" severity="danger" :loading="sending" @click="confirmSend" />
        </template>
      </template>
    </Dialog>

    <!-- The rendered template, in a sandboxed frame so its CSS cannot leak
         into the admin and the admin's cannot leak into it. -->
    <Dialog v-model:visible="templatePreviewOpen" modal header="Template preview" :style="{ width: '52rem' }">
      <template v-if="templatePreview">
        <p class="mb-3 text-sm text-gray-600">
          Subject: <strong class="text-gray-900">{{ templatePreview.subject }}</strong>
          <span class="ml-2 text-xs text-gray-400">· from the {{ templatePreview.site }} promotion template</span>
        </p>
        <iframe
          :srcdoc="templatePreview.html" sandbox="" title="Template preview"
          class="h-[32rem] w-full rounded-lg border border-gray-200 bg-white"
        />
        <p class="mt-2 text-xs text-gray-400">
          Shown for a stand-in recipient; each receiver gets the same email with their own name in
          the greeting. UniOne adds its unsubscribe footer below this.
        </p>
      </template>
      <p v-else class="text-sm text-gray-500">The template could not be rendered.</p>
      <template #footer>
        <Button label="Close" text @click="templatePreviewOpen = false" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
/* Same (small) height for every control in the filter bar, whatever component
   draws it: PrimeVue's DatePicker input-group and its Select come out a few
   pixels apart from a plain InputText, which would break the single baseline. */
.filters :deep(.p-inputtext),
.filters :deep(.p-select),
.filters :deep(.p-datepicker-input),
.filters :deep(.p-datepicker-dropdown),
.filters-apply {
  height: 2.25rem;
}
.filters :deep(.p-select) {
  align-items: center;
}
</style>
