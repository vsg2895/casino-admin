<script setup lang="ts">
/**
 * The product editor: own fields, categories, variants (one row per
 * volume), images, the notes pyramid and SEO — saved as ONE payload
 * (backend ProductWriter replaces the nested lists it receives).
 */
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import ImageDropzone from '@/components/ImageDropzone.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import { crud, getProduct, createProduct, updateProduct, fieldErrors, slugify } from '../api'
import {
  PERFUME_TYPES,
  type PerfumeBrand,
  type PerfumeCategory,
  type PerfumeGender,
  type PerfumeNoteLayer,
  type PerfumePerfumer,
  type PerfumeProduct,
  type PerfumeScentFamily,
  type PerfumeScentNote,
  type PerfumeType,
} from '@shared/types/perfume'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const id = computed(() => (route.params.id ? Number(route.params.id) : null))
const isEdit = computed(() => id.value !== null)

interface VariantRow {
  volume_ml: number | null
  label: string
  price: number | null
  old_price: number | null
  stock: number
  is_sample: boolean
}
interface ImageRow {
  path: string | null
  alt: string
}

const form = reactive({
  brand_id: null as number | null,
  perfumer_id: null as number | null,
  scent_family_id: null as number | null,
  name: '',
  slug: '',
  sku: '',
  gender: 'women' as PerfumeGender,
  type: 'edp' as PerfumeType,
  year: null as number | null,
  country: '',
  description: '',
  tint: '',
  is_new: false,
  is_on_sale: false,
  active: true,
  category_ids: [] as number[],
  variants: [] as VariantRow[],
  images: [] as ImageRow[],
  notes: { top: [] as number[], heart: [] as number[], base: [] as number[] },
})

const brands = ref<PerfumeBrand[]>([])
const categories = ref<PerfumeCategory[]>([])
const families = ref<PerfumeScentFamily[]>([])
const perfumers = ref<PerfumePerfumer[]>([])
const scentNotes = ref<PerfumeScentNote[]>([])

const genders = [
  { label: 'Women', value: 'women' },
  { label: 'Men', value: 'men' },
  { label: 'Unisex', value: 'unisex' },
]
const types = Object.entries(PERFUME_TYPES).map(([value, label]) => ({ label, value }))
const layers: { key: PerfumeNoteLayer; label: string }[] = [
  { key: 'top', label: 'Top notes' },
  { key: 'heart', label: 'Heart notes' },
  { key: 'base', label: 'Base notes' },
]

const errors = ref<Record<string, string>>({})
const loading = ref(true)
const saving = ref(false)
const slugTouched = ref(false)

const brandName = computed(() => brands.value.find((b) => b.id === form.brand_id)?.name ?? '')
watch(
  () => `${brandName.value} ${form.name}`,
  (full) => {
    if (!isEdit.value && !slugTouched.value) form.slug = slugify(full)
  },
)

function fill(p: PerfumeProduct): void {
  Object.assign(form, {
    brand_id: p.brand_id,
    perfumer_id: p.perfumer_id,
    scent_family_id: p.scent_family_id,
    name: p.name,
    slug: p.slug,
    sku: p.sku ?? '',
    gender: p.gender,
    type: p.type,
    year: p.year,
    country: p.country ?? '',
    description: p.description ?? '',
    tint: p.tint ?? '',
    is_new: p.is_new,
    is_on_sale: p.is_on_sale,
    active: p.active,
    category_ids: [...p.category_ids],
    variants: p.variants.map((v) => ({ volume_ml: v.volume_ml, label: v.label, price: v.price, old_price: v.old_price, stock: v.stock, is_sample: v.is_sample })),
    images: p.images.map((i) => ({ path: i.path, alt: i.alt ?? '' })),
    notes: { top: p.notes.top.map((n) => n.id), heart: p.notes.heart.map((n) => n.id), base: p.notes.base.map((n) => n.id) },
  })
}

onMounted(async () => {
  try {
    ;[brands.value, categories.value, families.value, perfumers.value, scentNotes.value] = await Promise.all([
      crud<PerfumeBrand>('brands').list(),
      crud<PerfumeCategory>('categories').list(),
      crud<PerfumeScentFamily>('scent-families').list(),
      crud<PerfumePerfumer>('perfumers').list(),
      crud<PerfumeScentNote>('scent-notes').list(),
    ])
    if (id.value !== null) fill(await getProduct(id.value))
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load the product.', life: 4000 })
  } finally {
    loading.value = false
  }
})

