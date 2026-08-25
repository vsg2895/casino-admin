<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'

/**
 * Field label with a REVERSIBLE Remove / Restore action.
 *
 * The difference from {@link RemovableLabel} is the whole point: that one clears
 * the field's value, which throws the wording away — "restore" could then only
 * ever put back a default, not what the operator actually wrote. This one toggles
 * the block's key in a `hidden_blocks` list and never touches the text, so hiding
 * is a setting and restoring is one click.
 *
 * Reusable for any block: pass its field name as `block`, and bind the shared
 * list with `v-model:hidden`.
 */
const props = defineProps<{
  /** Field name, e.g. "heading" — must be one of the server's optional_blocks. */
  block: string
  label: string
  /** The full list of currently hidden block keys. */
  hidden: string[]
  /** Wording for the action — "Remove image" reads better than a bare "Remove". */
  removeLabel?: string
}>()

const emit = defineEmits<{ 'update:hidden': [string[]] }>()

const isHidden = computed(() => props.hidden.includes(props.block))

function toggle(): void {
  // A new array every time: mutating the prop in place would not reliably trip
  // the parent's deep watcher that drives the live preview.
  emit(
    'update:hidden',
    isHidden.value
      ? props.hidden.filter((key) => key !== props.block)
      : [...props.hidden, props.block],
  )
}
</script>

<template>
  <div class="mb-1 flex items-center justify-between gap-2">
    <label class="block text-xs font-medium text-gray-600">{{ label }}</label>
    <Button
      v-if="isHidden"
      label="Restore"
      icon="pi pi-replay"
      text
      severity="secondary"
      size="small"
      @click="toggle"
    />
    <Button
      v-else
      :label="removeLabel ?? 'Remove'"
      icon="pi pi-trash"
      text
      severity="danger"
      size="small"
      @click="toggle"
    />
  </div>
</template>
