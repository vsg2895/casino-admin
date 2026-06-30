<script setup lang="ts">
/**
 * Reusable attachment table used by Casino, Bonus, and Banner edit views.
 *
 * Renders one row per registered site. Each row has an "Attach" checkbox and
 * one editable input per override field. Works as a controlled component via
 * v-model. The parent is responsible for fetching initial attachments and
 * calling the sync API on save.
 */

import { ref, computed, watch, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Checkbox from 'primevue/checkbox'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import { useSitesStore } from '@/stores/sitesStore'

// ── Exported types ─────────────────────────────────────────────────────────────

export interface OverrideField {
  name: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'url' | 'select' | 'date'
  placeholder?: string
  options?: Array<{ label: string; value: string }>
}

/**
 * One element per attached site in the v-model array.
 * shape: { site_id, ...override_values }
 */
export interface AttachmentEntry {
  site_id: number
  [key: string]: string | number | boolean
}

// ── Internal types ─────────────────────────────────────────────────────────────

interface AttachmentRow {
  site_id: number
  site_name: string
  site_domain: string
  attached: boolean
  overrides: Record<string, string | number | boolean>
}

// ── Props & emits ──────────────────────────────────────────────────────────────

const props = defineProps<{
  entityType: 'casino' | 'bonus' | 'banner'
  entityId: number
  overrideFields: OverrideField[]
  modelValue: AttachmentEntry[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: AttachmentEntry[]]
}>()

// ── Store ──────────────────────────────────────────────────────────────────────

const store = useSitesStore()

// ── State ──────────────────────────────────────────────────────────────────────

const rows = ref<AttachmentRow[]>([])

// Template values used by "apply to all attached" toolbar
const tmpl = ref<Record<string, string | number | boolean>>({})

// Prevent rebuild loop: store the exact array we last emitted.
// When the v-model echo arrives (parent reflects our own emit back),
// the reference is identical and we skip the rebuild.
let lastEmitted: AttachmentEntry[] = []

// ── Computed ───────────────────────────────────────────────────────────────────

const attachedCount = computed(() => rows.value.filter((r) => r.attached).length)

// ── Helpers ────────────────────────────────────────────────────────────────────

function zero(type: OverrideField['type']): string | number | boolean {
  if (type === 'number') return 0
  if (type === 'boolean') return false
  return ''
}

function initTemplate(): void {
  const t: Record<string, string | number | boolean> = {}
  for (const f of props.overrideFields) {
    t[f.name] = zero(f.type)
  }
  tmpl.value = t
}

function buildRows(): void {
  const map = new Map(props.modelValue.map((a) => [a.site_id, a]))

  rows.value = store.sites.map((site) => {
    const existing = map.get(site.id)
    const overrides: Record<string, string | number | boolean> = {}

    for (const f of props.overrideFields) {
      const raw = existing?.[f.name]
      overrides[f.name] = raw !== undefined ? raw : zero(f.type)
    }

    return {
      site_id: site.id,
      site_name: site.name,
      site_domain: site.domain,
      attached: !!existing,
      overrides,
    }
  })
}

// ── Emit ───────────────────────────────────────────────────────────────────────

function emitChange(): void {
  const output: AttachmentEntry[] = rows.value
    .filter((r) => r.attached)
    .map((r) => {
      const entry: AttachmentEntry = { site_id: r.site_id }
      for (const f of props.overrideFields) {
        entry[f.name] = r.overrides[f.name] ?? zero(f.type)
      }
      return entry
    })

  lastEmitted = output
  emit('update:modelValue', output)
}

// ── Row handlers ───────────────────────────────────────────────────────────────

function onAttach(row: AttachmentRow, val: boolean): void {
  row.attached = val
  emitChange()
}

function onStringChange(row: AttachmentRow, field: string, val: string | undefined): void {
  row.overrides[field] = val ?? ''
  if (row.attached) emitChange()
}

function onNumberChange(row: AttachmentRow, field: string, val: number | null): void {
  row.overrides[field] = val ?? 0
  if (row.attached) emitChange()
}

function onBoolChange(row: AttachmentRow, field: string, val: boolean): void {
  row.overrides[field] = val
  if (row.attached) emitChange()
}

// ── Template (bulk-apply) handlers ─────────────────────────────────────────────

function onTmplString(field: string, val: string | undefined): void {
  tmpl.value[field] = val ?? ''
}

function onTmplNumber(field: string, val: number | null): void {
  tmpl.value[field] = val ?? 0
}

function onTmplBool(field: string, val: boolean): void {
  tmpl.value[field] = val
}

function onTmplDate(field: string, val: Date | null): void {
  tmpl.value[field] = val ? val.toISOString() : ''
}

// ── Date / select helpers ──────────────────────────────────────────────────────

function toDate(val: string | number | boolean): Date | null {
  if (typeof val !== 'string' || !val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

function onSelectChange(row: AttachmentRow, field: string, val: string | undefined): void {
  row.overrides[field] = val ?? ''
  if (row.attached) emitChange()
}

function onDateChange(row: AttachmentRow, field: string, val: Date | null): void {
  row.overrides[field] = val ? val.toISOString() : ''
  if (row.attached) emitChange()
}

function applyTemplate(): void {
  for (const row of rows.value) {
    if (!row.attached) continue
    for (const [key, val] of Object.entries(tmpl.value)) {
      row.overrides[key] = val
    }
  }
  emitChange()
}

// ── Watchers ───────────────────────────────────────────────────────────────────

// Only rebuild when the parent provides a genuinely different array
// (e.g. switching to a different entity). Skip when it's just our own emit echoed back.
watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal === lastEmitted) return
    buildRows()
  },
)

