<script setup lang="ts">
import { computed } from 'vue'
import type { BonusCategory } from '@shared/types/bonusCategory'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import ImageDropzone from '@/components/ImageDropzone.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import type { Casino } from '@shared/types/casino'

export interface SpecialOfferFormModel {
  casino_id: number | null
  bonus_category_id: number | null
  title: string
  /**
   * The public address, editable while EDITING only.
   *
   * Absent on create: there is no address yet, and one is generated from the
   * title when the row is saved. See the field below for why it can be changed
   * afterwards at all.
   */
  slug?: string | null
  image_path: string | null
  banner_image: string | null
  bonuses: string | null
  affiliate_url: string | null
  description: string | null
  rating: number
  sort_order: number
  active: boolean
  // Structured bonus terms — all optional. An offer with none renders exactly
  // as it did before this section existed.
  wagering_requirement: string | null
  min_deposit: string | null
  max_cashout: string | null
  bonus_code: string | null
  expires_at: string | null
  terms_url: string | null
  /** Keep out of search results: noindex on the offer page, absent from the sitemap. */
  noindex: boolean
}

const props = defineProps<{
  form: SpecialOfferFormModel
  casinos: Casino[]
  errors?: Record<string, string>
  bonusCategories?: BonusCategory[]
  /** Edit screens only — a new offer has no address to change yet. */
  showSlug?: boolean
}>()

/** Clearing the field is the "rebuild it from the title" gesture. */
function clearSlug(): void {
  props.form.slug = null
}

/**
 * What the slug WILL be if the field is left empty — a preview, not the source
 * of truth.
 *
 * The server decides, in App\Models\SpecialOffer::slugBase(), and this mirrors
 * it so an editor can see the address before saving instead of discovering it
 * afterwards. Keep the two in step: casino slug first, hyphens throughout,
 * `%` → percent, `&` → and, a trailing "(Copy)" dropped, and the casino prefix
 * omitted when the title already names it.
 *
 * It cannot show the `-2` a collision would add — only the database knows that
 * — so the note under the field says the final address is confirmed on save.
 */
