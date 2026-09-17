<script setup lang="ts">
/**
 * UniOne — API keys, plus the Domains and Suppressions helper tabs.
 *
 * Mirrors the SendGrid Keys screen's shape (DataTable + create/edit Dialog +
 * per-row actions) as new, independent code. The SendGrid section is untouched.
 *
 * The key is WRITE-ONLY from here: the list shows the last four characters, the
 * edit form opens with an empty key field, and leaving it empty keeps the stored
 * value. There is no Reveal, because there is no endpoint that could serve one.
 */
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/unione'
import type { UniOneApiKey, UniOneDomain, UniOneKeyType, UniOneRegion } from '@shared/types/unione'

const toast = useToast()

const keys = ref<UniOneApiKey[]>([])
const loading = ref(false)

const fType = ref<UniOneKeyType | null>(null)
const fRegion = ref<UniOneRegion | null>(null)
const fActive = ref<boolean | null>(null)

const typeOptions = [
  { label: 'Any type', value: null },
  { label: 'User key (whole account)', value: 'user' },
  { label: 'Project key (one project)', value: 'project' },
]
const regionOptions = [
  { label: 'Any region', value: null },
  { label: 'auto (global)', value: 'auto' },
  { label: 'eu1', value: 'eu1' },
  { label: 'us1', value: 'us1' },
]
const activeOptions = [
  { label: 'Any', value: null },
  { label: 'Active', value: true },
  { label: 'Inactive', value: false },
]

// ── editor ───────────────────────────────────────────────────────────────────
const dialog = ref(false)
const saving = ref(false)
const editing = ref<UniOneApiKey | null>(null)
const form = ref({
  name: '', api_key: '', key_type: 'user' as UniOneKeyType, project_id: '',
  region: 'eu1' as UniOneRegion, base_url: '',
  is_active: true, default_from_email: '', default_from_name: '',
  // Default TRUE, matching UniOne — setting these to 0 needs their support to
  // enable the option, so defaulting off would fail every send.
  track_links: true, track_read: true,
  timeout_seconds: 15, notes: '',
})

// ── helper tabs ──────────────────────────────────────────────────────────────
const activeKeyId = ref<number | null>(null)
const domains = ref<UniOneDomain[]>([])
const domainsLoading = ref(false)
const dnsFor = ref<string | null>(null)
const dnsRecords = ref<Record<string, string> | null>(null)
const suppressions = ref<Array<Record<string, string>>>([])
const suppressionsLoading = ref(false)

const selectableKeys = computed(() => keys.value.filter((k) => k.is_active))

async function load(): Promise<void> {
  loading.value = true
  try {
    keys.value = await api.listKeys({
      key_type: fType.value, region: fRegion.value, is_active: fActive.value,
    })
    if (activeKeyId.value === null) {
      activeKeyId.value = keys.value.find((k) => k.is_default)?.id ?? keys.value[0]?.id ?? null
    }
  } catch {
    toast.add({ severity: 'error', summary: 'Could not load keys', life: 4000 })
  } finally {
    loading.value = false
  }
}

function open(key: UniOneApiKey | null): void {
  editing.value = key
  form.value = key
    ? {
        name: key.name,
        // Always blank on edit — Replace, never Reveal.
        api_key: '',
        key_type: key.key_type, project_id: key.project_id ?? '',
        region: key.region, base_url: key.base_url,
        is_active: key.is_active,
        default_from_email: key.default_from_email ?? '',
        default_from_name: key.default_from_name ?? '',
        track_links: key.track_links, track_read: key.track_read,
        timeout_seconds: key.timeout_seconds, notes: key.notes ?? '',
      }
    : {
        name: '', api_key: '', key_type: 'user', project_id: '', region: 'eu1', base_url: '',
        is_active: true, default_from_email: '', default_from_name: '',
        track_links: true, track_read: true, timeout_seconds: 15, notes: '',
      }
  dialog.value = true
}

