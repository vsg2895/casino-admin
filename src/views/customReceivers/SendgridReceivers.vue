<script setup lang="ts">
/**
 * Custom Receivers → Sendgrid Receivers: a separate list, mailed only by
 * SendGrid keys. Same screen as the Mailgun list, against its own table.
 */
import ReceiverListPanel from '@/components/receivers/ReceiverListPanel.vue'
import { sendgridReceiverList } from '@/api/sendgridReceivers'
</script>

<template>
  <ReceiverListPanel
    :api="sendgridReceiverList"
    title="Sendgrid Receivers"
    description="Addresses reachable through your SendGrid keys — a separate list from Mailgun Receivers. Each key decides which of these it sends to, in its own Receivers settings."
    credentials-screen="SendGrid Keys"
  />
</template>
