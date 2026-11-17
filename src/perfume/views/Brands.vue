<script setup lang="ts">
import SimpleCrud from '../components/SimpleCrud.vue'
import type { FieldDef } from '../components/fields'

const fields: FieldDef[] = [
  { key: 'name', label: 'Name', column: true, required: true },
  { key: 'slug', label: 'Slug', column: true, required: true, slugFrom: 'name' },
  { key: 'country', label: 'Country', column: true },
  { key: 'description', label: 'Description', type: 'textarea', help: 'Shown under the listing on the brand page.' },
  { key: 'featured', label: 'Featured on the home page', type: 'toggle', column: true },
  { key: 'active', label: 'Active', type: 'toggle', column: true, default: true },
]
</script>

<template>
  <SimpleCrud title="Big Glow Day · Brands" subtitle="Houses in the catalog. Featured brands appear on the home page." resource="brands" :fields="fields" item-name="brand" add-label="Add brand" />
</template>