async function save(): Promise<void> {
  saving.value = true
  try {
    const payload = {
      name: form.value.name,
      ...(form.value.api_key ? { api_key: form.value.api_key } : {}),
      key_type: form.value.key_type,
      project_id: form.value.key_type === 'project' ? form.value.project_id : null,
      region: form.value.region,
      base_url: form.value.base_url || null,
      is_active: form.value.is_active,
      default_from_email: form.value.default_from_email || null,
      default_from_name: form.value.default_from_name || null,
      track_links: form.value.track_links,
      track_read: form.value.track_read,
      timeout_seconds: form.value.timeout_seconds,
      notes: form.value.notes || null,
    }
    if (editing.value) await api.updateKey(editing.value.id, payload)
    else await api.createKey(payload)
    dialog.value = false
    await load()
    toast.add({ severity: 'success', summary: 'Key saved', life: 2500 })
  } catch (e: unknown) {
    toast.add({ severity: 'error', summary: message(e, 'Could not save that key'), life: 6000 })
  } finally {
    saving.value = false
  }
}

async function verify(key: UniOneApiKey): Promise<void> {
  try {
    const res = await api.verifyKey(key.id)
    await load()
    toast.add({
      severity: res.ok ? 'success' : 'warn',
      summary: res.ok ? 'Key verified' : 'Verification failed',
      detail: res.status, life: 7000,
    })
  } catch (e: unknown) {
    await load()
    toast.add({ severity: 'error', summary: message(e, 'Verification failed'), life: 7000 })
  }
}

async function makeDefault(key: UniOneApiKey): Promise<void> {
  try {
    await api.makeKeyDefault(key.id)
    await load()
    toast.add({ severity: 'success', summary: `${key.name} is now the default`, life: 2500 })
  } catch (e: unknown) {
    // The API refuses an unverified or inactive key — its wording explains why.
    toast.add({ severity: 'warn', summary: message(e, 'Could not set that default'), life: 6000 })
  }
}

async function toggle(key: UniOneApiKey): Promise<void> {
  try {
    await api.toggleKey(key.id)
    await load()
  } catch (e: unknown) {
    toast.add({ severity: 'warn', summary: message(e, 'Could not change that key'), life: 6000 })
  }
}

async function remove(key: UniOneApiKey): Promise<void> {
  if (!confirm(`Delete the key “${key.name}”?`)) return
  try {
    await api.deleteKey(key.id)
    await load()
    toast.add({ severity: 'success', summary: 'Key deleted', life: 2500 })
  } catch (e: unknown) {
    toast.add({ severity: 'warn', summary: message(e, 'Could not delete that key'), life: 6000 })
  }
}

// ── domains ──────────────────────────────────────────────────────────────────

async function loadDomains(): Promise<void> {
  if (activeKeyId.value === null) return
  domainsLoading.value = true
  dnsRecords.value = null
  try {
    const res = await api.listDomains(activeKeyId.value)
    domains.value = res.ok ? (res.data.domains ?? []) : []
    if (!res.ok) toast.add({ severity: 'warn', summary: res.message ?? 'UniOne refused that request', life: 6000 })
  } finally {
    domainsLoading.value = false
  }
}

async function showDns(domain: string): Promise<void> {
  if (activeKeyId.value === null) return
  dnsFor.value = domain
  const res = await api.domainDns(activeKeyId.value, domain)
  dnsRecords.value = res.ok ? res.data : null
  if (!res.ok) toast.add({ severity: 'warn', summary: res.message ?? 'Could not read the DNS records', life: 6000 })
}

