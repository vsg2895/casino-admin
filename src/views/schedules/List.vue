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
import type {
  EmailSchedule,
  ScheduleDateFilter,
  ScheduleFrequency,
  UpsertEmailSchedulePayload,
} from '@shared/types/emailSchedule'
import type { ErrorResponse } from '@shared/types/api'

const sitesStore = useSitesStore()
const toast = useToast()

const items = ref<EmailSchedule[]>([])
const loading = ref(false)

// ── Option lists / labels ─────────────────────────────────────────────────────
const dateFilterOptions: { label: string; value: ScheduleDateFilter }[] = [
  { label: 'Signed up today', value: 'today' },
  { label: 'Signed up yesterday', value: 'yesterday' },
  { label: 'Signed up last week', value: 'last_week' },
  { label: 'Signed up last month', value: 'last_month' },
  { label: 'Signed up last quarter', value: 'last_quarter' },
  { label: 'Signed up last year', value: 'last_year' },
  { label: 'Signed up on a specific date', value: 'specific' },
]
const frequencyOptions: { label: string; value: ScheduleFrequency }[] = [
  { label: 'Every day', value: 'daily' },
  { label: 'Every week', value: 'weekly' },
  { label: 'Every month', value: 'monthly' },
]
type AudienceMode = 'date' | 'count'
const audienceModeOptions: { label: string; value: AudienceMode }[] = [
  { label: 'By sign-up date', value: 'date' },
  { label: 'Most recent count', value: 'count' },
]
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const weekdayOptions = weekdays.map((label, value) => ({ label, value }))

const siteOptions = computed(() =>
  sitesStore.sites.map((s) => ({ label: `${s.name} (${s.domain})`, value: s.id })),
)

function audienceLabel(s: EmailSchedule): string {
  if (s.date_filter === null) return `Newest ${s.limit ?? 0} subscriber(s)`
  if (s.date_filter === 'specific') return `Signed up on ${s.specific_date ?? '—'}`
  return dateFilterOptions.find((o) => o.value === s.date_filter)?.label ?? s.date_filter
}

