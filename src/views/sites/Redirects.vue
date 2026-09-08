<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import * as redirectsApi from '@/api/redirects'
import * as sitesApi from '@/api/sites'
import type { Redirect, UpsertRedirectPayload } from '@shared/types/redirect'
import type { Site } from '@shared/types/site'
import type { ErrorResponse } from '@shared/types/api'

/**
 * URL redirects for one site.
 *
 * This is what makes changing a slug survivable — without it an old URL simply
 * 404s and whatever ranked there is lost.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()

const siteId = Number(route.params.id)
const site = ref<Site | null>(null)
const items = ref<Redirect[]>([])
const loading = ref(false)

const STATUS_CODES = [
  { label: '301 — permanent', value: 301 },
  { label: '302 — temporary', value: 302 },
]

async function reload(): Promise<void> {
  loading.value = true
  try {
    items.value = await redirectsApi.listRedirects(siteId)
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load redirects.', life: 4000 })
  } finally {
    loading.value = false
  }
}

const showDialog = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)
const fieldErrors = ref<Record<string, string>>({})
const form = ref<UpsertRedirectPayload>({
  source_path: '',
  destination_path: '',
  status_code: 301,
  active: true,
})

function openCreate(): void {
  editingId.value = null
  form.value = { source_path: '', destination_path: '', status_code: 301, active: true }
  formError.value = null
  fieldErrors.value = {}
  showDialog.value = true
}

function openEdit(r: Redirect): void {
  editingId.value = r.id
  form.value = {
    source_path: r.source_path,
    destination_path: r.destination_path,
    status_code: r.status_code,
    active: r.active,
  }
  formError.value = null
  fieldErrors.value = {}
  showDialog.value = true
}

async function save(): Promise<void> {
  saving.value = true
  formError.value = null
  fieldErrors.value = {}
  try {
    if (editingId.value === null) {
      await redirectsApi.createRedirect(siteId, form.value)
    } else {
      await redirectsApi.updateRedirect(siteId, editingId.value, form.value)
    }
    showDialog.value = false
    await reload()
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Redirect saved.', life: 2500 })
  } catch (e: unknown) {
    const data = axios.isAxiosError(e) ? (e.response?.data as ErrorResponse | undefined) : undefined
    // The API refuses a rule that would complete a loop and says which one.
    formError.value = data?.message ?? 'Could not save the redirect.'
    if (data?.errors) {
      fieldErrors.value = Object.fromEntries(
        Object.entries(data.errors).map(([k, v]) => [k, v[0] ?? '']),
      )
    }
  } finally {
    saving.value = false
  }
}

const deleting = ref<Redirect | null>(null)

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  try {
    await redirectsApi.deleteRedirect(siteId, deleting.value.id)
    deleting.value = null
    await reload()
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Redirect removed.', life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not delete.', life: 4000 })
  }
}

onMounted(async () => {
  await Promise.all([
    reload(),
    sitesApi.getSite(siteId).then((r) => (site.value = r.data)).catch(() => (site.value = null)),
  ])
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <Button label="Back to sites" icon="pi pi-arrow-left" text severity="secondary" @click="router.push({ name: 'sites' })" />
      <h2 class="text-lg font-semibold text-gray-900">
        Redirects<span v-if="site" class="text-gray-400"> — {{ site.name }}</span>
      </h2>
      <Button label="New redirect" icon="pi pi-plus" @click="openCreate" />
    </div>

    <div class="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
      Paths are matched without case or a trailing slash, so <code>/Old-Page/</code> and
      <code>/old-page</code> are the same rule. Changes take up to a minute to reach the site —
      the redirect list is cached at the edge rather than fetched on every request.
    </div>

    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable :value="items" :loading="loading" striped-rows data-key="id" :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">
            No redirects. Add one before changing a slug, not after.
          </div>
        </template>

        <Column header="From">
          <template #body="{ data }">
            <span class="font-mono text-gray-800">{{ data.source_path }}</span>
          </template>
        </Column>

        <Column header="To">
          <template #body="{ data }">
            <span class="font-mono text-gray-600">{{ data.destination_path }}</span>
          </template>
        </Column>

        <Column header="Type" :style="{ width: '110px' }">
          <template #body="{ data }">
            <Tag :value="String(data.status_code)" :severity="data.status_code === 301 ? 'info' : 'secondary'" />
          </template>
        </Column>

        <Column header="Hits" :style="{ width: '90px' }">
          <template #body="{ data }">
            <span class="tabular-nums text-gray-500">{{ data.hits }}</span>
          </template>
        </Column>

        <Column header="Status" :style="{ width: '100px' }">
          <template #body="{ data }">
            <Tag :value="data.active ? 'Active' : 'Off'" :severity="data.active ? 'success' : 'secondary'" />
          </template>
        </Column>

        <Column header="Actions" :style="{ width: '110px' }">
          <template #body="{ data }">
            <Button icon="pi pi-pencil" text severity="secondary" size="small" @click="openEdit(data)" />
            <Button icon="pi pi-trash" text severity="danger" size="small" @click="deleting = data" />
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog v-model:visible="showDialog" modal :header="editingId ? 'Edit redirect' : 'New redirect'" :style="{ width: '520px' }">
      <div class="space-y-3">
        <div v-if="formError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ formError }}</div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">From (old path)</label>
          <InputText v-model="form.source_path" fluid placeholder="/old-casino-page" />
          <p v-if="fieldErrors['source_path']" class="mt-1 text-xs text-red-600">{{ fieldErrors['source_path'] }}</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">To (new path or full URL)</label>
          <InputText v-model="form.destination_path" fluid placeholder="/casinos/new-slug" />
          <p v-if="fieldErrors['destination_path']" class="mt-1 text-xs text-red-600">{{ fieldErrors['destination_path'] }}</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Type</label>
          <Select v-model="form.status_code" :options="STATUS_CODES" option-label="label" option-value="value" fluid />
          <p class="mt-1 text-xs text-amber-700">
            301 is cached hard by browsers — anyone who follows it keeps following it even after you
            delete the rule. Use 302 unless the move is genuinely permanent.
          </p>
        </div>

        <div class="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <label class="text-sm text-gray-700">Active</label>
          <ToggleSwitch v-model="form.active" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="showDialog = false" />
        <Button :label="editingId ? 'Save' : 'Add redirect'" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <Dialog :visible="deleting !== null" modal header="Remove redirect" :style="{ width: '420px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">
        Remove <strong class="font-mono">{{ deleting?.source_path }}</strong>? That path will start
        returning 404 again.
      </p>
      <p v-if="(deleting?.hits ?? 0) > 0" class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        This rule has been used <strong>{{ deleting?.hits }}</strong> time(s) — traffic is still
        arriving on the old URL.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Remove" severity="danger" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
