<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import { useSitesStore } from '@/stores/sitesStore'
import * as api from '@/api/emailSchedules'
import { pageWindow, pagerMeta } from '@/utils/pagination'
import * as sendgridApi from '@/api/sendgridKeys'
import * as mailgunApi from '@/api/mailgunKeys'
import Textarea from 'primevue/textarea'
import type {
  EmailSchedule,
  ScheduleAudience,
  ScheduleFrequency,
  ScheduleProvider,
  ScheduleRecipientPreview,
  ScheduleTemplate,
  UpsertEmailSchedulePayload,
} from '@shared/types/emailSchedule'
import { SUBSCRIBER_ONLY_TEMPLATES } from '@shared/types/emailSchedule'
import type { SendgridKey } from '@shared/types/sendgridKey'
import type { MailgunKey } from '@shared/types/mailgunKey'
import type { ErrorResponse } from '@shared/types/api'

const sitesStore = useSitesStore()
const toast = useToast()

const items = ref<EmailSchedule[]>([])
const loading = ref(false)

// ── Option lists / labels ─────────────────────────────────────────────────────
/*
 * WHICH LIST a schedule mails. Two levels in the form — Custom Receivers opens
 * a second choice between its two lists — but one value on the wire.
 */
type AudienceGroup = 'newsletters' | 'custom' | 'warmup'
const audienceGroupOptions: { label: string; value: AudienceGroup }[] = [
  { label: 'Newsletters', value: 'newsletters' },
  { label: 'Custom Receivers', value: 'custom' },
  { label: 'Warmup', value: 'warmup' },
]
const customListOptions: { label: string; value: ScheduleAudience }[] = [
  { label: 'Mailgun Receivers', value: 'mailgun_receivers' },
  { label: 'Sendgrid Receivers', value: 'sendgrid_receivers' },
]
const AUDIENCE_LABELS: Record<ScheduleAudience, string> = {
  newsletters: 'Newsletters',
  mailgun_receivers: 'Mailgun Receivers',
  sendgrid_receivers: 'Sendgrid Receivers',
  warmup: 'Warmup',
}
/*
 * WHICH EMAIL a schedule sends. The first three are the site's own stored
 * templates — edited on their own screens — and the fourth is typed here.
 *
 * `newslettersOnly` is the pair that can only go to the site's subscribers:
 * both are about a subscriber's own record, and the verify email's link is
 * resolved from their token, so there is nothing for a Custom Receivers or
 * warmup address to confirm. The API rejects the combination; this flag is
 * what stops an admin reaching it.
 */
const templateOptions: {
  label: string
  value: ScheduleTemplate
  hint: string
  newslettersOnly: boolean
}[] = [
  {
    label: 'Promotion email',
    value: 'promotion',
    hint: "The site's Promotion Email template — the marketing offer.",
    newslettersOnly: false,
  },
  {
    label: 'Subscription email',
    value: 'subscribe',
    hint: "The site's Email Template — the welcome sent once a subscription is confirmed.",
    newslettersOnly: true,
  },
  {
    label: 'Verify email',
    value: 'verify',
    hint: "The site's Verify Email — the double opt-in message carrying the confirmation link.",
    newslettersOnly: true,
  },
  {
    label: 'Custom HTML',
    value: 'custom',
    hint: 'Your own From, subject and HTML, typed below and sent as pasted.',
    newslettersOnly: false,
  },
]
const TEMPLATE_LABELS: Record<ScheduleTemplate, string> = {
  promotion: 'Promotion email',
  subscribe: 'Subscription email',
  verify: 'Verify email',
  custom: 'Custom HTML',
}

// Bounds shared with StoreEmailScheduleRequest.
const MAX_LIMIT = 100000
const MAX_COOLDOWN_DAYS = 365
const MAX_SUBJECT_LENGTH = 255
// config('promotions.custom.max_html_bytes'); counted in bytes, as the API does.
const MAX_HTML_BYTES = 500_000
const frequencyOptions: { label: string; value: ScheduleFrequency }[] = [
  { label: 'Every day', value: 'daily' },
  { label: 'Every week', value: 'weekly' },
  { label: 'Every month', value: 'monthly' },
]
const providerOptions: { label: string; value: ScheduleProvider }[] = [
  { label: 'SMTP (.env credentials)', value: 'smtp' },
  { label: 'SendGrid (stored key)', value: 'sendgrid' },
  { label: 'Mailgun (stored key)', value: 'mailgun' },
]

