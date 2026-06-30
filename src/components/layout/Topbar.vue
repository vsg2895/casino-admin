<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

async function handleLogout(): Promise<void> {
  await auth.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <header class="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6">
    <!-- Page title -->
    <h1 class="text-base font-semibold text-gray-800">
      {{ route.meta['title'] ?? 'Dashboard' }}
    </h1>

    <!-- User area -->
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2.5">
        <div
          class="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white"
          :title="auth.user?.email"
        >
          {{ auth.user?.name?.charAt(0)?.toUpperCase() ?? '?' }}
        </div>
        <span class="text-sm font-medium text-gray-700">{{ auth.user?.name ?? '—' }}</span>
      </div>

      <button
        class="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600
               hover:border-gray-300 hover:text-gray-900 transition-colors"
        @click="handleLogout"
      >
        <i class="pi pi-sign-out text-xs" />
        Logout
      </button>
    </div>
  </header>
</template>
