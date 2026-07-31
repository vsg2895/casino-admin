<script setup lang="ts">
import Button from 'primevue/button'

/**
 * Field label with a "Remove" action for email-template blocks.
 *
 * Every content block of a site email template (image, button, paragraph,
 * header strip) can be deleted independently: clearing the value is what tells
 * the mail layout to drop that block entirely. The action only appears while
 * the field actually has content, so a removed block reads as removed.
 */
defineProps<{
  label: string
  value: string | null | undefined
  /** Wording for the action — "Remove image" / "Remove button" reads better than a bare "Remove". */
  removeLabel?: string
}>()

defineEmits<{ clear: [] }>()
</script>

<template>
  <div class="mb-1 flex items-center justify-between gap-2">
    <label class="block text-xs font-medium text-gray-600">{{ label }}</label>
    <Button
      v-if="value"
      :label="removeLabel ?? 'Remove'"
      icon="pi pi-trash"
      text
      severity="danger"
      size="small"
      @click="$emit('clear')"
    />
  </div>
</template>
