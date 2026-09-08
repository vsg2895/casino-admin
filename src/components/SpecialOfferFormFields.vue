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
  // Structured bonus terms — all optional. An offer with none renders exactly
  // as it did before this section existed.
  wagering_requirement: string | null
  min_deposit: string | null
  max_cashout: string | null
  bonus_code: string | null
  expires_at: string | null
  terms_url: string | null
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
  </div>

</template>
