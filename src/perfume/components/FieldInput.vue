<script setup lang="ts">
/**
 * One form control for a FieldDef: the text / number / toggle / select /
 * image / rich text / colour / multi-line-list input the definition names,
 * with its label and validation message. Used by SimpleCrud's dialog, the
 * product editor and the settings forms.
 */
import { computed } from 'vue'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Select from 'primevue/select'
import ImageDropzone from '@/components/ImageDropzone.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import type { FieldDef, FieldValue } from './fields'

const props = defineProps<{
  field: FieldDef
  modelValue: FieldValue
  error?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const type = computed(() => props.field.type ?? 'text')

const text = computed({
  get: () => (typeof props.modelValue === 'string' ? props.modelValue : ''),
  set: (v: string) => emit('update:modelValue', v),
})

const num = computed({
  get: () => (typeof props.modelValue === 'number' ? props.modelValue : null),
  set: (v: number | null) => emit('update:modelValue', v),
})

const bool = computed({
  get: () => props.modelValue === true,
  set: (v: boolean) => emit('update:modelValue', v),
})

const image = computed({
  get: () => (typeof props.modelValue === 'string' && props.modelValue !== '' ? props.modelValue : null),
  set: (v: string | null) => emit('update:modelValue', v),
})

const select = computed({
  get: () => (typeof props.modelValue === 'string' || typeof props.modelValue === 'number' ? props.modelValue : null),
  set: (v: string | number | null) => emit('update:modelValue', v),
})

// 'lines': an array edited as one item per line.
const lines = computed({
  get: () => (Array.isArray(props.modelValue) ? props.modelValue.join('\n') : ''),
  set: (v: string) =>
    emit(
      'update:modelValue',
      v
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== ''),
    ),
})
</script>

<template>
  <div>
    <label v-if="type !== 'toggle' && type !== 'image'" class="mb-1 block text-xs font-medium text-gray-600">
      {{ field.label }}<span v-if="field.required" class="text-red-500"> *</span>
    </label>

    <InputText v-if="type === 'text'" v-model="text" fluid :placeholder="field.placeholder" />

    <Textarea v-else-if="type === 'textarea'" v-model="text" rows="3" fluid auto-resize :placeholder="field.placeholder" />

    <Textarea v-else-if="type === 'lines'" v-model="lines" rows="3" fluid auto-resize placeholder="One per line" />

    <InputNumber v-else-if="type === 'number'" v-model="num" fluid :use-grouping="false" :min="0" />

    <div v-else-if="type === 'color'" class="flex items-center gap-2">
      <input type="color" :value="text || '#000000'" class="h-9 w-12 cursor-pointer rounded border border-gray-300" @input="text = ($event.target as HTMLInputElement).value" />
      <InputText v-model="text" class="w-32" placeholder="#D6F25C" />
    </div>

    <label v-else-if="type === 'toggle'" class="flex items-center gap-3 text-sm text-gray-700">
      <ToggleSwitch v-model="bool" />
      {{ field.label }}
    </label>

    <Select
      v-else-if="type === 'select'"
      v-model="select"
      :options="field.options ?? []"
      option-label="label"
      option-value="value"
      fluid
      :placeholder="field.placeholder ?? '—'"
      show-clear
    />

    <ImageDropzone v-else-if="type === 'image'" v-model="image" :label="field.label" />

    <RichTextEditor v-else-if="type === 'richtext'" v-model="text" />

    <p v-if="field.help" class="mt-1 text-xs text-gray-400">{{ field.help }}</p>
    <p v-if="error" class="mt-1 text-xs text-red-600">{{ error }}</p>
  </div>
</template>
