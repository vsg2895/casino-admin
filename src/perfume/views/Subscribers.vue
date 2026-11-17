<script setup lang="ts">
/**
 * The shop's mailing list: everyone who used the subscribe form in the
 * storefront header, plus anyone added by hand here. Switching someone off
 * is the same opt-out the unsubscribe link performs — the row is kept, so
 * the address is not re-added silently by a later import.
 */
import { ref, reactive, onMounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import Paginator from 'primevue/paginator'
import { useToast } from 'primevue/usetoast'
import {
  listSubscribers,
  createSubscriber,
  updateSubscriber,
  deleteSubscriber,
  fieldErrors,
  type ProductListMeta,
} from '../api'
import type { PerfumeSubscriber } from '@shared/types/perfume'

const toast = useToast()
const items = ref<PerfumeSubscriber[]>([])
const meta = ref<ProductListMeta>({ current_page: 1, last_page: 1, per_page: 50, total: 0 })
const loading = ref(false)
const search = ref('')
const page = ref(1)

const when = (v: string | null): string => (v ? new Date(v).toLocaleDateString() : '—')

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await listSubscribers({ search: search.value || undefined, page: page.value, per_page: 50 })
    items.value = res.data
    meta.value = res.meta
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load subscribers.', life: 4000 })
  } finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})

const dialogOpen = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({ email: '', name: '', active: true })
const errors = ref<Record<string, string>>({})
const saving = ref(false)

function openCreate(): void {
  Object.assign(form, { email: '', name: '', active: true })
  editingId.value = null
  errors.value = {}
  dialogOpen.value = true
}

function openEdit(row: PerfumeSubscriber): void {
  Object.assign(form, { email: row.email, name: row.name ?? '', active: row.active })
  editingId.value = row.id
  errors.value = {}
  dialogOpen.value = true
}

async function save(): Promise<void> {
  saving.value = true
  errors.value = {}
  const payload = { email: form.email.trim(), name: form.name.trim() === '' ? null : form.name.trim(), active: form.active }
  try {
    if (editingId.value === null) await createSubscriber(payload)
    else await updateSubscriber(editingId.value, payload)
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Subscriber saved.', life: 2500 })
    dialogOpen.value = false
    await load()
  } catch (e: unknown) {
    errors.value = fieldErrors(e)
    if (Object.keys(errors.value).length === 0) {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save the subscriber.', life: 4000 })
    }
  } finally {
    saving.value = false
  }
}

const deleting = ref<PerfumeSubscriber | null>(null)
const deleteLoading = ref(false)

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  deleteLoading.value = true
  try {
    await deleteSubscriber(deleting.value.id)
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Subscriber deleted.', life: 2500 })
    deleting.value = null
    await load()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete.', life: 4000 })
  } finally {
    deleteLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <section class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold text-indigo-500">Big Glow Day · Subscribers</h2>
        <p class="mt-1 text-sm text-gray-500">{{ meta.total }} on the list · they receive what you send from Emails</p>
      </div>
      <div class="flex flex-wrap gap-3">
        <InputText v-model="search" placeholder="Search email or name" class="w-72" />
        <Button label="Add subscriber" icon="pi pi-plus" @click="openCreate" />
      </div>
    </section>

    <section class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <DataTable :value="items" :loading="loading" striped-rows :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">Nobody has subscribed yet.</div>
        </template>
        <Column field="email" header="Email">
          <template #body="{ data }: { data: PerfumeSubscriber }"><span class="font-medium text-gray-900">{{ data.email }}</span></template>
        </Column>
        <Column field="name" header="Name">
          <template #body="{ data }: { data: PerfumeSubscriber }"><span class="text-gray-600">{{ data.name ?? '—' }}</span></template>
        </Column>
        <Column header="Subscribed" :style="{ width: '130px' }">
          <template #body="{ data }: { data: PerfumeSubscriber }"><span class="text-gray-600">{{ when(data.created_at) }}</span></template>
        </Column>
        <Column header="Last email" :style="{ width: '130px' }">
          <template #body="{ data }: { data: PerfumeSubscriber }"><span class="text-gray-600">{{ when(data.last_sent_at) }}</span></template>
        </Column>
        <Column header="Status" :style="{ width: '120px' }">
          <template #body="{ data }: { data: PerfumeSubscriber }">
            <Tag :severity="data.active ? 'success' : 'secondary'" :value="data.active ? 'Subscribed' : 'Opted out'" />
          </template>
        </Column>
        <Column header="" :style="{ width: '110px' }">
          <template #body="{ data }: { data: PerfumeSubscriber }">
            <div class="flex justify-end gap-1">
              <Button icon="pi pi-pencil" text rounded size="small" aria-label="Edit" @click="openEdit(data)" />
              <Button icon="pi pi-trash" text rounded size="small" severity="danger" aria-label="Delete" @click="deleting = data" />
            </div>
          </template>
        </Column>
      </DataTable>
      <Paginator
        v-if="meta.last_page > 1"
        :rows="meta.per_page"
        :total-records="meta.total"
        :first="(meta.current_page - 1) * meta.per_page"
        @page="(e) => { page = e.page + 1; load() }"
      />
    </section>

    <Dialog v-model:visible="dialogOpen" modal :header="editingId === null ? 'New subscriber' : 'Edit subscriber'" :style="{ width: '480px', maxWidth: '95vw' }">
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Email *</label>
          <InputText v-model="form.email" fluid />
          <p v-if="errors.email" class="mt-1 text-xs text-red-600">{{ errors.email }}</p>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Name</label>
          <InputText v-model="form.name" fluid />
        </div>
        <label class="flex items-center gap-3 text-sm text-gray-700">
          <ToggleSwitch v-model="form.active" />
          Subscribed — switching this off opts them out, exactly like the link in the email
        </label>
      </div>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="dialogOpen = false" />
        <Button :label="editingId === null ? 'Create' : 'Save'" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <Dialog :visible="deleting !== null" modal header="Delete subscriber?" :style="{ width: '420px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-600">{{ deleting?.email }} will be removed from the list entirely.</p>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="deleting = null" />
        <Button label="Delete" severity="danger" :loading="deleteLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
