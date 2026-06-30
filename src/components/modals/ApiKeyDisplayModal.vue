<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'

const props = defineProps<{
  visible: boolean
  apiKey: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  confirmed: []
}>()

const hasCopied = ref(false)
const hasConfirmed = ref(false)

watch(
  () => props.visible,
  (val) => {
    if (val) {
      hasCopied.value = false
      hasConfirmed.value = false
    }
  },
)

async function copyKey(): Promise<void> {
  await navigator.clipboard.writeText(props.apiKey)
  hasCopied.value = true
}

function close(): void {
  emit('confirmed')
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :closable="false"
    header="API Key — Copy Now"
    :style="{ width: '560px' }"
  >
    <div class="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <i class="pi pi-exclamation-triangle mt-0.5 text-amber-600" />
      <div class="text-sm text-amber-800">
        <p class="font-semibold">Copy this key now. It will not be shown again.</p>
        <p class="mt-0.5">
          Paste it into your Next.js
          <code class="rounded bg-amber-100 px-1 font-mono">.env.local</code>
          as
          <code class="rounded bg-amber-100 px-1 font-mono">API_SITE_KEY</code>.
        </p>
      </div>
    </div>

    <div class="mb-5 flex items-center gap-2">
      <code
        class="flex-1 select-all break-all rounded-md border border-gray-300 bg-gray-50 px-3 py-2.5 font-mono text-sm text-gray-900"
      >
        {{ apiKey }}
      </code>
      <Button
        :icon="hasCopied ? 'pi pi-check' : 'pi pi-copy'"
        :label="hasCopied ? 'Copied!' : 'Copy'"
        :severity="hasCopied ? 'success' : 'secondary'"
        size="small"
        @click="copyKey"
      />
    </div>

    <div class="flex items-center gap-2">
      <Checkbox v-model="hasConfirmed" input-id="key-confirmed" binary />
      <label for="key-confirmed" class="cursor-pointer text-sm text-gray-700">
        I have copied the key safely
      </label>
    </div>

    <template #footer>
      <Button label="Close" :disabled="!hasConfirmed" @click="close" />
    </template>
  </Dialog>
</template>
