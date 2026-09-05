<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { takeLogoutReason } from '@/api/client'
import axios from 'axios'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const loading = ref(false)

// Read once, on arrival: whoever was redirected here by an expired or revoked
// token deserves to know that is what happened, rather than assuming the panel
// logged them out at random.
onMounted(() => {
  if (takeLogoutReason() === 'expired') {
    notice.value = 'Your session ended. Sign in again to continue.'
  }
})

async function submit(): Promise<void> {
  error.value = null
  loading.value = true

  try {
    const revoked = await auth.login({ email: email.value, password: password.value })

    // Signing in is exclusive — the API revokes every other session for this
    // account. Saying so is not a nicety: an admin whose other device silently
    // stops working needs to recognise their own doing.
    if (revoked > 0) {
      sessionStorage.setItem(
        'auth_login_notice',
        `Signed out ${revoked} other session${revoked === 1 ? '' : 's'} on this account.`,
      )
    }

    await router.push({ name: 'casinos' })
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as { message?: string }
      error.value = data.message ?? 'Invalid credentials.'
    } else if (axios.isAxiosError(e) && e.response?.status === 401) {
      error.value = 'Invalid email or password.'
    } else {
      error.value = 'An unexpected error occurred. Please try again.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <h1 class="text-2xl font-bold text-gray-900">Casino Admin</h1>
        <p class="mt-1 text-sm text-gray-500">Sign in to manage your platform</p>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <form class="space-y-5" @submit.prevent="submit">
          <div v-if="notice" class="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            {{ notice }}
          </div>

          <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {{ error }}
          </div>

          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
              Email address
            </label>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
              :disabled="loading"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                     disabled:bg-gray-50 disabled:text-gray-500 transition"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <div class="mb-1 flex items-baseline justify-between">
              <label for="password" class="block text-sm font-medium text-gray-700">
                Password
              </label>
              <RouterLink
                :to="{ name: 'forgot-password' }"
                class="text-xs font-medium text-indigo-600 hover:text-indigo-500"
              >
                Forgot password?
              </RouterLink>
            </div>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              required
              :disabled="loading"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                     disabled:bg-gray-50 disabled:text-gray-500 transition"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white
                   hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                   disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <span v-if="loading" class="flex items-center justify-center gap-2">
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Signing in…
            </span>
            <span v-else>Sign in</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