async function recheck(domain: string, check: 'dkim' | 'verification'): Promise<void> {
  if (activeKeyId.value === null) return
  const res = await api.recheckDomain(activeKeyId.value, domain, check)
  toast.add({
    severity: res.ok ? 'success' : 'warn',
    // Validation is ASYNCHRONOUS — UniOne accepts the request and the result
    // shows up in the domain list, so the wording must not promise otherwise.
    summary: res.ok ? 'Re-check requested — refresh the list in a moment' : (res.message ?? 'Re-check failed'),
    life: 6000,
  })
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ severity: 'success', summary: 'Copied', life: 1500 })
  } catch {
    toast.add({ severity: 'warn', summary: 'Could not copy — select and copy manually', life: 4000 })
  }
}

async function loadSuppressions(): Promise<void> {
  if (activeKeyId.value === null) return
  suppressionsLoading.value = true
  try {
    const res = await api.listSuppressions(activeKeyId.value, { limit: 100 })
    suppressions.value = res.ok ? (res.data.suppressions ?? []) : []
    if (!res.ok) toast.add({ severity: 'warn', summary: res.message ?? 'Could not load suppressions', life: 6000 })
  } finally {
    suppressionsLoading.value = false
  }
}

function message(e: unknown, fallback: string): string {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

onMounted(() => void load())
</script>

<template>
  <div class="p-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-gray-900">UniOne</h1>
        <p class="mt-1 text-sm text-gray-500">
          API keys, sender domains and suppressions. Keys are stored encrypted and shown masked.
        </p>
      </div>
      <Button label="Add key" icon="pi pi-plus" @click="open(null)" />
    </div>

    <Tabs value="keys">
      <TabList>
        <Tab value="keys">Keys</Tab>
        <Tab value="domains">Domains</Tab>
        <Tab value="suppressions">Suppressions</Tab>
      </TabList>

      <TabPanels>
        <!-- ── keys ── -->
        <TabPanel value="keys">
          <div class="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Type</label>
              <Select v-model="fType" :options="typeOptions" option-label="label" option-value="value" class="w-56" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Region</label>
              <Select v-model="fRegion" :options="regionOptions" option-label="label" option-value="value" class="w-40" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Status</label>
              <Select v-model="fActive" :options="activeOptions" option-label="label" option-value="value" class="w-36" />
            </div>
            <Button label="Apply" icon="pi pi-filter" @click="load" />
          </div>

          <DataTable :value="keys" :loading="loading" data-key="id">
            <template #empty>
              <div class="py-12 text-center">
                <i class="pi pi-key mb-3 text-3xl text-gray-400" />
                <p class="font-medium text-gray-900">No UniOne keys yet.</p>
                <p class="mt-1 text-sm text-gray-500">Add one, verify it, then make it the default to start sending.</p>
              </div>
            </template>

            <Column header="Key" style="min-width:18rem">
              <template #body="{ data }: { data: UniOneApiKey }">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium text-gray-900">{{ data.name }}</span>
                  <Tag v-if="data.is_default" value="default" severity="success" />
                  <Tag v-if="!data.is_active" value="inactive" severity="secondary" />
                </div>
                <p class="font-mono text-xs text-gray-500">{{ data.masked_key }}</p>
                <p class="text-xs text-gray-400">
                  {{ data.key_type }} · {{ data.region }}
                  <span v-if="data.project_id"> · project {{ data.project_id }}</span>
                </p>
              </template>
            </Column>

            <Column header="Verification" style="width:18rem">
              <template #body="{ data }: { data: UniOneApiKey }">
                <Tag
                  :value="data.is_verified ? 'verified' : (data.last_verified_at ? 'failed' : 'not checked')"
                  :severity="data.is_verified ? 'success' : (data.last_verified_at ? 'danger' : 'secondary')"
                />
                <p class="mt-1 text-xs text-gray-500">{{ data.last_verify_status ?? '—' }}</p>
                <p class="text-xs text-gray-400">{{ formatDate(data.last_verified_at) }}</p>
              </template>
            </Column>

            <Column header="Tracking" style="width:8rem">
              <template #body="{ data }: { data: UniOneApiKey }">
                <p class="text-xs text-gray-600">links: {{ data.track_links ? 'on' : 'off' }}</p>
                <p class="text-xs text-gray-600">read: {{ data.track_read ? 'on' : 'off' }}</p>
              </template>
            </Column>

            <Column header="Webhook URL" style="min-width:16rem">
              <template #body="{ data }: { data: UniOneApiKey }">
                <div class="flex items-center gap-2">
                  <code class="truncate rounded bg-gray-100 px-1 text-[11px]">{{ data.webhook_url }}</code>
                  <Button size="small" text icon="pi pi-copy" @click="copy(data.webhook_url)" />
                </div>
                <p class="mt-1 text-xs text-gray-400">Paste into UniOne → Webhooks.</p>
              </template>
            </Column>

            <Column header="Active" style="width:6rem">
              <template #body="{ data }: { data: UniOneApiKey }">
                <ToggleSwitch :model-value="data.is_active" @update:model-value="toggle(data)" />
              </template>
            </Column>

            <Column header="" style="width:14rem">
              <template #body="{ data }: { data: UniOneApiKey }">
                <div class="flex flex-wrap gap-1">
                  <Button size="small" text icon="pi pi-check-circle" v-tooltip.top="'Verify'" @click="verify(data)" />
                  <Button
                    v-if="!data.is_default" size="small" text icon="pi pi-star"
                    v-tooltip.top="'Make default'" @click="makeDefault(data)"
                  />
                  <Button size="small" text icon="pi pi-pencil" @click="open(data)" />
                  <Button size="small" text severity="danger" icon="pi pi-trash" @click="remove(data)" />
                </div>
              </template>
            </Column>
          </DataTable>
        </TabPanel>

        <!-- ── domains ── -->
        <TabPanel value="domains">
          <div class="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Using key</label>
              <Select
                v-model="activeKeyId" :options="selectableKeys" option-label="name" option-value="id"
                class="w-64" placeholder="Select an active key"
              />
            </div>
            <Button label="Load domains" icon="pi pi-refresh" :disabled="!activeKeyId" @click="loadDomains" />
          </div>

          <p v-if="!activeKeyId" class="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
            Select an active key to read its domains.
          </p>

          <DataTable v-else :value="domains" :loading="domainsLoading" data-key="domain">
            <template #empty>
              <p class="py-8 text-center text-gray-500">No domains loaded yet — press “Load domains”.</p>
            </template>

            <Column field="domain" header="Domain" style="min-width:14rem" />

            <Column header="Verification" style="width:14rem">
              <template #body="{ data }: { data: UniOneDomain }">
                <Tag
                  :value="data['verification-record']?.status ?? 'unknown'"
                  :severity="data['verification-record']?.status === 'confirmed' ? 'success' : 'warn'"
                />
                <Button size="small" text label="Re-check" class="!px-0 !text-xs"
                        @click="recheck(data.domain, 'verification')" />
              </template>
            </Column>

            <Column header="DKIM" style="width:14rem">
              <template #body="{ data }: { data: UniOneDomain }">
                <Tag
                  :value="data.dkim?.status ?? 'unknown'"
                  :severity="data.dkim?.status === 'active' ? 'success' : 'warn'"
                />
                <Button size="small" text label="Re-check" class="!px-0 !text-xs"
                        @click="recheck(data.domain, 'dkim')" />
              </template>
            </Column>

            <Column header="" style="width:9rem">
              <template #body="{ data }: { data: UniOneDomain }">
                <Button size="small" text label="DNS records" @click="showDns(data.domain)" />
              </template>
            </Column>
          </DataTable>

          <div v-if="dnsRecords" class="mt-4 rounded-lg border border-gray-200 bg-white p-4">
            <h3 class="mb-3 font-semibold text-gray-900">DNS records for {{ dnsFor }}</h3>
            <div v-for="(value, label) in dnsRecords" :key="label" class="mb-3">
              <p class="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{{ label }}</p>
              <div class="flex items-start gap-2">
                <code class="flex-1 break-all rounded bg-gray-100 p-2 text-xs">{{ value }}</code>
                <Button size="small" text icon="pi pi-copy" @click="copy(String(value))" />
              </div>
            </div>
          </div>
        </TabPanel>

        <!-- ── suppressions ── -->
        <TabPanel value="suppressions">
          <div class="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-700">Using key</label>
              <Select
                v-model="activeKeyId" :options="selectableKeys" option-label="name" option-value="id"
                class="w-64" placeholder="Select an active key"
              />
            </div>
            <Button label="Load suppressions" icon="pi pi-refresh" :disabled="!activeKeyId" @click="loadSuppressions" />
          </div>

          <DataTable :value="suppressions" :loading="suppressionsLoading" data-key="email">
            <template #empty>
              <p class="py-8 text-center text-gray-500">Nothing loaded yet.</p>
            </template>
            <Column field="email" header="Email" style="min-width:16rem" />
            <Column field="cause" header="Cause" style="width:12rem" />
            <Column field="source" header="Source" style="width:10rem" />
            <Column field="created" header="Created" style="width:12rem" />
          </DataTable>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <Dialog v-model:visible="dialog" modal :header="editing ? 'Edit key' : 'Add UniOne key'" :style="{ width: '42rem' }">
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">
          <label class="mb-1 block text-xs font-medium text-gray-700">Name</label>
          <InputText v-model="form.name" class="w-full" placeholder="e.g. viglinksi promo (eu1)" />
        </div>

        <div class="col-span-2">
          <label class="mb-1 block text-xs font-medium text-gray-700">
            API key {{ editing ? '(leave empty to keep the current one)' : '' }}
          </label>
          <InputText v-model="form.api_key" class="w-full font-mono" type="password" autocomplete="off" />
          <p class="mt-1 text-xs text-gray-400">
            Stored encrypted. Only the last four characters are ever shown again — replacing is the only way to change it.
          </p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Key type</label>
          <Select
            v-model="form.key_type" class="w-full"
            :options="typeOptions.filter(o => o.value !== null)" option-label="label" option-value="value"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Project ID</label>
          <InputText v-model="form.project_id" class="w-full" :disabled="form.key_type !== 'project'" />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Region</label>
          <Select
            v-model="form.region" class="w-full"
            :options="regionOptions.filter(o => o.value !== null)" option-label="label" option-value="value"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Base URL (optional override)</label>
          <InputText v-model="form.base_url" class="w-full" placeholder="derived from the region" />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Default from email</label>
          <InputText v-model="form.default_from_email" class="w-full" placeholder="promo@viglinksi.com" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Default from name</label>
          <InputText v-model="form.default_from_name" class="w-full" />
        </div>

        <div class="col-span-2 flex flex-wrap items-center gap-8">
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-700">Track links</label>
            <ToggleSwitch v-model="form.track_links" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-700">Track opens</label>
            <ToggleSwitch v-model="form.track_read" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-700">Timeout (s)</label>
            <InputNumber v-model="form.timeout_seconds" :min="5" :max="120" class="w-28" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-700">Active</label>
            <ToggleSwitch v-model="form.is_active" />
          </div>
        </div>

        <p class="col-span-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Tracking is on by default because that is UniOne's default. Turning either off
          requires UniOne support to enable the option on your account — if the API rejects a
          send mentioning tracking, that is why.
        </p>

        <div class="col-span-2">
          <label class="mb-1 block text-xs font-medium text-gray-700">Notes</label>
          <Textarea v-model="form.notes" rows="2" class="w-full" />
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="dialog = false" />
        <Button label="Save" :loading="saving" :disabled="!form.name || (!editing && !form.api_key)" @click="save" />
      </template>
    </Dialog>
  </div>
</template>
