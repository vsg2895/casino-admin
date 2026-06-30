<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Popover from 'primevue/popover'
import { useToast } from 'primevue/usetoast'
import { useSpecialOffersStore } from '@/stores/specialOffersStore'
import * as offersApi from '@/api/specialOffers'
import type { SpecialOffer } from '@shared/types/specialOffer'
import type { CasinoSiteRow } from '@shared/types/casino'

const router = useRouter()
const toast = useToast()
const store = useSpecialOffersStore()

const search = ref('')
const filtered = computed(() =>
  store.offers.filter((o) => o.title.toLowerCase().includes(search.value.toLowerCase())),
)

const storageBase = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1').replace(/\/api\/v1\/?$/, '')
function img(path: string | null): string | null {
  if (!path) return null
  return /^https?:\/\//.test(path) ? path : `${storageBase}/storage/${path}`
}

const deleting = ref<SpecialOffer | null>(null)
const deleteLoading = ref(false)
async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  deleteLoading.value = true
  try {
    await offersApi.deleteSpecialOffer(deleting.value.id)
    store.remove(deleting.value.id)
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Special offer deleted.', life: 2500 })
    deleting.value = null
  } finally {
    deleteLoading.value = false
  }
}

// ── Copy public single-page link ───────────────────────────────────────────────
// An offer's casino can be attached to several sites; each site exposes the offer
// at https://{site domain}/special-offers/{slug}. One site → copy directly;
// many → open a per-site picker; none → the button is disabled.
const linkPopover = ref<{ toggle: (e: Event) => void; hide: () => void } | null>(null)
const popoverOffer = ref<SpecialOffer | null>(null)

function offerSites(offer: SpecialOffer): CasinoSiteRow[] {
  return offer.casino?.sites?.filter((s) => s.active) ?? []
}

function offerUrl(offer: SpecialOffer, site: CasinoSiteRow): string {
  // site_url is the site's Next.js origin (local dev host while developing).
  return `${site.site_url}/special-offers/${offer.slug}`
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ severity: 'success', summary: 'Link copied', detail: text, life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not copy to clipboard.', life: 3000 })
  }
}

function copyLink(offer: SpecialOffer, event: Event): void {
  const sites = offerSites(offer)
  if (sites.length === 0) return
  if (sites.length === 1) {
    void copyText(offerUrl(offer, sites[0]))
    return
  }
  popoverOffer.value = offer
  linkPopover.value?.toggle(event)
}

function copyFromPopover(site: CasinoSiteRow): void {
  if (!popoverOffer.value) return
  void copyText(offerUrl(popoverOffer.value, site))
  linkPopover.value?.hide()
}

async function duplicate(offer: SpecialOffer): Promise<void> {
  try {
    const res = await offersApi.duplicateSpecialOffer(offer.id)
    store.upsert(res.data)
    toast.add({ severity: 'success', summary: 'Duplicated', detail: `${res.data.title} created.`, life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to duplicate.', life: 4000 })
  }
}

onMounted(() => store.fetchOffers())
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-xl font-semibold text-indigo-500">Special Offers</h2>
      <div class="flex items-center gap-2">
        <InputText v-model="search" placeholder="Search by name" class="w-64" />
        <Button label="Create" icon="pi pi-plus" @click="router.push({ name: 'special-offers-create' })" />
      </div>
    </div>

    <div v-if="store.loading" class="py-12 text-center text-sm text-gray-400">Loading…</div>
    <div v-else-if="filtered.length === 0" class="py-12 text-center text-sm text-gray-400">No special offers yet.</div>

    <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <div v-for="offer in filtered" :key="offer.id" class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div class="aspect-video bg-gray-100">
          <img v-if="img(offer.banner_image) || img(offer.image_path)" :src="img(offer.banner_image) ?? img(offer.image_path) ?? ''" alt="" class="h-full w-full object-cover" />
        </div>
        <div class="space-y-2 p-3">
          <p class="truncate font-semibold text-gray-900">{{ offer.title }}</p>
          <p class="text-xs text-gray-500">Rating: {{ '★'.repeat(offer.rating) }}{{ '☆'.repeat(5 - offer.rating) }}</p>
          <div class="flex items-center gap-1 pt-1">
            <Button icon="pi pi-pencil" size="small" text severity="secondary" v-tooltip="'Edit'" @click="router.push({ name: 'special-offers-edit', params: { id: offer.id } })" />
            <Button icon="pi pi-trash" size="small" text severity="danger" v-tooltip="'Delete'" @click="deleting = offer" />
            <Button icon="pi pi-copy" size="small" text severity="secondary" v-tooltip="'Duplicate'" @click="duplicate(offer)" />
            <Button
              icon="pi pi-link"
              size="small"
              text
              severity="secondary"
              :disabled="offerSites(offer).length === 0"
              v-tooltip="offerSites(offer).length === 0 ? 'Not attached to any site' : 'Copy public link'"
              @click="copyLink(offer, $event)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Per-site public-link picker (shown when an offer's casino is on multiple sites) -->
    <Popover ref="linkPopover">
      <div v-if="popoverOffer" class="w-72">
        <p class="px-1 pb-2 text-xs font-semibold text-gray-500">Copy public link for…</p>
        <button
          v-for="site in offerSites(popoverOffer)"
          :key="site.site_id"
          type="button"
          class="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-gray-100"
          @click="copyFromPopover(site)"
        >
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium text-gray-800">{{ site.site_name }}</span>
            <span class="block truncate text-xs text-gray-400">{{ offerUrl(popoverOffer, site) }}</span>
          </span>
          <i class="pi pi-copy text-gray-400" />
        </button>
      </div>
    </Popover>

    <Dialog :visible="deleting !== null" modal header="Delete Special Offer" :style="{ width: '400px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">Delete <strong>{{ deleting?.title }}</strong>?</p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" severity="danger" :loading="deleteLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
