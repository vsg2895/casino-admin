<script setup lang="ts">
import SimpleCrud from '../components/SimpleCrud.vue'
import type { FieldDef } from '../components/fields'

const fields: FieldDef[] = [
  { key: 'name', label: 'Name', column: true, required: true },
  { key: 'address', label: 'Address', column: true, required: true },
  { key: 'hours', label: 'Hours', column: true, placeholder: '10:00–20:00' },
  { key: 'map_url', label: 'Route link (map URL)', placeholder: 'https://maps.google.com/…' },
  { key: 'active', label: 'Active', type: 'toggle', column: true, default: true },
]
</script>

<template>
  <SimpleCrud title="Big Glow Day · Stores" subtitle="The “Visit a store” block on the home page. With no stores it is hidden." resource="stores" :fields="fields" item-name="store" add-label="Add store" />
</template>
