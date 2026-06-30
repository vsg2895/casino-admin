<script setup lang="ts">
import Toast from 'primevue/toast'
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-gray-50">
    <Toast position="top-right" />
    <Sidebar />

    <div class="flex flex-1 flex-col overflow-hidden">
      <Topbar />

      <main class="flex-1 overflow-y-auto p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
