<script setup lang="ts">
import { ref, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { useCategoriesStore } from '@/stores/categoriesStore'
import type { Category } from '@shared/types/category'

const store = useCategoriesStore()
const toast = useToast()

const name = ref('')
const adding = ref(false)

async function add(): Promise<void> {
  if (!name.value.trim()) return
  adding.value = true
  try {
    await store.add(name.value.trim())
    name.value = ''
    toast.add({ severity: 'success', summary: 'Added', detail: 'Category created.', life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to add category.', life: 4000 })
  } finally {
    adding.value = false
  }
}

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
      <form class="flex gap-3" @submit.prevent="add">
        <InputText v-model="name" class="flex-1" placeholder="Category name" />
        <Button type="submit" label="Send" :loading="adding" :disabled="!name.trim()" />
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

          <Column field="name" header="Name">
            <template #body="{ data }: { data: Category }">
              <span class="font-medium text-gray-900">{{ data.name }}</span>
            </template>
          </Column>

          <Column header="Actions" :style="{ width: '120px' }">
            <template #body="{ data }: { data: Category }">
              <Button icon="pi pi-trash" text severity="danger" size="small" v-tooltip="'Delete'" @click="deleting = data" />
            </template>
          </Column>
        </DataTable>
      </div>
    </section>

    <Dialog :visible="deleting !== null" modal header="Delete Category" :style="{ width: '400px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">Delete <strong>{{ deleting?.name }}</strong>? It will be detached from all casinos.</p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" severity="danger" :loading="deleteLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