function addVariant(sample = false): void {
  form.variants.push({ volume_ml: sample ? 2 : null, label: sample ? '2 ml sample' : '', price: null, old_price: null, stock: 0, is_sample: sample })
}

function labelFor(v: VariantRow): void {
  if (!v.is_sample && v.volume_ml && v.label === '') v.label = `${v.volume_ml} ml`
}

const nul = (s: string): string | null => (s.trim() === '' ? null : s.trim())

async function save(): Promise<void> {
  saving.value = true
  errors.value = {}
  const payload: Record<string, unknown> = {
    brand_id: form.brand_id,
    perfumer_id: form.perfumer_id,
    scent_family_id: form.scent_family_id,
    name: form.name,
    slug: form.slug,
    sku: nul(form.sku),
    gender: form.gender,
    type: form.type,
    year: form.year,
    country: nul(form.country),
    description: nul(form.description),
    tint: nul(form.tint),
    is_new: form.is_new,
    is_on_sale: form.is_on_sale,
    active: form.active,
    category_ids: form.category_ids,
    variants: form.variants.map((v) => ({ ...v, label: v.label.trim() })),
    images: form.images.filter((i) => i.path).map((i) => ({ path: i.path, alt: nul(i.alt) })),
    notes: layers.flatMap((l) => form.notes[l.key].map((noteId) => ({ scent_note_id: noteId, layer: l.key }))),
  }
  try {
    if (id.value === null) {
      const created = await createProduct(payload)
      toast.add({ severity: 'success', summary: 'Created', detail: 'Product created.', life: 2500 })
      await router.replace({ name: 'perfume-product-edit', params: { id: created.id } })
    } else {
      fill(await updateProduct(id.value, payload))
      toast.add({ severity: 'success', summary: 'Saved', detail: 'Product updated.', life: 2500 })
    }
  } catch (e: unknown) {
    errors.value = fieldErrors(e)
    toast.add({ severity: 'error', summary: 'Not saved', detail: Object.values(errors.value)[0] ?? 'Could not save the product.', life: 5000 })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="!loading" class="space-y-6">
    <section class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold text-indigo-500">{{ isEdit ? `${brandName} ${form.name}` : 'New product' }}</h2>
        <p class="mt-1 text-sm text-gray-500">Big Glow Day · Products</p>
      </div>
      <div class="flex gap-2">
        <Button label="Back" text severity="secondary" icon="pi pi-arrow-left" @click="router.push({ name: 'perfume-products' })" />
        <Button label="Save" icon="pi pi-check" :loading="saving" @click="save" />
      </div>
    </section>

    <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 class="mb-3 text-sm font-semibold text-gray-800">Product</h3>
      <div class="grid gap-4 md:grid-cols-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Brand *</label>
          <Select v-model="form.brand_id" :options="brands" option-label="name" option-value="id" fluid placeholder="Choose a brand" filter />
          <p v-if="errors.brand_id" class="mt-1 text-xs text-red-600">{{ errors.brand_id }}</p>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Name *</label>
          <InputText v-model="form.name" fluid />
          <p v-if="errors.name" class="mt-1 text-xs text-red-600">{{ errors.name }}</p>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Slug *</label>
          <InputText v-model="form.slug" fluid @input="slugTouched = true" />
          <p v-if="errors.slug" class="mt-1 text-xs text-red-600">{{ errors.slug }}</p>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Gender *</label>
          <Select v-model="form.gender" :options="genders" option-label="label" option-value="value" fluid />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Type *</label>
          <Select v-model="form.type" :options="types" option-label="label" option-value="value" fluid />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">SKU</label>
          <InputText v-model="form.sku" fluid placeholder="Empty = not shown" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Scent family</label>
          <Select v-model="form.scent_family_id" :options="families" option-label="name" option-value="id" fluid show-clear placeholder="—" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Perfumer</label>
          <Select v-model="form.perfumer_id" :options="perfumers" option-label="name" option-value="id" fluid show-clear placeholder="—" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Year</label>
          <InputNumber v-model="form.year" fluid :use-grouping="false" :min="1800" :max="2100" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Country</label>
          <InputText v-model="form.country" fluid />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Placeholder tint</label>
          <div class="flex items-center gap-2">
            <input type="color" :value="form.tint || '#2E2E3A'" class="h-9 w-12 cursor-pointer rounded border border-gray-300" @input="form.tint = ($event.target as HTMLInputElement).value" />
            <InputText v-model="form.tint" class="w-32" placeholder="#5B6EA8" />
          </div>
          <p class="mt-1 text-xs text-gray-400">Bottle colour when there is no photo.</p>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Categories</label>
          <MultiSelect v-model="form.category_ids" :options="categories" option-label="name" option-value="id" fluid placeholder="—" display="chip" />
        </div>
        <div class="md:col-span-3">
          <label class="mb-1 block text-xs font-medium text-gray-600">Description</label>
          <RichTextEditor v-model="form.description" />
        </div>
        <div class="flex flex-wrap gap-6 md:col-span-3">
          <label class="flex items-center gap-2 text-sm text-gray-700"><ToggleSwitch v-model="form.is_new" /> New arrival</label>
          <label class="flex items-center gap-2 text-sm text-gray-700"><ToggleSwitch v-model="form.is_on_sale" /> On sale</label>
          <label class="flex items-center gap-2 text-sm text-gray-700"><ToggleSwitch v-model="form.active" /> Active</label>
        </div>
      </div>
    </section>

    <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-800">Variants (volumes)</h3>
        <div class="flex gap-2">
          <Button label="Add sample" icon="pi pi-plus" size="small" text @click="addVariant(true)" />
          <Button label="Add volume" icon="pi pi-plus" size="small" text @click="addVariant(false)" />
        </div>
      </div>
      <p v-if="form.variants.length === 0" class="text-xs text-gray-400">No volumes yet — the product cannot be bought without one.</p>
      <div v-for="(v, i) in form.variants" :key="i" class="mb-2 grid grid-cols-[90px_1fr_120px_120px_90px_90px_40px] items-end gap-2">
        <div><label class="text-[11px] text-gray-500">ml</label><InputNumber v-model="v.volume_ml" fluid :use-grouping="false" :min="1" @update:model-value="labelFor(v)" /></div>
        <div><label class="text-[11px] text-gray-500">Label</label><InputText v-model="v.label" fluid placeholder="100 ml" /></div>
        <div><label class="text-[11px] text-gray-500">Price $</label><InputNumber v-model="v.price" fluid :use-grouping="false" :min="0" :max-fraction-digits="2" placeholder="—" /></div>
        <div><label class="text-[11px] text-gray-500">Old price $</label><InputNumber v-model="v.old_price" fluid :use-grouping="false" :min="0" :max-fraction-digits="2" placeholder="—" /></div>
        <div><label class="text-[11px] text-gray-500">Stock</label><InputNumber v-model="v.stock" fluid :use-grouping="false" :min="0" /></div>
        <label class="flex items-center gap-1 pb-2 text-xs text-gray-600"><ToggleSwitch v-model="v.is_sample" /> Sample</label>
        <Button icon="pi pi-trash" text severity="danger" size="small" aria-label="Remove" @click="form.variants.splice(i, 1)" />
      </div>
      <p v-if="errors.variants" class="mt-1 text-xs text-red-600">{{ errors.variants }}</p>
    </section>

    <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-800">Images</h3>
        <Button label="Add image" icon="pi pi-plus" size="small" text @click="form.images.push({ path: null, alt: '' })" />
      </div>
      <p v-if="form.images.length === 0" class="text-xs text-gray-400">No photos — the storefront shows the bottle placeholder in the tint colour.</p>
      <div class="grid gap-4 md:grid-cols-3">
        <div v-for="(img, i) in form.images" :key="i" class="space-y-2 rounded-lg border border-gray-100 p-3">
          <ImageDropzone v-model="img.path" :label="`Image ${i + 1}`" />
          <InputText v-model="img.alt" fluid placeholder="Alt text" />
          <Button label="Remove" icon="pi pi-trash" text severity="danger" size="small" @click="form.images.splice(i, 1)" />
        </div>
      </div>
    </section>

    <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 class="mb-3 text-sm font-semibold text-gray-800">Notes pyramid</h3>
      <div class="grid gap-4 md:grid-cols-3">
        <div v-for="l in layers" :key="l.key">
          <label class="mb-1 block text-xs font-medium text-gray-600">{{ l.label }}</label>
          <MultiSelect v-model="form.notes[l.key]" :options="scentNotes" option-label="name" option-value="id" fluid filter display="chip" placeholder="—" />
        </div>
      </div>
      <p class="mt-2 text-xs text-gray-400">Missing a note? Add it under Scent notes first.</p>
    </section>

    <div class="flex justify-end">
      <Button label="Save" icon="pi pi-check" :loading="saving" @click="save" />
    </div>
  </div>
  <p v-else class="text-sm text-gray-400">Loading…</p>
</template>
