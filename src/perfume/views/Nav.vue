<script setup lang="ts">
import SimpleCrud from '../components/SimpleCrud.vue'
import type { FieldDef } from '../components/fields'

/**
 * Only the FOOTER is editable here. The header menu is the three sections
 * (Sections page) and carries nothing else, so there is nothing to manage.
 */
const footerFields: FieldDef[] = [
  { key: 'group_label', label: 'Column', column: true, required: true, placeholder: 'Shop / Help / About' },
  { key: 'label', label: 'Label', column: true, required: true },
  { key: 'url', label: 'URL', column: true, required: true, placeholder: '/category/women' },
  { key: 'position', label: 'Order', type: 'number', column: true, default: 0 },
  { key: 'active', label: 'Active', type: 'toggle', column: true, default: true },
]
</script>

<template>
  <SimpleCrud
    title="Big Glow Day · Footer links"
    subtitle="Grouped by column name, in order. The header menu is the three sections and is not edited here."
    resource="nav-items"
    :fields="footerFields"
    :fixed="{ location: 'footer' }"
    item-name="link"
    add-label="Add link"
  />
</template>
