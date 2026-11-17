<script setup lang="ts">
import SettingsForm from '../components/SettingsForm.vue'
import type { FieldDef } from '../components/fields'

const url = (key: string, label: string): FieldDef => ({ key, label, placeholder: 'https://…' })

const sections: { title: string; help?: string; fields: FieldDef[] }[] = [
  {
    title: 'Site',
    fields: [
      { key: 'site_name', label: 'Site name', required: true },
      { key: 'domain', label: 'Domain', required: true },
      { key: 'accent_color', label: 'Accent colour', type: 'color' },
      { key: 'logo_path', label: 'Logo', type: 'image' },
    ],
  },
  {
    title: 'Contacts',
    help: 'Shown in the top bar and the footer. Empty values are simply not shown.',
    fields: [
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'hours', label: 'Opening hours', placeholder: '10:00–20:00' },
      url('whatsapp_url', 'WhatsApp link'),
      url('viber_url', 'Viber link'),
      url('telegram_url', 'Telegram link'),
    ],
  },
  {
    title: 'Social links',
    fields: [url('instagram_url', 'Instagram'), url('facebook_url', 'Facebook'), url('tiktok_url', 'TikTok'), url('youtube_url', 'YouTube')],
  },
  {
    title: 'Top bar sale',
    help: 'The sale line shows only when the percentage is set. Use {sale_percent} in the text.',
    fields: [
      { key: 'topbar_sale_text', label: 'Sale text' },
      { key: 'sale_percent', label: 'Sale percentage', type: 'number' },
    ],
  },
  {
    title: 'Delivery, bonus and samples',
    help: 'These fill the {delivery_local_time}, {delivery_free_from}, {delivery_national_time}, {bonus_percent} and {samples_max_per_order} tokens in the home page texts. A sentence whose token is empty is dropped.',
    fields: [
      { key: 'delivery_local_time', label: 'Local delivery time', placeholder: 'same day' },
      { key: 'delivery_free_from', label: 'Free delivery from ($)', type: 'number' },
      { key: 'delivery_national_time', label: 'Nationwide delivery time', placeholder: '2–3 days' },
      { key: 'bonus_percent', label: 'Bonus points, % back', type: 'number' },
      { key: 'samples_max_per_order', label: 'Samples per order (max)', type: 'number' },
    ],
  },
  {
    title: 'Payment and map',
    fields: [
      { key: 'payment_labels', label: 'Payment labels (footer)', type: 'lines' },
      { key: 'map_embed_url', label: 'Map embed URL (stores block)', type: 'textarea', help: 'The src of a Google / Yandex map iframe. Empty = no map.' },
    ],
  },
]
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-xl font-semibold text-indigo-500">Big Glow Day · Settings</h2>
    <SettingsForm :sections="sections" />
  </div>
</template>
