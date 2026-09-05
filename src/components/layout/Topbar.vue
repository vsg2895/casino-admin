<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/authStore'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

async function handleLogout(): Promise<void> {
  await auth.logout()
  await router.push({ name: 'login' })
}

const signingOutOthers = ref(false)

/**
 * End every session but this one.
 *
 * Signing in already does this implicitly; this is for the admin who is already
 * signed in, suspects a session elsewhere, and does not want to sign themselves
 * out to deal with it.
 */
async function handleLogoutOtherDevices(): Promise<void> {
  signingOutOthers.value = true
  try {
    const revoked = await auth.logoutOtherDevices()
    toast.add({
      severity: revoked > 0 ? 'success' : 'info',
      summary: revoked > 0 ? 'Other sessions ended' : 'Nothing to sign out',
      detail:
        revoked > 0
          ? `Signed out ${revoked} other session${revoked === 1 ? '' : 's'}.`
          : 'This is the only active session on your account.',
      life: 4000,
    })
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Could not sign out the other sessions.',
      life: 4000,
    })
  } finally {
    signingOutOthers.value = false
  }
}

// Set by the login screen when signing in revoked other sessions. Shown here
// rather than there because the redirect to the panel unmounts the login view
// before a toast on it would be read.
onMounted(() => {
  try {
    const message = sessionStorage.getItem('auth_login_notice')
    if (message) {
      sessionStorage.removeItem('auth_login_notice')
      toast.add({ severity: 'info', summary: 'Other sessions ended', detail: message, life: 6000 })
    }
  } catch {
    // Private mode / blocked site data. The notice is a nicety, never load-bearing.
  }
})
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
               hover:border-gray-300 hover:text-gray-900 transition-colors disabled:opacity-60"
        :disabled="signingOutOthers"
        title="End every session except this one"
        @click="handleLogoutOtherDevices"
      >
        <i class="pi pi-desktop text-xs" />
        {{ signingOutOthers ? 'Signing out…' : 'Sign out other devices' }}
      </button>

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
