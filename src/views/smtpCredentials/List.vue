<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/smtpCredentials'
import type {
  SmtpCredential,
  SmtpCredentialType,
  SmtpEncryption,
  SmtpReceiverSettings,
  UpsertSmtpCredentialPayload,
} from '@shared/types/smtpCredential'
import type {
  MailgunReceiver,
  MailgunReceiverTemplate,
} from '@shared/types/mailgunReceiver'

// Stored SMTP servers. They mail the SAME receiver list as Mailgun Credentials —
// only the transport differs — so the receiver settings dialog below is the same
// shape as that screen's, minus the "send to receivers" switch: this channel has
// no scheduler and runs only from "Run now".

const toast = useToast()

const items = ref<SmtpCredential[]>([])
const loading = ref(false)

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    items.value = (await api.listSmtpCredentials()).data
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load SMTP credentials.', life: 4000 })
  } finally {
    loading.value = false
  }
}

// ── Create / edit ───────────────────────────────────────────────────────────
const showDialog = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
const fieldErrors = ref<Record<string, string>>({})

const typeOptions: { label: string; value: SmtpCredentialType }[] = [
  { label: 'Own SMTP server', value: 'own_smtp' },
  { label: 'Mailgun SMTP', value: 'mailgun_smtp' },
]

function typeLabel(value: SmtpCredentialType): string {
  return typeOptions.find((o) => o.value === value)?.label ?? value
}

const encryptionOptions: { label: string; value: SmtpEncryption }[] = [
  { label: 'SSL / implicit TLS (usually 465)', value: 'ssl' },
  { label: 'STARTTLS (usually 587)', value: 'tls' },
  { label: 'None — unencrypted', value: 'none' },
]

const form = reactive<UpsertSmtpCredentialPayload>({
  name: '',
  type: 'own_smtp',
  host: '',
  port: 465,
  username: '',
  password: '',
  encryption: 'ssl',
  from_address: '',
  from_name: '',
})

function resetForm(): void {
  form.name = ''
  form.type = 'own_smtp'
  form.host = ''
  form.port = 465
  form.username = ''
  form.password = ''
  form.encryption = 'ssl'
  form.from_address = ''
  form.from_name = ''
  fieldErrors.value = {}
}

function openCreate(): void {
  editingId.value = null
  resetForm()
  showDialog.value = true
}

function openEdit(c: SmtpCredential): void {
  editingId.value = c.id
  form.name = c.name
  form.type = c.type
  form.host = c.host
  form.port = c.port
  form.username = c.username
  // Always blank on edit: the stored password is never sent to the browser, and
  // leaving it empty is what tells the API to keep it.
  form.password = ''
  form.encryption = c.encryption
  form.from_address = c.from_address
  form.from_name = c.from_name ?? ''
  fieldErrors.value = {}
  showDialog.value = true
}

function payload(): UpsertSmtpCredentialPayload {
  const body: UpsertSmtpCredentialPayload = {
    name: form.name.trim(),
    type: form.type,
    host: form.host.trim(),
    port: Number(form.port),
    username: form.username.trim(),
    encryption: form.encryption,
    from_address: form.from_address.trim(),
    from_name: form.from_name?.trim() || null,
  }

  // Only send a password when one was typed. An empty string would be rejected
  // on create and would mean "keep the stored one" on edit, so omitting it
  // entirely is the honest signal in both cases.
  const typed = (form.password ?? '').trim()
  if (typed !== '') body.password = typed

  return body
}

async function save(): Promise<void> {
  saving.value = true
  fieldErrors.value = {}
  try {
    if (editingId.value === null) {
      await api.createSmtpCredential(payload())
      toast.add({ severity: 'success', summary: 'Added', detail: 'SMTP credential saved.', life: 2500 })
    } else {
      await api.updateSmtpCredential(editingId.value, payload())
      toast.add({ severity: 'success', summary: 'Saved', detail: 'SMTP credential updated.', life: 2500 })
    }
    showDialog.value = false
    await reload()
  } catch (e: unknown) {
    const errors = (e as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors
    if (errors) {
      fieldErrors.value = Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v[0] ?? '']))
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save the credential.', life: 4000 })
    }
  } finally {
    saving.value = false
  }
}

