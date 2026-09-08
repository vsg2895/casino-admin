<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { uploadCategoryLogo } from '@/api/categories'
import { STORAGE_BASE_URL } from '@/config/urls'
import type { Category } from '@shared/types/category'
import type { ErrorResponse } from '@shared/types/api'

const store = useCategoriesStore()
const toast = useToast()

/**
 * A stored path resolved against the API origin's /storage mount — the same
 * shape every other admin screen uses for uploaded files.
 */
function logoUrl(path: string | null): string | null {
  if (!path) return null
  return /^https?:\/\//.test(path) ? path : `${STORAGE_BASE_URL}/storage/${path}`
}

// ── Add ──────────────────────────────────────────────────────────────────────
const name = ref('')
const newLogo = ref<string | null>(null)
const adding = ref(false)

async function add(): Promise<void> {
  if (!name.value.trim()) return
  adding.value = true
  try {
    await store.add({ name: name.value.trim(), logo_path: newLogo.value })
    name.value = ''
    newLogo.value = null
    toast.add({ severity: 'success', summary: 'Added', detail: 'Category created.', life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to add category.', life: 4000 })
  } finally {
    adding.value = false
  }
}

// ── Logo upload ──────────────────────────────────────────────────────────────
// One uploader serving both the add form and the edit dialog. The file goes up
// on its own request and only its PATH is held here, so a failed save never
// discards a logo the admin already picked.
const uploading = ref(false)

async function pickLogo(event: Event, target: 'new' | 'edit'): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  uploading.value = true
  try {
    const path = await uploadCategoryLogo(file)
    if (target === 'new') newLogo.value = path
    else editLogo.value = path
  } catch (e: unknown) {
    const data = axios.isAxiosError(e) ? (e.response?.data as ErrorResponse | undefined) : undefined
    toast.add({
      severity: 'error',
      summary: 'Upload failed',
      // The server explains SVG-only and the size cap; passing it through beats
      // a generic message the admin cannot act on.
      detail: data?.errors?.file?.[0] ?? data?.message ?? 'Could not upload that file.',
      life: 5000,
    })
  } finally {
    uploading.value = false
    // Cleared so picking the SAME file again still fires a change event.
    input.value = ''
  }
}

// ── Edit ─────────────────────────────────────────────────────────────────────
const editing = ref<Category | null>(null)
const editName = ref('')
const editLogo = ref<string | null>(null)
const saving = ref(false)

const editLogoUrl = computed(() => logoUrl(editLogo.value))

function openEdit(category: Category): void {
  editing.value = category
  editName.value = category.name
  editLogo.value = category.logo_path
}

function closeEdit(): void {
  editing.value = null
}

async function saveEdit(): Promise<void> {
  if (!editing.value || !editName.value.trim()) return
  saving.value = true
  try {
    await store.update(editing.value.id, {
      name: editName.value.trim(),
      logo_path: editLogo.value,
    })
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Category updated.', life: 2500 })
    closeEdit()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save.', life: 4000 })
  } finally {
    saving.value = false
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────
const deleting = ref<Category | null>(null)
const deleteLoading = ref(false)

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  deleteLoading.value = true
  try {
    await store.remove(deleting.value.id)
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Category deleted.', life: 2500 })
    deleting.value = null
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete.', life: 4000 })
  } finally {
    deleteLoading.value = false
  }
}

onMounted(() => store.fetchCategories())
</script>

<template>
  <div class="space-y-8">
    <!-- Add Category -->
    <section>
      <h2 class="mb-4 text-xl font-semibold text-indigo-500">Add Category</h2>
      <form class="flex flex-wrap items-center gap-3" @submit.prevent="add">
        <InputText v-model="name" class="min-w-64 flex-1" placeholder="Category name" />

        <label
          class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:border-indigo-400 hover:text-indigo-600"
        >
          <img
            v-if="logoUrl(newLogo)"
            :src="logoUrl(newLogo)!"
            alt=""
            class="h-5 w-5"
          />
          <i v-else class="pi pi-image" />
          {{ newLogo ? 'Change logo' : 'SVG logo' }}
          <!-- The accept hint only filters the picker; the server is what
               enforces SVG, since accept is trivially bypassed. -->
          <input type="file" accept=".svg,image/svg+xml" class="hidden" @change="pickLogo($event, 'new')" />
        </label>

        <Button
          v-if="newLogo"
          icon="pi pi-times"
          text
          severity="secondary"
          size="small"
          v-tooltip="'Remove logo'"
          @click="newLogo = null"
        />

        <Button type="submit" label="Add" :loading="adding || uploading" :disabled="!name.trim()" />
      </form>
    </section>

    <!-- Categories list -->
    <section>
      <h2 class="mb-4 text-xl font-semibold text-indigo-500">Categories list</h2>
      <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <DataTable :value="store.categories" :loading="store.loading" striped-rows :pt="{ root: { class: 'text-sm' } }">
          <template #empty>
            <div class="py-10 text-center text-sm text-gray-400">No categories yet.</div>
          </template>

          <Column header="Logo" :style="{ width: '90px' }">
            <template #body="{ data }: { data: Category }">
              <!-- Rendered as <img>, never inlined: scripts do not execute in an
                   img, which is the second line of defence behind sanitising. -->
              <img
                v-if="logoUrl(data.logo_path)"
                :src="logoUrl(data.logo_path)!"
                :alt="`${data.name} logo`"
                class="h-7 w-7"
              />
              <span v-else class="text-xs text-gray-300">—</span>
            </template>
          </Column>

          <Column field="name" header="Name">
            <template #body="{ data }: { data: Category }">
              <span class="font-medium text-gray-900">{{ data.name }}</span>
            </template>
          </Column>

          <Column header="Actions" :style="{ width: '120px' }">
            <template #body="{ data }: { data: Category }">
              <Button icon="pi pi-pencil" text severity="secondary" size="small" v-tooltip="'Edit'" @click="openEdit(data)" />
              <Button icon="pi pi-trash" text severity="danger" size="small" v-tooltip="'Delete'" @click="deleting = data" />
            </template>
          </Column>
        </DataTable>
      </div>
    </section>

    <!-- Edit -->
    <Dialog
      :visible="editing !== null"
      modal
      header="Edit Category"
      :style="{ width: '460px' }"
      @update:visible="closeEdit"
    >
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <InputText v-model="editName" class="w-full" placeholder="Category name" />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Logo (SVG)</label>
          <div class="flex items-center gap-3">
            <span class="grid h-12 w-12 place-items-center rounded-lg border border-gray-200 bg-gray-50">
              <img v-if="editLogoUrl" :src="editLogoUrl" alt="" class="h-7 w-7" />
              <i v-else class="pi pi-image text-gray-300" />
            </span>

            <label class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:border-indigo-400 hover:text-indigo-600">
              <i class="pi pi-upload" />
              {{ editLogo ? 'Replace' : 'Upload' }}
              <input type="file" accept=".svg,image/svg+xml" class="hidden" @change="pickLogo($event, 'edit')" />
            </label>

            <Button
              v-if="editLogo"
              label="Remove"
              text
              severity="secondary"
              size="small"
              @click="editLogo = null"
            />
          </div>
          <p class="mt-1 text-xs text-gray-500">SVG only, up to 256 KB. Shown beside the category on every website.</p>
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="closeEdit" />
        <Button label="Save" :loading="saving || uploading" :disabled="!editName.trim()" @click="saveEdit" />
      </template>
    </Dialog>

    <Dialog :visible="deleting !== null" modal header="Delete Category" :style="{ width: '400px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">Delete <strong>{{ deleting?.name }}</strong>? It will be detached from all casinos.</p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" severity="danger" :loading="deleteLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