function cadenceLabel(s: EmailSchedule): string {
  if (s.frequency === 'weekly') return `Every ${weekdays[s.day_of_week ?? 0]} at ${s.time}`
  if (s.frequency === 'monthly') return `Monthly on day ${s.day_of_month ?? 1} at ${s.time}`
  return `Every day at ${s.time}`
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

// ── Data ──────────────────────────────────────────────────────────────────────
async function reload(): Promise<void> {
  loading.value = true
  try {
    items.value = (await api.listSchedules()).data
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
const audienceMode = ref<AudienceMode>('date')

function emptyForm(): UpsertEmailSchedulePayload {
  return {
    site_id: sitesStore.sites[0]?.id ?? 0,
    name: '',
    date_filter: 'today',
    specific_date: null,
    limit: 100,
    frequency: 'daily',
    time: '03:00',
    day_of_week: 1,
    day_of_month: 1,
    active: true,
  }
}
const form = reactive<UpsertEmailSchedulePayload>(emptyForm())

function openCreate(): void {
  Object.assign(form, emptyForm())
  audienceMode.value = 'date'
  editingId.value = null
  fieldErrors.value = {}
  showDialog.value = true
}

function openEdit(s: EmailSchedule): void {
  Object.assign(form, {
    site_id: s.site_id,
    name: s.name ?? '',
    date_filter: s.date_filter ?? 'today',
    specific_date: s.specific_date,
    limit: s.limit ?? 100,
    frequency: s.frequency,
    time: s.time,
    day_of_week: s.day_of_week ?? 1,
    day_of_month: s.day_of_month ?? 1,
    active: s.active,
  })
  audienceMode.value = s.date_filter === null ? 'count' : 'date'
  editingId.value = s.id
  fieldErrors.value = {}
  showDialog.value = true
}

// Build the payload for the chosen audience mode: date window OR newest-N.
function payload(): UpsertEmailSchedulePayload {
  const base = { ...form }
  return audienceMode.value === 'count'
    ? { ...base, date_filter: null, limit: form.limit }
    : { ...base, date_filter: form.date_filter, limit: null }
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
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to queue the campaign.', life: 4000 })
  } finally {
    runningId.value = null
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

onMounted(async () => {
  await sitesStore.fetchSites()
  await reload()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Schedule Setting</h2>
        <p class="text-sm text-gray-500">
          Automatically send a site's promotion email to subscribers by sign-up date, on a recurring schedule.
        </p>
      </div>
      <Button label="New schedule" icon="pi pi-plus" @click="openCreate" />
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable :value="items" :loading="loading" striped-rows data-key="id" :pt="{ root: { class: 'text-sm' } }">
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
        <Column header="Audience (by sign-up)">
          <template #body="{ data }: { data: EmailSchedule }">{{ audienceLabel(data) }}</template>
        </Column>
        <Column header="Runs">
          <template #body="{ data }: { data: EmailSchedule }">{{ cadenceLabel(data) }}</template>
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
        <Column header="Actions" :style="{ width: '150px' }">
          <template #body="{ data }: { data: EmailSchedule }">
            <Button icon="pi pi-play" text severity="success" size="small" v-tooltip.top="'Run now'" :loading="runningId === data.id" @click="runNow(data)" />
            <Button icon="pi pi-pencil" text severity="secondary" size="small" v-tooltip.top="'Edit'" @click="openEdit(data)" />
            <Button icon="pi pi-trash" text severity="danger" size="small" v-tooltip.top="'Delete'" @click="deleting = data" />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Create / edit dialog -->
    <Dialog v-model:visible="showDialog" modal :header="editingId ? 'Edit schedule' : 'New schedule'" :style="{ width: '520px' }">
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Site</label>
          <Select v-model="form.site_id" :options="siteOptions" option-label="label" option-value="value" fluid placeholder="Select a site" />
          <p class="mt-1 text-xs text-gray-400">This site's promotion email template will be sent.</p>
          <p v-if="err('site_id')" class="mt-1 text-xs text-red-600">{{ err('site_id') }}</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Name (optional)</label>
          <InputText v-model="form.name" fluid placeholder="e.g. Daily welcome-back offer" />
        </div>

        <!-- Audience -->
        <section class="rounded-lg border border-gray-200 p-3">
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Audience</h4>
          <SelectButton v-model="audienceMode" :options="audienceModeOptions" option-label="label" option-value="value" :allow-empty="false" class="mb-3" />

          <template v-if="audienceMode === 'date'">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div :class="form.date_filter === 'specific' ? '' : 'sm:col-span-2'">
                <label class="mb-1 block text-xs font-medium text-gray-600">Subscribers who signed up…</label>
                <Select v-model="form.date_filter" :options="dateFilterOptions" option-label="label" option-value="value" fluid />
                <p v-if="err('date_filter')" class="mt-1 text-xs text-red-600">{{ err('date_filter') }}</p>
              </div>
              <div v-if="form.date_filter === 'specific'">
                <label class="mb-1 block text-xs font-medium text-gray-600">Date</label>
                <input type="date" v-model="form.specific_date" class="h-10 w-full rounded-md border border-gray-300 px-3 text-sm" />
                <p v-if="err('specific_date')" class="mt-1 text-xs text-red-600">{{ err('specific_date') }}</p>
              </div>
            </div>
            <p class="mt-2 text-xs text-gray-400">The window covers the full day(s) — nobody is missed by time-of-day.</p>
          </template>

          <template v-else>
            <label class="mb-1 block text-xs font-medium text-gray-600">Number of most recent subscribers</label>
            <input type="number" v-model.number="form.limit" min="1" max="100000" class="h-10 w-full rounded-md border border-gray-300 px-3 text-sm sm:w-48" />
            <p class="mt-1 text-xs text-gray-400">Sends to the newest N subscribers (most recent sign-ups first), ignoring date.</p>
            <p v-if="err('limit')" class="mt-1 text-xs text-red-600">{{ err('limit') }}</p>
          </template>
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
