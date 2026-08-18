<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import ToggleSwitch from 'primevue/toggleswitch'
import ImageDropzone from '@/components/ImageDropzone.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import type { Category } from '@shared/types/category'
import type { SpecialOffer } from '@shared/types/specialOffer'

export interface CasinoFormModel {
  name: string
  slug: string
  image_path: string | null
  banner_image: string | null
  bonuses: string | null
  affiliate_url: string | null
  description: string | null
  rating: number
  sort_order: number
  featured_special_offer_id: number | null
  meta_title: string | null
  meta_description: string | null
  active: boolean
  category_ids: number[]
}

const props = defineProps<{
  form: CasinoFormModel
  categories: Category[]
  offers: SpecialOffer[]
  errors?: Record<string, string>
  /**
   * Create shows a blank slug that the backend fills in from the title; edit
   * shows the live one, where changing it moves a URL that may already be
   * indexed. The warning below is therefore only shown while editing.
   */
  editing?: boolean
}>()

const ratingOptions = [0, 1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: n }))

// Mirrors the backend's Str::slug() so the admin sees the value that will
// actually be stored, rather than discovering it after saving.
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Set once the admin types in the slug field \u2014 it stops tracking the title. */
const slugTouched = ref(false)

/** What the current title would produce. */
const suggestedSlug = computed(() => slugify(props.form.name))

/**
 * On CREATE the slug tracks the title as it is typed, the way every CMS does \u2014
 * so a new casino never has to have its slug filled in by hand. Tracking stops
 * the moment the admin edits the slug themselves.
 *
 * Deliberately NOT done while editing: an existing casino's slug is a live,
 * possibly indexed URL, and a rename must never move it silently. There the
 * "Use title" button below makes it a one-click, deliberate action instead.
 */
watch(
  () => props.form.name,
  (name) => {
    if (!props.editing && !slugTouched.value) {
      props.form.slug = slugify(name)
    }
  },
)

function normalizeSlug(): void {
  props.form.slug = slugify(props.form.slug)
}

/** Adopt the title's slug \u2014 the one-click answer to "I renamed it". */
function applySuggestedSlug(): void {
  props.form.slug = suggestedSlug.value
  slugTouched.value = true
}

/**
 * Whether the stored slug has fallen out of step with the title. This is the
 * exact "renamed to Win Spirit but the slug is still 7" case: surfaced as a
 * prompt rather than applied automatically, because only the admin knows
 * whether the old URL is worth keeping.
 */
const slugDiffers = computed(
  () => props.editing && suggestedSlug.value !== '' && props.form.slug !== suggestedSlug.value,
)
</script>

<template>
  <div class="space-y-6">
    <!-- Images -->
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <ImageDropzone v-model="form.image_path" label="Image" type="image" />
      <ImageDropzone v-model="form.banner_image" label="Banner Image" type="banner" />
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- Left column -->
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Title <span class="text-red-500">*</span></label>
          <InputText v-model="form.name" fluid />
          <p v-if="errors?.name" class="mt-1 text-xs text-red-600">{{ errors.name }}</p>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">
            Slug <span v-if="editing" class="text-red-500">*</span>
          </label>
          <div class="flex items-start gap-2">
            <InputText
              v-model="form.slug"
              class="flex-1"
              placeholder="auto-generated from the title"
              @input="slugTouched = true"
              @blur="normalizeSlug"
            />
            <Button
              v-if="editing"
              label="Use title"
              icon="pi pi-refresh"
              severity="secondary"
              outlined
              :disabled="!slugDiffers"
              @click="applySuggestedSlug"
            />
          </div>
          <p v-if="errors?.slug" class="mt-1 text-xs text-red-600">{{ errors.slug }}</p>
          <p v-else-if="slugDiffers" class="mt-1 text-xs text-amber-600">
            The title suggests <code>{{ suggestedSlug }}</code>, but the slug is
            <code>{{ form.slug || '…' }}</code>. Renaming does not move the URL on its own — click
            <strong>Use title</strong> to change it, and note the old link will 404.
          </p>
          <p v-else-if="editing" class="mt-1 text-xs text-gray-400">
            Public URL on every site: <code>/casinos/{{ form.slug || '…' }}</code>. Changing it breaks the old
            link — anything already indexed or shared will 404.
          </p>
          <p v-else class="mt-1 text-xs text-gray-400">
            Follows the title as you type. Lowercase letters, numbers and hyphens.
          </p>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Bonuses</label>
          <InputText v-model="form.bonuses" fluid placeholder="e.g. 500$ + 180 Free Spins" />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Special Offer</label>
          <Select
            v-model="form.featured_special_offer_id"
            :options="offers"
            option-label="title"
            option-value="id"
            placeholder="Select a special offer"
            show-clear
            fluid
          />
          <p class="mt-1 text-xs text-gray-400">Offers attached to this casino. Create offers in Special Offers first.</p>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Link</label>
          <InputText v-model="form.affiliate_url" fluid placeholder="https://…" />
          <p v-if="errors?.affiliate_url" class="mt-1 text-xs text-red-600">{{ errors.affiliate_url }}</p>
        </div>
      </div>

      <!-- Right column -->
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Rating</label>
          <Select v-model="form.rating" :options="ratingOptions" option-label="label" option-value="value" fluid />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Order</label>
          <InputNumber v-model="form.sort_order" :min="0" :use-grouping="false" input-class="w-full" fluid />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Category</label>
          <MultiSelect
            v-model="form.category_ids"
            :options="categories"
            option-label="name"
            option-value="id"
            placeholder="Select categories"
            display="chip"
            fluid
          />
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

    <!-- Description -->
    <div>
      <label class="mb-1 block text-sm font-medium text-gray-700">Description</label>
      <RichTextEditor v-model="form.description" />
    </div>

    <!-- SEO (kept for affiliate search ranking) -->
    <fieldset class="space-y-4 border-t border-gray-100 pt-4">
      <legend class="text-xs font-semibold uppercase tracking-wide text-gray-400">SEO</legend>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Meta Title</label>
          <InputText v-model="form.meta_title" fluid />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Meta Description</label>
          <InputText v-model="form.meta_description" fluid />
        </div>
      </div>
    </fieldset>
  </div>
</template>