// Active SendGrid keys available to pick when provider = 'sendgrid'.
const sendgridKeys = ref<SendgridKey[]>([])
// Active Mailgun credentials available to pick when provider = 'mailgun'.
const mailgunKeys = ref<MailgunKey[]>([])
const mailgunKeyOptions = computed(() =>
  mailgunKeys.value.map((k) => ({ label: `${k.name} — ${k.domain}`, value: k.id })),
)
const sendgridKeyOptions = computed(() =>
  sendgridKeys.value.map((k) => ({ label: `${k.name} (${k.masked_key})`, value: k.id })),
)
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const weekdayOptions = weekdays.map((label, value) => ({ label, value }))

const siteOptions = computed(() =>
  sitesStore.sites.map((s) => ({ label: `${s.name} (${s.domain})`, value: s.id })),
)

function audienceLabel(s: EmailSchedule): string {
  return AUDIENCE_LABELS[s.audience] ?? s.audience
}

function templateLabel(s: EmailSchedule): string {
  return s.template_label || TEMPLATE_LABELS[s.template] || s.template
}

/** The chosen template's own explanation, shown under the picker. */
const templateHint = computed(
  () => templateOptions.find((o) => o.value === form.template)?.hint ?? '',
)

/**
 * Whether the chosen template can ONLY go to Newsletters — today just the
 * Verify email, which asks for confirmation of an address the recipient
 * submitted. Nobody on an operator-built list submitted one.
 *
 * "Subscription email" was in this set until 2026-12; every global list now
 * carries its own unsubscribe token, so a welcome message is valid on any
 * audience.
 */
const templateIsSubscriberOnly = computed(() => SUBSCRIBER_ONLY_TEMPLATES.includes(form.template))

/**
 * Said under the picker rather than left to a 422, so the reason is visible
 * while the choice is being made. The API refuses the same pair.
 */
const templateAudienceError = computed(() =>
  templateIsSubscriberOnly.value && form.audience !== 'newsletters'
    ? `The ${TEMPLATE_LABELS[form.template]} can only be sent to Newsletters — the addresses on a global list have nothing to confirm.`
    : '',
)

/** Size of the pasted HTML on the wire — the API's limit is in bytes too. */
const htmlBytes = computed(() => new TextEncoder().encode(form.custom_html ?? '').length)

function audienceDetail(s: EmailSchedule): string {
  const days = s.cooldown_days === 1 ? '1 day' : `${s.cooldown_days} days`
  return `${(s.limit ?? 0).toLocaleString()} per run · rest ${days}`
}

function cadenceLabel(s: EmailSchedule): string {
  if (s.frequency === 'weekly') return `Every ${weekdays[s.day_of_week ?? 0]} at ${s.time}`
  if (s.frequency === 'monthly') return `Monthly on day ${s.day_of_month ?? 1} at ${s.time}`
  return `Every day at ${s.time}`
}

function providerLabel(s: EmailSchedule): string {
  if (s.provider === 'sendgrid') return `SendGrid · ${s.sendgrid_key?.name ?? 'key removed'}`
  if (s.provider === 'mailgun') return `Mailgun · ${s.mailgun_key?.name ?? 'key removed'}`
  return 'SMTP'
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

// ── Data, server-side paginated ───────────────────────────────────────────────
//
// The API paginates schedules and this table offered no paginator, so it showed
// page one and nothing else — a 51st schedule would have existed, run on its
// cadence, and been invisible and un-editable in the admin.
const page = ref(1)
const perPage = ref(50)
const totalRecords = ref(0)
const first = computed(() => (page.value - 1) * perPage.value)

async function onPage(event: { page: number; rows: number }): Promise<void> {
  page.value = event.page + 1 // PrimeVue counts from 0, Laravel from 1
  perPage.value = event.rows
  await reload()
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    // The listing carries no total (simple-paginated); the dedicated COUNT,
    // requested beside it, sizes the paginator. Never fatal.
    const [response, count] = await Promise.all([
      api.listSchedules(page.value, perPage.value),
      api.countSchedules().catch(() => null),
    ])
    items.value = response.data
    totalRecords.value = pagerMeta(pageWindow(response), count).total
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load schedules.', life: 4000 })
  } finally {
    loading.value = false
  }
}

