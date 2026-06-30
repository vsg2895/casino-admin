<script setup lang="ts">
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import ImageDropzone from '@/components/ImageDropzone.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import type { Casino } from '@shared/types/casino'

export interface SpecialOfferFormModel {
  casino_id: number | null
  title: string
  image_path: string | null
  banner_image: string | null
  bonuses: string | null
  affiliate_url: string | null
  description: string | null
  rating: number
  sort_order: number
  active: boolean
}

defineProps<{
  form: SpecialOfferFormModel
  casinos: Casino[]
  errors?: Record<string, string>
}>()

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
          <label class="mb-1 block text-sm font-medium text-gray-700">Title <span class="text-red-500">*</span></label>
          <InputText v-model="form.title" fluid />
          <p v-if="errors?.title" class="mt-1 text-xs text-red-600">{{ errors.title }}</p>
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
</template>
