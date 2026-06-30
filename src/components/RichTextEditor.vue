<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

/**
 * Minimal self-contained rich text editor (no external API key required).
 * v-models an HTML string. Toolbar mirrors the product mockups: bold, italic,
 * underline, strikethrough, ordered/unordered lists, and link.
 */
const props = defineProps<{ modelValue: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const editor = ref<HTMLDivElement | null>(null)

onMounted(() => {
  if (editor.value) editor.value.innerHTML = props.modelValue ?? ''
})

watch(
  () => props.modelValue,
  (val) => {
    if (editor.value && editor.value.innerHTML !== (val ?? '')) {
      editor.value.innerHTML = val ?? ''
    }
  },
)

function exec(command: string): void {
  document.execCommand(command, false)
  syncContent()
  editor.value?.focus()
}

function createLink(): void {
  const url = window.prompt('Enter URL')
  if (url) exec('createLink')
  else syncContent()
}

function syncContent(): void {
  emit('update:modelValue', editor.value?.innerHTML ?? '')
}

interface ToolButton {
  cmd: string
  icon: string
  title: string
  action?: () => void
}

const buttons: ToolButton[] = [
  { cmd: 'bold', icon: 'pi-bold', title: 'Bold' },
  { cmd: 'italic', icon: 'pi-italic', title: 'Italic' },
  { cmd: 'underline', icon: 'pi-underline', title: 'Underline' },
  { cmd: 'strikeThrough', icon: 'pi-minus', title: 'Strikethrough' },
  { cmd: 'insertUnorderedList', icon: 'pi-list', title: 'Bullet list' },
  { cmd: 'insertOrderedList', icon: 'pi-sort-numeric-down', title: 'Numbered list' },
  { cmd: 'createLink', icon: 'pi-link', title: 'Link', action: createLink },
]
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-gray-300">
    <div class="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
      <button
        v-for="b in buttons"
        :key="b.cmd"
        type="button"
        :title="b.title"
        class="flex h-7 w-7 items-center justify-center rounded text-gray-600 hover:bg-gray-200"
        @click="b.action ? b.action() : exec(b.cmd)"
      >
        <i :class="['pi', b.icon, 'text-xs']" />
      </button>
    </div>
    <div
      ref="editor"
      class="min-h-32 px-3 py-2 text-sm focus:outline-none"
      contenteditable="true"
      @input="syncContent"
      @blur="syncContent"
    />
  </div>
</template>
