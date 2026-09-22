<script setup lang="ts">
/**
 * Boards — the forum's Section → Category taxonomy for one site.
 *
 * Both levels on ONE screen because they are never edited apart: a board is
 * meaningless without its section, and moving a board between sections is the
 * commonest edit. Two screens would mean opening both every time.
 *
 * Deletion of a non-empty section or board is refused by the API (409), not
 * cascaded. Taking every discussion and post beneath a heading from one click
 * is wildly out of proportion to what the button says, so the server makes the
 * operator empty it first and this screen surfaces that message verbatim.
 */
import { ref, computed, onMounted, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/forum'
import { useSitesStore } from '@/stores/sitesStore'
import type { ForumAdminSection, ForumCategory } from '@shared/types/community-forum'

const toast = useToast()
const sitesStore = useSitesStore()

const siteId = ref<number | null>(null)
const sections = ref<ForumAdminSection[]>([])
const loading = ref(false)

// ── section dialog ───────────────────────────────────────────────────────────
const sectionDialog = ref(false)
const editingSection = ref<ForumAdminSection | null>(null)
const sectionForm = ref({ name: '', description: '', position: 0, active: true })

// ── category dialog ──────────────────────────────────────────────────────────
const categoryDialog = ref(false)
const editingCategory = ref<ForumCategory | null>(null)
const categoryForm = ref({ forum_section_id: 0, name: '', description: '', icon: '', position: 0, active: true })

const sectionOptions = computed(() =>
  sections.value.map((s) => ({ label: s.name, value: s.id })),
)

async function load(): Promise<void> {
  if (siteId.value === null) return
  loading.value = true
  try {
    sections.value = await api.listSections(siteId.value)
  } catch {
    toast.add({ severity: 'error', summary: 'Could not load the boards', life: 4000 })
  } finally {
    loading.value = false
  }
}

function openSection(section: ForumAdminSection | null): void {
  editingSection.value = section
  sectionForm.value = section
    ? { name: section.name, description: section.description ?? '', position: section.position, active: section.active }
    // A new section goes to the end rather than the top: appending never
    // reorders what the operator already arranged.
    : { name: '', description: '', position: sections.value.length, active: true }
  sectionDialog.value = true
}

async function saveSection(): Promise<void> {
  if (siteId.value === null) return
  try {
    const payload = {
      name: sectionForm.value.name,
      description: sectionForm.value.description || null,
      position: sectionForm.value.position,
      active: sectionForm.value.active,
    }
    if (editingSection.value) await api.updateSection(siteId.value, editingSection.value.id, payload)
    else await api.createSection(siteId.value, payload)
    sectionDialog.value = false
    await load()
    toast.add({ severity: 'success', summary: 'Section saved', life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Could not save that section', life: 4000 })
  }
}

function openCategory(section: ForumAdminSection, category: ForumCategory | null): void {
  editingCategory.value = category
  categoryForm.value = category
    ? {
        forum_section_id: section.id,
        name: category.name,
        description: category.description ?? '',
        icon: category.icon ?? '',
        position: 0,
        active: true,
      }
    : { forum_section_id: section.id, name: '', description: '', icon: '', position: section.categories.length, active: true }
  categoryDialog.value = true
}

async function saveCategory(): Promise<void> {
  if (siteId.value === null) return
  try {
    const payload = {
      forum_section_id: categoryForm.value.forum_section_id,
      name: categoryForm.value.name,
      description: categoryForm.value.description || null,
      icon: categoryForm.value.icon || null,
      position: categoryForm.value.position,
      active: categoryForm.value.active,
    }
    if (editingCategory.value) await api.updateCategory(siteId.value, editingCategory.value.id, payload)
    else await api.createCategory(siteId.value, payload)
    categoryDialog.value = false
    await load()
    toast.add({ severity: 'success', summary: 'Board saved', life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Could not save that board', life: 4000 })
  }
}

/** The API refuses a non-empty delete with 409 — its message is shown as-is. */
async function removeSection(section: ForumAdminSection): Promise<void> {
  if (siteId.value === null) return
  if (!confirm(`Delete the section “${section.name}”?`)) return
  try {
    await api.deleteSection(siteId.value, section.id)
    await load()
    toast.add({ severity: 'success', summary: 'Section deleted', life: 2500 })
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    toast.add({ severity: 'warn', summary: msg ?? 'Could not delete that section', life: 6000 })
  }
}

async function removeCategory(category: ForumCategory): Promise<void> {
  if (siteId.value === null) return
  if (!confirm(`Delete the board “${category.name}”?`)) return
  try {
    await api.deleteCategory(siteId.value, category.id)
    await load()
    toast.add({ severity: 'success', summary: 'Board deleted', life: 2500 })
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    toast.add({ severity: 'warn', summary: msg ?? 'Could not delete that board', life: 6000 })
  }
}

watch(siteId, () => void load())

onMounted(async () => {
  if (sitesStore.sites.length === 0) await sitesStore.fetchSites?.()
  siteId.value = sitesStore.sites[0]?.id ?? null
})
</script>

<template>
  <div class="p-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-gray-900">Forum Boards</h1>
        <p class="mt-1 text-sm text-gray-500">Sections group the boards shown on the forum index.</p>
      </div>
      <div class="flex items-end gap-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Site</label>
          <Select v-model="siteId" :options="sitesStore.sites" option-label="name" option-value="id" class="w-48" />
        </div>
        <Button label="New section" icon="pi pi-plus" @click="openSection(null)" />
      </div>
    </div>

    <div v-if="loading" class="py-12 text-center text-gray-500">Loading…</div>

    <div v-else-if="sections.length === 0" class="rounded-lg border border-dashed border-gray-300 py-16 text-center">
      <i class="pi pi-sitemap mb-3 text-3xl text-gray-400" />
      <p class="font-medium text-gray-900">No sections yet.</p>
      <p class="mt-1 text-sm text-gray-500">A forum needs at least one section and one board before it can show anything.</p>
      <Button class="mt-4" label="Create the first section" icon="pi pi-plus" @click="openSection(null)" />
    </div>

    <div v-else class="space-y-4">
      <div v-for="section in sections" :key="section.id" class="rounded-lg border border-gray-200 bg-white">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-gray-900">{{ section.name }}</span>
            <Tag v-if="!section.active" value="hidden" severity="secondary" />
            <span class="text-xs text-gray-400">#{{ section.position }}</span>
          </div>
          <div class="flex gap-1">
            <Button size="small" text icon="pi pi-plus" label="Board" @click="openCategory(section, null)" />
            <Button size="small" text icon="pi pi-pencil" @click="openSection(section)" />
            <Button size="small" text severity="danger" icon="pi pi-trash" @click="removeSection(section)" />
          </div>
        </div>

        <p v-if="section.categories.length === 0" class="px-4 py-6 text-sm text-gray-400">
          No boards in this section yet.
        </p>

        <ul v-else class="divide-y divide-gray-100">
          <li v-for="cat in section.categories" :key="cat.id" class="flex flex-wrap items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-900">{{ cat.name }}</span>
                <code class="rounded bg-gray-100 px-1 text-xs text-gray-500">/{{ cat.slug }}</code>
              </div>
              <p v-if="cat.description" class="truncate text-sm text-gray-500">{{ cat.description }}</p>
            </div>
            <!-- Denormalised counters, straight off the row — no COUNT() anywhere. -->
            <div class="text-right text-xs text-gray-500">
              <div>{{ cat.posts_count }} posts</div>
              <div>{{ cat.articles_count }} discussions</div>
            </div>
            <div class="flex gap-1">
              <Button size="small" text icon="pi pi-pencil" @click="openCategory(section, cat)" />
              <Button size="small" text severity="danger" icon="pi pi-trash" @click="removeCategory(cat)" />
            </div>
          </li>
        </ul>
      </div>
    </div>

    <Dialog v-model:visible="sectionDialog" modal :header="editingSection ? 'Edit section' : 'New section'" :style="{ width: '30rem' }">
      <label class="mb-1 block text-xs font-medium text-gray-700">Name</label>
      <InputText v-model="sectionForm.name" class="mb-3 w-full" />
      <label class="mb-1 block text-xs font-medium text-gray-700">Description</label>
      <Textarea v-model="sectionForm.description" rows="2" class="mb-3 w-full" />
      <div class="flex items-center gap-6">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Position</label>
          <InputNumber v-model="sectionForm.position" :min="0" :max="9999" class="w-28" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Shown</label>
          <ToggleSwitch v-model="sectionForm.active" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="sectionDialog = false" />
        <Button label="Save" :disabled="!sectionForm.name" @click="saveSection" />
      </template>
    </Dialog>

    <Dialog v-model:visible="categoryDialog" modal :header="editingCategory ? 'Edit board' : 'New board'" :style="{ width: '32rem' }">
      <label class="mb-1 block text-xs font-medium text-gray-700">Section</label>
      <Select v-model="categoryForm.forum_section_id" :options="sectionOptions" option-label="label" option-value="value" class="mb-3 w-full" />
      <label class="mb-1 block text-xs font-medium text-gray-700">Name</label>
      <InputText v-model="categoryForm.name" class="mb-3 w-full" />
      <label class="mb-1 block text-xs font-medium text-gray-700">Description</label>
      <Textarea v-model="categoryForm.description" rows="2" class="mb-3 w-full" />
      <label class="mb-1 block text-xs font-medium text-gray-700">Icon</label>
      <!-- A short token the public site maps to one of its own SVGs. Never a
           path or markup: an admin-supplied icon reaching the DOM would be a
           stored-XSS hole for the sake of a decoration. -->
      <InputText v-model="categoryForm.icon" class="mb-1 w-full" placeholder="e.g. slots, payments, support" />
      <p class="mb-3 text-xs text-gray-400">Lower-case letters, numbers and hyphens. The site picks the matching icon.</p>
      <div class="flex items-center gap-6">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Position</label>
          <InputNumber v-model="categoryForm.position" :min="0" :max="9999" class="w-28" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-700">Shown</label>
          <ToggleSwitch v-model="categoryForm.active" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" text @click="categoryDialog = false" />
        <Button label="Save" :disabled="!categoryForm.name || !categoryForm.forum_section_id" @click="saveCategory" />
      </template>
    </Dialog>
  </div>
</template>
