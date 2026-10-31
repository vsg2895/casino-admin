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
import CasinoDetailFields from '@/components/CasinoDetailFields.vue'
import SitesAttachmentTable from '@/components/attachments/SitesAttachmentTable.vue'
import type { OverrideField, AttachmentEntry } from '@/components/attachments/SitesAttachmentTable.vue'
import * as casinosApi from '@/api/casinos'
import * as attachmentsApi from '@/api/casinoAttachments'
import * as detailsApi from '@/api/casinoDetails'
import { useCasinosStore } from '@/stores/casinosStore'
import { useSitesStore } from '@/stores/sitesStore'
import BylineFields from '@/components/BylineFields.vue'
import type { BylineValue } from '@/components/BylineFields.vue'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useCountriesStore } from '@/stores/countriesStore'
import type { SpecialOffer } from '@shared/types/specialOffer'
import type { CasinoDetail } from '@shared/types/casinoDetail'
import type { ErrorResponse } from '@shared/types/api'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const store = useCasinosStore()
const categoriesStore = useCategoriesStore()
const countriesStore = useCountriesStore()
const sitesStore = useSitesStore()

const casinoId = Number(route.params.id)
const activeTab = ref('details')
const offers = ref<SpecialOffer[]>([])
const loaded = ref(false)

const form = reactive<CasinoFormModel>({
  name: '', slug: '', image_path: null, banner_image: null, bonuses: null, affiliate_url: null,
  description: null, rating: 0, sort_order: 0, featured_special_offer_id: null,
  bonuses_intro: null, reviewed_at: null, meta_title: null, meta_description: null, noindex: false, active: false, category_ids: [], country_ids: [],
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

// Per-site bylines. Casinos are shared by every site but authors are not, so
// each attached site names its own writer and reviewer.
interface SiteByline { site_id: number; site_name: string; value: BylineValue; saving: boolean }
const bylines = ref<SiteByline[]>([])

// The factual profile. Loaded and saved on its own endpoints, so the casino
// save above is completely unchanged by this feature.
const detail = ref<CasinoDetail | null>(null)
const detailSaving = ref(false)

onMounted(async () => {
  await categoriesStore.fetchCategories()
  await countriesStore.ensureLoaded()
  const [{ data: casino }, attachRes, detailRes] = await Promise.all([
    casinosApi.getCasino(casinoId),
    attachmentsApi.getCasinoAttachments(casinoId),
    // Never 404s: a casino with no profile yet returns an all-null shell.
    detailsApi.getCasinoDetail(casinoId),
  ])
  detail.value = detailRes
  Object.assign(form, {
    name: casino.name,
    slug: casino.slug,
    image_path: casino.image_path,
    banner_image: casino.banner_image,
    bonuses: casino.bonuses,
    affiliate_url: casino.affiliate_url,
    description: casino.description,
    rating: casino.rating,
    sort_order: casino.sort_order,
    featured_special_offer_id: casino.featured_special_offer_id,
    bonuses_intro: casino.bonuses_intro ?? null,
    reviewed_at: casino.reviewed_at ?? null,
    meta_title: casino.meta_title,
    meta_description: casino.meta_description,
    noindex: casino.noindex ?? false,
    active: casino.active,
    category_ids: casino.category_ids ?? [],
    country_ids: casino.country_ids ?? [],
  })
  offers.value = casino.special_offers ?? []
  await sitesStore.fetchSites()
  bylines.value = attachRes.data.map((a) => ({
    site_id: a.site_id,
    site_name: sitesStore.sites.find((s) => s.id === a.site_id)?.name ?? `Site #${a.site_id}`,
    value: { author_id: a.author_id ?? null, reviewed_by_id: a.reviewed_by_id ?? null, last_reviewed_at: a.last_reviewed_at ?? null },
    saving: false,
  }))
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

async function saveDetail(): Promise<void> {
  if (detail.value === null) return
  detailSaving.value = true
  try {
    detail.value = await detailsApi.saveCasinoDetail(casinoId, detail.value)
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Operator profile saved.', life: 3000 })
  } catch (e: unknown) {
    const data = axios.isAxiosError(e) ? (e.response?.data as ErrorResponse | undefined) : undefined
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: data?.message ?? 'Failed to save the operator profile.',
      life: 4000,
    })
  } finally {
    detailSaving.value = false
  }
}

async function saveByline(row: SiteByline): Promise<void> {
  row.saving = true
  try {
    await attachmentsApi.updateCasinoByline(casinoId, row.site_id, row.value)
    toast.add({ severity: 'success', summary: 'Saved', detail: `Byline saved for ${row.site_name}.`, life: 3000 })
  } catch (e: unknown) {
    const data = axios.isAxiosError(e) ? (e.response?.data as ErrorResponse | undefined) : undefined
    toast.add({ severity: 'error', summary: 'Error', detail: data?.message ?? 'Failed to save the byline.', life: 4000 })
  } finally {
    row.saving = false
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
        <Tab value="profile">Operator Profile</Tab>
        <Tab value="sites">Attach to Sites</Tab>
        <Tab value="bylines">Bylines</Tab>
      </TabList>
      <TabPanels class="!pt-4">
        <TabPanel value="details">
          <div class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <CasinoFormFields :form="form" :categories="categoriesStore.categories" :countries="countriesStore.countries" :offers="offers" :errors="errors" editing />
          </div>
        </TabPanel>
        <TabPanel value="profile">
          <div v-if="detail" class="space-y-4">
            <CasinoDetailFields v-model="detail" />
            <div class="flex justify-end">
              <Button label="Save profile" icon="pi pi-check" :loading="detailSaving" @click="saveDetail" />
            </div>
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
        <TabPanel value="bylines">
          <div class="space-y-4">
            <p class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Who wrote and who checked this review, per site. Name only real people who did the
              work; the byline shows on the site once that author is visible. "Last reviewed" falls
              back to the global review date on the Details tab when left empty.
            </p>
            <p v-if="bylines.length === 0" class="text-sm text-gray-400">Attach the casino to a site first (and save).</p>
            <div v-for="row in bylines" :key="row.site_id" class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="text-sm font-semibold text-gray-800">{{ row.site_name }}</h3>
                <Button label="Save byline" icon="pi pi-check" size="small" :loading="row.saving" @click="saveByline(row)" />
              </div>
              <BylineFields v-model="row.value" :site-id="row.site_id" />
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
