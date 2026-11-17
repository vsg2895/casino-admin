<script setup lang="ts">
import SimpleCrud from '../components/SimpleCrud.vue'
import type { FieldDef } from '../components/fields'

const fields: FieldDef[] = [
  { key: 'title', label: 'Title', column: true, required: true },
  { key: 'slug', label: 'Slug', column: true, required: true, slugFrom: 'title', help: 'The page is served at /info/<slug>.' },
  { key: 'body', label: 'Body', type: 'richtext' },
  { key: 'active', label: 'Published', type: 'toggle', column: true, default: true },
]
</script>

<template>
  <SimpleCrud title="Big Glow Day · Pages" subtitle="Delivery, returns, authenticity, FAQ, contacts, about, privacy." resource="pages" :fields="fields" item-name="page" add-label="Add page" />
</template>
