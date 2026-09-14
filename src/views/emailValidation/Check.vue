<script setup lang="ts">
/**
 * Validate Email — check one address on demand.
 *
 * Every click spends a real SendGrid credit from the shared 2,500/month budget
 * unless the verdict is already cached, so this fires ONLY on an explicit
 * submit: never on mount, never on keystroke, never on a watcher.
 */
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import { useSitesStore } from '@/stores/sitesStore'
import { checkEmailAddress } from '@/api/emailValidation'
import axios from 'axios'
import type { EmailValidationCheckResult } from '@shared/types/emailValidation'
import type { ErrorResponse } from '@shared/types/api'

const sitesStore = useSitesStore()
const toast = useToast()

const email = ref('')
const siteId = ref<number | null>(null)
const loading = ref(false)
const result = ref<EmailValidationCheckResult | null>(null)
const fieldError = ref('')

const siteOptions = computed(() => sitesStore.sites.map((s) => ({ label: s.name, value: s.id })))
const canSubmit = computed(() => email.value.trim() !== '' && siteId.value !== null && !loading.value)

async function run(): Promise<void> {
  if (!canSubmit.value) return
  loading.value = true
  fieldError.value = ''
  result.value = null

  try {
    result.value = await checkEmailAddress(email.value.trim(), siteId.value as number)
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as ErrorResponse
      fieldError.value = data.errors?.email?.[0] ?? data.message
    } else if (axios.isAxiosError(e) && e.response?.status === 429) {
      fieldError.value = 'Too many checks in a short time. Wait a moment and try again.'
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: 'The check could not be run.', life: 5000 })
    }
  } finally {
    loading.value = false
  }
}

const verdictSeverity = (v: string | null): string =>
  v === 'Valid' ? 'success' : v === 'Risky' ? 'warn' : v === 'Invalid' ? 'danger' : 'secondary'

/** SendGrid's nested checks, flattened for display. */
const checkRows = computed(() => {
  const c = result.value?.checks
  if (!c) return []
  return ([
    ['Valid address syntax', c.domain?.has_valid_address_syntax, false],
    ['Domain has MX or A record', c.domain?.has_mx_or_a_record, false],
    ['Suspected disposable address', c.domain?.is_suspected_disposable_address, true],
    ['Suspected role address', c.local_part?.is_suspected_role_address, true],
    ['Known bounces', c.additional?.has_known_bounces, true],
    ['Suspected bounces', c.additional?.has_suspected_bounces, true],
  ] as [string, boolean | undefined, boolean][])
    .filter(([, v]) => v !== undefined)
    .map(([label, value, badWhenTrue]) => ({
      label,
      value: value as boolean,
      // A "true" is good for syntax/MX and bad for disposable/role/bounces —
      // colouring every true green would misread half the report.
      good: badWhenTrue ? !value : value,
    }))
})

