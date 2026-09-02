<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import * as api from '@/api/mailgunKeys'
import { listEmailTemplateTypes } from '@/api/emailTemplateTypes'
import { useAuthStore } from '@/stores/authStore'
import type { MailgunKey, MailgunRegion, UpsertMailgunKeyPayload } from '@shared/types/mailgunKey'
import type { EmailTemplateType } from '@shared/types/emailTemplateType'
import type { ErrorResponse } from '@shared/types/api'

const toast = useToast()
const authStore = useAuthStore()

const items = ref<MailgunKey[]>([])
const loading = ref(false)

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    items.value = (await api.listMailgunKeys()).data
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load Mailgun credentials.', life: 4000 })
  } finally {
    loading.value = false
  }
}

// ── Create / edit dialog ────────────────────────────────────────────────────────
const showDialog = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const fieldErrors = ref<Record<string, string>>({})

interface KeyForm {
  name: string
  // Mailgun authenticates a (domain, key) pair, so the sending domain is part
  // of the credential rather than a global setting.
  domain: string
  api_key: string
  region: MailgunRegion
  // Sender identity registered with Mailgun for this domain. Recorded for
  // reference only — no send path reads it; every send takes its sender from
  // the site template's own from_email.
  from_address: string
  from_name: string
  active: boolean
}

function emptyForm(): KeyForm {
  return { name: '', domain: '', api_key: '', region: 'us', from_address: '', from_name: '', active: true }
}

const REGION_OPTIONS: Array<{ label: string; value: MailgunRegion }> = [
  { label: 'US (api.mailgun.net)', value: 'us' },
  { label: 'EU (api.eu.mailgun.net)', value: 'eu' },
]
const form = reactive<KeyForm>(emptyForm())

function openCreate(): void {
  Object.assign(form, emptyForm())
  editingId.value = null
  fieldErrors.value = {}
  showDialog.value = true
}

function openEdit(k: MailgunKey): void {
  Object.assign(form, {
    name: k.name,
    domain: k.domain,
    api_key: '',
    region: k.region,
    from_address: k.from_address ?? '',
    from_name: k.from_name ?? '',
    active: k.status === 'active',
  })
  editingId.value = k.id
  fieldErrors.value = {}
  showDialog.value = true
}

function payload(): UpsertMailgunKeyPayload {
  const base: UpsertMailgunKeyPayload = {
    name: form.name,
    domain: form.domain.trim(),
    region: form.region,
    // null rather than '' so emptying the box actually clears the stored value;
    // '' would fail the backend's `email` rule instead of meaning "unset".
    from_address: form.from_address.trim() || null,
    from_name: form.from_name.trim() || null,
    status: form.active ? 'active' : 'inactive',
  }
  // Only send the key when the admin typed one (required on create, optional on
  // edit — blank means "keep the stored key").
  if (form.api_key.trim() !== '') base.api_key = form.api_key.trim()
  return base
}