// Rebuild when the site list is loaded or changes
watch(() => store.sites, buildRows)

// ── Mount ──────────────────────────────────────────────────────────────────────

onMounted(async () => {
  initTemplate()
  await store.fetchSites()
  buildRows()
})
</script>

<template>
  <div class="space-y-3">
    <!--
      Bulk-apply toolbar — visible once at least one site is attached.
      User fills template values here, then clicks Apply to copy them
      into all attached rows at once.
    -->
    <div
      v-if="attachedCount > 0"
      class="flex flex-wrap items-end gap-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3"
    >
      <p class="w-full text-xs font-semibold text-indigo-700 mb-0.5">
        Apply same values to all {{ attachedCount }} attached site{{ attachedCount === 1 ? '' : 's' }}
      </p>

      <template v-for="field in overrideFields" :key="field.name">
        <!-- boolean: compact inline checkbox -->
        <div v-if="field.type === 'boolean'" class="flex flex-col items-center gap-1">
          <label class="text-xs font-medium text-indigo-600">{{ field.label }}</label>
          <Checkbox
            :model-value="Boolean(tmpl[field.name])"
            binary
            @update:model-value="(v) => onTmplBool(field.name, Boolean(v))"
          />
        </div>

        <!-- number field -->
        <div v-else-if="field.type === 'number'" class="flex flex-col gap-1">
          <label class="text-xs font-medium text-indigo-600">{{ field.label }}</label>
          <InputNumber
            :model-value="Number(tmpl[field.name] ?? 0)"
            :use-grouping="false"
            input-class="w-24 text-sm"
            @update:model-value="(v) => onTmplNumber(field.name, v)"
          />
        </div>

        <!-- select field -->
        <div v-else-if="field.type === 'select'" class="flex flex-col gap-1">
          <label class="text-xs font-medium text-indigo-600">{{ field.label }}</label>
          <Select
            :model-value="String(tmpl[field.name] ?? '')"
            :options="field.options ?? []"
            option-label="label"
            option-value="value"
            size="small"
            class="w-40"
            @update:model-value="(v) => onTmplString(field.name, v)"
          />
        </div>

        <!-- date field -->
        <div v-else-if="field.type === 'date'" class="flex flex-col gap-1">
          <label class="text-xs font-medium text-indigo-600">{{ field.label }}</label>
          <DatePicker
            :model-value="toDate(tmpl[field.name] ?? '')"
            show-time
            hour-format="24"
            class="w-48"
            @update:model-value="(v) => onTmplDate(field.name, v as Date | null)"
          />
        </div>

        <!-- text / url field -->
        <div v-else class="flex flex-col gap-1">
          <label class="text-xs font-medium text-indigo-600">{{ field.label }}</label>
          <InputText
            :model-value="String(tmpl[field.name] ?? '')"
            size="small"
            :placeholder="field.placeholder ?? field.label"
            class="w-44"
            @update:model-value="(v) => onTmplString(field.name, v)"
          />
        </div>
      </template>

      <Button
        label="Apply to all"
        icon="pi pi-check"
        size="small"
        severity="secondary"
        class="self-end"
        @click="applyTemplate"
      />
    </div>

    <!-- Attachment table -->
    <div class="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <DataTable
        :value="rows"
        :loading="store.loading"
        striped-rows
        class="text-sm"
      >
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">
            No sites registered yet. Register a domain in the Sites section.
          </div>
        </template>

        <!-- Attach checkbox -->
        <Column header="Attach" :style="{ width: '72px', textAlign: 'center' }">
          <template #body="{ data: row }: { data: AttachmentRow }">
            <Checkbox
              :model-value="row.attached"
              binary
              @update:model-value="(v) => onAttach(row, Boolean(v))"
            />
          </template>
        </Column>

        <!-- Site info -->
        <Column header="Site" :style="{ minWidth: '200px' }">
          <template #body="{ data: row }: { data: AttachmentRow }">
            <div :class="['transition-opacity', !row.attached && 'opacity-40']">
              <p class="font-medium text-gray-900 leading-tight">{{ row.site_name }}</p>
              <p class="font-mono text-xs text-gray-400 mt-0.5">{{ row.site_domain }}</p>
            </div>
          </template>
        </Column>

        <!-- Dynamic override columns -->
        <Column
          v-for="field in overrideFields"
          :key="field.name"
          :header="field.label"
          :style="{ minWidth: field.type === 'boolean' ? '90px' : field.type === 'number' ? '120px' : field.type === 'select' ? '150px' : field.type === 'date' ? '210px' : '180px' }"
        >
          <template #body="{ data: row }: { data: AttachmentRow }">
            <!-- text / url -->
            <InputText
              v-if="field.type === 'text' || field.type === 'url'"
              :model-value="String(row.overrides[field.name] ?? '')"
              :disabled="!row.attached"
              size="small"
              :placeholder="field.placeholder ?? ''"
              fluid
              @update:model-value="(v) => onStringChange(row, field.name, v)"
            />

            <!-- number -->
            <InputNumber
              v-else-if="field.type === 'number'"
              :model-value="Number(row.overrides[field.name] ?? 0)"
              :disabled="!row.attached"
              :use-grouping="false"
              input-class="w-full text-sm"
              @update:model-value="(v) => onNumberChange(row, field.name, v)"
            />

            <!-- boolean -->
            <Checkbox
              v-else-if="field.type === 'boolean'"
              :model-value="Boolean(row.overrides[field.name])"
              binary
              :disabled="!row.attached"
              @update:model-value="(v) => onBoolChange(row, field.name, Boolean(v))"
            />

            <!-- select -->
            <Select
              v-else-if="field.type === 'select'"
              :model-value="String(row.overrides[field.name] ?? '')"
              :options="field.options ?? []"
              option-label="label"
              option-value="value"
              :disabled="!row.attached"
              fluid
              @update:model-value="(v) => onSelectChange(row, field.name, v)"
            />

            <!-- date -->
            <DatePicker
              v-else-if="field.type === 'date'"
              :model-value="toDate(row.overrides[field.name] ?? '')"
              :disabled="!row.attached"
              show-time
              hour-format="24"
              fluid
              @update:model-value="(v) => onDateChange(row, field.name, v as Date | null)"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>
