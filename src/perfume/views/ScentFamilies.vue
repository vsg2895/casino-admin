<script setup lang="ts">
import SimpleCrud from '../components/SimpleCrud.vue'
import type { FieldDef } from '../components/fields'

const fields: FieldDef[] = [
  { key: 'name', label: 'Name', column: true, required: true },
  { key: 'slug', label: 'Slug', column: true, required: true, slugFrom: 'name' },
]
</script>

<template>
  <SimpleCrud title="Big Glow Day · Scent families" subtitle="Woody, Citrus, Fougère… — one per product, and a catalog filter." resource="scent-families" :fields="fields" item-name="family" add-label="Add family" />
</template>