async function save(): Promise<void> {
  fieldErrors.value = {}
  saving.value = true
  try {
    if (editingId.value === null) {
      await api.createMailgunKey(payload())
      toast.add({ severity: 'success', summary: 'Created', detail: 'Mailgun key added.', life: 2500 })
    } else {
      await api.updateMailgunKey(editingId.value, payload())
      toast.add({ severity: 'success', summary: 'Saved', detail: 'Mailgun key updated.', life: 2500 })
    }
    showDialog.value = false
    await reload()
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as ErrorResponse
      for (const [field, messages] of Object.entries(data.errors ?? {})) {
        fieldErrors.value[field] = messages[0] ?? ''
      }
      toast.add({ severity: 'warn', summary: 'Check the form', detail: data.message, life: 5000 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save the key.', life: 4000 })
    }
  } finally {
    saving.value = false
  }
}

// ── Status toggle ───────────────────────────────────────────────────────────────
const togglingId = ref<number | null>(null)
async function toggleStatus(k: MailgunKey): Promise<void> {
  togglingId.value = k.id
  try {
    const res = await api.toggleMailgunKey(k.id)
    const idx = items.value.findIndex((i) => i.id === k.id)
    if (idx !== -1) items.value[idx] = res.data
    toast.add({
      severity: 'success',
      summary: res.data.status === 'active' ? 'Enabled' : 'Disabled',
      detail: `Key "${res.data.name}" is now ${res.data.status}.`,
      life: 2500,
    })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to change status.', life: 4000 })
  } finally {
    togglingId.value = null
  }
}

// ── Send test — renders a real template and proves the key delivers ─────────────
const testing = ref<MailgunKey | null>(null)
const testEmail = ref('')
const testTemplate = ref<string | null>(null)
const testSending = ref(false)
const testErrors = ref<Record<string, string>>({})
// Result stays on screen (rather than a toast) so the admin gets a definitive,
// readable works / does-not-work answer — the failure text is Mailgun's own.
const testResult = ref<{ ok: boolean; message: string } | null>(null)

// Templates come from the backend catalog, so a newly registered one appears
// here with no change to this component.
const templateTypes = ref<EmailTemplateType[]>([])
// This screen's own connection test, prepended to the shared catalog list.
// It is NOT registered in EmailTemplateCatalog: that list is also used by the
// SendGrid dialog and the warmup picker, which must stay as they are.
const CONNECTION_TEST = {
  value: 'mailgun_connection_test',
  label: 'Connection test (no website content)',
  description:
    'Plain diagnostic message. Confirms the credential authenticates and delivers, without rendering any site template.',
}

const templateOptions = computed(() => [
  { label: CONNECTION_TEST.label, value: CONNECTION_TEST.value },
  ...templateTypes.value.map((t) => ({ label: t.label, value: t.value })),
])
const selectedTemplateHint = computed(() =>
  testTemplate.value = CONNECTION_TEST.value
    ? CONNECTION_TEST.description
    : (templateTypes.value.find((t) => t.value === testTemplate.value)?.description ?? ''),
)

const canSendTest = computed(
  () => testEmail.value.trim() !== '' && testTemplate.value !== null,
)

function openTest(k: MailgunKey): void {
  testing.value = k
  testEmail.value = authStore.user?.email ?? ''
  // Sensible defaults so the common case is one click.
  testTemplate.value = templateTypes.value[0]?.value ?? null
  testErrors.value = {}
  testResult.value = null
}

function closeTest(): void {
  testing.value = null
  testResult.value = null
  testErrors.value = {}
}

async function runTest(): Promise<void> {
  if (!testing.value || !canSendTest.value) return
  testSending.value = true
  testErrors.value = {}
  testResult.value = null
  try {
    const res = await api.testMailgunKey(testing.value.id, {
      to: testEmail.value.trim(),
      template: testTemplate.value as string,
    })
    testResult.value = { ok: true, message: res.message }
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as ErrorResponse
      for (const [field, messages] of Object.entries(data.errors ?? {})) {
        testErrors.value[field] = messages[0] ?? ''
      }
      testResult.value = { ok: false, message: data.message ?? 'Check the highlighted fields.' }
    } else {
      const msg = axios.isAxiosError(e)
        ? ((e.response?.data as { message?: string } | undefined)?.message ?? 'The key test failed.')
        : 'The key test failed.'
      testResult.value = { ok: false, message: msg }
    }
  } finally {
    testSending.value = false
  }
}

function testErr(field: string): string | undefined {
  return testErrors.value[field]
}

// ── Delete ──────────────────────────────────────────────────────────────────────
const deleting = ref<MailgunKey | null>(null)
const deletingLoading = ref(false)
async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  deletingLoading.value = true
  try {
    await api.deleteMailgunKey(deleting.value.id)
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Mailgun key removed.', life: 2500 })
    deleting.value = null
    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete the key.', life: 4000 })
  } finally {
    deletingLoading.value = false
  }
}

function err(field: string): string | undefined {
  return fieldErrors.value[field]
}

