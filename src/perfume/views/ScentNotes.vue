<script setup lang="ts">
import SimpleCrud from '../components/SimpleCrud.vue'
import type { FieldDef } from '../components/fields'

const fields: FieldDef[] = [
  { key: 'name', label: 'Name', column: true, required: true },
  { key: 'slug', label: 'Slug', column: true, required: true, slugFrom: 'name' },
  { key: 'featured_on_home', label: 'Show as a chip on the home page', type: 'toggle', column: true },
]
</script>

<template>
  <SimpleCrud title="Big Glow Day · Scent notes" subtitle="Used in each product's notes pyramid and in the home page chips." resource="scent-notes" :fields="fields" item-name="note" add-label="Add note" />
</template>
