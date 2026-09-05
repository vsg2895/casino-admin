<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as authApi from '@/api/auth'
import axios from 'axios'

const route = useRoute()
const router = useRouter()

// Both arrive in the emailed link. The token is the credential; the email is
// carried with it because the broker verifies the pair, not the token alone.
const token = String(route.query.token ?? '')
const email = ref(String(route.query.email ?? ''))

const password = ref('')
const passwordConfirmation = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const done = ref(false)

const linkIsComplete = computed(() => token !== '' && email.value !== '')

async function submit(): Promise<void> {
  error.value = null
  loading.value = true

  try {
    await authApi.resetPassword({
      token,
      email: email.value,
      password: password.value,
      password_confirmation: passwordConfirmation.value,
    })
    done.value = true
    // Straight to sign-in: the reset revoked every session for this account, so
    // there is nothing to return to and the new password has to be used.
    setTimeout(() => router.push({ name: 'login' }), 2000)
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 429) {
      error.value = 'Too many attempts. Wait a minute and try again.'
    } else if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as { message?: string; errors?: Record<string, string[]> }
      error.value =
        data.errors?.password?.[0] ??
        data.errors?.email?.[0] ??
        data.message ??
        'That reset link is no longer valid.'
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
        <h1 class="text-2xl font-bold text-gray-900">Choose a new password</h1>
        <p class="mt-1 text-sm text-gray-500">This also signs out every other device</p>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <!-- A link opened without its query string cannot be completed here, and
             a form that submits into a guaranteed failure is worse than none. -->
        <div v-if="!linkIsComplete" class="space-y-4">
          <div class="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            This reset link is incomplete. Some mail clients trim long links — open it
            directly from the email, or request a new one.
          </div>
          <RouterLink
            :to="{ name: 'forgot-password' }"
            class="block text-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Request a new link
          </RouterLink>
        </div>

        <div v-else-if="done" class="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
          Password updated. Taking you to sign in…
        </div>

        <form v-else class="space-y-5" @submit.prevent="submit">
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
              readonly
              class="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
              New password
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="new-password"
              required
              :disabled="loading"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                     disabled:bg-gray-50 transition"
            />
          </div>

          <div>
            <label for="password_confirmation" class="block text-sm font-medium text-gray-700 mb-1">
              Confirm new password
            </label>
            <input
              id="password_confirmation"
              v-model="passwordConfirmation"
              type="password"
              autocomplete="new-password"
              required
              :disabled="loading"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                     disabled:bg-gray-50 transition"
            />
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white
                   hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                   disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {{ loading ? 'Updating…' : 'Set new password' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
