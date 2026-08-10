<script setup lang="ts">
/**
 * SMS Templates — reusable message texts for bulk phone sends.
 *
 * Editing a template here changes what the NEXT send starts from. It never
 * touches a run already queued or already sent: the body travels with the job and
 * is recorded per recipient, so history stays a truthful record of what went out.
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
import * as api from '@/api/smsTemplates'
import { segmentCount, segmentSummary } from '@/utils/smsSegments'
import type { SmsTemplate, SmsTemplatePayload } from '@shared/types/smsTemplate'
import type { ErrorResponse } from '@shared/types/api'

const toast = useToast()

const items = ref<SmsTemplate[]>([])
const loading = ref(false)

async function reload(): Promise<void> {
  loading.value = true
  try {
    const { data } = await api.listSmsTemplates()
    items.value = data
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load SMS templates.', life: 4000 })
  } finally {
    loading.value = false
  }
}

function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

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
const form = ref<SmsTemplatePayload>({ name: '', body: '' })

// Live cost feedback while typing, from the same rule the send dialog uses.
const summary = computed(() => segmentSummary(form.value.body))
const segments = computed(() => segmentCount(form.value.body))

function openCreate(): void {
  editingId.value = null
  form.value = { name: '', body: '' }
  showForm.value = true
}

function openEdit(row: SmsTemplate): void {
  editingId.value = row.id
  form.value = { name: row.name, body: row.body }
  showForm.value = true
}

const canSave = computed(
  () => form.value.name.trim() !== '' && form.value.body.trim() !== '',
)

async function save(): Promise<void> {
  if (!canSave.value) return
  saving.value = true
  try {
    const payload: SmsTemplatePayload = {
      name: form.value.name.trim(),
      body: form.value.body.trim(),
    }
    if (editingId.value === null) {
      await api.createSmsTemplate(payload)
      toast.add({ severity: 'success', summary: 'Added', detail: 'Template saved.', life: 2500 })
    } else {
      await api.updateSmsTemplate(editingId.value, payload)
      toast.add({
        severity: 'success',
        summary: 'Saved',
        detail: 'Template updated — the next send will start from the new text.',
        life: 4000,
      })
    }
    showForm.value = false
    await reload()
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: 'Error', detail: extractError(e, 'Could not save the template.'), life: 7000 })
  } finally {
    saving.value = false
  }
}

// ── Toggle / delete ───────────────────────────────────────────────────────────
const actionLoading = ref(false)
const deleting = ref<SmsTemplate | null>(null)

async function toggle(row: SmsTemplate): Promise<void> {
  actionLoading.value = true
  try {
    await api.toggleSmsTemplate(row.id)
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
    await api.deleteSmsTemplate(deleting.value.id)
    deleting.value = null
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Template removed.', life: 2500 })
    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not delete the template.', life: 4000 })
  } finally {
    actionLoading.value = false
  }
}

onMounted(reload)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">SMS Templates</h2>
        <p class="text-sm text-gray-500">
          Reusable message texts for bulk sends. Edit one here and the next send starts from the new
          wording — runs already queued keep the text they were sent with.
        </p>
      </div>
      <Button label="Add template" icon="pi pi-plus" @click="openCreate" />
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
            No templates yet. Add one so you do not have to retype the message on every send.
          </div>
        </template>

        <Column field="name" header="Name" :style="{ width: '200px' }">
          <template #body="{ data }: { data: SmsTemplate }">
            <span class="font-medium text-gray-900">{{ data.name }}</span>
          </template>
        </Column>

        <Column header="Message">
          <template #body="{ data }: { data: SmsTemplate }">
            <span class="text-gray-600">{{ data.preview }}</span>
          </template>
        </Column>

        <Column header="Cost" :style="{ width: '190px' }">
          <template #body="{ data }: { data: SmsTemplate }">
            <span class="text-gray-600 tabular-nums">{{ data.length }} chars</span>
            <span class="mx-1 text-gray-300">·</span>
            <span :class="data.segments > 1 ? 'font-medium text-amber-700' : 'text-gray-600'">
              {{ data.segments }} seg
            </span>
            <Tag v-if="data.uses_unicode" severity="warn" value="Unicode" class="ml-2" />
          </template>
        </Column>

        <Column header="Status" :style="{ width: '110px' }">
          <template #body="{ data }: { data: SmsTemplate }">
            <Tag
              :severity="data.status === 'active' ? 'success' : 'secondary'"
              :value="data.status === 'active' ? 'Active' : 'Inactive'"
            />
          </template>
        </Column>

        <Column header="Updated" :style="{ width: '160px' }">
          <template #body="{ data }: { data: SmsTemplate }">
            <span class="text-gray-600">{{ formatDate(data.updated_at) }}</span>
          </template>
        </Column>

        <Column header="Actions" :style="{ width: '150px' }">
          <template #body="{ data }: { data: SmsTemplate }">
            <div class="flex items-center gap-1">
              <Button
                :icon="data.status === 'active' ? 'pi pi-pause' : 'pi pi-play'"
                text
                size="small"
                severity="secondary"
                :loading="actionLoading"
                v-tooltip.top="data.status === 'active' ? 'Hide from the send dialog' : 'Make available again'"
                @click="toggle(data)"
              />
              <Button icon="pi pi-pencil" text size="small" severity="secondary" v-tooltip.top="'Edit'" @click="openEdit(data)" />
              <Button icon="pi pi-trash" text size="small" severity="danger" v-tooltip.top="'Delete'" @click="deleting = data" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Create / edit -->
    <Dialog
      v-model:visible="showForm"
      modal
      :header="editingId ? 'Edit template' : 'Add template'"
      :style="{ width: '600px' }"
    >
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Name</label>
          <InputText v-model="form.name" fluid placeholder="e.g. Weekend bonus" />
          <p class="mt-1 text-xs text-gray-500">Only shown in the admin — never sent.</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Message</label>
          <Textarea v-model="form.body" rows="6" auto-resize fluid placeholder="Write the message…" />
          <p class="mt-1 text-xs" :class="segments > 1 ? 'text-amber-700' : 'text-gray-500'">
            {{ summary }}
          </p>
        </div>

        <div
          v-if="editingId !== null"
          class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600"
        >
          Saving changes what the <strong>next</strong> send starts from. Messages already sent, and
          any run currently queued, keep the text they went out with.
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
      header="Delete template"
      :style="{ width: '460px' }"
      @update:visible="deleting = null"
    >
      <p class="text-sm text-gray-700">
        Delete <strong>{{ deleting?.name }}</strong>? Messages already sent with it are unaffected.
      </p>
      <p class="mt-2 text-sm text-gray-500">
        To keep it but hide it from the send dialog, deactivate it instead.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" icon="pi pi-trash" severity="danger" :loading="actionLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
