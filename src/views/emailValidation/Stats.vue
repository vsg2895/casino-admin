<script setup lang="ts">
/**
 * Email Validation Stats — where the month's SendGrid credits went.
 *
 * Read-only. One row per registered site INCLUDING sites with no attempts: an
 * absent row reads as "no data" when the real answer is "nobody subscribed
 * there", and those are different problems.
 */
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import ProgressBar from 'primevue/progressbar'
import { useToast } from 'primevue/usetoast'
import { getEmailValidationStats } from '@/api/emailValidation'
import type { EmailValidationStats } from '@shared/types/emailValidation'

const toast = useToast()
const stats = ref<EmailValidationStats | null>(null)
const loading = ref(false)
const month = ref<string>('')

const monthOptions = computed(() => [
  { label: 'All time', value: 'all' },
  ...(stats.value?.months ?? []).map((m) => ({ label: m, value: m })),
])

const quota = computed(() => stats.value?.quota ?? null)

async function load(): Promise<void> {
  loading.value = true
  try {
    stats.value = await getEmailValidationStats(month.value || undefined)
    if (!month.value) month.value = stats.value.month
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load validation stats.', life: 5000 })
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-gray-900">Email Validation Stats</h1>
        <p class="mt-0.5 text-sm text-gray-500">
          SendGrid address validation on the public subscribe forms, per site.
        </p>
      </div>
      <Select
        v-model="month"
        :options="monthOptions"
        option-label="label"
        option-value="value"
        class="w-48"
        @change="load"
      />
    </div>

    <!-- Configuration state. A fake or missing key is the expected state until
         the real one is pasted on the server, and it must be visible rather
         than looking like "no traffic". -->
    <Message v-if="quota && !quota.enabled" severity="warn" :closable="false">
      Validation is <strong>switched off</strong>. Subscribes proceed exactly as they did before this
      feature — every address receives a verification email.
    </Message>
    <Message v-else-if="quota && !quota.key_configured" severity="warn" :closable="false">
      No validation key is configured. Subscribes are <strong>failing open</strong>: every address is
      accepted and receives a verification email, and nothing is being validated.
    </Message>

    <Message v-if="quota?.exhausted" severity="error" :closable="false">
      Monthly quota <strong>exhausted</strong> ({{ quota.used }} / {{ quota.quota }}). Validation is
      skipped and subscribes are failing open until {{ quota.month }} rolls over.
    </Message>
    <Message v-else-if="quota?.warning" severity="warn" :closable="false">
      {{ quota.percent }}% of this month's validation quota used
      ({{ quota.used }} / {{ quota.quota }}).
    </Message>

    <div v-if="quota" class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Quota · {{ quota.month }}</p>
          <p class="mt-1 text-2xl font-semibold text-gray-900">
            {{ quota.used }} <span class="text-base font-normal text-gray-400">/ {{ quota.quota }}</span>
          </p>
          <p class="mt-0.5 text-sm text-gray-500">{{ quota.remaining }} remaining (our count)</p>
        </div>
        <div class="text-right">
          <p class="text-xs font-medium uppercase tracking-wide text-gray-500">SendGrid reports</p>
          <p class="mt-1 text-lg font-semibold text-gray-900">
            {{ quota.sendgrid_remaining ?? '—' }}
          </p>
          <!-- Shown alongside ours because the two can legitimately differ: a
               call billed upstream that timed out here never became a row. -->
          <p class="mt-0.5 text-xs text-gray-400">
            {{ quota.sendgrid_remaining === null ? 'not reported yet' : 'remaining, per SendGrid' }}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Allowed verdicts</p>
          <div class="mt-1 flex gap-1">
            <Tag v-for="v in quota.allowed_verdicts" :key="v" :value="v" severity="success" />
          </div>
        </div>
      </div>
      <ProgressBar
        :value="Math.min(100, quota.percent)"
        :show-value="false"
        class="mt-3 h-2"
        :class="quota.exhausted ? 'p-progressbar-danger' : ''"
      />
    </div>

    <DataTable :value="stats?.sites ?? []" :loading="loading" data-key="site_id" size="small" striped-rows>
      <Column field="site_name" header="Site" />
      <Column field="attempts" header="Attempts" />
      <Column header="API calls">
        <template #body="{ data }">
          <!-- The only column that costs money. -->
          <span class="font-semibold">{{ data.api_calls }}</span>
        </template>
      </Column>
      <Column field="cache_hits" header="Cached" />
      <Column field="skipped" header="Skipped" />
      <Column header="Valid"><template #body="{ data }"><Tag v-if="data.valid" :value="data.valid" severity="success" /><span v-else class="text-gray-300">0</span></template></Column>
      <Column header="Risky"><template #body="{ data }"><Tag v-if="data.risky" :value="data.risky" severity="warn" /><span v-else class="text-gray-300">0</span></template></Column>
      <Column header="Invalid"><template #body="{ data }"><Tag v-if="data.invalid" :value="data.invalid" severity="danger" /><span v-else class="text-gray-300">0</span></template></Column>
      <Column field="allowed" header="Allowed" />
      <Column header="Hard rej.">
        <template #body="{ data }">
          <!-- Cannot receive mail. Loosening the rules will never help these. -->
          <span :class="data.hard_rejected ? 'text-red-600' : 'text-gray-300'">{{ data.hard_rejected }}</span>
        </template>
      </Column>
      <Column header="Soft rej.">
        <template #body="{ data }">
          <!-- Probably deliverable, failed policy — the rows worth revisiting. -->
          <span :class="data.soft_rejected ? 'font-semibold text-amber-600' : 'text-gray-300'">{{ data.soft_rejected }}</span>
        </template>
      </Column>
      <Column header="Failed open">
        <template #body="{ data }">
          <span :class="data.failed_open ? 'font-semibold text-amber-600' : 'text-gray-300'">
            {{ data.failed_open }}
          </span>
        </template>
      </Column>

      <template #footer>
        <div v-if="stats" class="flex flex-wrap gap-6 text-sm text-gray-600">
          <span><strong>{{ stats.totals.attempts }}</strong> attempts</span>
          <span><strong>{{ stats.totals.api_calls }}</strong> API calls</span>
          <span><strong>{{ stats.totals.cache_hits }}</strong> cached</span>
          <span><strong>{{ stats.totals.hard_rejected }}</strong> hard rejected</span>
          <span><strong>{{ stats.totals.soft_rejected }}</strong> soft rejected</span>
          <span><strong>{{ stats.totals.failed_open }}</strong> failed open</span>
        </div>
      </template>
      <template #empty><span class="text-gray-500">No validation attempts recorded.</span></template>
    </DataTable>
  </div>
</template>
