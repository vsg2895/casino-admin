<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import * as authorsApi from '@/api/authors'
import type { Author } from '@shared/types/author'

/**
 * "Written by / Reviewed by / Last reviewed" for one piece of content on ONE
 * site. Offers only that site's authors — the backend refuses any other — and
 * marks hidden ones, whose byline stays off the public page until they are
 * made visible.
 */

export interface BylineValue {
  author_id: number | null
  reviewed_by_id: number | null
  last_reviewed_at: string | null
}

const props = defineProps<{ siteId: number | null; modelValue: BylineValue }>()
const emit = defineEmits<{ 'update:modelValue': [value: BylineValue] }>()

const authors = ref<Author[]>([])

watch(
  () => props.siteId,
  async (id) => {
    authors.value = id ? await authorsApi.listAuthors(id).catch(() => []) : []
  },
  { immediate: true },
)

const options = computed(() =>
  authors.value.map((a) => ({ label: a.visible ? a.name : `${a.name} (hidden)`, value: a.id })),
)

const reviewedAt = computed<Date | null>(() => {
  const v = props.modelValue.last_reviewed_at
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
})

function set<K extends keyof BylineValue>(key: K, value: BylineValue[K]): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function setDate(value: Date | null): void {
  // A calendar date, sent as YYYY-MM-DD in local time: toISOString() would
  // shift it a day back east of UTC.
  if (!value) return set('last_reviewed_at', null)
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  set('last_reviewed_at', `${y}-${m}-${d}`)
}
</script>

<template>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <div>
      <label class="mb-1 block text-xs font-medium text-gray-600">Written by</label>
      <Select :model-value="modelValue.author_id" :options="options" option-label="label" option-value="value"
              show-clear placeholder="No named author" fluid
              @update:model-value="(v: number | null) => set('author_id', v ?? null)" />
    </div>
    <div>
      <label class="mb-1 block text-xs font-medium text-gray-600">Reviewed by</label>
      <Select :model-value="modelValue.reviewed_by_id" :options="options" option-label="label" option-value="value"
              show-clear placeholder="No reviewer" fluid
              @update:model-value="(v: number | null) => set('reviewed_by_id', v ?? null)" />
    </div>
    <div>
      <label class="mb-1 block text-xs font-medium text-gray-600">Last reviewed</label>
      <DatePicker :model-value="reviewedAt" date-format="yy-mm-dd" show-button-bar fluid
                  @update:model-value="(v) => setDate(v as Date | null)" />
    </div>
    <p v-if="siteId && authors.length === 0" class="text-xs text-gray-400 sm:col-span-3">
      This site has no authors yet — add them under Sites → Authors.
    </p>
    <p v-else class="text-xs text-gray-400 sm:col-span-3">
      Change “Last reviewed” only when someone has actually re-checked the content.
    </p>
  </div>
</template>