sitesStore.fetchSites().then(() => {
  if (siteId.value === null) siteId.value = sitesStore.sites[0]?.id ?? null
}).catch(() => { /* the operator can still pick manually once loaded */ })
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-xl font-semibold text-gray-900">Validate Email</h1>
      <p class="mt-0.5 text-sm text-gray-500">
        Check a single address against SendGrid and see the full result.
      </p>
    </div>

    <Message severity="info" :closable="false" class="text-sm">
      Each check spends <strong>one validation credit</strong> from the monthly quota, unless the
      address was already checked recently — a cached result is free and is labelled as such.
    </Message>

    <div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div class="flex flex-wrap items-end gap-3">
        <div class="min-w-0 flex-1">
          <label class="mb-1 block text-sm font-medium text-gray-700">Email address</label>
          <InputText
            v-model="email"
            fluid
            placeholder="someone@example.com"
            :invalid="fieldError !== ''"
            @keyup.enter="run"
          />
          <p v-if="fieldError" class="mt-1 text-xs text-red-600">{{ fieldError }}</p>
        </div>
        <div class="w-56">
          <label class="mb-1 block text-sm font-medium text-gray-700">Attribute to site</label>
          <Select v-model="siteId" :options="siteOptions" option-label="label" option-value="value" fluid />
        </div>
        <Button
          label="Validate"
          icon="pi pi-check-circle"
          :loading="loading"
          :disabled="!canSubmit"
          @click="run"
        />
      </div>
      <p class="mt-2 text-xs text-gray-400">
        The site is recorded against the check so the credit is attributed in the stats. It does not
        change the result.
      </p>
    </div>

    <div v-if="result" class="space-y-4">
      <!-- The headline answer: would this address get a verification email? -->
      <div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Result for</p>
            <p class="mt-0.5 text-lg font-semibold text-gray-900">{{ result.email }}</p>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-right">
              <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Verdict</p>
              <Tag v-if="result.verdict" :value="result.verdict" :severity="verdictSeverity(result.verdict)" class="mt-1" />
              <p v-else class="mt-1 text-sm text-gray-400">not checked</p>
            </div>
            <div class="text-right">
              <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Score</p>
              <p class="mt-1 text-lg font-semibold text-gray-900">
                {{ result.score !== null ? result.score.toFixed(4) : '—' }}
              </p>
            </div>
          </div>
        </div>

        <!-- Tri-state on purpose: null means nothing was checked, and rendering
             "would be blocked" there would be a lie. -->
        <div class="mt-4 border-t border-gray-100 pt-4">
          <Message v-if="result.would_allow === true" severity="success" :closable="false" class="!mt-0">
            This address <strong>would receive</strong> a verification email on the public subscribe form.
          </Message>
          <Message v-else-if="result.would_allow === false" severity="error" :closable="false" class="!mt-0">
            This address <strong>would be refused</strong> — no subscriber row, no verification email.
            Allowed verdicts: {{ result.allowed_verdicts.join(', ') }}.
          </Message>
          <Message v-else severity="warn" :closable="false" class="!mt-0">
            <strong>Could not check.</strong>
            <template v-if="result.reason_code === 'quota_exhausted'">
              The monthly quota is exhausted.
            </template>
            <template v-else-if="result.reason_code === 'missing_key'">
              No validation key is configured.
            </template>
            <template v-else-if="result.reason_code === 'email_cooldown'">
              This address was checked moments ago — wait a minute and retry.
            </template>
            <template v-else-if="result.reason_code === 'disabled'">
              Validation is switched off.
            </template>
            <!-- Transport failures get a sentence, not a raw code: 401 and 403
                 are the two an operator will actually hit, and each has a
                 different fix. The code itself stays in the tags below. -->
            <template v-else-if="result.http_status === 401">
              SendGrid rejected the key (401). Check SENDGRID_VALIDATION_KEY on the server.
            </template>
            <template v-else-if="result.http_status === 403">
              The key is valid but lacks the “Email Address Validation” permission (403).
              The transactional send key will not work here — it needs its own key.
            </template>
            <template v-else-if="result.http_status === 429">
              SendGrid rate-limited the request (429). Try again shortly.
            </template>
            <template v-else>
              SendGrid did not return a verdict.
            </template>
            On the public form this address would be let through (fail open).
          </Message>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <Tag v-if="result.was_cached" value="cached result — no credit spent" severity="info" />
          <Tag v-if="result.reason_code && !result.checked" :value="result.reason_code" severity="secondary" />
          <Tag v-if="result.http_status" :value="'HTTP ' + result.http_status" severity="secondary" />
          <Tag v-if="result.latency_ms !== null" :value="result.latency_ms + ' ms'" severity="secondary" />
        </div>
      </div>

      <div v-if="checkRows.length" class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p class="mb-3 text-sm font-semibold text-gray-800">Checks</p>
        <ul class="divide-y divide-gray-100">
          <li v-for="row in checkRows" :key="row.label" class="flex items-center justify-between py-2">
            <span class="text-sm text-gray-600">{{ row.label }}</span>
            <span class="flex items-center gap-2">
              <span class="text-xs text-gray-400">{{ row.value ? 'yes' : 'no' }}</span>
              <i :class="row.good ? 'pi pi-check-circle text-green-600' : 'pi pi-exclamation-circle text-amber-500'" />
            </span>
          </li>
        </ul>
      </div>

      <Message v-if="result.suggestion" severity="warn" :closable="false">
        SendGrid suggests the domain <strong>{{ result.suggestion }}</strong> — the address may be a typo.
      </Message>

      <!-- Only when it says something the sentence above did not. A bare
           "http_401" repeated under an explanation of the 401 is noise. -->
      <Message
        v-if="result.error_message && result.would_allow === null && !/^http_\d+$/.test(result.error_message)"
        severity="error"
        :closable="false"
      >
        <span class="break-all">{{ result.error_message }}</span>
      </Message>
    </div>
  </div>
</template>
