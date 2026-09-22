<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/newsCategories'
import * as sitesApi from '@/api/sites'
import type { NewsCategory } from '@shared/types/newsCategory'
import type { Site } from '@shared/types/site'

/**
 * Editorial sections for ONE site's news.
 *
 * Per site rather than global: a bonus type describes the offer and means the
 * same on every domain, but "Licensing" on this site says nothing about what
 * another domain in the network covers.
 *
 * A category appears publicly — as the badge on a card and as a topic pill —
 * only while it is shown AND has at least one visible post. A pill leading to an
 * empty feed is the same broken promise as a menu entry leading nowhere.
 */

const route = useRoute()
const router = useRouter()
const toast = useToast()
const siteId = Number(route.params.id)

const site = ref<Site | null>(null)
const items = ref<NewsCategory[]>([])
const loading = ref(false)
const busyId = ref<number | null>(null)

const showDialog = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const deleting = ref<NewsCategory | null>(null)
const form = ref({ name: '', position: 0, active: true })

async function reload(): Promise<void> {
  loading.value = true
  try {
    items.value = await api.listNewsCategories(siteId)
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load categories.', life: 4000 })
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  editingId.value = null
  form.value = { name: '', position: (items.value.at(-1)?.position ?? 0) + 10, active: true }
  showDialog.value = true
}

function openEdit(row: NewsCategory): void {
  editingId.value = row.id
  form.value = { name: row.name, position: row.position, active: row.active }
  showDialog.value = true
}

async function save(): Promise<void> {
  if (!form.value.name.trim()) {
    toast.add({ severity: 'warn', summary: 'Name required', detail: 'Give the section a name.', life: 3000 })
    return
  }
  saving.value = true
  try {
    if (editingId.value === null) await api.createNewsCategory(siteId, { ...form.value })
    else await api.updateNewsCategory(siteId, editingId.value, { ...form.value })
    showDialog.value = false
    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save that category.', life: 4000 })
  } finally {
    saving.value = false
  }
}

/** Inline edits patch the row locally — a reload would reorder the table under the cursor. */
async function patchRow(row: NewsCategory, changes: Partial<NewsCategory>): Promise<void> {
  busyId.value = row.id
  try {
    await api.updateNewsCategory(siteId, row.id, changes)
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
    const { message } = await api.deleteNewsCategory(siteId, row.id)
    toast.add({ severity: 'success', summary: 'Deleted', detail: message, life: 6000 })
    deleting.value = null
    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not delete that category.', life: 4000 })
  }
}

onMounted(async () => {
  site.value = await sitesApi.getSite(siteId).then((r) => r.data).catch(() => null)
  await reload()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <Button label="Back to news" icon="pi pi-arrow-left" text severity="secondary"
              @click="router.push({ name: 'site-news', params: { id: siteId } })" />
      <h2 class="text-lg font-semibold text-gray-900">
        News categories<span v-if="site" class="text-gray-400"> — {{ site.name }}</span>
      </h2>
      <Button label="New category" icon="pi pi-plus" @click="openCreate" />
    </div>

    <Message severity="info" :closable="false" class="text-sm">
      Sections appear on the site as the label on each card and as a topic pill above the feed —
      but only while <strong>shown</strong> and holding at least one visible post. A post without
      a category still publishes; it just carries no label.
    </Message>

    <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <DataTable :value="items" :loading="loading" striped-rows data-key="id" :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No categories yet.</div>
        </template>

        <Column header="Name">
          <template #body="{ data }">
            <span class="font-medium text-gray-900">{{ data.name }}</span>
            <p class="font-mono text-xs text-gray-400">/news?category={{ data.slug }}</p>
          </template>
        </Column>

        <Column header="Shown" :style="{ width: '90px' }">
          <template #body="{ data }">
            <ToggleSwitch :model-value="data.active" :disabled="busyId === data.id"
                          @update:model-value="(v: boolean) => patchRow(data, { active: v })" />
          </template>
        </Column>

        <Column header="Posts" :style="{ width: '80px' }">
          <template #body="{ data }">
            <span :class="data.articles_count ? 'text-gray-700' : 'text-amber-600'">
              {{ data.articles_count ?? 0 }}
            </span>
          </template>
        </Column>

        <Column header="Position" :style="{ width: '120px' }">
          <template #body="{ data }">
            <InputNumber :model-value="data.position" :min="0" :max="9999" :allow-empty="false"
                         :input-style="{ width: '3.5rem' }" :disabled="busyId === data.id"
                         @update:model-value="(v: number) => v !== data.position && patchRow(data, { position: v })" />
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

    <Dialog v-model:visible="showDialog" modal :header="editingId ? 'Edit category' : 'New category'" :style="{ width: '480px' }">
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Name</label>
          <InputText v-model="form.name" fluid placeholder="Licensing" />
          <p v-if="editingId" class="mt-1 text-xs text-gray-400">
            Renaming changes the label everywhere. The URL keeps its original slug, so existing
            links keep working.
          </p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Position</label>
          <InputNumber v-model="form.position" :min="0" :max="9999" fluid />
          <p class="mt-1 text-xs text-gray-400">Lower comes first in the topic pills.</p>
        </div>

        <div class="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-3">
          <div>
            <label class="text-sm text-gray-700">Shown on the site</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Off removes the badge and the pill. The posts stay published and keep their URLs.
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

    <Dialog :visible="deleting !== null" modal header="Delete category" :style="{ width: '440px' }"
            @update:visible="deleting = null">
      <p class="text-sm text-gray-700">Delete <strong>{{ deleting?.name }}</strong>?</p>
      <p v-if="deleting?.articles_count" class="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
        {{ deleting.articles_count }} post(s) are filed here. They are <strong>not</strong> deleted —
        they stay published and keep their URLs, they just lose the section label.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" severity="danger" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