function err(field: string): string | undefined {
  return fieldErrors.value[field]
}

// ── Toggle / delete ─────────────────────────────────────────────────────────
async function toggleStatus(c: SmtpCredential): Promise<void> {
  try {
    const res = await api.toggleSmtpCredential(c.id)
    Object.assign(c, res.data)
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not change the status.', life: 4000 })
  }
}

const deleting = ref<SmtpCredential | null>(null)
const deletingLoading = ref(false)

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  deletingLoading.value = true
  try {
    await api.deleteSmtpCredential(deleting.value.id)
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'SMTP credential removed.', life: 2500 })
    deleting.value = null
    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete the credential.', life: 4000 })
  } finally {
    deletingLoading.value = false
  }
}

// ── Send test ───────────────────────────────────────────────────────────────
// Sends the credential's OWN configured message, so unlike the Mailgun test
// dialog there is no template picker — there is nothing to pick.
const showTest = ref(false)
const testing = ref<SmtpCredential | null>(null)
const testSending = ref(false)
const testResult = ref<{ ok: boolean; message: string } | null>(null)
const testForm = reactive({ to: '', name: '' })

function openTest(c: SmtpCredential): void {
  testing.value = c
  testForm.to = ''
  testForm.name = ''
  testResult.value = null
  showTest.value = true
}

async function runTest(): Promise<void> {
  if (!testing.value) return
  testSending.value = true
  testResult.value = null
  try {
    testResult.value = await api.testSmtpCredential(testing.value.id, {
      to: testForm.to.trim(),
      name: testForm.name.trim() || null,
    })
  } catch (e: unknown) {
    // A 422 carries the transport's real error text — "535 authentication
    // failed", "Connection could not be established" — which is the whole point
    // of testing. Showing a generic failure here would waste the trip.
    const data = (e as { response?: { data?: { message?: string } } })?.response?.data
    testResult.value = { ok: false, message: data?.message ?? 'The test could not be sent.' }
  } finally {
    testSending.value = false
  }
}

const canSendTest = computed(() => testForm.to.trim() !== '' && !testSending.value)

// ── Per-credential receiver settings ────────────────────────────────────────
const showSettings = ref(false)
const settingsFor = ref<SmtpCredential | null>(null)
const settingsLoading = ref(false)
const settingsSaving = ref(false)
const settingsErrors = ref<Record<string, string>>({})
const settings = ref<SmtpReceiverSettings | null>(null)
const previewRows = ref<MailgunReceiver[]>([])
const previewLoading = ref(false)

const NAME_TOKEN = '{{name}}'
const EMAIL_TOKEN = '{{email}}'

const orderOptions = [
  { label: 'Newest added first', value: 'newest' },
  { label: 'Oldest added first', value: 'oldest' },
]

// The palette, declared once. `key` is typed against the template so a renamed
// field is a build error rather than a colour that silently stops applying.
type ColorField = {
  [K in keyof MailgunReceiverTemplate]: MailgunReceiverTemplate[K] extends string ? K : never
}[keyof MailgunReceiverTemplate]

const colorFields: { key: ColorField; label: string }[] = [
  { key: 'background_color', label: 'Background' },
  { key: 'heading_color', label: 'Heading' },
  { key: 'text_color', label: 'Text' },
  { key: 'secondary_text_color', label: 'Secondary' },
  { key: 'muted_text_color', label: 'Muted' },
  { key: 'button_color', label: 'Button' },
  { key: 'accent_color', label: 'Link' },
]

function setColor(key: ColorField, event: Event): void {
  if (settings.value === null) return
  settings.value.message_template[key] = (event.target as HTMLInputElement).value
}

function sErr(field: string): string {
  return settingsErrors.value[field] ?? ''
}

async function openSettings(c: SmtpCredential): Promise<void> {
  settingsFor.value = c
  settings.value = null
  previewRows.value = []
  settingsErrors.value = {}
  showSettings.value = true
  settingsLoading.value = true
  try {
    settings.value = (await api.getSmtpReceiverSettings(c.id)).data
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load settings.', life: 4000 })
  } finally {
    settingsLoading.value = false
  }
}