// ── Create / edit dialog ────────────────────────────────────────────────────────
const showDialog = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const fieldErrors = ref<Record<string, string>>({})
// The first level of the audience choice; `form.audience` holds the real value.
const audienceGroup = ref<AudienceGroup>('newsletters')

function groupOf(audience: ScheduleAudience): AudienceGroup {
  if (audience === 'mailgun_receivers' || audience === 'sendgrid_receivers') return 'custom'
  return audience
}

/** Switching the first level picks that group's list (Custom → Mailgun first). */
function onAudienceGroup(group: AudienceGroup): void {
  audienceGroup.value = group
  if (group === 'custom') {
    if (form.audience !== 'mailgun_receivers' && form.audience !== 'sendgrid_receivers') form.audience = 'mailgun_receivers'
  } else {
    form.audience = group
  }
}

function emptyForm(): UpsertEmailSchedulePayload {
  return {
    site_id: sitesStore.sites[0]?.id ?? 0,
    name: '',
    // What every schedule sent before the choice existed.
    template: 'promotion',
    custom_from_name: '',
    custom_from_address: '',
    custom_subject: '',
    custom_html: '',
    audience: 'newsletters',
    limit: 100,
    cooldown_days: 1,
    // Never on by default: an opt-out is the site's, and honouring it is the
    // only safe starting point.
    include_unsubscribed: false,
    frequency: 'daily',
    time: '03:00',
    day_of_week: 1,
    day_of_month: 1,
    provider: 'smtp',
    sendgrid_key_id: null,
    mailgun_key_id: null,
    active: true,
  }
}
const form = reactive<UpsertEmailSchedulePayload>(emptyForm())

function openCreate(): void {
  Object.assign(form, emptyForm())
  audienceGroup.value = 'newsletters'
  editingId.value = null
  fieldErrors.value = {}
  showDialog.value = true
}

function openEdit(s: EmailSchedule): void {
  Object.assign(form, {
    site_id: s.site_id,
    name: s.name ?? '',
    template: s.template,
    // Empty strings rather than null so the inputs are controlled either way;
    // payload() turns them back into null for a non-custom template.
    custom_from_name: s.custom_from_name ?? '',
    custom_from_address: s.custom_from_address ?? '',
    custom_subject: s.custom_subject ?? '',
    custom_html: s.custom_html ?? '',
    audience: s.audience,
    // A legacy schedule has no count; the form starts at 100, and saving is
    // what gives the schedule one.
    limit: s.limit ?? 100,
    cooldown_days: s.cooldown_days,
    include_unsubscribed: s.include_unsubscribed,
    frequency: s.frequency,
    time: s.time,
    day_of_week: s.day_of_week ?? 1,
    day_of_month: s.day_of_month ?? 1,
    provider: s.provider,
    sendgrid_key_id: s.sendgrid_key_id,
    mailgun_key_id: s.mailgun_key_id,
    active: s.active,
  })
  audienceGroup.value = groupOf(s.audience)
  editingId.value = s.id
  fieldErrors.value = {}
  showDialog.value = true
}

/*
 * Drops the other provider's key so no stale id lingers, and the custom
 * content unless the custom template is the one being saved — the API clears
 * it server-side too, so a stored-template schedule can never keep a body it
 * would then send.
 */
function payload(): UpsertEmailSchedulePayload {
  const custom = form.template === 'custom'

  return {
    ...form,
    custom_from_name: custom ? form.custom_from_name : null,
    custom_from_address: custom ? form.custom_from_address : null,
    custom_subject: custom ? form.custom_subject : null,
    custom_html: custom ? form.custom_html : null,
    sendgrid_key_id: form.provider === 'sendgrid' ? form.sendgrid_key_id : null,
    mailgun_key_id: form.provider === 'mailgun' ? form.mailgun_key_id : null,
  }
}

/**
 * Picking a subscriber-only template moves the audience back to Newsletters,
 * because the pair would be refused on save. Any other template leaves the
 * audience alone — overriding a choice the admin made deliberately.
 */
function onTemplate(template: ScheduleTemplate): void {
  form.template = template

  if (SUBSCRIBER_ONLY_TEMPLATES.includes(template)) {
    form.audience = 'newsletters'
    audienceGroup.value = 'newsletters'
  }
}

