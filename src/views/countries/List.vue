<script setup lang="ts">
/**
 * Countries — the list casinos are attached to, grouped by continent.
 *
 * Grouped rather than one flat table because the grouping IS the model: the
 * public grid renders a heading per continent, and an admin scanning for
 * "which African countries do we cover" should see the same shape.
 *
 * A country's flag is optional. `code` alone is enough for a front end to render
 * one, so an empty image is a normal state rather than a missing field — which
 * is why nothing here warns about it.
 */
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import ImageDropzone from '@/components/ImageDropzone.vue'
import { useCountriesStore } from '@/stores/countriesStore'
import { STORAGE_BASE_URL } from '@/config/urls'
import type { Country, UpsertCountryPayload } from '@shared/types/country'

const store = useCountriesStore()
const toast = useToast()

const search = ref('')

/** Filters within each group, so a search never flattens the continent headings. */
const groups = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (term === '') return store.byContinent

  return store.byContinent
    .map((group) => ({
      continent: group.continent,
      countries: group.countries.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.code ?? '').toLowerCase().includes(term),
      ),
    }))
    .filter((group) => group.countries.length > 0)
})

const total = computed(() => store.countries.length)

// `/storage/` is the mount the public disk is served through — the same shape
// ImageDropzone builds its preview from. An absolute URL is passed through, so a
// flag hosted elsewhere still renders.
function flagUrl(country: Country): string | null {
  const path = country.image_path
  if (!path) return null
  return /^https?:\/\//.test(path) ? path : `${STORAGE_BASE_URL}/storage/${path}`
}

// ── Create / edit ────────────────────────────────────────────────────────────
const showForm = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const fieldErrors = ref<Record<string, string>>({})

interface CountryForm {
  continent_id: number | null
  name: string
  code: string
  image_path: string | null
  position: number | null
  active: boolean
}

function emptyForm(): CountryForm {
  return {
    continent_id: store.continents[0]?.id ?? null,
    name: '',
    code: '',
    image_path: null,
    // Gaps of 10 everywhere, so a new country can be slotted between two
    // existing ones without renumbering the rest.
    position: 10,
    active: true,
  }
}

const form = ref<CountryForm>(emptyForm())

function err(field: string): string {
  return fieldErrors.value[field] ?? ''
}

function openCreate(): void {
  form.value = emptyForm()
  editingId.value = null
  fieldErrors.value = {}
  showForm.value = true
}

function openEdit(country: Country): void {
  form.value = {
    continent_id: country.continent_id,
    name: country.name,
    code: country.code ?? '',
    image_path: country.image_path,
    position: country.position,
    active: country.active,
  }
  editingId.value = country.id
  fieldErrors.value = {}
  showForm.value = true
}