async function saveSettings(): Promise<void> {
  if (settings.value === null || settingsFor.value === null) return
  settingsErrors.value = {}
  settingsSaving.value = true
  try {
    const res = await api.saveSmtpReceiverSettings(settingsFor.value.id, settings.value)
    settings.value.eligible_count = res.eligible_count
    settings.value.next_batch_count = res.next_batch_count
    settings.value.blocked_reason = res.blocked_reason
    toast.add({ severity: 'success', summary: 'Settings saved', life: 2500 })
  } catch (e: unknown) {
    const errors = (e as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors
    if (errors) settingsErrors.value = Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v[0] ?? '']))
    else toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save.', life: 4000 })
  } finally {
    settingsSaving.value = false
  }
}

// Re-seed every field from the source site's promotion email. Destructive by
// design — it is the "start over" control — so it replaces the subject too.
const templateResetLoading = ref(false)

async function resetTemplateFromSource(): Promise<void> {
  if (settings.value === null || settingsFor.value === null) return
  templateResetLoading.value = true
  try {
    const seed = await api.getSmtpTemplateSource(settingsFor.value.id)
    settings.value.message_template = seed.template
    settings.value.message_subject = seed.subject
    settings.value.template_source = seed.site_name
    settingsErrors.value = {}
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load the promotion template.', life: 4000 })
  } finally {
    templateResetLoading.value = false
  }
}

// ── Message preview — the rendered email, from the fields as they stand now ──
const showMessagePreview = ref(false)
const messagePreviewLoading = ref(false)
const messagePreviewHtml = ref('')

async function loadMessagePreview(): Promise<void> {
  if (settings.value === null || settingsFor.value === null) return
  messagePreviewLoading.value = true
  try {
    messagePreviewHtml.value = await api.previewSmtpReceiverMessage(
      settingsFor.value.id,
      settings.value.message_template,
    )
    showMessagePreview.value = true
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not render the preview.', life: 4000 })
  } finally {
    messagePreviewLoading.value = false
  }
}

async function loadPreview(): Promise<void> {
  if (settingsFor.value === null) return
  previewLoading.value = true
  try {
    const res = await api.previewSmtpReceiverBatch(settingsFor.value.id)
    previewRows.value = res.data
    if (settings.value) {
      settings.value.eligible_count = res.meta.eligible_count
      settings.value.next_batch_count = res.meta.next_batch_count
    }
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load the batch preview.', life: 4000 })
  } finally {
    previewLoading.value = false
  }
}

// ── Run now — the ONLY way this channel sends ───────────────────────────────
const showRunConfirm = ref(false)
const running = ref(false)

async function runNow(): Promise<void> {
  if (settingsFor.value === null) return
  running.value = true
  try {
    const res = await api.runSmtpReceiverCampaign(settingsFor.value.id)
    toast.add({ severity: 'success', summary: 'Run queued', detail: res.message, life: 4000 })
    showRunConfirm.value = false
    showSettings.value = false
    await reload()
  } catch (e: unknown) {
    // A 409 means the job refused for a stated reason — inactive, unusable
    // credential, no message configured. That wording comes from the same method
    // the job logs, so the admin and the log agree.
    const data = (e as { response?: { data?: { message?: string } } })?.response?.data
    toast.add({
      severity: 'warn',
      summary: 'Not queued',
      detail: data?.message ?? 'The run could not be queued.',
      life: 5000,
    })
  } finally {
    running.value = false
  }
}

