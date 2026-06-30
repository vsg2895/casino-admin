<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import { useSitesStore } from '@/stores/sitesStore'
import Register from './Register.vue'
import Edit from './Edit.vue'
import ApiKeyDisplayModal from '@/components/modals/ApiKeyDisplayModal.vue'
import * as sitesApi from '@/api/sites'
import type { Site, SiteRegistrationResponse } from '@shared/types/site'
import type { ErrorResponse } from '@shared/types/api'

const store = useSitesStore()
const toast = useToast()
const router = useRouter()

// ── modals state ──────────────────────────────────────────────────────────────
const showRegister = ref(false)
const showEdit = ref(false)
const editSite = ref<Site | null>(null)
const showApiKey = ref(false)
const pendingApiKey = ref('')

// ── rotate-key confirmation dialog ────────────────────────────────────────────
const showRotateConfirm = ref(false)
const rotateSite = ref<Site | null>(null)
const rotateConfirmInput = ref('')
const rotateLoading = ref(false)

// ── toggle-active state ───────────────────────────────────────────────────────
const togglingId = ref<number | null>(null)

onMounted(() => store.fetchSites())

// ── register flow ─────────────────────────────────────────────────────────────
function onRegistered(response: SiteRegistrationResponse): void {
  store.upsert(response)
  pendingApiKey.value = response.api_key
  showApiKey.value = true
}

// ── edit flow ─────────────────────────────────────────────────────────────────
function openEdit(site: Site): void {
  editSite.value = site
  showEdit.value = true
}

function onUpdated(site: Site): void {
  store.upsert(site)
  toast.add({ severity: 'success', summary: 'Saved', detail: `${site.name} updated.`, life: 3000 })
}

// ── subscription email template ───────────────────────────────────────────────
function openEmailTemplate(site: Site): void {
  router.push({ name: 'sites-email-template', params: { siteId: site.id } })
}

// ── rotate-key flow ───────────────────────────────────────────────────────────
function openRotateConfirm(site: Site): void {
  rotateSite.value = site
  rotateConfirmInput.value = ''
  showRotateConfirm.value = true
}

async function confirmRotate(): Promise<void> {
  if (!rotateSite.value) return
  rotateLoading.value = true

  try {
    const response = await sitesApi.rotateKey(rotateSite.value.id)
    store.upsert(response.data)
    showRotateConfirm.value = false
    pendingApiKey.value = response.data.api_key
    showApiKey.value = true
  } catch (e: unknown) {
    const msg =
      axios.isAxiosError(e)
        ? ((e.response?.data as ErrorResponse | undefined)?.message ?? 'Failed to rotate key.')
        : 'An unexpected error occurred.'
    toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 5000 })
  } finally {
    rotateLoading.value = false
  }
}

// ── toggle active ─────────────────────────────────────────────────────────────
async function toggleActive(site: Site): Promise<void> {
  togglingId.value = site.id
  try {
    const response = await sitesApi.updateSite(site.id, { active: !site.active })
    store.upsert(response.data)
    const label = response.data.active ? 'activated' : 'deactivated'
    toast.add({ severity: 'success', summary: 'Updated', detail: `${site.name} ${label}.`, life: 3000 })
  } catch (e: unknown) {
    const msg =
      axios.isAxiosError(e)
        ? ((e.response?.data as ErrorResponse | undefined)?.message ?? 'Failed to update site.')
        : 'An unexpected error occurred.'
    toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 5000 })
  } finally {
    togglingId.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Sites</h2>
        <p class="text-sm text-gray-500">Manage registered domains and their API keys.</p>
      </div>
      <Button
        label="Register Domain"
        icon="pi pi-plus"
        @click="showRegister = true"
      />
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable
        :value="store.sites"
        :loading="store.loading"
        striped-rows
        :pt="{ root: { class: 'text-sm' } }"
      >
        <template #empty>
          <div class="py-12 text-center text-sm text-gray-400">
            No sites registered yet.
          </div>
        </template>

        <Column field="name" header="Name" class="font-medium" />

        <Column field="domain" header="Domain">
          <template #body="{ data: site }: { data: Site }">
            <span class="font-mono text-xs text-gray-700">{{ site.domain }}</span>
          </template>
        </Column>

        <Column field="slug" header="Slug">
          <template #body="{ data: site }: { data: Site }">
            <span class="font-mono text-xs text-gray-500">{{ site.slug }}</span>
          </template>
        </Column>

        <Column header="Status">
          <template #body="{ data: site }: { data: Site }">
            <Tag
              :severity="site.active ? 'success' : 'danger'"
              :value="site.active ? 'Active' : 'Inactive'"
            />
          </template>
        </Column>

        <Column header="API Key">
          <template #body>
            <span class="font-mono text-xs tracking-widest text-gray-400 select-none">
              ••••••••••••
            </span>
          </template>
        </Column>

        <Column header="Actions" style="width: 220px">
          <template #body="{ data: site }: { data: Site }">
            <div class="flex items-center gap-1.5">
              <Button
                icon="pi pi-pencil"
                size="small"
                text
                severity="secondary"
                v-tooltip="'Edit'"
                @click="openEdit(site)"
              />
              <Button
                icon="pi pi-envelope"
                size="small"
                text
                severity="secondary"
                v-tooltip="'Subscription Email'"
                @click="openEmailTemplate(site)"
              />
              <Button
                icon="pi pi-refresh"
                size="small"
                text
                severity="warn"
                v-tooltip="'Rotate API Key'"
                @click="openRotateConfirm(site)"
              />
              <Button
                :icon="site.active ? 'pi pi-eye-slash' : 'pi pi-eye'"
                :severity="site.active ? 'danger' : 'success'"
                :loading="togglingId === site.id"
                size="small"
                text
                :v-tooltip="site.active ? 'Deactivate' : 'Activate'"
                @click="toggleActive(site)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Register modal -->
    <Register v-model:visible="showRegister" @registered="onRegistered" />

    <!-- Edit modal -->
    <Edit v-model:visible="showEdit" :site="editSite" @updated="onUpdated" />

    <!-- API key display (register + rotate) -->
    <ApiKeyDisplayModal v-model:visible="showApiKey" :api-key="pendingApiKey" />

    <!-- Rotate-key confirmation dialog -->
    <Dialog
      v-model:visible="showRotateConfirm"
      modal
      header="Rotate API Key"
      :style="{ width: '440px' }"
    >
      <div class="space-y-4">
        <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p class="font-semibold">This will immediately invalidate the current key.</p>
          <p class="mt-0.5">Any Next.js site using the old key will stop working until you update its <code class="rounded bg-red-100 px-1 font-mono">API_SITE_KEY</code>.</p>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">
            Type <strong>{{ rotateSite?.name }}</strong> to confirm
          </label>
          <InputText
            v-model="rotateConfirmInput"
            fluid
            :placeholder="rotateSite?.name ?? ''"
            @keyup.enter="rotateConfirmInput === rotateSite?.name && confirmRotate()"
          />
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="showRotateConfirm = false" />
        <Button
          label="Rotate Key"
          severity="danger"
          :loading="rotateLoading"
          :disabled="rotateConfirmInput !== rotateSite?.name"
          @click="confirmRotate"
        />
      </template>
    </Dialog>
  </div>
</template>
