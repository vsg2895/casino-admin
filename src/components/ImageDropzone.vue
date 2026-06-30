<script setup lang="ts">
import { ref, computed } from 'vue'
import { uploadImage } from '@/api/uploads'

/**
 * Drag-and-drop image upload. v-models the STORED PATH returned by the backend
 * (e.g. "uploads/banner/uuid.webp"). Shows a preview resolved against the
 * public storage URL. Matches the "Drag & Drop your file or Browse" mockups.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string | null
    label?: string
    type?: 'image' | 'banner'
  }>(),
  { label: 'Image', type: 'image' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const dragging = ref(false)
const uploading = ref(false)
const error = ref<string | null>(null)
const input = ref<HTMLInputElement | null>(null)

// Resolve a stored path into a browsable URL via the API origin's /storage mount.
const storageBase = computed(() => {
  const api = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'
  return api.replace(/\/api\/v1\/?$/, '')
})

const previewUrl = computed(() => {
  const v = props.modelValue
  if (!v) return null
  if (/^https?:\/\//.test(v)) return v
  return `${storageBase.value}/storage/${v}`
})

async function handleFiles(files: FileList | null): Promise<void> {
  if (!files || files.length === 0) return
  error.value = null
  uploading.value = true
  try {
    const result = await uploadImage(files[0], props.type)
    emit('update:modelValue', result.path)
  } catch {
    error.value = 'Upload failed. Please try a different image.'
  } finally {
    uploading.value = false
  }
}

function onDrop(e: DragEvent): void {
  dragging.value = false
  void handleFiles(e.dataTransfer?.files ?? null)
}

function clear(): void {
  emit('update:modelValue', null)
}
</script>

<template>
  <div>
    <label class="mb-1 block text-sm font-medium text-gray-700">{{ label }}</label>

    <div
      class="relative flex min-h-40 items-center justify-center rounded-lg border-2 border-dashed
             transition-colors"
      :class="dragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-gray-50'"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <!-- Preview -->
      <template v-if="previewUrl">
        <img :src="previewUrl" alt="" class="max-h-40 rounded-lg object-contain" />
        <button
          type="button"
          class="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-gray-600 shadow hover:text-red-600"
          @click="clear"
        >
          <i class="pi pi-times text-xs" />
        </button>
      </template>

      <!-- Empty / dropzone -->
      <div v-else class="px-4 py-8 text-center text-sm text-gray-500">
        <i class="pi pi-cloud-upload mb-2 block text-2xl text-gray-400" />
        <span v-if="uploading">Uploading…</span>
        <span v-else>
          Drag &amp; Drop your file or
          <button type="button" class="font-semibold text-indigo-600 hover:underline" @click="input?.click()">
            Browse
          </button>
        </span>
      </div>

      <input ref="input" type="file" accept="image/*" class="hidden" @change="handleFiles(($event.target as HTMLInputElement).files)" />
    </div>

    <p v-if="error" class="mt-1 text-xs text-red-600">{{ error }}</p>
  </div>
</template>