async function save(): Promise<void> {
  if (form.value.continent_id === null) return
  fieldErrors.value = {}
  saving.value = true
  try {
    const payload: UpsertCountryPayload = {
      continent_id: form.value.continent_id,
      name: form.value.name.trim(),
      // '' is not a valid two-letter code; null is what "no code" means.
      code: form.value.code.trim() === '' ? null : form.value.code.trim().toUpperCase(),
      image_path: form.value.image_path,
      position: form.value.position ?? 0,
      active: form.value.active,
    }
    if (editingId.value === null) await store.add(payload)
    else await store.save(editingId.value, payload)
    showForm.value = false
    toast.add({ severity: 'success', summary: 'Saved', life: 2500 })
  } catch (e: unknown) {
    const errors = (e as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data
      ?.errors
    if (errors) {
      fieldErrors.value = Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v[0] ?? '']))
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save.', life: 4000 })
    }
  } finally {
    saving.value = false
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────
const deleting = ref<Country | null>(null)
const deleteLoading = ref(false)

async function confirmDelete(): Promise<void> {
  if (deleting.value === null) return
  deleteLoading.value = true
  try {
    await store.remove(deleting.value.id)
    toast.add({ severity: 'success', summary: 'Deleted', life: 2500 })
    deleting.value = null
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not delete.', life: 4000 })
  } finally {
    deleteLoading.value = false
  }
}

onMounted(() => store.fetchCountries())
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Countries</h2>
        <p class="text-sm text-gray-500">
          Attach casinos to the countries they accept players from, on the casino's own form.
          Grouped here the way the public grid renders them.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-600">
          {{ total }} countries
        </span>
        <Button label="Add country" icon="pi pi-plus" @click="openCreate" />
      </div>
    </div>

    <InputText v-model="search" placeholder="Search name or code" class="w-72" />

    <div v-if="store.loading" class="py-10 text-center text-sm text-gray-400">Loading…</div>

    <div v-else-if="groups.length === 0" class="py-10 text-center text-sm text-gray-400">
      No countries match this search.
    </div>

    <section v-for="group in groups" :key="group.continent.id" class="space-y-2">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500">
        {{ group.continent.name }}
        <span class="ml-1 font-normal normal-case text-gray-400">({{ group.countries.length }})</span>
      </h3>

      <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <DataTable :value="group.countries" data-key="id" striped-rows>
          <Column header="" :style="{ width: '64px' }">
            <template #body="{ data }: { data: Country }">
              <img
                v-if="flagUrl(data)"
                :src="flagUrl(data) ?? ''"
                :alt="data.name"
                class="h-8 w-8 rounded-full object-cover"
              />
              <!-- No flag uploaded: the code stands in, which is all a front end
                   needs to render one anyway. -->
              <span
                v-else
                class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-400"
              >
                {{ data.code ?? '—' }}
              </span>
            </template>
          </Column>

          <Column header="Name" class="font-medium">
            <template #body="{ data }: { data: Country }">
              <span class="text-gray-900">{{ data.name }}</span>
              <span v-if="data.code" class="ml-2 text-xs text-gray-400">{{ data.code }}</span>
            </template>
          </Column>

          <Column header="Casinos" :style="{ width: '110px' }">
            <template #body="{ data }: { data: Country }">
              <span class="text-sm tabular-nums text-gray-600">{{ data.casinos_count ?? 0 }}</span>
            </template>
          </Column>

          <Column header="Order" :style="{ width: '90px' }">
            <template #body="{ data }: { data: Country }">
              <span class="text-sm tabular-nums text-gray-500">{{ data.position }}</span>
            </template>
          </Column>

          <Column header="Status" :style="{ width: '110px' }">
            <template #body="{ data }: { data: Country }">
              <Tag v-if="data.active" value="Active" severity="success" />
              <Tag v-else value="Hidden" severity="secondary" />
            </template>
          </Column>

          <Column header="Actions" :style="{ width: '110px' }">
            <template #body="{ data }: { data: Country }">
              <Button icon="pi pi-pencil" text size="small" @click="openEdit(data)" />
              <Button icon="pi pi-trash" text severity="danger" size="small" @click="deleting = data" />
            </template>
          </Column>
        </DataTable>
      </div>
    </section>

    <!-- Create / edit -->
    <Dialog
      v-model:visible="showForm"
      modal
      :header="editingId ? 'Edit country' : 'Add country'"
      :style="{ width: '520px' }"
    >
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Continent</label>
          <Select
            v-model="form.continent_id"
            :options="store.continents"
            option-label="name"
            option-value="id"
            placeholder="Select a continent"
            fluid
          />
          <p v-if="err('continent_id')" class="mt-1 text-xs text-red-600">{{ err('continent_id') }}</p>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-2">
            <label class="mb-1 block text-xs font-medium text-gray-600">Name</label>
            <InputText v-model="form.name" fluid />
            <p v-if="err('name')" class="mt-1 text-xs text-red-600">{{ err('name') }}</p>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">ISO code</label>
            <InputText v-model="form.code" maxlength="2" placeholder="DE" fluid />
            <p v-if="err('code')" class="mt-1 text-xs text-red-600">{{ err('code') }}</p>
          </div>
        </div>

        <div>
          <ImageDropzone v-model="form.image_path" label="Flag" type="image" />
          <p class="mt-1 text-xs text-gray-400">
            Optional. Without one, the front end can render a flag from the ISO code.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Order within continent</label>
            <InputNumber v-model="form.position" :min="0" :max="65535" fluid />
            <p class="mt-1 text-xs text-gray-400">Lower shows first. Seeded in tens.</p>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Visible</label>
            <div class="flex items-center gap-3 pt-1">
              <ToggleSwitch v-model="form.active" />
              <span class="text-sm text-gray-600">{{ form.active ? 'On' : 'Off' }}</span>
            </div>
          </div>
        </div>

        <p v-if="editingId" class="text-xs text-gray-400">
          The slug is fixed once created — it is part of the public URL and every cache key.
        </p>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="showForm = false" />
        <Button
          :label="editingId ? 'Save changes' : 'Add country'"
          icon="pi pi-check"
          :loading="saving"
          :disabled="!form.name.trim() || form.continent_id === null"
          @click="save"
        />
      </template>
    </Dialog>

    <!-- Delete -->
    <Dialog
      :visible="deleting !== null"
      modal
      header="Delete country"
      :style="{ width: '420px' }"
      @update:visible="deleting = null"
    >
      <p class="text-sm text-gray-700">
        Delete <strong>{{ deleting?.name }}</strong
        >? Its casino attachments go with it.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" severity="danger" :loading="deleteLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
