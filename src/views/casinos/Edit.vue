<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import CasinoFormFields from '@/components/CasinoFormFields.vue'
import type { CasinoFormModel } from '@/components/CasinoFormFields.vue'
import SitesAttachmentTable from '@/components/attachments/SitesAttachmentTable.vue'
import type { OverrideField, AttachmentEntry } from '@/components/attachments/SitesAttachmentTable.vue'
import * as casinosApi from '@/api/casinos'
import * as attachmentsApi from '@/api/casinoAttachments'
import { useCasinosStore } from '@/stores/casinosStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import type { SpecialOffer } from '@shared/types/specialOffer'
import type { ErrorResponse } from '@shared/types/api'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const store = useCasinosStore()
const categoriesStore = useCategoriesStore()

const casinoId = Number(route.params.id)
const activeTab = ref('details')
const offers = ref<SpecialOffer[]>([])
const loaded = ref(false)

const form = reactive<CasinoFormModel>({
  name: '', image_path: null, banner_image: null, bonuses: null, affiliate_url: null,
  description: null, rating: 0, sort_order: 0, featured_special_offer_id: null,
  meta_title: null, meta_description: null, active: false, category_ids: [],
})

const saving = ref(false)
const errors = ref<Record<string, string>>({})
const formError = ref<string | null>(null)

// Attachments
const CASINO_OVERRIDE_FIELDS: OverrideField[] = [
  { name: 'affiliate_url', label: 'Affiliate URL', type: 'url', placeholder: 'https://…' },
  { name: 'position', label: 'Position', type: 'number' },
  { name: 'featured', label: 'Featured', type: 'boolean' },
]
const attachments = ref<AttachmentEntry[]>([])
const attachSaving = ref(false)

onMounted(async () => {
  await categoriesStore.fetchCategories()
  const [{ data: casino }, attachRes] = await Promise.all([
    casinosApi.getCasino(casinoId),
    attachmentsApi.getCasinoAttachments(casinoId),
  ])
  Object.assign(form, {
    name: casino.name,
    image_path: casino.image_path,
    banner_image: casino.banner_image,
    bonuses: casino.bonuses,
    affiliate_url: casino.affiliate_url,
    description: casino.description,
    rating: casino.rating,
    sort_order: casino.sort_order,
    featured_special_offer_id: casino.featured_special_offer_id,
    meta_title: casino.meta_title,
    meta_description: casino.meta_description,
    active: casino.active,
    category_ids: casino.category_ids ?? [],
  })
  offers.value = casino.special_offers ?? []
  attachments.value = attachRes.data.map((a) => ({
    site_id: a.site_id,
    affiliate_url: a.affiliate_url,
    position: a.position,
    featured: a.featured,
  }))
  loaded.value = true
})

async function save(): Promise<void> {
  errors.value = {}
  formError.value = null
  saving.value = true
  try {
    const response = await casinosApi.updateCasino(casinoId, { ...form })
    store.upsert(response.data)
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Product updated.', life: 3000 })
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as ErrorResponse
      formError.value = data.message
      for (const [field, messages] of Object.entries(data.errors ?? {})) {
        errors.value[field] = messages[0] ?? ''
      }
    } else {
      formError.value = 'Failed to update product.'
    }
  } finally {
    saving.value = false
  }
}

async function saveAttachments(): Promise<void> {
  attachSaving.value = true
  try {
    await attachmentsApi.syncCasinoAttachments(
      casinoId,
      attachments.value.map((a) => ({
        site_id: a.site_id,
        affiliate_url: String(a.affiliate_url ?? ''),
        position: Number(a.position ?? 0),
        featured: Boolean(a.featured ?? false),
      })),
    )
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Site attachments saved.', life: 3000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save attachments.', life: 4000 })
  } finally {
    attachSaving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <Button label="Cancel" icon="pi pi-arrow-left" text severity="secondary" @click="router.push({ name: 'casinos' })" />
      <h2 class="text-lg font-semibold text-gray-900">Edit Product</h2>
      <Button label="Update" icon="pi pi-check" :loading="saving" @click="save" />
    </div>

    <div v-if="formError" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{{ formError }}</div>

    <Tabs v-if="loaded" v-model:value="activeTab">
      <TabList>
        <Tab value="details">Details</Tab>
        <Tab value="sites">Attach to Sites</Tab>
      </TabList>
      <TabPanels class="!pt-4">
        <TabPanel value="details">
          <div class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <CasinoFormFields :form="form" :categories="categoriesStore.categories" :offers="offers" :errors="errors" />
          </div>
        </TabPanel>
        <TabPanel value="sites">
          <div class="space-y-4">
            <SitesAttachmentTable
              v-model="attachments"
              entity-type="casino"
              :entity-id="casinoId"
              :override-fields="CASINO_OVERRIDE_FIELDS"
            />
            <div class="flex justify-end">
              <Button label="Save Attachments" icon="pi pi-check" :loading="attachSaving" @click="saveAttachments" />
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