onMounted(async () => {
  // The template list backs the test dialog's dropdown; a failure there is not
  // fatal to the credential list itself, it just leaves the dropdown empty.
  // Sites are not fetched: this dialog has no website picker.
  await Promise.all([
    reload(),
    listEmailTemplateTypes()
      .then((types) => (templateTypes.value = types))
      .catch(() => (templateTypes.value = [])),
  ])
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Mailgun Credentials</h2>
        <p class="text-sm text-gray-500">
          Store Mailgun API keys to send scheduled promotion campaigns through the Mailgun API.
        </p>
      </div>
      <Button label="New credential" icon="pi pi-plus" @click="openCreate" />
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable :value="items" :loading="loading" striped-rows data-key="id" :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">
            No Mailgun credentials yet. Add one to use it in Schedule Settings.
          </div>
        </template>

        <Column header="Name" class="font-medium">
          <template #body="{ data }: { data: MailgunKey }">{{ data.name }}</template>
        </Column>
        <Column header="Domain" :style="{ width: '220px' }">
            <template #body="{ data }: { data: MailgunKey }">
              <span class="text-gray-700">{{ data.domain }}</span>
              <span class="ml-2 text-xs uppercase text-gray-400">{{ data.region }}</span>
            </template>
          </Column>

          <Column header="From" :style="{ width: '210px' }">
            <template #body="{ data }: { data: MailgunKey }">
              <span v-if="data.from_address" class="text-gray-700">{{ data.from_address }}</span>
              <!-- Not a warning: the site template supplies the sender, so a
                   credential without one is complete and works. -->
              <span v-else class="text-xs text-gray-400">from site template</span>
            </template>
          </Column>

          <Column header="Key">
          <template #body="{ data }: { data: MailgunKey }">
            <code class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{{ data.masked_key }}</code>
          </template>
        </Column>
        <Column header="Status" :style="{ width: '120px' }">
          <template #body="{ data }: { data: MailgunKey }">
            <Tag :severity="data.status === 'active' ? 'success' : 'secondary'" :value="data.status === 'active' ? 'Active' : 'Inactive'" />
          </template>
        </Column>
        <Column header="Enabled" :style="{ width: '100px' }">
          <template #body="{ data }: { data: MailgunKey }">
            <ToggleSwitch
              :model-value="data.status === 'active'"
              :disabled="togglingId === data.id"
              @update:model-value="toggleStatus(data)"
            />
          </template>
        </Column>
        <Column header="Created" :style="{ width: '160px' }">
          <template #body="{ data }: { data: MailgunKey }">
            <span class="text-gray-500">{{ formatDate(data.created_at) }}</span>
          </template>
        </Column>
        <Column header="Actions" :style="{ width: '150px' }">
          <template #body="{ data }: { data: MailgunKey }">
            <Button icon="pi pi-send" text severity="secondary" size="small" v-tooltip.top="'Send test email'" @click="openTest(data)" />
            <Button icon="pi pi-pencil" text severity="secondary" size="small" v-tooltip.top="'Edit'" @click="openEdit(data)" />
            <Button icon="pi pi-trash" text severity="danger" size="small" v-tooltip.top="'Delete'" @click="deleting = data" />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Create / edit dialog -->
    <Dialog v-model:visible="showDialog" modal :header="editingId ? 'Edit Mailgun key' : 'New Mailgun key'" :style="{ width: '480px' }">
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Name</label>
          <InputText v-model="form.name" fluid placeholder="e.g. Marketing account" />
          <p v-if="err('name')" class="mt-1 text-xs text-red-600">{{ err('name') }}</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Mailgun domain</label>
          <InputText v-model="form.domain" fluid placeholder="e.g. mg.example.com" />
          <p class="mt-1 text-xs text-gray-400">
            The verified sending domain from Mailgun → Sending → Domains. Bare hostname only — no
            https://, no trailing slash. Emails are sent from and signed by this domain.
          </p>
          <p v-if="err('domain')" class="mt-1 text-xs text-red-600">{{ err('domain') }}</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Region</label>
          <Select
            v-model="form.region"
            :options="REGION_OPTIONS"
            option-label="label"
            option-value="value"
            fluid
          />
          <p class="mt-1 text-xs text-gray-400">
            Must match the region your Mailgun account was created in — shown next to the domain in
            the Mailgun dashboard. The wrong region fails authentication with a misleading 401.
          </p>
          <p v-if="err('region')" class="mt-1 text-xs text-red-600">{{ err('region') }}</p>
        </div>

        <!-- Sender identity, recorded for reference. Optional on purpose, and
             not used when sending: every site template defines its own
             from_email, which is what a send actually uses. Leaving both blank
             is a perfectly valid, working credential. -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">
              From address <span class="font-normal text-gray-400">(optional)</span>
            </label>
            <InputText v-model="form.from_address" fluid autocomplete="off" placeholder="offers@mg.example.com" />
            <p v-if="err('from_address')" class="mt-1 text-xs text-red-600">{{ err('from_address') }}</p>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">
              From name <span class="font-normal text-gray-400">(optional)</span>
            </label>
            <InputText v-model="form.from_name" fluid autocomplete="off" placeholder="Example Offers" />
            <p v-if="err('from_name')" class="mt-1 text-xs text-red-600">{{ err('from_name') }}</p>
          </div>
          <p class="col-span-2 -mt-1 text-xs text-gray-400">
            Used only when a site's email template has no From address of its own. A template that
            defines one always takes precedence, so filling these in never changes an existing send.
          </p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">API key</label>
          <InputText
            v-model="form.api_key"
            fluid
            autocomplete="off"
            :placeholder="editingId ? 'Leave blank to keep the current key' : 'Your Mailgun private API key'"
          />
          <p class="mt-1 text-xs text-gray-400">
            {{ editingId ? 'The stored key is never shown. Enter a new value only to replace it.' : 'Paste the private API key from your Mailgun dashboard. It is stored encrypted.' }}
          </p>
          <p v-if="err('api_key')" class="mt-1 text-xs text-red-600">{{ err('api_key') }}</p>
        </div>

        <section class="flex items-center justify-between rounded-lg border border-gray-200 p-3">
          <div>
            <p class="text-sm font-medium text-gray-800">Active</p>
            <p class="text-xs text-gray-500">Only active keys can be selected in Schedule Settings.</p>
          </div>
          <ToggleSwitch v-model="form.active" />
        </section>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="showDialog = false" />
        <Button :label="editingId ? 'Save changes' : 'Add credential'" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <!-- Send test — verify the key works -->
    <Dialog
      :visible="testing !== null"
      modal
      header="Test Mailgun key"
      :style="{ width: '460px' }"
      @update:visible="closeTest"
    >
      <div class="space-y-4">
        <p class="text-sm text-gray-700">
          Sends a message through <strong>{{ testing?.name }}</strong> to confirm the credential
          authenticates and can deliver. The connection test renders no site content; the other
          templates use your first active website's, and the confirmation names which one.
          Inactive credentials can be tested too.
        </p>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Email template</label>
          <Select
            v-model="testTemplate"
            :options="templateOptions"
            option-label="label"
            option-value="value"
            placeholder="Select a template"
            fluid
          />
          <p v-if="selectedTemplateHint" class="mt-1 text-xs text-gray-400">{{ selectedTemplateHint }}</p>
          <p v-if="testErr('template')" class="mt-1 text-xs text-red-600">{{ testErr('template') }}</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Send to</label>
          <InputText v-model="testEmail" fluid type="email" placeholder="you@example.com" @keyup.enter="runTest" />
          <p v-if="testErr('to')" class="mt-1 text-xs text-red-600">{{ testErr('to') }}</p>
        </div>

        <div
          v-if="testResult"
          class="rounded-lg border p-3 text-sm"
          :class="testResult.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'"
        >
          <p class="flex items-start gap-2">
            <i :class="testResult.ok ? 'pi pi-check-circle' : 'pi pi-times-circle'" class="mt-0.5" />
            <span class="break-words">{{ testResult.message }}</span>
          </p>
        </div>
      </div>

      <template #footer>
        <Button label="Close" text @click="closeTest" />
        <Button
          label="Send test"
          icon="pi pi-send"
          :loading="testSending"
          :disabled="!canSendTest"
          @click="runTest"
        />
      </template>
    </Dialog>

    <!-- Delete confirm -->
    <Dialog :visible="deleting !== null" modal header="Delete Mailgun key" :style="{ width: '420px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">
        Delete <strong>{{ deleting?.name }}</strong>? Any schedule using it will fall back to needing a new key before it can send.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" severity="danger" :loading="deletingLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