function previewSlug(title: string, casinoSlug: string): string {
  const base = (title || '')
    .toLowerCase()
    .replace(/%/g, ' percent ')
    .replace(/&/g, ' and ')
    .replace(/\s*\(\s*cop(?:y|ies)\s*\d*\s*\)\s*$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (base === '') return ''

  const prefix = casinoSlug.replace(/^-+|-+$/g, '')

  if (prefix === '' || base === prefix || `-${base}-`.includes(`-${prefix}-`)) return base

  return `${prefix}-${base}`
}

/** The casino currently selected in the form, for the slug prefix and the URL. */
const selectedCasino = computed(() =>
  props.casinos.find((c) => c.id === props.form.casino_id) ?? null,
)

/** The slug that will actually be used: what was typed, or the preview. */
const effectiveSlug = computed(() =>
  (props.form.slug ?? '').trim() !== ''
    ? (props.form.slug as string).trim()
    : previewSlug(props.form.title ?? '', selectedCasino.value?.slug ?? ''),
)

/**
 * The full public URL, on one of the sites this offer's casino is attached to.
 *
 * An offer is global master data and appears on every attached domain, so there
 * is no single canonical address — the first attached site is shown as the
 * example, with the count of the others beside it. Falls back to the path alone
 * when the attachments are not loaded.
 */
const previewUrl = computed(() => {
  const sites = selectedCasino.value?.sites ?? []
  const base = sites[0]?.site_url?.replace(/\/+$/, '') ?? ''
  const path = `/special-offers/${effectiveSlug.value || '…'}`

  return { url: base !== '' ? `${base}${path}` : path, others: Math.max(0, sites.length - 1) }
})

const ratingOptions = [0, 1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: n }))
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <ImageDropzone v-model="form.image_path" label="Image" type="image" />
      <ImageDropzone v-model="form.banner_image" label="Banner Image" type="banner" />
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Casino <span class="text-red-500">*</span></label>
          <Select v-model="form.casino_id" :options="casinos" option-label="name" option-value="id" placeholder="Select a casino" filter fluid />
          <p v-if="errors?.casino_id" class="mt-1 text-xs text-red-600">{{ errors.casino_id }}</p>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Bonus category</label>
          <Select
            v-model="form.bonus_category_id"
            :options="bonusCategories"
            option-label="name"
            option-value="id"
            placeholder="Uncategorised"
            show-clear
            fluid
          />
          <p class="mt-1 text-xs text-gray-400">
            Which section of the Bonus area this offer appears in. Uncategorised offers still show
            on the Special Offers page — they just have no section on the home page.
          </p>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Title <span class="text-red-500">*</span></label>
          <InputText v-model="form.title" fluid />
          <p v-if="errors?.title" class="mt-1 text-xs text-red-600">{{ errors.title }}</p>
        </div>

        <!-- The public address.
             It FOLLOWS THE TITLE: rename the offer and the link is rebuilt from
             the new name, with a 301 written from the old path on every site
             the offer appears on, so links already shared keep working. This
             field is the override — type an address and it is kept as typed. -->
        <div v-if="showSlug">
          <label class="mb-1 block text-sm font-medium text-gray-700">Link</label>
          <div class="flex items-center gap-2">
            <InputText v-model="form.slug" fluid placeholder="rebuilt from the title on save" />
            <Button
              label="From title"
              icon="pi pi-refresh"
              size="small"
              outlined
              severity="secondary"
              :disabled="!form.slug"
              @click="clearSlug"
            />
          </div>
          <!-- The full address, not just the path: this is the string an
               operator copies, and the one they check against what Search
               Console reports. -->
          <p class="mt-1 text-xs text-gray-500">
            <span class="font-mono break-all text-gray-700">{{ previewUrl.url }}</span>
            <span v-if="previewUrl.others > 0" class="text-gray-400">
              (and {{ previewUrl.others }} more site{{ previewUrl.others > 1 ? 's' : '' }})
            </span>
          </p>
          <p class="mt-1 text-xs text-gray-500">
            Leave it empty and it is built from the casino and the title on save —
            <span class="font-mono">casino-slug-offer-title</span>, lowercase letters, numbers and
            hyphens. Type here only to override it; <strong>From title</strong> hands it back.
          </p>
          <!-- Said plainly, because the previous wording promised a redirect
               that does not exist and an operator would have trusted it. -->
          <p class="mt-1 text-xs text-amber-700">
            Renaming the offer or editing this field <strong>changes the public address</strong> and
            the old one stops working — there is no automatic redirect. Update any link you have
            shared or published yourself.
          </p>
          <p v-if="errors?.slug" class="mt-1 text-xs text-red-600">{{ errors.slug }}</p>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Bonuses</label>
          <InputText v-model="form.bonuses" fluid placeholder="e.g. 100 Free Spins On Registration" />
        </div>
      </div>

      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Rating</label>
          <Select v-model="form.rating" :options="ratingOptions" option-label="label" option-value="value" fluid />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Link</label>
          <InputText v-model="form.affiliate_url" fluid placeholder="https://…" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Order</label>
          <InputNumber v-model="form.sort_order" :min="0" :use-grouping="false" input-class="w-full" fluid />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Visibility</label>
          <div class="flex items-center gap-3">
            <ToggleSwitch v-model="form.active" />
            <span class="text-sm text-gray-600">{{ form.active ? 'On' : 'Off' }}</span>
          </div>
        </div>
      </div>
    </div>

    <div>
      <label class="mb-1 block text-sm font-medium text-gray-700">Description</label>
      <RichTextEditor v-model="form.description" />
    </div>
  </div>

  <!-- Bonus terms. These are what a player needs before depositing, and what an
       affiliate site is expected to state plainly rather than leave buried in
       the operator's T&Cs. Everything is optional. -->
  <div class="mt-6 rounded-xl border border-gray-200 bg-white p-4">
    <h3 class="text-sm font-semibold text-gray-800">Bonus terms</h3>
    <p class="mt-0.5 text-xs text-gray-500">
      Shown as labelled figures beside the offer. Leave anything you have not confirmed blank —
      blank fields are not rendered.
    </p>

    <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">Wagering requirement</label>
        <InputText v-model="form.wagering_requirement" fluid placeholder="35x (D+B)" />
        <p v-if="errors?.wagering_requirement" class="mt-1 text-xs text-red-600">{{ errors.wagering_requirement }}</p>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">Bonus code</label>
        <InputText v-model="form.bonus_code" fluid placeholder="Leave empty if none" />
      </div>
      <!-- Text, not numbers: these run in EUR, USD and crypto, and operators
           state ranges. A number field would drop the currency. -->
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">Minimum deposit</label>
        <InputText v-model="form.min_deposit" fluid placeholder="€20" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">Maximum cashout</label>
        <InputText v-model="form.max_cashout" fluid placeholder="€5,000" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">Expires on</label>
        <!-- Native date input rather than PrimeVue's DatePicker: it yields a
             YYYY-MM-DD string, which is exactly what the API stores and returns.
             The DatePicker works in Date objects and would need converting in
             both directions for no gain. -->
        <InputText v-model="form.expires_at" type="date" fluid />
        <p class="mt-1 text-xs text-amber-700">
          After this date the offer disappears from every listing and stops showing a claim button.
        </p>
        <p v-if="errors?.expires_at" class="mt-1 text-xs text-red-600">{{ errors.expires_at }}</p>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">Full terms URL</label>
        <InputText v-model="form.terms_url" fluid placeholder="https://operator.com/terms" />
        <p class="mt-1 text-xs text-gray-400">Linked beside the offer, never as fine print.</p>
        <p v-if="errors?.terms_url" class="mt-1 text-xs text-red-600">{{ errors.terms_url }}</p>
      </div>
    </div>

    <div class="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
      <div>
        <label class="text-sm text-gray-700">Keep out of search results</label>
        <p class="text-xs text-gray-400">Sets noindex and leaves the offer out of the sitemap. The page stays reachable by direct link.</p>
      </div>
      <ToggleSwitch v-model="form.noindex" />
    </div>
  </div>

</template>