async function save(): Promise<void> {
  fieldErrors.value = {}
  saving.value = true
  try {
    if (editingId.value === null) {
      await api.createSchedule(payload())
      toast.add({ severity: 'success', summary: 'Created', detail: 'Schedule created.', life: 2500 })
    } else {
      await api.updateSchedule(editingId.value, payload())
      toast.add({ severity: 'success', summary: 'Saved', detail: 'Schedule updated.', life: 2500 })
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
      toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save schedule.', life: 4000 })
    }
  } finally {
    saving.value = false
  }
}

// ── Row actions ────────────────────────────────────────────────────────────────
const runningId = ref<number | null>(null)
async function runNow(s: EmailSchedule): Promise<void> {
  runningId.value = s.id
  try {
    const res = await api.runSchedule(s.id)
    toast.add({ severity: 'success', summary: 'Queued', detail: res.message, life: 4000 })
    await reload()
  } catch (e: unknown) {
    // The API refuses a run it knows would send nothing (paused schedule,
    // promotion email switched off) or that is already in flight — show its
    // reason rather than a generic failure.
    const refusal = axios.isAxiosError(e) ? (e.response?.data as { message?: string } | undefined)?.message : undefined
    const alreadyRunning = axios.isAxiosError(e) && e.response?.status === 409
    toast.add({
      severity: alreadyRunning ? 'warn' : 'error',
      summary: alreadyRunning ? 'Already running' : 'Not queued',
      detail: refusal ?? 'Failed to queue the campaign.',
      life: 6000,
    })
  } finally {
    runningId.value = null
  }
}

// ── Recipient preview ──────────────────────────────────────────────────────────
// Shows exactly who would be mailed if this schedule ran right now — the count
// comes from the same query the scheduled send uses.
const previewing = ref<EmailSchedule | null>(null)
const previewLoading = ref(false)
const previewData = ref<ScheduleRecipientPreview | null>(null)
const previewError = ref('')
const exportingId = ref<number | null>(null)

async function openPreview(s: EmailSchedule): Promise<void> {
  previewing.value = s
  previewData.value = null
  previewError.value = ''
  previewLoading.value = true
  try {
    previewData.value = (await api.previewScheduleRecipients(s.id)).data
  } catch {
    previewError.value = 'Could not load the recipient list.'
  } finally {
    previewLoading.value = false
  }
}

