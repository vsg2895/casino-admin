<script setup lang="ts">
/**
 * A form over a subset of the store's settings row: loads it, shows the
 * given fields in sections, PUTs the edited subset. The Settings and Home
 * views are two subsets of the same row.
 */
import { ref, reactive, onMounted } from 'vue'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import FieldInput from './FieldInput.vue'
import { toPayload, type FieldDef, type FormState, type FieldValue } from './fields'
import { getSettings, updateSettings, fieldErrors } from '../api'
import type { PerfumeSettings } from '@shared/types/perfume'

const props = defineProps<{
  sections: { title: string; help?: string; fields: FieldDef[] }[]
}>()

const toast = useToast()
const form = reactive<FormState>({})
const errors = ref<Record<string, string>>({})
const loading = ref(true)
const saving = ref(false)

const allFields = props.sections.flatMap((s) => s.fields)

function fill(settings: PerfumeSettings): void {
  const row = settings as unknown as Record<string, FieldValue>
  for (const f of allFields) form[f.key] = row[f.key] ?? (f.type === 'lines' ? [] : f.type === 'toggle' ? false : f.type === 'number' ? null : '')
}

onMounted(async () => {
  try {
    fill(await getSettings())
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load the settings.', life: 4000 })
  } finally {
    loading.value = false
  }
})

async function save(): Promise<void> {
  saving.value = true
  errors.value = {}
  try {
    fill(await updateSettings(toPayload(form) as Partial<PerfumeSettings>))
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Settings updated.', life: 2500 })
  } catch (e: unknown) {
    errors.value = fieldErrors(e)
    if (Object.keys(errors.value).length === 0) {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save the settings.', life: 4000 })
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="!loading" class="space-y-6">
    <section v-for="s in sections" :key="s.title" class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 class="mb-1 text-sm font-semibold text-gray-800">{{ s.title }}</h3>
      <p v-if="s.help" class="mb-3 text-xs text-gray-400">{{ s.help }}</p>
      <div class="grid gap-4 md:grid-cols-2">
        <FieldInput
          v-for="f in s.fields"
          :key="f.key"
          :field="f"
          :model-value="form[f.key] ?? null"
          :error="errors[f.key]"
          :class="f.type === 'textarea' || f.type === 'richtext' || f.type === 'lines' ? 'md:col-span-2' : ''"
          @update:model-value="form[f.key] = $event"
        />
      </div>
    </section>
    <div class="flex justify-end">
      <Button label="Save" icon="pi pi-check" :loading="saving" @click="save" />
    </div>
  </div>
  <p v-else class="text-sm text-gray-400">Loading…</p>
</template>
