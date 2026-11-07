<script setup lang="ts">
/**
 * Custom Receivers → Mailgun Receivers: the list Mailgun credentials and stored
 * SMTP servers (Email Configs) send to. The screen itself is the shared panel.
 */
import ReceiverListPanel from '@/components/receivers/ReceiverListPanel.vue'
import { mailgunReceiverList } from '@/api/mailgunReceivers'
</script>

<template>
  <ReceiverListPanel
    :api="mailgunReceiverList"
    title="Mailgun Receivers"
    description="Addresses reachable through your Mailgun credentials and Email Configs. Each credential decides which of these it sends to, in its own Receivers settings."
    credentials-screen="Mailgun Credentials or Email Configs"
  />
</template>
