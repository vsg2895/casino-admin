<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import Paginator from 'primevue/paginator'
import { useToast } from 'primevue/usetoast'
import { listProducts, deleteProduct, crud, type ProductListMeta } from '../api'
import type { PerfumeBrand, PerfumeProduct } from '@shared/types/perfume'

const router = useRouter()
const toast = useToast()

const items = ref<PerfumeProduct[]>([])
const meta = ref<ProductListMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 })
const loading = ref(false)
const search = ref('')
const brandId = ref<number | null>(null)
const gender = ref<string | null>(null)
const page = ref(1)
const brands = ref<PerfumeBrand[]>([])

const genders = [
  { label: 'Women', value: 'women' },
  { label: 'Men', value: 'men' },
  { label: 'Unisex', value: 'unisex' },
]

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await listProducts({
      search: search.value || undefined,
      brand_id: brandId.value ?? undefined,
      gender: gender.value ?? undefined,
      page: page.value,
      per_page: 25,
    })
    items.value = res.data
    meta.value = res.meta
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load products.', life: 4000 })
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
watch([brandId, gender], () => {
  page.value = 1
  void load()
})

const deleting = ref<PerfumeProduct | null>(null)
const deleteLoading = ref(false)

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  deleteLoading.value = true
  try {
    await deleteProduct(deleting.value.id)
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Product deleted.', life: 2500 })
    deleting.value = null
    await load()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete.', life: 4000 })
  } finally {
    deleteLoading.value = false
  }
}

function priceOf(p: PerfumeProduct): string {
  const priced = p.variants.filter((v) => !v.is_sample && v.price !== null).sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0]
  return priced?.price != null ? priced.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—'
}

onMounted(async () => {
  brands.value = await crud<PerfumeBrand>('brands').list().catch(() => [])
  await load()
})
</script>

<template>
  <div class="space-y-4">
    <section class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold text-indigo-500">Big Glow Day · Products</h2>
        <p class="mt-1 text-sm text-gray-500">{{ meta.total }} products</p>
      </div>
      <Button label="Add product" icon="pi pi-plus" @click="router.push({ name: 'perfume-product-create' })" />
    </section>

    <section class="flex flex-wrap gap-3">
      <InputText v-model="search" placeholder="Search name, brand, SKU" class="w-72" />
      <Select v-model="brandId" :options="brands" option-label="name" option-value="id" placeholder="All brands" show-clear class="w-56" />
      <Select v-model="gender" :options="genders" option-label="label" option-value="value" placeholder="Any gender" show-clear class="w-44" />
    </section>

    <section class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <DataTable :value="items" :loading="loading" striped-rows :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No products.</div>
        </template>
        <Column header="Product">
          <template #body="{ data }: { data: PerfumeProduct }">
            <div class="flex items-center gap-3">
              <img v-if="data.images[0]?.url" :src="data.images[0].url" alt="" class="h-10 w-10 rounded object-cover" />
              <span v-else class="h-10 w-10 rounded" :style="{ background: data.tint ?? '#2E2E3A' }" />
              <div>
                <div class="font-medium text-gray-900">{{ data.brand?.name }} {{ data.name }}</div>
                <div class="text-xs text-gray-500">{{ data.type_label }} · {{ data.gender }} · {{ data.sku ?? 'no SKU' }}</div>
              </div>
            </div>
          </template>
        </Column>
        <Column header="Price from" :style="{ width: '130px' }">
          <template #body="{ data }: { data: PerfumeProduct }"><span class="text-gray-600">{{ priceOf(data) }}</span></template>
        </Column>
        <Column header="Volumes" :style="{ width: '220px' }">
          <template #body="{ data }: { data: PerfumeProduct }"><span class="text-gray-600">{{ data.variants.map((v) => v.label).join(', ') || '—' }}</span></template>
        </Column>
        <Column header="Flags" :style="{ width: '200px' }">
          <template #body="{ data }: { data: PerfumeProduct }">
            <div class="flex flex-wrap gap-1">
              <Tag v-if="data.is_new" value="New" severity="info" />
              <Tag v-if="data.is_on_sale" value="Sale" severity="warn" />
              <Tag :value="data.active ? 'Active' : 'Hidden'" :severity="data.active ? 'success' : 'secondary'" />
            </div>
          </template>
        </Column>
        <Column header="" :style="{ width: '110px' }">
          <template #body="{ data }: { data: PerfumeProduct }">
            <div class="flex justify-end gap-1">
              <Button icon="pi pi-pencil" text rounded size="small" aria-label="Edit" @click="router.push({ name: 'perfume-product-edit', params: { id: data.id } })" />
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

    <Dialog :visible="deleting !== null" modal header="Delete product?" :style="{ width: '420px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-600">{{ deleting?.brand?.name }} {{ deleting?.name }} and its variants, images and notes will be removed.</p>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="deleting = null" />
        <Button label="Delete" severity="danger" :loading="deleteLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
