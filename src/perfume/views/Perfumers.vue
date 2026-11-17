<script setup lang="ts">
import SimpleCrud from '../components/SimpleCrud.vue'
import type { FieldDef } from '../components/fields'

const fields: FieldDef[] = [
  { key: 'name', label: 'Name', column: true, required: true },
  { key: 'slug', label: 'Slug', column: true, required: true, slugFrom: 'name' },
  { key: 'description', label: 'Biography', type: 'textarea' },
]
</script>

<template>
  <SimpleCrud title="Big Glow Day · Perfumers" resource="perfumers" :fields="fields" item-name="perfumer" add-label="Add perfumer" />
</template>
