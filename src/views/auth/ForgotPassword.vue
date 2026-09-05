<script setup lang="ts">
import { ref } from 'vue'
import * as authApi from '@/api/auth'
import axios from 'axios'

const email = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
// The success message replaces the form entirely. Leaving the form up invites a
// second submit, which the throttle then rejects with an error — for an action
// that already succeeded.
const sent = ref(false)

async function submit(): Promise<void> {
  error.value = null
  loading.value = true

  try {
    await authApi.forgotPassword(email.value)
    sent.value = true
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 429) {
      error.value = 'Too many requests. Wait a minute and try again.'
    } else if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as { errors?: Record<string, string[]> }
      error.value = data.errors?.email?.[0] ?? 'Enter a valid email address.'
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
        <h1 class="text-2xl font-bold text-gray-900">Reset your password</h1>
        <p class="mt-1 text-sm text-gray-500">We'll email you a link to set a new one</p>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <!-- Deliberately does NOT say whether the address has an account: the API
             answers identically either way, and a UI that distinguishes them
             would hand back the account enumeration the API refuses to give. -->
        <div v-if="sent" class="space-y-4">
          <div class="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
            If that address belongs to an account, a reset link is on its way. The link is
            valid for 60 minutes.
          </div>
          <p class="text-sm text-gray-500">
            Nothing arrived? Check the spam folder, then try again in a minute.
          </p>
          <RouterLink
            :to="{ name: 'login' }"
            class="block text-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Back to sign in
          </RouterLink>
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
              :disabled="loading"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                     disabled:bg-gray-50 disabled:text-gray-500 transition"
              placeholder="admin@example.com"
            />
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white
                   hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                   disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {{ loading ? 'Sending…' : 'Email me a reset link' }}
          </button>

          <RouterLink
            :to="{ name: 'login' }"
            class="block text-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Back to sign in
          </RouterLink>
        </form>
      </div>
    </div>
  </div>
</template>
