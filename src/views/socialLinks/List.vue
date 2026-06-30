<script setup lang="ts">
import { ref, computed, reactive, onMounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import { useSocialLinksStore } from '@/stores/socialLinksStore'
import { useSitesStore } from '@/stores/sitesStore'
import type { SocialLink, SocialPlatform } from '@shared/types/socialLink'

// Keep in sync with App\Models\SocialLink::PLATFORMS (backend) and the site icon maps.
const PLATFORMS: { label: string; value: SocialPlatform; icon: string }[] = [
  { label: 'Facebook', value: 'facebook', icon: 'pi-facebook' },
  { label: 'Twitter / X', value: 'twitter', icon: 'pi-twitter' },
  { label: 'Instagram', value: 'instagram', icon: 'pi-instagram' },
  { label: 'YouTube', value: 'youtube', icon: 'pi-youtube' },
  { label: 'TikTok', value: 'tiktok', icon: 'pi-hashtag' },
  { label: 'Telegram', value: 'telegram', icon: 'pi-telegram' },
  { label: 'Discord', value: 'discord', icon: 'pi-discord' },
  { label: 'LinkedIn', value: 'linkedin', icon: 'pi-linkedin' },
  { label: 'Twitch', value: 'twitch', icon: 'pi-twitch' },
  { label: 'Reddit', value: 'reddit', icon: 'pi-reddit' },
]

const platformIcon = (p: string): string => PLATFORMS.find((x) => x.value === p)?.icon ?? 'pi-link'
const platformLabel = (p: string): string => PLATFORMS.find((x) => x.value === p)?.label ?? p

const store = useSocialLinksStore()
const sitesStore = useSitesStore()
const toast = useToast()

const siteId = ref<number | null>(null)
const siteOptions = computed(() => sitesStore.sites.map((s) => ({ label: `${s.name} (${s.domain})`, value: s.id })))

// ── Create / edit dialog ─────────────────────────────────────────────────
interface FormState {
  id: number | null
  site_id: number | null
  platform: SocialPlatform
  label: string
  url: string
  sort_order: number
  active: boolean
}

const blankForm = (): FormState => ({
  id: null,
  site_id: siteId.value,
  platform: 'facebook',
  label: '',
  url: '',
  sort_order: 0,
  active: true,
})

const form = reactive<FormState>(blankForm())
const dialogOpen = ref(false)
const saving = ref(false)
const isEdit = computed(() => form.id !== null)

function openCreate(): void {
  Object.assign(form, blankForm())
  dialogOpen.value = true
}

function openEdit(link: SocialLink): void {
  Object.assign(form, {
    id: link.id,
    site_id: link.site_id,
    platform: link.platform,
    label: link.label ?? '',
    url: link.url,
    sort_order: link.sort_order,
    active: link.active,
  })
  dialogOpen.value = true
}

const canSave = computed(() => !!form.site_id && !!form.platform && form.url.trim().length > 0)

async function save(): Promise<void> {
  if (!canSave.value || !form.site_id) return
  saving.value = true
  try {
    const label = form.label.trim() === '' ? null : form.label.trim()
    if (form.id === null) {
      await store.add({
        site_id: form.site_id,
        platform: form.platform,
        label,
        url: form.url.trim(),
        sort_order: form.sort_order,
        active: form.active,
      })
      toast.add({ severity: 'success', summary: 'Added', detail: 'Social link created.', life: 2500 })
    } else {
      await store.update(form.id, {
        platform: form.platform,
        label,
        url: form.url.trim(),
        sort_order: form.sort_order,
        active: form.active,
      })
      toast.add({ severity: 'success', summary: 'Saved', detail: 'Social link updated.', life: 2500 })
    }
    dialogOpen.value = false
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save the social link.', life: 4000 })
  } finally {
    saving.value = false
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────
const deleting = ref<SocialLink | null>(null)
const deleteLoading = ref(false)

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  deleteLoading.value = true
  try {
    await store.remove(deleting.value.id)
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Social link deleted.', life: 2500 })
    deleting.value = null
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete.', life: 4000 })
  } finally {
    deleteLoading.value = false
  }
}

watch(siteId, (id) => {
  if (id) store.fetchSocialLinks(id)
})

onMounted(async () => {
  await sitesStore.fetchSites()
  siteId.value = sitesStore.sites[0]?.id ?? null
  if (siteId.value) await store.fetchSocialLinks(siteId.value)
})
</script>

<template>
  <div class="space-y-6">
    <!-- Toolbar -->
    <section class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold text-indigo-500">Social media links</h2>
        <p class="mt-1 text-sm text-gray-500">Shown in the footer of each public site.</p>
      </div>
      <div class="flex items-center gap-3">
        <Select
          v-model="siteId"
          :options="siteOptions"
          option-label="label"
          option-value="value"
          placeholder="Select site"
          class="w-64"
        />
        <Button label="Add link" icon="pi pi-plus" :disabled="!siteId" @click="openCreate" />
      </div>
    </section>

    <!-- List -->
    <section class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable :value="store.items" :loading="store.loading" striped-rows :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No social links for this site yet.</div>
        </template>

        <Column header="Platform" :style="{ width: '200px' }">
          <template #body="{ data }: { data: SocialLink }">
            <span class="inline-flex items-center gap-2 font-medium text-gray-900">
              <i :class="['pi', platformIcon(data.platform)]" />
              {{ platformLabel(data.platform) }}
            </span>
          </template>
        </Column>

        <Column field="label" header="Label">
          <template #body="{ data }: { data: SocialLink }">
            <span class="text-gray-600">{{ data.label ?? '—' }}</span>
          </template>
        </Column>

        <Column header="URL">
          <template #body="{ data }: { data: SocialLink }">
            <a :href="data.url" target="_blank" rel="noopener" class="text-indigo-600 hover:underline break-all">{{ data.url }}</a>
          </template>
        </Column>

        <Column field="sort_order" header="Order" :style="{ width: '90px' }">
          <template #body="{ data }: { data: SocialLink }">
            <span class="text-gray-600">{{ data.sort_order }}</span>
          </template>
        </Column>

        <Column header="Status" :style="{ width: '110px' }">
          <template #body="{ data }: { data: SocialLink }">
            <Tag :value="data.active ? 'Active' : 'Hidden'" :severity="data.active ? 'success' : 'secondary'" />
          </template>
        </Column>

        <Column header="Actions" :style="{ width: '120px' }">
          <template #body="{ data }: { data: SocialLink }">
            <Button icon="pi pi-pencil" text size="small" v-tooltip="'Edit'" @click="openEdit(data)" />
            <Button icon="pi pi-trash" text severity="danger" size="small" v-tooltip="'Delete'" @click="deleting = data" />
          </template>
        </Column>
      </DataTable>
    </section>

    <!-- Create / edit dialog -->
    <Dialog
      :visible="dialogOpen"
      modal
      :header="isEdit ? 'Edit social link' : 'Add social link'"
      :style="{ width: '480px' }"
      @update:visible="dialogOpen = $event"
    >
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Site</label>
          <Select
            v-model="form.site_id"
            :options="siteOptions"
            option-label="label"
            option-value="value"
            placeholder="Select site"
            class="w-full"
            :disabled="isEdit"
          />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Platform</label>
          <Select v-model="form.platform" :options="PLATFORMS" option-label="label" option-value="value" class="w-full">
            <template #option="{ option }">
              <span class="inline-flex items-center gap-2"><i :class="['pi', option.icon]" />{{ option.label }}</span>
            </template>
          </Select>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Label <span class="text-gray-400">(optional)</span></label>
          <InputText v-model="form.label" class="w-full" placeholder="@yourhandle" />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">URL</label>
          <InputText v-model="form.url" class="w-full" placeholder="https://facebook.com/yourpage" />
        </div>

        <div class="flex items-end justify-between gap-4">
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">Sort order</label>
            <InputNumber v-model="form.sort_order" :min="0" show-buttons class="w-40" />
          </div>
          <div class="flex items-center gap-2 pb-2">
            <ToggleSwitch v-model="form.active" input-id="active" />
            <label for="active" class="text-sm font-medium text-gray-700">Active</label>
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="dialogOpen = false" />
        <Button :label="isEdit ? 'Save' : 'Create'" :loading="saving" :disabled="!canSave" @click="save" />
      </template>
    </Dialog>

    <!-- Delete confirm -->
    <Dialog :visible="deleting !== null" modal header="Delete social link" :style="{ width: '400px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">
        Delete the <strong>{{ deleting ? platformLabel(deleting.platform) : '' }}</strong> link? This removes it from the site footer.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" severity="danger" :loading="deleteLoading" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
