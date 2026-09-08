<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import * as navApi from '@/api/navItems'
import * as sitesApi from '@/api/sites'
import type { NavItem, NavLocation, UpsertNavItemPayload } from '@shared/types/navItem'
import type { Site } from '@shared/types/site'
import type { ErrorResponse } from '@shared/types/api'

/**
 * Header and footer menus for one site.
 *
 * The legal row (T&Cs, privacy, 18+, responsible gambling) is deliberately not
 * editable here — it lives in each site's code so it cannot be deleted. That is
 * the contract, not an omission.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()

const siteId = Number(route.params.id)
const site = ref<Site | null>(null)
const items = ref<NavItem[]>([])
const loading = ref(false)

const LOCATIONS: { label: string; value: NavLocation }[] = [
  { label: 'Header', value: 'header' },
  { label: 'Footer', value: 'footer' },
]

const header = computed(() => items.value.filter((i) => i.location === 'header'))
const footer = computed(() => items.value.filter((i) => i.location === 'footer'))

async function reload(): Promise<void> {
  loading.value = true
  try {
    items.value = await navApi.listNavItems(siteId)
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load the menus.', life: 4000 })
  } finally {
    loading.value = false
  }
}

// ── Create / edit ───────────────────────────────────────────────────────────
const showDialog = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const fieldErrors = ref<Record<string, string>>({})
const form = ref<UpsertNavItemPayload>({
  location: 'header',
  label: '',
  url: '',
  active: true,
  opens_in_new_tab: false,
})

function openCreate(location: NavLocation): void {
  editingId.value = null
  form.value = { location, label: '', url: '', active: true, opens_in_new_tab: false }
  fieldErrors.value = {}
  showDialog.value = true
}

function openEdit(item: NavItem): void {
  editingId.value = item.id
  form.value = {
    location: item.location,
    label: item.label,
    url: item.url,
    active: item.active,
    opens_in_new_tab: item.opens_in_new_tab,
  }
  fieldErrors.value = {}
  showDialog.value = true
}

async function save(): Promise<void> {
  saving.value = true
  fieldErrors.value = {}
  try {
    if (editingId.value === null) {
      await navApi.createNavItem(siteId, form.value)
    } else {
      await navApi.updateNavItem(siteId, editingId.value, form.value)
    }
    showDialog.value = false
    await reload()
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Menu updated.', life: 2500 })
  } catch (e: unknown) {
    const data = axios.isAxiosError(e) ? (e.response?.data as ErrorResponse | undefined) : undefined
    if (data?.errors) {
      fieldErrors.value = Object.fromEntries(
        Object.entries(data.errors).map(([k, v]) => [k, v[0] ?? '']),
      )
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save the link.', life: 4000 })
    }
  } finally {
    saving.value = false
  }
}

const deleting = ref<NavItem | null>(null)

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  try {
    await navApi.deleteNavItem(siteId, deleting.value.id)
    deleting.value = null
    await reload()
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Link removed.', life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not delete the link.', life: 4000 })
  }
}

// ── Ordering ────────────────────────────────────────────────────────────────
// Up/down buttons rather than drag-and-drop: a menu is a handful of rows, and
// buttons are keyboard-reachable and testable where a drag handle is neither.
async function move(item: NavItem, direction: -1 | 1): Promise<void> {
  const group = item.location === 'header' ? [...header.value] : [...footer.value]
  const index = group.findIndex((i) => i.id === item.id)
  const target = index + direction

  if (index < 0 || target < 0 || target >= group.length) return

  const [moved] = group.splice(index, 1)
  group.splice(target, 0, moved)

  try {
    await navApi.reorderNavItems(siteId, group.map((i) => i.id))
    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not reorder.', life: 4000 })
  }
}

onMounted(async () => {
  await Promise.all([
    reload(),
    sitesApi
      .getSite(siteId)
      .then((r) => (site.value = r.data))
      .catch(() => (site.value = null)),
  ])
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <Button label="Back to sites" icon="pi pi-arrow-left" text severity="secondary" @click="router.push({ name: 'sites' })" />
      <h2 class="text-lg font-semibold text-gray-900">
        Navigation<span v-if="site" class="text-gray-400"> — {{ site.name }}</span>
      </h2>
      <span class="w-32" />
    </div>

    <p class="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
      Header and footer menus for this site only. Leave both empty and the site keeps using the
      links built into its code. Legal links (terms, privacy, 18+, responsible gambling) are not
      listed here — they are part of the site's compliance markup and cannot be removed.
    </p>

    <div v-for="group in LOCATIONS" :key="group.value" class="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 class="text-sm font-semibold text-gray-800">{{ group.label }} menu</h3>
        <Button :label="`Add ${group.label.toLowerCase()} link`" icon="pi pi-plus" size="small" outlined @click="openCreate(group.value)" />
      </div>

      <div v-if="loading" class="px-4 py-6 text-sm text-gray-400">Loading…</div>

      <div
        v-else-if="(group.value === 'header' ? header : footer).length === 0"
        class="px-4 py-6 text-sm text-gray-400"
      >
        No links yet — this site falls back to the menu in its code.
      </div>

      <ul v-else class="divide-y divide-gray-100">
        <li
          v-for="(item, index) in group.value === 'header' ? header : footer"
          :key="item.id"
          class="flex items-center gap-3 px-4 py-2.5"
        >
          <div class="flex flex-col">
            <button
              class="text-gray-400 hover:text-gray-700 disabled:opacity-30"
              :disabled="index === 0"
              aria-label="Move up"
              @click="move(item, -1)"
            >
              <i class="pi pi-chevron-up text-xs" />
            </button>
            <button
              class="text-gray-400 hover:text-gray-700 disabled:opacity-30"
              :disabled="index === (group.value === 'header' ? header : footer).length - 1"
              aria-label="Move down"
              @click="move(item, 1)"
            >
              <i class="pi pi-chevron-down text-xs" />
            </button>
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-gray-900">
              {{ item.label }}
              <span v-if="!item.active" class="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">hidden</span>
              <span v-if="item.opens_in_new_tab" class="ml-1 text-xs text-gray-400">↗</span>
            </p>
            <p class="truncate font-mono text-xs text-gray-400">{{ item.url }}</p>
          </div>

          <Button icon="pi pi-pencil" text severity="secondary" size="small" @click="openEdit(item)" />
          <Button icon="pi pi-trash" text severity="danger" size="small" @click="deleting = item" />
        </li>
      </ul>
    </div>

    <!-- Create / edit -->
    <Dialog v-model:visible="showDialog" modal :header="editingId ? 'Edit link' : 'Add link'" :style="{ width: '460px' }">
      <div class="space-y-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Menu</label>
          <Select v-model="form.location" :options="LOCATIONS" option-label="label" option-value="value" fluid />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Label</label>
          <InputText v-model="form.label" fluid placeholder="Casinos" />
          <p v-if="fieldErrors['label']" class="mt-1 text-xs text-red-600">{{ fieldErrors['label'] }}</p>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Link</label>
          <InputText v-model="form.url" fluid placeholder="/casinos" />
          <p class="mt-1 text-xs text-gray-400">
            An internal path starting with <code>/</code>, or a full <code>https://</code> address.
          </p>
          <p v-if="fieldErrors['url']" class="mt-1 text-xs text-red-600">{{ fieldErrors['url'] }}</p>
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <label class="text-sm text-gray-700">Visible</label>
          <ToggleSwitch v-model="form.active" />
        </div>
        <div class="flex items-center justify-between gap-3">
          <div>
            <label class="text-sm text-gray-700">Open in a new tab</label>
            <p class="text-xs text-gray-400">Only sensible for links to other websites.</p>
          </div>
          <ToggleSwitch v-model="form.opens_in_new_tab" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="showDialog = false" />
        <Button :label="editingId ? 'Save' : 'Add link'" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <Dialog :visible="deleting !== null" modal header="Remove link" :style="{ width: '400px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">
        Remove <strong>{{ deleting?.label }}</strong> from the menu? The page it points to is not
        affected.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Remove" severity="danger" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
