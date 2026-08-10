<script setup lang="ts">
/**
 * Twilio Configs — stored credentials used to authenticate bulk SMS sends.
 *
 * Deliberately the same screen as SendGrid Keys and Mailgun Keys: CRUD, an
 * active/inactive toggle, and a test that proves the credential really delivers.
 * The Auth Token is write-only — the server returns only a masked preview, so an
 * edit that leaves the field blank keeps the stored token.
 */
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import * as api from '@/api/twilioConfigs'
import type { TwilioConfig, TwilioConfigPayload } from '@shared/types/twilioConfig'
import type { ErrorResponse } from '@shared/types/api'

const toast = useToast()

const items = ref<TwilioConfig[]>([])
const loading = ref(false)

async function reload(): Promise<void> {
  loading.value = true
  try {
    const { data } = await api.listTwilioConfigs()
    items.value = data
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load Twilio configurations.', life: 4000 })
  } finally {
    loading.value = false
  }
}

function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

/** First field error if the server sent one, otherwise its message. */
function extractError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as ErrorResponse | undefined
    const firstField = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
    return firstField ?? data?.message ?? fallback
  }
  return fallback
}

// ── Create / edit ─────────────────────────────────────────────────────────────
const showForm = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)

const form = ref<TwilioConfigPayload>({
  name: '',
  account_sid: '',
  auth_token: '',
  from_number: '',
  messaging_service_sid: '',
})

function openCreate(): void {
  editingId.value = null
  form.value = {
    name: '',
    account_sid: '',
    auth_token: '',
    from_number: '',
    messaging_service_sid: '',
  }
  showForm.value = true
}

function openEdit(row: TwilioConfig): void {
  editingId.value = row.id
  form.value = {
    name: row.name,
    // The listing carries only a masked SID, so it cannot be prefilled — the
    // admin re-enters it when editing, which is also the only way to change it.
    account_sid: '',
    // Blank means "keep the stored token".
    auth_token: '',
    from_number: row.from_number ?? '',
    messaging_service_sid: row.messaging_service_sid ?? '',
  }
  showForm.value = true
}

const canSave = computed(
  () =>
    form.value.name.trim() !== '' &&
    form.value.account_sid.trim() !== '' &&
    // A token is required on create; on edit, blank keeps the stored one.
    (editingId.value !== null || (form.value.auth_token ?? '').trim() !== '') &&
    // One sender identity is mandatory, matching the server-side rule.
    ((form.value.from_number ?? '').trim() !== '' ||
      (form.value.messaging_service_sid ?? '').trim() !== ''),
)

async function save(): Promise<void> {
  if (!canSave.value) return
  saving.value = true
  try {
    const payload: TwilioConfigPayload = {
      name: form.value.name.trim(),
      account_sid: form.value.account_sid.trim(),
      from_number: (form.value.from_number ?? '').trim() || null,
      messaging_service_sid: (form.value.messaging_service_sid ?? '').trim() || null,
    }

    // Only send the token when one was typed, or a blank edit would be rejected
    // as a missing field instead of preserving the stored value.
    const token = (form.value.auth_token ?? '').trim()
    if (token !== '') payload.auth_token = token

    if (editingId.value === null) {
      await api.createTwilioConfig(payload)
      toast.add({ severity: 'success', summary: 'Added', detail: 'Twilio configuration saved.', life: 2500 })
    } else {
      await api.updateTwilioConfig(editingId.value, payload)
      toast.add({ severity: 'success', summary: 'Saved', detail: 'Twilio configuration updated.', life: 2500 })
    }
    showForm.value = false
    await reload()
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: extractError(e, 'Could not save the configuration.'),
      life: 7000,
    })
  } finally {
    saving.value = false
  }
}

// ── Toggle / delete ───────────────────────────────────────────────────────────
const actionLoading = ref(false)
const deleting = ref<TwilioConfig | null>(null)

async function toggle(row: TwilioConfig): Promise<void> {
  actionLoading.value = true
  try {
    await api.toggleTwilioConfig(row.id)
    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not change the status.', life: 4000 })
  } finally {
    actionLoading.value = false
  }
}

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  actionLoading.value = true
  try {
    await api.deleteTwilioConfig(deleting.value.id)
    deleting.value = null
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Configuration removed.', life: 2500 })
    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not delete the configuration.', life: 4000 })
  } finally {
    actionLoading.value = false
  }
}

// ── Test ──────────────────────────────────────────────────────────────────────
const showTest = ref(false)
const testing = ref(false)
const testTarget = ref<TwilioConfig | null>(null)
const testTo = ref('')
const testBody = ref('Test message from the admin panel.')

function openTest(row: TwilioConfig): void {
  testTarget.value = row
  testTo.value = ''
  testBody.value = 'Test message from the admin panel.'
  showTest.value = true
}

async function runTest(): Promise<void> {
  if (!testTarget.value || testTo.value.trim() === '' || testBody.value.trim() === '') return
  testing.value = true
  try {
    const res = await api.testTwilioConfig(testTarget.value.id, {
      to: testTo.value.trim(),
      body: testBody.value.trim(),
    })
    toast.add({ severity: 'success', summary: 'Sent', detail: res.message, life: 7000 })
    showTest.value = false
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Test failed',
      detail: extractError(e, 'The test message could not be sent.'),
      life: 9000,
    })
  } finally {
    testing.value = false
  }
}