onMounted(reload)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Email Configs</h2>
        <p class="text-sm text-gray-500">
          Your own SMTP servers. Each one mails the same Mailgun receiver list, through its own
          server instead of the Mailgun API, and sends only when you press Run now.
        </p>
      </div>
      <Button label="New SMTP server" icon="pi pi-plus" @click="openCreate" />
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable :value="items" :loading="loading" striped-rows data-key="id" :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">
            No SMTP servers yet. Add one to send to the receiver list without Mailgun.
          </div>
        </template>

        <Column field="name" header="Name">
          <template #body="{ data }">
            <span class="font-medium text-gray-900">{{ data.name }}</span>
          </template>
        </Column>

        <Column header="Server">
          <template #body="{ data }">
            <span class="text-gray-700">{{ data.host }}</span>
            <span class="text-gray-400">:{{ data.port }}</span>
          </template>
        </Column>

        <Column field="username" header="Username" />

        <Column header="Password">
          <template #body="{ data }">
            <span class="font-mono text-gray-400">{{ data.masked_password || '—' }}</span>
          </template>
        </Column>

        <Column header="Type">
          <template #body="{ data }">
            <span class="text-gray-600">
              {{ typeLabel(data.type) }}<span class="text-gray-400"> · {{ data.encryption.toUpperCase() }}</span>
            </span>
          </template>
        </Column>

        <Column header="Last run">
          <template #body="{ data }">
            <span class="text-gray-600">{{ formatDate(data.last_run_at) }}</span>
          </template>
        </Column>

        <Column header="Status">
          <template #body="{ data }">
            <button type="button" class="cursor-pointer" @click="toggleStatus(data)">
              <Tag
                :value="data.status === 'active' ? 'Active' : 'Inactive'"
                :severity="data.status === 'active' ? 'success' : 'secondary'"
              />
            </button>
            <!-- Separate from the status badge on purpose: a credential can be
                 Active and still unable to authenticate, and that is exactly the
                 state worth surfacing before a run is attempted. -->
            <Tag v-if="!data.can_authenticate" value="Incomplete" severity="warn" class="ml-1" />
          </template>
        </Column>

        <Column header="Actions" :style="{ width: '190px' }">
          <template #body="{ data }">
            <Button icon="pi pi-users" text severity="secondary" size="small" v-tooltip.top="'Receivers & message'" @click="openSettings(data)" />
            <Button icon="pi pi-send" text severity="secondary" size="small" v-tooltip.top="'Send test email'" @click="openTest(data)" />
            <Button icon="pi pi-pencil" text severity="secondary" size="small" v-tooltip.top="'Edit'" @click="openEdit(data)" />
            <Button icon="pi pi-trash" text severity="danger" size="small" v-tooltip.top="'Delete'" @click="deleting = data" />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Create / edit -->
    <Dialog
      v-model:visible="showDialog"
      modal
      :header="editingId ? 'Edit SMTP server' : 'New SMTP server'"
      :style="{ width: '560px' }"
    >
      <div class="space-y-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Name</label>
          <InputText v-model="form.name" placeholder="SMTP_BIU" fluid />
          <p v-if="err('name')" class="mt-1 text-xs text-red-600">{{ err('name') }}</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Type</label>
          <Select v-model="form.type" :options="typeOptions" option-label="label" option-value="value" fluid />
          <p class="mt-1 text-xs text-gray-400">
            On a Mailgun SMTP row the password is Mailgun's <strong>SMTP password</strong>, not the
            API key — they look alike and only one of them authenticates.
          </p>
          <p v-if="err('type')" class="mt-1 text-xs text-red-600">{{ err('type') }}</p>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-2">
            <label class="mb-1 block text-xs font-medium text-gray-600">Mail host</label>
            <InputText v-model="form.host" placeholder="mail.example.com" fluid />
            <p v-if="err('host')" class="mt-1 text-xs text-red-600">{{ err('host') }}</p>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Port</label>
            <InputNumber v-model="form.port" :min="1" :max="65535" :use-grouping="false" fluid />
            <p v-if="err('port')" class="mt-1 text-xs text-red-600">{{ err('port') }}</p>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Encryption</label>
          <Select v-model="form.encryption" :options="encryptionOptions" option-label="label" option-value="value" fluid />
          <p v-if="err('encryption')" class="mt-1 text-xs text-red-600">{{ err('encryption') }}</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Mail username</label>
          <InputText v-model="form.username" placeholder="info@example.com" fluid />
          <p v-if="err('username')" class="mt-1 text-xs text-red-600">{{ err('username') }}</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Mail password</label>
          <InputText v-model="form.password" type="password" autocomplete="new-password" fluid />
          <p class="mt-1 text-xs text-gray-400">
            {{ editingId ? 'Leave empty to keep the stored password.' : 'Stored encrypted. It is never shown again.' }}
          </p>
          <p v-if="err('password')" class="mt-1 text-xs text-red-600">{{ err('password') }}</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">From address</label>
            <InputText v-model="form.from_address" placeholder="info@example.com" fluid />
            <p v-if="err('from_address')" class="mt-1 text-xs text-red-600">{{ err('from_address') }}</p>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">From name</label>
            <InputText v-model="form.from_name" placeholder="Optional" fluid />
            <p v-if="err('from_name')" class="mt-1 text-xs text-red-600">{{ err('from_name') }}</p>
          </div>
        </div>

        <p class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The From address should be on the same domain this server authenticates. A mismatch is the
          usual cause of mail that sends without error and never arrives.
        </p>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="showDialog = false" />
        <Button :label="editingId ? 'Save changes' : 'Add server'" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <!-- Send test -->
    <Dialog
      v-model:visible="showTest"
      modal
      :header="`Send test — ${testing?.name ?? ''}`"
      :style="{ width: '460px' }"
    >
      <div class="space-y-3">
        <p class="text-sm text-gray-600">
          Sends this server's own configured message. If no message is configured yet, a short
          connection test is sent instead, so you can check the settings before writing any copy.
        </p>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">To</label>
          <InputText v-model="testForm.to" placeholder="you@example.com" fluid />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Name (optional)</label>
          <InputText v-model="testForm.name" placeholder="Substituted for {{name}}" fluid />
        </div>

        <div
          v-if="testResult"
          class="rounded-lg px-3 py-2 text-sm"
          :class="testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'"
        >
          {{ testResult.message }}
        </div>
      </div>

      <template #footer>
        <Button label="Close" text @click="showTest = false" />
        <Button label="Send test" icon="pi pi-send" :loading="testSending" :disabled="!canSendTest" @click="runTest" />
      </template>
    </Dialog>

    <!-- Delete confirm -->
    <Dialog :visible="deleting !== null" modal header="Delete SMTP server" :style="{ width: '420px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">
        Delete <strong>{{ deleting?.name }}</strong>? Its send history goes with it. The receiver
        list itself is shared and is not affected.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" severity="danger" :loading="deletingLoading" @click="confirmDelete" />
      </template>
    </Dialog>

    <!-- Receivers & message. No credential picker: the row that opened this
         dialog is the sender. -->
    <Dialog
      v-model:visible="showSettings"
      modal
      :header="`Receivers & message — ${settingsFor?.name ?? ''}`"
      :style="{ width: '760px' }"
    >
      <div v-if="settingsLoading" class="py-8 text-center text-sm text-gray-400">Loading…</div>

      <div v-else-if="settings" class="space-y-4">
        <div v-if="settings.blocked_reason" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This server will not run: {{ settings.blocked_reason }}.
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Receivers per run</label>
            <InputNumber v-model="settings.batch_size" :min="1" :max="10000" fluid />
            <p v-if="sErr('batch_size')" class="mt-1 text-xs text-red-600">{{ sErr('batch_size') }}</p>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Order</label>
            <Select v-model="settings.selection_order" :options="orderOptions" option-label="label" option-value="value" fluid />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Cooldown (days)</label>
            <InputNumber v-model="settings.cooldown_days" :min="0" :max="365" fluid />
            <p class="mt-1 text-xs text-gray-400">
              Skip anyone mailed within N days. Leave empty for no cooldown.
            </p>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Subject</label>
          <InputText v-model="settings.message_subject" fluid />
          <p v-if="sErr('message_subject')" class="mt-1 text-xs text-red-600">{{ sErr('message_subject') }}</p>
        </div>

        <!-- The message template. The admin fills in blocks; the backend renders
             the email HTML from them, so no raw markup is authored here. Every
             block is optional — clearing a field removes it from the email. -->
        <div class="rounded-lg border border-gray-200">
          <div class="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
            <span class="text-sm font-medium text-gray-700">Email template</span>
            <div class="flex items-center gap-1">
              <Button
                label="Reset to promotion template"
                icon="pi pi-replay"
                size="small"
                text
                severity="secondary"
                :loading="templateResetLoading"
                @click="resetTemplateFromSource"
              />
              <Button
                label="Preview email"
                icon="pi pi-eye"
                size="small"
                text
                :loading="messagePreviewLoading"
                @click="loadMessagePreview"
              />
            </div>
          </div>

          <div class="space-y-3 p-3">
            <p v-if="settings.template_source" class="text-xs text-gray-400">
              Starting copy and colours come from the <strong>{{ settings.template_source }}</strong>
              promotion email. Everything below is editable and nothing is saved until you press
              Save settings.
            </p>

            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Preview line</label>
              <InputText v-model="settings.message_template.preheader" fluid />
              <p class="mt-1 text-xs text-gray-400">Shown under the subject in the inbox list. Not visible in the message itself.</p>
              <p v-if="sErr('message_template.preheader')" class="mt-1 text-xs text-red-600">{{ sErr('message_template.preheader') }}</p>
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Heading</label>
              <InputText v-model="settings.message_template.heading" fluid />
              <p v-if="sErr('message_template.heading')" class="mt-1 text-xs text-red-600">{{ sErr('message_template.heading') }}</p>
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Message text</label>
              <Textarea v-model="settings.message_template.intro_text" rows="4" fluid />
              <p class="mt-1 text-xs text-gray-400">
                <code>**bold**</code> becomes bold. <code>{{ NAME_TOKEN }}</code> and
                <code>{{ EMAIL_TOKEN }}</code> are substituted per recipient.
              </p>
              <p v-if="sErr('message_template.intro_text')" class="mt-1 text-xs text-red-600">{{ sErr('message_template.intro_text') }}</p>
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Secondary text</label>
              <Textarea v-model="settings.message_template.secondary_text" rows="3" fluid />
              <p v-if="sErr('message_template.secondary_text')" class="mt-1 text-xs text-red-600">{{ sErr('message_template.secondary_text') }}</p>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-xs font-medium text-gray-600">Button label</label>
                <InputText v-model="settings.message_template.button_text" fluid />
                <p v-if="sErr('message_template.button_text')" class="mt-1 text-xs text-red-600">{{ sErr('message_template.button_text') }}</p>
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-gray-600">Button link</label>
                <InputText v-model="settings.message_template.button_url" placeholder="https://…" fluid />
                <p v-if="sErr('message_template.button_url')" class="mt-1 text-xs text-red-600">{{ sErr('message_template.button_url') }}</p>
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-gray-600">Banner image URL</label>
                <InputText v-model="settings.message_template.hero_image_url" placeholder="https://…" fluid />
                <p v-if="sErr('message_template.hero_image_url')" class="mt-1 text-xs text-red-600">{{ sErr('message_template.hero_image_url') }}</p>
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-gray-600">Banner link</label>
                <InputText v-model="settings.message_template.hero_url" placeholder="https://…" fluid />
                <p v-if="sErr('message_template.hero_url')" class="mt-1 text-xs text-red-600">{{ sErr('message_template.hero_url') }}</p>
              </div>
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Disclaimer</label>
              <Textarea v-model="settings.message_template.disclaimer_text" rows="2" fluid />
              <p v-if="sErr('message_template.disclaimer_text')" class="mt-1 text-xs text-red-600">{{ sErr('message_template.disclaimer_text') }}</p>
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Footer</label>
              <Textarea v-model="settings.message_template.footer_text" rows="2" fluid />
              <p class="mt-1 text-xs text-gray-400">
                Sender name, postal address and a monitored contact belong here — commercial mail is
                expected to carry them, and their absence is itself a spam signal. The unsubscribe
                link is added automatically and cannot be removed.
              </p>
              <p v-if="sErr('message_template.footer_text')" class="mt-1 text-xs text-red-600">{{ sErr('message_template.footer_text') }}</p>
            </div>

            <!-- Palette. Native colour inputs: they emit #rrggbb, which is the
                 exact shape the backend validates. -->
            <div>
              <label class="mb-2 block text-xs font-medium text-gray-600">Colours</label>
              <div class="flex flex-wrap gap-3">
                <label v-for="c in colorFields" :key="c.key" class="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="color"
                    class="h-7 w-9 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                    :value="settings.message_template[c.key]"
                    @input="setColor(c.key, $event)"
                  />
                  {{ c.label }}
                </label>
              </div>
              <div class="mt-3 w-40">
                <label class="mb-1 block text-xs font-medium text-gray-600">Button text size</label>
                <InputNumber v-model="settings.message_template.button_text_font_size" :min="12" :max="24" suffix=" px" fluid />
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-lg bg-gray-50 px-3 py-2 text-sm">
          <span class="text-gray-600">Matching receivers now:</span>
          <strong class="ml-1 tabular-nums">{{ settings.eligible_count.toLocaleString() }}</strong>
          <span class="ml-3 text-gray-600">Next run would take:</span>
          <strong class="ml-1 tabular-nums">{{ settings.next_batch_count.toLocaleString() }}</strong>
          <span class="ml-3 text-gray-400">Last run: {{ formatDate(settings.last_run_at) }}</span>
        </div>

        <div class="flex items-center gap-2">
          <Button label="Preview batch" icon="pi pi-eye" size="small" outlined :loading="previewLoading" @click="loadPreview" />
          <span v-if="previewRows.length" class="text-xs text-gray-400">
            Showing the first {{ previewRows.length }} the next run would take.
          </span>
        </div>

        <div v-if="previewRows.length" class="max-h-56 overflow-auto rounded-lg border border-gray-200">
          <table class="w-full text-xs">
            <thead class="bg-gray-50 text-gray-500">
              <tr>
                <th class="px-3 py-2 text-left font-medium">Email</th>
                <th class="px-3 py-2 text-left font-medium">Last sent</th>
                <th class="px-3 py-2 text-left font-medium">Sent</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in previewRows" :key="r.id" class="border-t border-gray-100">
                <td class="px-3 py-1.5 text-gray-700">{{ r.email }}</td>
                <td class="px-3 py-1.5 text-gray-500">{{ formatDate(r.last_sent_at) }}</td>
                <td class="px-3 py-1.5 tabular-nums text-gray-500">{{ r.sent_count }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <template #footer>
        <Button label="Close" text @click="showSettings = false" />
        <Button
          label="Run now"
          icon="pi pi-play"
          outlined
          severity="secondary"
          :disabled="!settings || settings.blocked_reason !== null"
          @click="showRunConfirm = true"
        />
        <Button label="Save settings" icon="pi pi-check" :loading="settingsSaving" @click="saveSettings" />
      </template>
    </Dialog>

    <!-- Run confirm. Separate from the button because this one actually mails
         real people, and unsaved edits are NOT part of it. -->
    <Dialog v-model:visible="showRunConfirm" modal header="Run now" :style="{ width: '460px' }">
      <p class="text-sm text-gray-700">
        Queue a run for <strong>{{ settingsFor?.name }}</strong>, mailing
        <strong class="tabular-nums">{{ settings?.next_batch_count.toLocaleString() ?? 0 }}</strong>
        receiver(s) through this server.
      </p>
      <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        This sends the <strong>saved</strong> message, not unsaved edits in this dialog. Save first
        if you have changed anything.
      </p>
      <p class="mt-3 text-sm text-gray-500">
        Anyone already mailed today — by this server or by a Mailgun credential — is skipped.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="showRunConfirm = false" />
        <Button label="Queue the run" icon="pi pi-play" severity="danger" :loading="running" @click="runNow" />
      </template>
    </Dialog>

    <!-- Rendered message preview -->
    <Dialog v-model:visible="showMessagePreview" modal header="Email preview" :style="{ width: '700px' }">
      <div class="max-h-[70vh] overflow-auto rounded-lg border border-gray-200" v-html="messagePreviewHtml" />
      <template #footer>
        <Button label="Close" text @click="showMessagePreview = false" />
      </template>
    </Dialog>
  </div>
</template>
