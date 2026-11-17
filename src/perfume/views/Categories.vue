<script setup lang="ts">
import SimpleCrud from '../components/SimpleCrud.vue'
import type { FieldDef } from '../components/fields'

/**
 * The shop sells in three sections — Women, Men and Unisex — and those are
 * the whole header menu. A product is put into one of them in the product
 * editor.
 */
const fields: FieldDef[] = [
  { key: 'name', label: 'Menu name', column: true, required: true },
  { key: 'slug', label: 'Slug', column: true, required: true, slugFrom: 'name' },
  { key: 'title', label: 'Page title', column: true, placeholder: "Men's fragrances" },
  { key: 'description', label: 'Text under the listing', type: 'richtext' },
  { key: 'active', label: 'Active', type: 'toggle', column: true, default: true },
]
</script>

<template>
  <SimpleCrud
    title="Big Glow Day · Sections"
    subtitle="Women, Men and Unisex — the three sections of the shop and its whole header menu."
    resource="categories"
    :fields="fields"
    item-name="section"
    add-label="Add section"
  />
</template>
