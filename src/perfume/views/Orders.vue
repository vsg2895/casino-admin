<script setup lang="ts">
/**
 * The order desk. Orders arrive from the storefront's order form — there is
 * no payment, so the work here is reading what was asked for, phoning the
 * number back and moving the status along.
 */
import { ref, onMounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import Paginator from 'primevue/paginator'
import { useToast } from 'primevue/usetoast'
import { listOrders, updateOrder, deleteOrder, type ProductListMeta } from '../api'
import { PERFUME_ORDER_STATUSES, type PerfumeOrder, type PerfumeOrderStatus } from '@shared/types/perfume'

const toast = useToast()
const items = ref<PerfumeOrder[]>([])
const meta = ref<ProductListMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 })
const loading = ref(false)
const search = ref('')
const status = ref<string | null>(null)
const page = ref(1)

const SEVERITY: Record<PerfumeOrderStatus, string> = {
  new: 'info',
  confirmed: 'warn',
  shipped: 'secondary',
  done: 'success',
  cancelled: 'danger',
}

const money = (v: number | null): string =>
  v === null ? '—' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const when = (v: string | null): string => (v ? new Date(v).toLocaleString() : '—')

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await listOrders({
      search: search.value || undefined,
      status: status.value ?? undefined,
      page: page.value,
      per_page: 25,
    })
    items.value = res.data
    meta.value = res.meta
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load orders.', life: 4000 })
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
watch(status, () => {
  page.value = 1
  void load()
})

// ── Detail ───────────────────────────────────────────────────────────────
const open = ref<PerfumeOrder | null>(null)
const draftStatus = ref<PerfumeOrderStatus>('new')
const saving = ref(false)

function view(order: PerfumeOrder): void {
  open.value = order
  draftStatus.value = order.status
}

async function saveStatus(): Promise<void> {
  if (!open.value) return
  saving.value = true
  try {
    await updateOrder(open.value.id, { status: draftStatus.value })
    toast.add({ severity: 'success', summary: 'Saved', detail: `Order ${open.value.reference} is now ${draftStatus.value}.`, life: 2500 })
    open.value = null
    await load()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not update the order.', life: 4000 })
  } finally {
    saving.value = false
  }
}

const deleting = ref<PerfumeOrder | null>(null)
const deleteLoading = ref(false)

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  deleteLoading.value = true
  try {
    await deleteOrder(deleting.value.id)
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Order deleted.', life: 2500 })
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
        <h2 class="text-xl font-semibold text-indigo-500">Big Glow Day · Orders</h2>
        <p class="mt-1 text-sm text-gray-500">{{ meta.total }} orders · placed from the shop's order form, paid offline</p>
      </div>
      <div class="flex flex-wrap gap-3">
        <InputText v-model="search" placeholder="Reference, name, phone, email" class="w-72" />
        <Select
          v-model="status"
          :options="PERFUME_ORDER_STATUSES"
          option-label="label"
          option-value="value"
          placeholder="Any status"
          show-clear
          class="w-44"
        />
      </div>
    </section>

    <section class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <DataTable :value="items" :loading="loading" striped-rows :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No orders yet.</div>
        </template>

        <Column header="Order" :style="{ width: '150px' }">
          <template #body="{ data }: { data: PerfumeOrder }">
            <button type="button" class="font-mono font-medium text-indigo-600 hover:underline" @click="view(data)">{{ data.reference }}</button>
            <div class="text-xs text-gray-400">{{ when(data.created_at) }}</div>
          </template>
        </Column>
        <Column header="Customer">
          <template #body="{ data }: { data: PerfumeOrder }">
            <div class="font-medium text-gray-900">{{ data.customer_name }}</div>
            <div class="text-xs text-gray-500">{{ data.phone }}<span v-if="data.email"> · {{ data.email }}</span></div>
          </template>
        </Column>
        <Column header="Items" :style="{ width: '90px' }">
          <template #body="{ data }: { data: PerfumeOrder }"><span class="text-gray-600">{{ data.items_count }}</span></template>
        </Column>
        <Column header="Total" :style="{ width: '130px' }">
          <template #body="{ data }: { data: PerfumeOrder }"><span class="text-gray-600">{{ money(data.total) }}</span></template>
        </Column>
        <Column header="Status" :style="{ width: '130px' }">
          <template #body="{ data }: { data: PerfumeOrder }">
            <Tag :severity="SEVERITY[data.status]" :value="data.status" />
          </template>
        </Column>
        <Column header="" :style="{ width: '110px' }">
          <template #body="{ data }: { data: PerfumeOrder }">
            <div class="flex justify-end gap-1">
              <Button icon="pi pi-eye" text rounded size="small" aria-label="View" @click="view(data)" />
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

    <Dialog :visible="open !== null" modal :header="open ? `Order ${open.reference}` : ''" :style="{ width: '640px', maxWidth: '95vw' }" @update:visible="open = null">
      <div v-if="open" class="space-y-4">
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div><span class="text-gray-500">Name</span><div class="font-medium text-gray-900">{{ open.customer_name }}</div></div>
          <div><span class="text-gray-500">Phone</span><div class="font-medium text-gray-900">{{ open.phone }}</div></div>
          <div><span class="text-gray-500">Email</span><div class="text-gray-900">{{ open.email ?? '—' }}</div></div>
          <div><span class="text-gray-500">Placed</span><div class="text-gray-900">{{ when(open.created_at) }}</div></div>
          <div class="col-span-2"><span class="text-gray-500">Address</span><div class="text-gray-900">{{ open.address ?? '—' }}</div></div>
        </div>

        <div v-if="open.comment">
          <span class="text-xs font-medium text-gray-600">Comment</span>
          <Textarea :model-value="open.comment" rows="2" fluid readonly auto-resize />
        </div>

        <div class="overflow-hidden rounded-lg border border-gray-200">
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="item in open.items ?? []" :key="item.id" class="border-b border-gray-100 last:border-0">
                <td class="px-3 py-2">
                  <div class="font-medium text-gray-900">{{ item.brand_name }} {{ item.product_name }}</div>
                  <div class="text-xs text-gray-500">{{ item.variant_label }}</div>
                </td>
                <td class="px-3 py-2 text-right text-gray-600">× {{ item.qty }}</td>
                <td class="px-3 py-2 text-right text-gray-900">{{ money(item.price) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between border-t border-gray-100 pt-3">
          <span class="text-sm text-gray-500">Total</span>
          <span class="font-semibold text-gray-900">{{ money(open.total) }}</span>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Status</label>
          <Select v-model="draftStatus" :options="PERFUME_ORDER_STATUSES" option-label="label" option-value="value" class="w-56" />
        </div>
      </div>
      <template #footer>
        <Button label="Close" text severity="secondary" @click="open = null" />
        <Button label="Save status" icon="pi pi-check" :loading="saving" @click="saveStatus" />
      </template>
    </Dialog>

    <Dialog :visible="deleting !== null" modal header="Delete order?" :style="{ width: '420px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-600">Order {{ deleting?.reference }} and its lines will be removed. This cannot be undone.</p>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="deleting = null" />
        <Button label="Delete" severity="danger" :loading="deleteLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
