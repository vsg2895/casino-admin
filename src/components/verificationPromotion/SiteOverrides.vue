<script setup lang="ts">
/**
 * Per-site image + link overrides for the post-verification promotion.
 *
 * ── What this screen can and cannot change ──────────────────────────────────
 *
 * The promotion is ONE template for every site: one subject, one set of words,
 * one delay, one transport. This section changes the hero IMAGE and where the
 * LINKS point, for one site, and nothing else. There is deliberately no text
 * field anywhere below — the email must read identically on every site, so a
 * heading or a button label is not editable here and the API would reject one.
 *
 * Footer links are the subtle case. They are shown as one URL box per default
 * link, captioned with that link's own label, because a site may re-point
 * "Privacy Policy" at its own page but may not rename it. Leaving a box empty
 * leaves that link on the template's target.
 *
 * Clearing every field on a site restores the default completely — there is no
 * delete button because there is nothing to delete.
 */
import { ref, computed, onMounted } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/verificationPromotion'
import { uploadImage } from '@/api/uploads'
import type { VerificationPromotionOverride } from '@/api/verificationPromotion'

const toast = useToast()

const rows = ref<VerificationPromotionOverride[]>([])
const labels = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const selectedId = ref<number | null>(null)
const errors = ref<Record<string, string>>({})

const current = computed(() => rows.value.find((r) => r.site_id === selectedId.value) ?? null)

const siteOptions = computed(() =>
  rows.value.map((r) => ({
    label: r.active ? `${r.site_name} — overridden` : r.site_name,
    value: r.site_id,
  })),
)

/** The link boxes, in the order they appear in the email. */
const LINK_FIELDS = [
  { key: 'hero_url', label: 'Header & hero image link', hint: 'The brand name in the header and the banner itself.' },
  { key: 'top_button_url', label: 'Top button link', hint: 'The button above the banner.' },
  { key: 'cta_button_url', label: 'Main CTA button link', hint: 'The button below the offer.' },
  { key: 'email_preferences_url', label: 'Email preferences link', hint: 'Footer. Not the unsubscribe link — that one is per recipient and cannot be changed.' },
] as const

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await api.listVerificationPromotionOverrides()
    labels.value = res.footer_link_labels
    rows.value = res.data.map((r) => ({
      ...r,
      // Pad to the template's footer-link count so every default link gets a
      // box, including ones this site has never touched.
      footer_link_urls: Array.from(
        { length: res.footer_link_labels.length },
        (_, i) => r.footer_link_urls[i] ?? null,
      ),
    }))
    if (selectedId.value === null) selectedId.value = rows.value[0]?.site_id ?? null
  } catch {
    toast.add({ severity: 'error', summary: 'Could not load per-site overrides', life: 4000 })
  } finally {
    loading.value = false
  }
}

async function onImagePick(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !current.value) return
  uploading.value = true
  try {
    const { url } = await uploadImage(file, 'banner')
    current.value.hero_image_url = url
    toast.add({ severity: 'success', summary: 'Image uploaded — save to apply', life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Upload failed', life: 4000 })
  } finally {
    uploading.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

async function save(): Promise<void> {
  const row = current.value
  if (!row) return
  saving.value = true
  errors.value = {}
  try {
    const res = await api.updateVerificationPromotionOverride(row.site_id, {
      hero_image_url: row.hero_image_url || null,
      hero_url: row.hero_url || null,
      top_button_url: row.top_button_url || null,
      cta_button_url: row.cta_button_url || null,
      email_preferences_url: row.email_preferences_url || null,
      footer_link_urls: row.footer_link_urls.map((u) => u || null),
    })
    row.active = res.data.active
    toast.add({
      severity: 'success',
      summary: res.data.active
        ? `${row.site_name} now uses its own image and links`
        : `${row.site_name} is back on the default image and links`,
      life: 3000,
    })
  } catch (e) {
    const bag = (e as { response?: { data?: { errors?: Record<string, string[]> } } }).response?.data?.errors
    if (bag) errors.value = Object.fromEntries(Object.entries(bag).map(([k, v]) => [k, v[0]]))
    toast.add({ severity: 'error', summary: 'Could not save those overrides', life: 4000 })
  } finally {
    saving.value = false
  }
}

function clearAll(): void {
  const row = current.value
  if (!row) return
  row.hero_image_url = null
  row.hero_url = null
  row.top_button_url = null
  row.cta_button_url = null
  row.email_preferences_url = null
  row.footer_link_urls = row.footer_link_urls.map(() => null)
}

function err(key: string): string | undefined {
  return errors.value[key]
}

onMounted(() => void load())
</script>

<template>
  <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-gray-800">Per-site image &amp; links</h3>
      <Tag v-if="current?.active" severity="info" value="This site is overridden" />
    </div>
    <p class="mb-3 text-xs text-gray-500">
      Replaces the banner image and where the links point, for one site only. Every word of the
      email — headings, button labels, footer text — stays exactly the same on every site.
      Leave a field empty to keep the default.
    </p>

    <div class="mb-4">
      <label class="mb-1 block text-xs font-medium text-gray-600">Site</label>
      <Select
        v-model="selectedId" :options="siteOptions" option-label="label" option-value="value"
        :loading="loading" class="w-full sm:w-80"
      />
    </div>

    <template v-if="current">
      <div class="mb-4">
        <label class="mb-1 block text-xs font-medium text-gray-600">Banner image</label>
        <div class="flex flex-wrap items-center gap-2">
          <InputText v-model="current.hero_image_url" fluid class="min-w-0 flex-1" placeholder="https://… (or upload)" />
          <label class="inline-flex min-h-10 cursor-pointer items-center rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {{ uploading ? 'Uploading…' : 'Upload' }}
            <input type="file" accept="image/*" class="hidden" :disabled="uploading" @change="onImagePick" />
          </label>
        </div>
        <p v-if="err('hero_image_url')" class="mt-1 text-xs text-red-600">{{ err('hero_image_url') }}</p>
        <img
          v-if="current.hero_image_url" :src="current.hero_image_url" alt=""
          class="mt-2 max-h-32 rounded border border-gray-200 object-contain"
        />
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div v-for="f in LINK_FIELDS" :key="f.key">
          <label class="mb-1 block text-xs font-medium text-gray-600">{{ f.label }}</label>
          <InputText v-model="current[f.key]" fluid placeholder="https://…" />
          <p class="mt-1 text-xs text-gray-400">{{ f.hint }}</p>
          <p v-if="err(f.key)" class="mt-1 text-xs text-red-600">{{ err(f.key) }}</p>
        </div>
      </div>

      <div v-if="labels.length" class="mt-4">
        <p class="mb-1 text-xs font-medium text-gray-600">Footer links</p>
        <p class="mb-2 text-xs text-gray-400">
          Each keeps its label — only the target changes.
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <div v-for="(label, i) in labels" :key="i">
            <label class="mb-1 block text-xs text-gray-500">{{ label }}</label>
            <InputText v-model="current.footer_link_urls[i]" fluid placeholder="https://… (default)" />
            <p v-if="err(`footer_link_urls.${i}`)" class="mt-1 text-xs text-red-600">
              {{ err(`footer_link_urls.${i}`) }}
            </p>
          </div>
        </div>
      </div>

      <div class="mt-4 flex items-center gap-3">
        <Button label="Save overrides" icon="pi pi-check" :loading="saving" @click="save" />
        <Button label="Clear all" text severity="secondary" @click="clearAll" />
        <span class="text-xs text-gray-400">Clearing every field restores the default.</span>
      </div>
    </template>
  </section>
</template>
