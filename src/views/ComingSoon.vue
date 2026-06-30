<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="flex items-center justify-center h-64 text-gray-400">
    <div class="text-center">
      <p class="text-2xl font-semibold text-gray-600">{{ route.meta['title'] }}</p>
      <p class="mt-1 text-sm">This section is coming soon.</p>
    </div>
  </div>
</template>