onMounted(reload)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Twilio Configs</h2>
        <p class="text-sm text-gray-500">
          Credentials used to send bulk SMS. Test a configuration before trusting it with a run — a
          wrong token, an unowned sender or a blocked destination country all surface there.
        </p>
      </div>
      <Button label="Add configuration" icon="pi pi-plus" @click="openCreate" />
    </div>

    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable
        :value="items"
        :loading="loading"
        data-key="id"
        striped-rows
        :pt="{ root: { class: 'text-sm' } }"
      >
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">
            No Twilio configurations yet. Add one to enable bulk SMS.
          </div>
        </template>

        <Column field="name" header="Name">
          <template #body="{ data }: { data: TwilioConfig }">
            <span class="font-medium text-gray-900">{{ data.name }}</span>
          </template>
        </Column>

        <Column header="Account SID" :style="{ width: '190px' }">
          <template #body="{ data }: { data: TwilioConfig }">
            <span class="font-mono text-xs text-gray-600">{{ data.account_sid }}</span>
          </template>
        </Column>

        <Column header="Sender" :style="{ width: '220px' }">
          <template #body="{ data }: { data: TwilioConfig }">
            <span v-if="data.has_sender" class="font-mono text-xs text-gray-700">{{ data.sender }}</span>
            <Tag v-else severity="warn" value="No sender configured" />
          </template>
        </Column>

        <Column header="Status" :style="{ width: '120px' }">
          <template #body="{ data }: { data: TwilioConfig }">
            <Tag
              :severity="data.status === 'active' ? 'success' : 'secondary'"
              :value="data.status === 'active' ? 'Active' : 'Inactive'"
            />
          </template>
        </Column>

        <Column header="Added" :style="{ width: '170px' }">
          <template #body="{ data }: { data: TwilioConfig }">
            <span class="text-gray-600">{{ formatDate(data.created_at) }}</span>
          </template>
        </Column>

        <Column header="Actions" :style="{ width: '200px' }">
          <template #body="{ data }: { data: TwilioConfig }">
            <div class="flex items-center gap-1">
              <Button
                icon="pi pi-send"
                text
                size="small"
                severity="secondary"
                v-tooltip.top="'Send a test message'"
                @click="openTest(data)"
              />
              <Button
                :icon="data.status === 'active' ? 'pi pi-pause' : 'pi pi-play'"
                text
                size="small"
                severity="secondary"
                :loading="actionLoading"
                @click="toggle(data)"
              />
              <Button icon="pi pi-pencil" text size="small" severity="secondary" @click="openEdit(data)" />
              <Button icon="pi pi-trash" text size="small" severity="danger" @click="deleting = data" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Create / edit -->
    <Dialog
      v-model:visible="showForm"
      modal
      :header="editingId ? 'Edit Twilio configuration' : 'Add Twilio configuration'"
      :style="{ width: '560px' }"
    >
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Name</label>
          <InputText v-model="form.name" fluid placeholder="e.g. Main Twilio account" />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Account SID</label>
          <InputText v-model="form.account_sid" fluid placeholder="AC…" />
          <p class="mt-1 text-xs text-gray-500">
            From the Twilio Console dashboard. Starts with <code>AC</code> and is 34 characters —
            not an API Key SID.
          </p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Auth Token</label>
          <InputText
            v-model="form.auth_token"
            type="password"
            fluid
            :placeholder="editingId ? 'Leave blank to keep the stored token' : 'Auth Token'"
          />
          <p class="mt-1 text-xs text-gray-500">
            Stored encrypted and never shown again.
          </p>
        </div>

        <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p class="mb-2 text-xs font-medium text-gray-700">
            Sender — fill in one of the two
          </p>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Messaging Service SID</label>
              <InputText v-model="form.messaging_service_sid" fluid placeholder="MG…" />
              <p class="mt-1 text-xs text-gray-500">
                Preferred at volume: it pools numbers, keeps a consistent sender per recipient and
                handles opt-outs for you. Takes priority if both are set.
              </p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Or a phone number</label>
              <InputText v-model="form.from_number" fluid placeholder="+15551234567" />
              <p class="mt-1 text-xs text-gray-500">
                Must be a number your Twilio account owns.
              </p>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="showForm = false" />
        <Button label="Save" icon="pi pi-check" :loading="saving" :disabled="!canSave" @click="save" />
      </template>
    </Dialog>

    <!-- Delete -->
    <Dialog
      :visible="deleting !== null"
      modal
      header="Delete configuration"
      :style="{ width: '460px' }"
      @update:visible="deleting = null"
    >
      <p class="text-sm text-gray-700">
        Delete <strong>{{ deleting?.name }}</strong>? Past sends stay in the history, but any run
        still queued against it will stop.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" icon="pi pi-trash" severity="danger" :loading="actionLoading" @click="confirmDelete" />
      </template>
    </Dialog>

    <!-- Test -->
    <Dialog v-model:visible="showTest" modal header="Send a test message" :style="{ width: '520px' }">
      <div class="space-y-4">
        <p class="text-sm text-gray-600">
          Sends one real SMS through <strong>{{ testTarget?.name }}</strong> and reports exactly what
          Twilio said. It will be billed like any other message.
        </p>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">To</label>
          <InputText v-model="testTo" fluid placeholder="+15551234567" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Message</label>
          <Textarea v-model="testBody" rows="3" auto-resize fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="showTest = false" />
        <Button
          label="Send test"
          icon="pi pi-send"
          :loading="testing"
          :disabled="testTo.trim() === '' || testBody.trim() === ''"
          @click="runTest"
        />
      </template>
    </Dialog>
  </div>
</template>