async function exportRecipients(s: EmailSchedule): Promise<void> {
  exportingId.value = s.id
  try {
    await api.exportScheduleRecipients(s.id)
    toast.add({ severity: 'success', summary: 'Exported', detail: 'Recipient list downloaded.', life: 3000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to export recipients.', life: 4000 })
  } finally {
    exportingId.value = null
  }
}

const deleting = ref<EmailSchedule | null>(null)
const deletingLoading = ref(false)
async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  deletingLoading.value = true
  try {
    await api.deleteSchedule(deleting.value.id)
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Schedule removed.', life: 2500 })
    deleting.value = null
    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete schedule.', life: 4000 })
  } finally {
    deletingLoading.value = false
  }
}

function err(field: string): string | undefined {
  return fieldErrors.value[field]
}

async function loadMailgunKeys(): Promise<void> {
  try {
    mailgunKeys.value = (await mailgunApi.listMailgunKeys('active')).data
  } catch {
    // Non-fatal, and isolated from the SendGrid load: one provider's API
    // failing must never blank the other's dropdown.
    mailgunKeys.value = []
  }
}

async function loadSendgridKeys(): Promise<void> {
  try {
    sendgridKeys.value = (await sendgridApi.listSendgridKeys('active')).data
  } catch {
    // Non-fatal: the SendGrid option just shows no keys to pick.
    sendgridKeys.value = []
  }
}

onMounted(async () => {
  // The listing needs none of the others, so it loads beside them, not after.
  await Promise.all([sitesStore.fetchSites(), loadSendgridKeys(), loadMailgunKeys(), reload()])
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Schedule Setting</h2>
        <p class="text-sm text-gray-500">
          Automatically send a site's promotion email to a list — newsletters, Custom Receivers or
          warmup — on a recurring schedule, skipping anyone who received it recently.
        </p>
      </div>
      <Button label="New schedule" icon="pi pi-plus" @click="openCreate" />
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable
        :value="items"
        :loading="loading"
        striped-rows
        data-key="id"
        lazy
        paginator
        :rows="perPage"
        :first="first"
        :total-records="totalRecords"
        :rows-per-page-options="[50, 100]"
        current-page-report-template="{first}–{last} of {totalRecords}"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport"
        :pt="{ root: { class: 'text-sm' } }"
        @page="onPage"
      >
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No schedules yet. Create one to start sending.</div>
        </template>

        <Column header="Site" class="font-medium">
          <template #body="{ data }: { data: EmailSchedule }">{{ data.site?.name ?? '—' }}</template>
        </Column>
        <Column header="Name">
          <template #body="{ data }: { data: EmailSchedule }">
            <span class="text-gray-700">{{ data.name || '—' }}</span>
          </template>
        </Column>
        <Column header="Sends">
          <template #body="{ data }: { data: EmailSchedule }">
            <span class="text-gray-800">{{ templateLabel(data) }}</span>
            <span v-if="data.template === 'custom'" class="block truncate text-xs text-gray-400" :title="data.custom_subject ?? ''">
              {{ data.custom_subject || 'No subject saved' }}
            </span>
          </template>
        </Column>
        <Column header="Audience">
          <template #body="{ data }: { data: EmailSchedule }">
            <span class="text-gray-800">{{ audienceLabel(data) }}</span>
            <span class="block text-xs text-gray-400">{{ audienceDetail(data) }}</span>
            <!-- A schedule saved before counts existed sends nobody until edited. -->
            <Tag v-if="data.blocked_reason" value="Needs a count" severity="warn" class="mt-1" v-tooltip.top="data.blocked_reason" />
            <!-- Visible on the row, not only inside the dialog: mailing people
                 who opted out is the kind of setting nobody should discover by
                 opening a form. -->
            <Tag
              v-if="data.include_unsubscribed"
              value="Includes unsubscribed"
              severity="danger"
              class="mt-1"
              v-tooltip.top="'This schedule mails addresses that unsubscribed from this site.'"
            />
          </template>
        </Column>
        <Column header="Runs">
          <template #body="{ data }: { data: EmailSchedule }">{{ cadenceLabel(data) }}</template>
        </Column>
        <Column header="Via" :style="{ width: '150px' }">
          <template #body="{ data }: { data: EmailSchedule }">
            <span class="text-gray-600">{{ providerLabel(data) }}</span>
          </template>
        </Column>
        <Column header="Status" :style="{ width: '110px' }">
          <template #body="{ data }: { data: EmailSchedule }">
            <Tag :severity="data.active ? 'success' : 'secondary'" :value="data.active ? 'Active' : 'Paused'" />
          </template>
        </Column>
        <Column header="Last run" :style="{ width: '160px' }">
          <template #body="{ data }: { data: EmailSchedule }">
            <span class="text-gray-500">{{ formatDate(data.last_run_at) }}</span>
          </template>
        </Column>
        <Column header="Actions" :style="{ width: '210px' }">
          <template #body="{ data }: { data: EmailSchedule }">
            <Button icon="pi pi-users" text severity="info" size="small" v-tooltip.top="'Preview recipients'" @click="openPreview(data)" />
            <Button icon="pi pi-download" text severity="secondary" size="small" v-tooltip.top="'Export recipients (CSV)'" :loading="exportingId === data.id" @click="exportRecipients(data)" />
            <Button icon="pi pi-play" text severity="success" size="small" v-tooltip.top="'Run now'" :loading="runningId === data.id" @click="runNow(data)" />
            <Button icon="pi pi-pencil" text severity="secondary" size="small" v-tooltip.top="'Edit'" @click="openEdit(data)" />
            <Button icon="pi pi-trash" text severity="danger" size="small" v-tooltip.top="'Delete'" @click="deleting = data" />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Recipient preview -->
    <Dialog
      :visible="previewing !== null"
      modal
      header="Recipients"
      :style="{ width: '640px' }"
      @update:visible="previewing = null"
    >
      <div class="space-y-4">
        <p class="text-sm text-gray-600">
          Who would receive <strong>{{ previewing?.name || previewing?.site?.name }}</strong> if it ran now.
          Uses the same recipient query as the scheduled send.
        </p>

        <div v-if="previewLoading" class="py-8 text-center text-sm text-gray-400">
          <i class="pi pi-spin pi-spinner mr-2" />Loading recipients…
        </div>

        <p v-else-if="previewError" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {{ previewError }}
        </p>

        <template v-else-if="previewData">
          <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div>
              <p class="text-2xl font-semibold text-gray-900">{{ previewData.count.toLocaleString() }}</p>
              <p class="text-xs text-gray-500">recipients right now · as of {{ previewData.generated_at }}</p>
            </div>
            <Button
              label="Export CSV"
              icon="pi pi-download"
              outlined
              size="small"
              :loading="exportingId === previewing?.id"
              :disabled="previewData.count === 0"
              @click="previewing && exportRecipients(previewing)"
            />
          </div>

          <div v-if="previewData.count === 0" class="py-6 text-center text-sm text-gray-400">
            Nobody on this list can be mailed right now — everyone is resting, opted out or already
            mailed today.
          </div>

          <template v-else>
            <DataTable :value="previewData.sample" data-key="email" :pt="{ root: { class: 'text-sm' } }">
              <Column field="email" header="Email address" />
              <Column field="created_at" header="Added to the list" :style="{ width: '190px' }" />
            </DataTable>
            <p v-if="previewData.count > previewData.sample.length" class="text-xs text-gray-400">
              Showing the first {{ previewData.sample.length }} of
              {{ previewData.count.toLocaleString() }} — export the CSV for the full list.
            </p>
          </template>
        </template>
      </div>

      <template #footer>
        <Button label="Close" text @click="previewing = null" />
      </template>
    </Dialog>

    <!-- Create / edit dialog -->
    <Dialog v-model:visible="showDialog" modal :header="editingId ? 'Edit schedule' : 'New schedule'" :style="{ width: '520px' }">
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Site</label>
          <Select v-model="form.site_id" :options="siteOptions" option-label="label" option-value="value" fluid placeholder="Select a site" />
          <p class="mt-1 text-xs text-gray-400">Whose template, subscribers and unsubscribe links this schedule uses.</p>
          <p v-if="err('site_id')" class="mt-1 text-xs text-red-600">{{ err('site_id') }}</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Name (optional)</label>
          <InputText v-model="form.name" fluid placeholder="e.g. Daily welcome-back offer" />
        </div>

        <!-- WHICH email goes out: a stored template of the site, or your own HTML. -->
        <section class="rounded-lg border border-gray-200 p-3">
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Email to send</h4>
          <Select
            :model-value="form.template"
            :options="templateOptions"
            option-label="label"
            option-value="value"
            fluid
            @update:model-value="onTemplate"
          />
          <p class="mt-1 text-xs text-gray-400">{{ templateHint }}</p>
          <p v-if="err('template')" class="mt-1 text-xs text-red-600">{{ err('template') }}</p>
          <p v-if="templateAudienceError" class="mt-2 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
            {{ templateAudienceError }}
          </p>

          <!-- Custom HTML: the four things a stored template would have supplied. -->
          <div v-if="form.template === 'custom'" class="mt-3 space-y-3 border-t border-gray-100 pt-3">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs font-medium text-gray-600">From name</label>
                <InputText v-model="form.custom_from_name" fluid maxlength="120" placeholder="e.g. Casino Weekly" />
                <p v-if="err('custom_from_name')" class="mt-1 text-xs text-red-600">{{ err('custom_from_name') }}</p>
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-gray-600">From address</label>
                <InputText v-model="form.custom_from_address" fluid type="email" placeholder="offers@yourdomain.com" />
                <p v-if="err('custom_from_address')" class="mt-1 text-xs text-red-600">{{ err('custom_from_address') }}</p>
              </div>
            </div>

            <!--
              The one setting on this screen that can break delivery silently.
              A From domain the sending account is not authorised for fails
              SPF/DKIM alignment, and the message is filtered rather than
              bounced — it sends, reports no error, and never arrives. Nothing
              server-side can check it, so it is said here.
            -->
            <p class="rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
              Use a domain this provider is authorised to send for. A From address outside it fails SPF/DKIM
              and the mail is filtered silently — it will look sent and never arrive.
            </p>

            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Subject</label>
              <InputText v-model="form.custom_subject" fluid :maxlength="MAX_SUBJECT_LENGTH" placeholder="What lands in the inbox" />
              <p v-if="err('custom_subject')" class="mt-1 text-xs text-red-600">{{ err('custom_subject') }}</p>
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">HTML</label>
              <Textarea v-model="form.custom_html" rows="10" fluid class="font-mono text-xs" placeholder="<html>…</html>" />
              <p class="mt-1 flex justify-between text-xs" :class="htmlBytes > MAX_HTML_BYTES ? 'text-red-600' : 'text-gray-400'">
                <span>Sent exactly as pasted. A plain-text part and an unsubscribe link are added.</span>
                <span>{{ (htmlBytes / 1000).toFixed(1) }} / {{ MAX_HTML_BYTES / 1000 }} KB</span>
              </p>
              <p v-if="err('custom_html')" class="mt-1 text-xs text-red-600">{{ err('custom_html') }}</p>
            </div>
          </div>
        </section>

        <!-- Audience: which list, how many per run, and how long an address rests. -->
        <section class="rounded-lg border border-gray-200 p-3">
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Audience</h4>
          <SelectButton
            :model-value="audienceGroup"
            :options="audienceGroupOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            class="mb-3"
            @update:model-value="onAudienceGroup"
          />

          <!-- Custom Receivers opens its own choice: which of the two lists. -->
          <div v-if="audienceGroup === 'custom'" class="mb-3 rounded-md bg-gray-50 p-2">
            <label class="mb-1 block text-xs font-medium text-gray-600">Custom Receivers list</label>
            <SelectButton
              v-model="form.audience"
              :options="customListOptions"
              option-label="label"
              option-value="value"
              :allow-empty="false"
            />
          </div>
          <p v-if="err('audience')" class="mb-2 text-xs text-red-600">{{ err('audience') }}</p>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Emails per run</label>
              <input
                v-model.number="form.limit"
                type="number"
                min="1"
                :max="MAX_LIMIT"
                class="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
              />
              <p class="mt-1 text-xs text-gray-400">The newest addresses on the list that may be mailed now.</p>
              <p v-if="err('limit')" class="mt-1 text-xs text-red-600">{{ err('limit') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Skip addresses contacted in the last</label>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="form.cooldown_days"
                  type="number"
                  min="1"
                  :max="MAX_COOLDOWN_DAYS"
                  class="h-10 w-24 rounded-md border border-gray-300 px-3 text-sm"
                />
                <span class="text-sm text-gray-600">day(s)</span>
              </div>
              <p class="mt-1 text-xs text-gray-400">
                An address that received this site's {{ TEMPLATE_LABELS[form.template].toLowerCase() }}
                inside this window is skipped, so each run moves further down the list.
              </p>
              <p v-if="err('cooldown_days')" class="mt-1 text-xs text-red-600">{{ err('cooldown_days') }}</p>
            </div>
          </div>
          <p v-if="form.audience === 'warmup'" class="mt-2 text-xs text-amber-600">
            Warmup addresses are your seed mailboxes. A send here moves their warmup
            "Last sent", so a warmup run will not contact them again inside its own cooldown.
          </p>

          <!--
            Unsubscribed addresses.

            Off by default and deliberately hard to turn on: an opt-out is global
            per site — any unsubscribe, through any template, stops all mail from
            that site to that address, whichever list it also sits on.
          -->
          <div class="mt-3 border-t border-gray-100 pt-3">
            <label class="flex items-start gap-3">
              <ToggleSwitch v-model="form.include_unsubscribed" class="mt-0.5 shrink-0" />
              <span class="min-w-0">
                <span class="block text-xs font-medium text-gray-600">Include unsubscribed addresses</span>
                <span class="mt-0.5 block text-xs text-gray-400">
                  Off: anyone who unsubscribed from this site — through any of its emails, on any
                  list — is skipped.
                </span>
              </span>
            </label>
            <p v-if="form.include_unsubscribed" class="mt-2 rounded-md bg-red-50 px-2.5 py-2 text-xs text-red-700">
              This schedule will mail people who asked this site to stop. That is what spam
              complaints and provider blocks are made of, and in most of the world it is unlawful.
              Turn it on only for a list you can prove consent for.
            </p>
          </div>
        </section>

        <!-- Cadence -->
        <section class="rounded-lg border border-gray-200 p-3">
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">When to send</h4>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Frequency</label>
              <Select v-model="form.frequency" :options="frequencyOptions" option-label="label" option-value="value" fluid />
              <p v-if="err('frequency')" class="mt-1 text-xs text-red-600">{{ err('frequency') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Time</label>
              <input type="time" v-model="form.time" class="h-10 w-full rounded-md border border-gray-300 px-3 text-sm" />
              <p v-if="err('time')" class="mt-1 text-xs text-red-600">{{ err('time') }}</p>
            </div>
            <div v-if="form.frequency === 'weekly'">
              <label class="mb-1 block text-xs font-medium text-gray-600">Day of week</label>
              <Select v-model="form.day_of_week" :options="weekdayOptions" option-label="label" option-value="value" fluid />
              <p v-if="err('day_of_week')" class="mt-1 text-xs text-red-600">{{ err('day_of_week') }}</p>
            </div>
            <div v-if="form.frequency === 'monthly'">
              <label class="mb-1 block text-xs font-medium text-gray-600">Day of month (1–31)</label>
              <input type="number" v-model.number="form.day_of_month" min="1" max="31" class="h-10 w-full rounded-md border border-gray-300 px-3 text-sm" />
              <p class="mt-1 text-xs text-gray-400">Day 29–31 falls back to the last day in shorter months.</p>
              <p v-if="err('day_of_month')" class="mt-1 text-xs text-red-600">{{ err('day_of_month') }}</p>
            </div>
          </div>
        </section>

        <!-- Delivery / email provider -->
        <section class="rounded-lg border border-gray-200 p-3">
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Email provider</h4>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div :class="form.provider === 'smtp' ? 'sm:col-span-2' : ''">
              <label class="mb-1 block text-xs font-medium text-gray-600">Send via</label>
              <Select v-model="form.provider" :options="providerOptions" option-label="label" option-value="value" fluid />
              <p v-if="err('provider')" class="mt-1 text-xs text-red-600">{{ err('provider') }}</p>
            </div>
            <div v-if="form.provider === 'sendgrid'">
              <label class="mb-1 block text-xs font-medium text-gray-600">SendGrid key</label>
              <Select
                v-model="form.sendgrid_key_id"
                :options="sendgridKeyOptions"
                option-label="label"
                option-value="value"
                fluid
                placeholder="Select an active key"
              />
              <p v-if="err('sendgrid_key_id')" class="mt-1 text-xs text-red-600">{{ err('sendgrid_key_id') }}</p>
            </div>
            <div v-if="form.provider === 'mailgun'">
              <label class="mb-1 block text-xs font-medium text-gray-600">Mailgun key</label>
              <Select
                v-model="form.mailgun_key_id"
                :options="mailgunKeyOptions"
                option-label="label"
                option-value="value"
                fluid
                placeholder="Select an active key"
              />
              <p v-if="err('mailgun_key_id')" class="mt-1 text-xs text-red-600">{{ err('mailgun_key_id') }}</p>
            </div>
          </div>
          <p v-if="form.provider === 'sendgrid' && sendgridKeyOptions.length === 0" class="mt-2 text-xs text-amber-600">
            No active SendGrid keys. Add one under “SendGrid Keys” first.
          </p>
          <p v-else-if="form.provider === 'mailgun' && mailgunKeyOptions.length === 0" class="mt-2 text-xs text-amber-600">
            No active Mailgun keys. Add one under “Mailgun Keys” first.
          </p>
          <p v-else class="mt-2 text-xs text-gray-400">
            SMTP uses the server's .env mail credentials. SendGrid and Mailgun each send through their selected stored key.
          </p>
        </section>

        <section class="flex items-center justify-between rounded-lg border border-gray-200 p-3">
          <div>
            <p class="text-sm font-medium text-gray-800">Active</p>
            <p class="text-xs text-gray-500">When paused, the schedule never runs.</p>
          </div>
          <ToggleSwitch v-model="form.active" />
        </section>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="showDialog = false" />
        <Button :label="editingId ? 'Save changes' : 'Create schedule'" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <!-- Delete confirm -->
    <Dialog :visible="deleting !== null" modal header="Delete schedule" :style="{ width: '420px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">
        Delete this schedule for <strong>{{ deleting?.site?.name }}</strong>? This stops future sends. It cannot be undone.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" severity="danger" :loading="deletingLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
