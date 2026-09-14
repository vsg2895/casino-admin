<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import axios from 'axios'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Password from 'primevue/password'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/authStore'
import type { ErrorResponse } from '@shared/types/api'

const auth = useAuthStore()
const toast = useToast()

const form = reactive({
  current_password: '',
  password: '',
  password_confirmation: '',
})

const loading = ref(false)
const globalError = ref<string | null>(null)
const fieldErrors = ref<Record<string, string>>({})

/**
 * The policy, mirrored from the server for live feedback only.
 *
 * The API is the authority — AppServiceProvider's Password::defaults() is what
 * actually decides, and in production it additionally rejects passwords found in
 * known breach corpora, which nothing here can check. So this list is allowed to
 * say "looks fine" and still be overruled by a 422, and the form is built to show
 * that server message rather than trusting these ticks.
 */
const rules = computed(() => [
  { label: 'At least 12 characters', met: form.password.length >= 12 },
  { label: 'An uppercase and a lowercase letter', met: /\p{Lu}/u.test(form.password) && /\p{Ll}/u.test(form.password) },
  { label: 'A number', met: /\d/.test(form.password) },
  { label: 'A symbol', met: /[^\p{L}\p{N}]/u.test(form.password) },
  {
    label: 'Different from your current password',
    met: form.password.length > 0 && form.password !== form.current_password,
  },
])

const confirmationMatches = computed(
  () => form.password_confirmation.length > 0 && form.password === form.password_confirmation,
)

const canSubmit = computed(
  () =>
    !loading.value &&
    form.current_password.length > 0 &&
    rules.value.every((r) => r.met) &&
    confirmationMatches.value,
)

function reset(): void {
  form.current_password = ''
  form.password = ''
  form.password_confirmation = ''
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return

  globalError.value = null
  fieldErrors.value = {}
  loading.value = true

  try {
    const revoked = await auth.changePassword({ ...form })

    // Cleared on success so the new password is not left sitting in a form
    // field on an unattended screen.
    reset()

    toast.add({
      severity: 'success',
      summary: 'Password changed',
      detail:
        revoked > 0
          ? `Signed out ${revoked} other session${revoked === 1 ? '' : 's'}. This one stays signed in.`
          : 'This session stays signed in. No other sessions were active.',
      life: 6000,
    })
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as ErrorResponse
      globalError.value = data.message
      for (const [field, messages] of Object.entries(data.errors ?? {})) {
        fieldErrors.value[field] = messages[0] ?? ''
      }
    } else if (axios.isAxiosError(e) && e.response?.status === 429) {
      globalError.value = 'Too many attempts. Wait a minute and try again.'
    } else {
      globalError.value = 'Could not change the password. Please try again.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-xl font-semibold text-gray-900">Change Password</h1>
      <p class="mt-0.5 text-sm text-gray-500">
        Update the password for <strong>{{ auth.user?.email ?? 'your account' }}</strong>.
      </p>
    </div>

    <Message severity="info" :closable="false" class="text-sm">
      Changing the password ends every other signed-in session and emails the account
      address to say it happened. This session stays signed in.
    </Message>

    <div class="max-w-xl rounded-xl border border-gray-200 bg-white p-6">
      <form class="space-y-5" autocomplete="on" @submit.prevent="submit">
        <div
          v-if="globalError"
          class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {{ globalError }}
        </div>

        <!--
          Hidden, and not decoration: without a username field, password managers
          cannot tell WHICH account this form belongs to, so they either skip
          saving the new password or save it against the wrong entry. The operator
          then changes their password and loses the saved copy of it.
        -->
        <input
          type="text"
          name="username"
          autocomplete="username"
          :value="auth.user?.email ?? ''"
          class="hidden"
          tabindex="-1"
          aria-hidden="true"
          readonly
        />

        <div>
          <label for="current-password" class="mb-1 block text-sm font-medium text-gray-700">
            Current password <span class="text-red-500">*</span>
          </label>
          <Password
            input-id="current-password"
            v-model="form.current_password"
            :feedback="false"
            toggle-mask
            fluid
            input-class="w-full"
            :input-props="{ autocomplete: 'current-password', required: true }"
          />
          <p v-if="fieldErrors['current_password']" class="mt-1 text-xs text-red-600">
            {{ fieldErrors['current_password'] }}
          </p>
          <p v-else class="mt-1 text-xs text-gray-500">
            Required even though you are signed in — it is what proves the change is
            coming from you and not from a session someone else got hold of.
          </p>
        </div>

        <div>
          <label for="new-password" class="mb-1 block text-sm font-medium text-gray-700">
            New password <span class="text-red-500">*</span>
          </label>
          <Password
            input-id="new-password"
            v-model="form.password"
            :feedback="false"
            toggle-mask
            fluid
            input-class="w-full"
            :input-props="{ autocomplete: 'new-password', required: true }"
          />
          <p v-if="fieldErrors['password']" class="mt-1 text-xs text-red-600">
            {{ fieldErrors['password'] }}
          </p>

          <ul class="mt-2 space-y-1">
            <li
              v-for="rule in rules"
              :key="rule.label"
              class="flex items-center gap-2 text-xs"
              :class="rule.met ? 'text-emerald-700' : 'text-gray-500'"
            >
              <i :class="['pi', rule.met ? 'pi-check-circle' : 'pi-circle', 'text-[11px]']" />
              {{ rule.label }}
            </li>
          </ul>
          <p class="mt-2 text-xs text-gray-400">
            A long passphrase of a few unrelated words beats a short scramble, and is easier
            to type. Use a password manager if you have one.
          </p>
        </div>

        <div>
          <label for="confirm-password" class="mb-1 block text-sm font-medium text-gray-700">
            Confirm new password <span class="text-red-500">*</span>
          </label>
          <Password
            input-id="confirm-password"
            v-model="form.password_confirmation"
            :feedback="false"
            toggle-mask
            fluid
            input-class="w-full"
            :input-props="{ autocomplete: 'new-password', required: true }"
          />
          <p
            v-if="form.password_confirmation.length > 0 && !confirmationMatches"
            class="mt-1 text-xs text-red-600"
          >
            The two passwords do not match.
          </p>
        </div>

        <div class="flex items-center gap-3 border-t border-gray-100 pt-4">
          <Button type="submit" label="Change Password" :loading="loading" :disabled="!canSubmit" />
          <Button label="Clear" text :disabled="loading" @click="reset" />
        </div>
      </form>
    </div>

    <p class="max-w-xl text-xs text-gray-500">
      Forgotten the current password instead? Sign out and use the
      <RouterLink :to="{ name: 'forgot-password' }" class="text-indigo-600 hover:text-indigo-500">
        reset link
      </RouterLink>
      — it is emailed to the account address and does not need the old password.
    </p>
  </div>
</template>
