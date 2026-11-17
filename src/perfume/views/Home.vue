<script setup lang="ts">
import SettingsForm from '../components/SettingsForm.vue'
import SimpleCrud from '../components/SimpleCrud.vue'
import type { FieldDef } from '../components/fields'

const sections: { title: string; help?: string; fields: FieldDef[] }[] = [
  {
    title: 'Hero',
    fields: [
      { key: 'hero_eyebrow', label: 'Eyebrow line' },
      { key: 'hero_title', label: 'Title', help: 'Wrap the accent clause in *asterisks*: it is set in the italic accent colour.' },
      { key: 'hero_text', label: 'Text', type: 'textarea' },
      { key: 'hero_cta_primary_label', label: 'Primary button label' },
      { key: 'hero_cta_primary_url', label: 'Primary button URL', placeholder: '#new or /category/women' },
      { key: 'hero_cta_secondary_label', label: 'Secondary button label' },
      { key: 'hero_cta_secondary_url', label: 'Secondary button URL' },
    ],
  },
  {
    title: 'Section titles',
    fields: [
      { key: 'notes_title', label: 'Notes block title' },
      { key: 'new_arrivals_title', label: 'New arrivals title', help: 'The products shown are those flagged "New arrival".' },
      { key: 'brands_title', label: 'Brands block title', help: 'Shows the brands flagged "Featured".' },
      { key: 'stores_title', label: 'Stores block title' },
    ],
  },
  {
    title: 'Samples block',
    fields: [
      { key: 'samples_title', label: 'Title' },
      { key: 'samples_text', label: 'Text', type: 'textarea', help: 'May use {samples_max_per_order}.' },
      { key: 'samples_steps', label: 'Steps', type: 'lines' },
      { key: 'samples_cta_label', label: 'Button label' },
      { key: 'samples_cta_url', label: 'Button URL' },
    ],
  },
]

const tileFields: FieldDef[] = [
  { key: 'number', label: 'Number', column: true, placeholder: '01' },
  { key: 'title', label: 'Title', column: true, required: true },
  { key: 'url', label: 'URL', column: true, placeholder: '/category/women' },
  { key: 'position', label: 'Order', type: 'number', column: true, default: 0 },
  { key: 'active', label: 'Active', type: 'toggle', column: true, default: true },
]

const serviceFields: FieldDef[] = [
  { key: 'title', label: 'Title', column: true, required: true },
  { key: 'text', label: 'Text', type: 'textarea', help: 'May use the delivery / bonus tokens from Settings.' },
  { key: 'link_label', label: 'Link label', column: true },
  { key: 'url', label: 'Link URL', column: true, help: 'Empty = the label is shown without a link.' },
  { key: 'position', label: 'Order', type: 'number', column: true, default: 0 },
  { key: 'active', label: 'Active', type: 'toggle', column: true, default: true },
]
</script>

<template>
  <div class="space-y-8">
    <div>
      <h2 class="text-xl font-semibold text-indigo-500">Big Glow Day · Home page</h2>
      <p class="mt-1 text-sm text-gray-500">Texts and cards of the home page. New arrivals, note chips and featured brands are flags on those items.</p>
    </div>
    <SettingsForm :sections="sections" />
    <SimpleCrud title="Hero tiles" subtitle="The three numbered tiles beside the hero." resource="home-cards" :fields="tileFields" :fixed="{ kind: 'hero_tile' }" item-name="tile" add-label="Add tile" />
    <SimpleCrud title="Service cards" subtitle="Only originals · Delivery · Bonus points." resource="home-cards" :fields="serviceFields" :fixed="{ kind: 'service' }" item-name="card" add-label="Add card" />
  </div>
</template>
