<script setup lang="ts">
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import InputChips from 'primevue/inputchips'
import Select from 'primevue/select'
import type { CasinoDetail } from '@shared/types/casinoDetail'

/**
 * The casino's factual profile — licence, payments, support, safer-play tools.
 *
 * Every field is optional by design. An editor fills in what the licence
 * register and the operator's own pages actually state and leaves the rest
 * blank; the public page renders only the groups that have values. Nothing here
 * should ever pressure someone into inventing a figure.
 */
const model = defineModel<CasinoDetail>({ required: true })

/**
 * Three states, not two.
 *
 * `null` means "we have not checked", `false` means "the operator does not offer
 * this". A checkbox would collapse those into one value, and on the safer-play
 * tools that is the difference between an unknown and an accusation.
 */
const TRISTATE = [
  { label: 'Not checked', value: null },
  { label: 'Yes', value: true },
  { label: 'No', value: false },
]

const TOOLS: { key: keyof CasinoDetail; label: string }[] = [
  { key: 'tool_deposit_limit', label: 'Deposit limit' },
  { key: 'tool_loss_limit', label: 'Loss limit' },
  { key: 'tool_session_limit', label: 'Session / time limit' },
  { key: 'tool_reality_check', label: 'Reality check' },
  { key: 'tool_withdrawal_lock', label: 'Withdrawal lock' },
  { key: 'tool_self_exclusion', label: 'Self-exclusion' },
]

const currentYear = new Date().getFullYear()
</script>

<template>
  <div class="space-y-6">
    <p class="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
      Leave anything you have not verified blank. The public page shows only the groups that
      have values — a half-filled table looks worse than no table.
    </p>

    <!-- General -->
    <section>
      <h3 class="mb-3 text-sm font-semibold text-gray-800">General</h3>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Established</label>
          <InputNumber v-model="model.established_year" :min="1990" :max="currentYear" :use-grouping="false" fluid />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Operating company</label>
          <InputText v-model="model.company" fluid placeholder="e.g. Dama N.V." />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Licences</label>
          <InputChips v-model="model.licences" fluid separator="," add-on-blur placeholder="MGA, Curaçao…" />
          <p class="mt-1 text-xs text-gray-400">Press Enter or comma after each one.</p>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Currencies</label>
          <InputChips v-model="model.currencies" fluid separator="," add-on-blur placeholder="EUR, USD…" />
        </div>
      </div>
    </section>

    <!-- Payments -->
    <section class="border-t border-gray-100 pt-5">
      <h3 class="mb-3 text-sm font-semibold text-gray-800">Payments &amp; withdrawals</h3>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="mb-1 block text-xs font-medium text-gray-600">Payment methods</label>
          <InputChips v-model="model.payment_methods" fluid separator="," add-on-blur placeholder="Visa, Skrill…" />
        </div>
        <!-- Free text, not numbers: operators state these as ranges and
             per-method values, and a number field would force a false precision. -->
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Minimum deposit</label>
          <InputText v-model="model.min_deposit" fluid placeholder="e.g. €20" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Minimum withdrawal</label>
          <InputText v-model="model.min_withdrawal" fluid placeholder="e.g. €20" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Withdrawal limit</label>
          <InputText v-model="model.withdrawal_limit" fluid placeholder="e.g. €5,000 / month" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Pending time</label>
          <InputText v-model="model.pending_time" fluid placeholder="e.g. 0–12 hours" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Withdrawal time</label>
          <InputText v-model="model.withdrawal_time" fluid placeholder="e.g. 24–48 hours" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Verification speed</label>
          <InputText v-model="model.verification_speed" fluid placeholder="e.g. under 24 hours" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Deposit fees</label>
          <Select v-model="model.deposit_fees" :options="TRISTATE" option-label="label" option-value="value" fluid />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Withdrawal fees</label>
          <Select v-model="model.withdrawal_fees" :options="TRISTATE" option-label="label" option-value="value" fluid />
        </div>
      </div>
    </section>

    <!-- Games -->
    <section class="border-t border-gray-100 pt-5">
      <h3 class="mb-3 text-sm font-semibold text-gray-800">Games</h3>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="mb-1 block text-xs font-medium text-gray-600">Game providers</label>
          <InputChips v-model="model.game_providers" fluid separator="," add-on-blur placeholder="NetEnt, Play'n GO…" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">RNG tested</label>
          <Select v-model="model.rng_tested" :options="TRISTATE" option-label="label" option-value="value" fluid />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Progressive jackpots</label>
          <Select v-model="model.progressive_jackpots" :options="TRISTATE" option-label="label" option-value="value" fluid />
        </div>
      </div>
    </section>

    <!-- Support -->
    <section class="border-t border-gray-100 pt-5">
      <h3 class="mb-3 text-sm font-semibold text-gray-800">Support</h3>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Live chat</label>
          <Select v-model="model.live_chat" :options="TRISTATE" option-label="label" option-value="value" fluid />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Email support</label>
          <Select v-model="model.email_support" :options="TRISTATE" option-label="label" option-value="value" fluid />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Support email</label>
          <InputText v-model="model.support_email" fluid placeholder="support@…" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Support languages</label>
          <InputChips v-model="model.support_languages" fluid separator="," add-on-blur placeholder="English, German…" />
        </div>
      </div>
    </section>

    <!-- Safer play -->
    <section class="border-t border-gray-100 pt-5">
      <h3 class="text-sm font-semibold text-gray-800">Safer-play tools</h3>
      <p class="mb-3 mt-0.5 text-xs text-gray-500">
        The fields winpalack ranks on. "Not checked" and "No" are different claims — leave it
        as Not checked unless you have confirmed the answer.
      </p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div v-for="tool in TOOLS" :key="String(tool.key)">
          <label class="mb-1 block text-xs font-medium text-gray-600">{{ tool.label }}</label>
          <Select
            v-model="model[tool.key] as boolean | null"
            :options="TRISTATE"
            option-label="label"
            option-value="value"
            fluid
          />
        </div>
      </div>
    </section>
  </div>
</template>
