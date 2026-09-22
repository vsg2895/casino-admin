<script setup lang="ts">
import { onMounted, ref } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/bonusCategories'
import type { BonusCategory } from '@shared/types/bonusCategory'

/**
 * Bonus categories — the sub-items under the Bonus menu.
 *
 * One row drives TWO surfaces: an entry in the header's Bonus dropdown and a
 * section on the home page. That is why there is no separate "menu" screen to
 * keep in step with this one — a menu maintained beside a page drifts, and the
 * first symptom is a menu item leading to a section that no longer exists.
 *
 * Global, not per-site: a bonus type is a property of the offer. Which sites
 * publish the area at all is the `bonus_enabled` switch in each site's settings.
 */

const toast = useToast()
const items = ref<BonusCategory[]>([])
const loading = ref(false)
const busyId = ref<number | null>(null)

const showDialog = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const deleting = ref<BonusCategory | null>(null)

const form = ref({ name: '', description: '' as string | null, position: 0, active: true })

async function reload(): Promise<void> {
  loading.value = true
  try {
    items.value = await api.listBonusCategories()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load bonus categories.', life: 4000 })
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  editingId.value = null
  form.value = { name: '', description: null, position: (items.value.at(-1)?.position ?? 0) + 10, active: true }
  showDialog.value = true
}

function openEdit(row: BonusCategory): void {
  editingId.value = row.id
  form.value = {
    name: row.name,
    description: row.description,
    position: row.position,
    active: row.active,
  }
  showDialog.value = true
}

async function save(): Promise<void> {
  if (!form.value.name.trim()) {
    toast.add({ severity: 'warn', summary: 'Name required', detail: 'Give the category a name.', life: 3000 })
    return
  }
  saving.value = true
  try {
    if (editingId.value === null) {
      await api.createBonusCategory({ ...form.value })
    } else {
      await api.updateBonusCategory(editingId.value, { ...form.value })
    }
    showDialog.value = false
    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save that category.', life: 4000 })
  } finally {
    saving.value = false
  }
}

/**
 * Inline edits. Patched locally on success rather than refetching — a reload
 * would reorder the table under the cursor the instant a position changes.
 */
async function patchRow(row: BonusCategory, changes: Partial<BonusCategory>): Promise<void> {
  busyId.value = row.id
  try {
    await api.updateBonusCategory(row.id, changes)
    Object.assign(row, changes)
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save that change.', life: 4000 })
    await reload()
  } finally {
    busyId.value = null
  }
}

async function confirmDelete(): Promise<void> {
  const row = deleting.value
  if (!row) return
  try {
    const { message } = await api.deleteBonusCategory(row.id)
    // The API says how many offers were orphaned; repeating it verbatim beats
    // inventing a cheerier summary of a destructive action.
    toast.add({ severity: 'success', summary: 'Deleted', detail: message, life: 6000 })
    deleting.value = null
    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not delete that category.', life: 4000 })
  }
}

onMounted(reload)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-gray-900">Bonus Categories</h1>
        <p class="mt-0.5 text-sm text-gray-500">
          The sub-items under the <strong>Bonus</strong> menu. Each one is also a section on the
          home page, listing the special offers filed under it.
        </p>
      </div>
      <Button label="New category" icon="pi pi-plus" @click="openCreate" />
    </div>

    <Message severity="info" :closable="false" class="text-sm">
      A category appears in the menu and on the home page only while it is <strong>shown</strong>
      AND has at least one visible offer on that site. An empty heading is never rendered — which
      is what stops a menu entry from leading to a section that is not there.
      Each site publishes the whole area via <strong>Sites → Edit → Bonus area</strong>.
    </Message>

    <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <DataTable :value="items" :loading="loading" striped-rows data-key="id" :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No bonus categories yet.</div>
        </template>

        <Column header="Name">
          <template #body="{ data }">
            <span class="font-medium text-gray-900">{{ data.name }}</span>
            <p class="font-mono text-xs text-gray-400">{{ data.slug }}</p>
            <p v-if="data.description" class="mt-0.5 text-xs text-gray-500">{{ data.description }}</p>
          </template>
        </Column>

        <Column header="Shown" :style="{ width: '90px' }">
          <template #body="{ data }">
            <ToggleSwitch
              :model-value="data.active"
              :disabled="busyId === data.id"
              @update:model-value="(v: boolean) => patchRow(data, { active: v })"
            />
          </template>
        </Column>

        <Column header="Offers" :style="{ width: '90px' }">
          <template #body="{ data }">
            <span :class="data.offers_count ? 'text-gray-700' : 'text-amber-600'">
              {{ data.offers_count ?? 0 }}
            </span>
          </template>
        </Column>

        <Column header="Position" :style="{ width: '120px' }">
          <template #body="{ data }">
            <InputNumber
              :model-value="data.position"
              :min="0"
              :max="9999"
              :allow-empty="false"
              :input-style="{ width: '3.5rem' }"
              :disabled="busyId === data.id"
              @update:model-value="(v: number) => v !== data.position && patchRow(data, { position: v })"
            />
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

    <Dialog v-model:visible="showDialog" modal :header="editingId ? 'Edit category' : 'New category'" :style="{ width: '520px' }">
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Name</label>
          <InputText v-model="form.name" fluid placeholder="No Deposit" />
          <p v-if="editingId" class="mt-1 text-xs text-gray-400">
            Renaming changes the label everywhere. The URL keeps its original slug, so nothing
            that already links here breaks.
          </p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Description</label>
          <Textarea v-model="form.description" rows="2" fluid placeholder="Optional line under the section heading" />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Position</label>
          <InputNumber v-model="form.position" :min="0" :max="9999" fluid />
          <p class="mt-1 text-xs text-gray-400">Lower comes first, in the menu and on the page.</p>
        </div>

        <div class="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-3">
          <div>
            <label class="text-sm text-gray-700">Shown on the site</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Off removes both the menu entry and the home-page section, and keeps the offers
              filed under it untouched.
            </p>
          </div>
          <ToggleSwitch v-model="form.active" />
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="showDialog = false" />
        <Button :label="editingId ? 'Save' : 'Create category'" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <Dialog :visible="deleting !== null" modal header="Delete category" :style="{ width: '440px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">
        Delete <strong>{{ deleting?.name }}</strong>?
      </p>
      <p v-if="deleting?.offers_count" class="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
        {{ deleting.offers_count }} offer(s) are filed here. They are <strong>not</strong> deleted —
        they become uncategorised and stop showing in the Bonus area until filed again.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" severity="danger" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
