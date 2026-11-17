<script setup lang="ts">
/**
 * A table plus a create / edit dialog for one perfume resource, driven by a
 * list of FieldDefs: brands, categories, notes, families, perfumers, home
 * cards, nav items, stores and pages all use it. Products have their own
 * editor (views/ProductEdit.vue).
 *
 * `fixed` are values written on every save and used to filter the list —
 * how one resource (home-cards, nav-items) is shown as two tables.
 */
import { ref, reactive, computed, onMounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import FieldInput from './FieldInput.vue'
import { blankForm, toPayload, type FieldDef, type FormState, type FieldValue } from './fields'
import { crud, fieldErrors, slugify, type PerfumeResource } from '../api'

interface Row {
  id: number
  [key: string]: FieldValue | undefined
}

const props = defineProps<{
  title: string
  subtitle?: string
  resource: PerfumeResource
  fields: FieldDef[]
  fixed?: Record<string, FieldValue>
  addLabel?: string
  itemName?: string
}>()

const api = crud<Row>(props.resource)
const toast = useToast()
const noun = computed(() => props.itemName ?? 'item')

const items = ref<Row[]>([])
const loading = ref(false)

const visibleItems = computed(() =>
  items.value.filter((row) => !props.fixed || Object.entries(props.fixed).every(([k, v]) => row[k] === v)),
)

const columns = computed(() => props.fields.filter((f) => f.column))

async function load(): Promise<void> {
  loading.value = true
  try {
    items.value = await api.list()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: `Could not load ${props.title.toLowerCase()}.`, life: 4000 })
  } finally {
    loading.value = false
  }
}

// ── Dialog ───────────────────────────────────────────────────────────────
const dialogOpen = ref(false)
const editingId = ref<number | null>(null)
const form = reactive<FormState>(blankForm(props.fields))
const errors = ref<Record<string, string>>({})
const saving = ref(false)
const slugTouched = ref(false)

const slugField = computed(() => props.fields.find((f) => f.slugFrom))

function openCreate(): void {
  Object.assign(form, blankForm(props.fields))
  editingId.value = null
  errors.value = {}
  slugTouched.value = false
  dialogOpen.value = true
}

function openEdit(row: Row): void {
  const next = blankForm(props.fields)
  for (const f of props.fields) {
    const v = row[f.key]
    if (v !== undefined) next[f.key] = v
  }
  Object.assign(form, next)
  editingId.value = row.id
  errors.value = {}
  slugTouched.value = true
  dialogOpen.value = true
}

// Auto-slug while creating, until the admin edits the slug by hand.
watch(
  () => (slugField.value?.slugFrom ? form[slugField.value.slugFrom] : null),
  (source) => {
    if (editingId.value !== null || slugTouched.value || !slugField.value || typeof source !== 'string') return
    form[slugField.value.key] = slugify(source)
  },
)

function onFieldInput(key: string, value: FieldValue): void {
  if (slugField.value && key === slugField.value.key) slugTouched.value = true
  form[key] = value
}

async function save(): Promise<void> {
  saving.value = true
  errors.value = {}
  try {
    const payload = { ...toPayload(form), ...(props.fixed ?? {}) }
    if (editingId.value === null) {
      await api.create(payload)
      toast.add({ severity: 'success', summary: 'Added', detail: `The ${noun.value} was created.`, life: 2500 })
    } else {
      await api.update(editingId.value, payload)
      toast.add({ severity: 'success', summary: 'Saved', detail: `The ${noun.value} was updated.`, life: 2500 })
    }
    dialogOpen.value = false
    await load()
  } catch (e: unknown) {
    errors.value = fieldErrors(e)
    if (Object.keys(errors.value).length === 0) {
      toast.add({ severity: 'error', summary: 'Error', detail: `Could not save the ${noun.value}.`, life: 4000 })
    }
  } finally {
    saving.value = false
  }
}

// ── Delete ───────────────────────────────────────────────────────────────
const deleting = ref<Row | null>(null)
const deleteLoading = ref(false)

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  deleteLoading.value = true
  try {
    await api.remove(deleting.value.id)
    toast.add({ severity: 'success', summary: 'Deleted', detail: `The ${noun.value} was deleted.`, life: 2500 })
    deleting.value = null
    await load()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete.', life: 4000 })
  } finally {
    deleteLoading.value = false
  }
}

function cell(row: Row, field: FieldDef): string {
  const v = row[field.key]
  if (v === null || v === undefined || v === '') return '—'
  if (field.type === 'select') return String(field.options?.find((o) => o.value === v)?.label ?? v)
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <section class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold text-indigo-500">{{ title }}</h2>
        <p v-if="subtitle" class="mt-1 text-sm text-gray-500">{{ subtitle }}</p>
      </div>
      <Button :label="addLabel ?? 'Add'" icon="pi pi-plus" @click="openCreate" />
    </section>

    <section class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <DataTable :value="visibleItems" :loading="loading" striped-rows :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">Nothing here yet.</div>
        </template>

        <Column v-for="f in columns" :key="f.key" :header="f.label">
          <template #body="{ data }: { data: Row }">
            <Tag v-if="f.type === 'toggle'" :severity="data[f.key] ? 'success' : 'secondary'" :value="data[f.key] ? 'Yes' : 'No'" />
            <img v-else-if="f.type === 'image' && data[f.key + '_url']" :src="String(data[f.key + '_url'])" alt="" class="h-8 w-8 rounded object-cover" />
            <span v-else :class="f.key === 'name' || f.key === 'title' || f.key === 'label' ? 'font-medium text-gray-900' : 'text-gray-600'">{{ cell(data, f) }}</span>
          </template>
        </Column>

        <Column header="" :style="{ width: '110px' }">
          <template #body="{ data }: { data: Row }">
            <div class="flex justify-end gap-1">
              <Button icon="pi pi-pencil" text rounded size="small" aria-label="Edit" @click="openEdit(data)" />
              <Button icon="pi pi-trash" text rounded size="small" severity="danger" aria-label="Delete" @click="deleting = data" />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <Dialog v-model:visible="dialogOpen" modal :header="editingId === null ? `New ${noun}` : `Edit ${noun}`" :style="{ width: '640px', maxWidth: '95vw' }">
      <div class="space-y-4">
        <FieldInput
          v-for="f in fields"
          :key="f.key"
          :field="f"
          :model-value="form[f.key] ?? null"
          :error="errors[f.key]"
          @update:model-value="onFieldInput(f.key, $event)"
        />
      </div>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="dialogOpen = false" />
        <Button :label="editingId === null ? 'Create' : 'Save'" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <Dialog :visible="deleting !== null" modal header="Delete?" :style="{ width: '420px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-600">This {{ noun }} will be removed from the store. This cannot be undone.</p>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="deleting = null" />
        <Button label="Delete" severity="danger" :loading="deleteLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
