<script setup lang="ts">
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

defineProps<{
  form: CasinoFormModel
  categories: Category[]
  offers: SpecialOffer[]
  errors?: Record<string, string>
}>()

const ratingOptions = [0, 1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: n }))
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
