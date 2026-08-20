<script setup lang="ts">
/**
 * Promotion After Verification — the ONE global template + its settings.
 *
 * Adapted from views/sites/PromotionEmail.vue, which edits the per-site
 * promotion. Two deliberate differences:
 *  - no site picker and no siteId anywhere: this template is global, and the
 *    preview renders it against a representative site so {{site_name}} resolves;
 *  - it also owns the feature settings (enabled, delay, transport), because the
 *    delay and the sending key are meaningless without the template they drive.
 */
import { ref, reactive, computed, watch, onMounted } from 'vue'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import RemovableLabel from '@/components/forms/RemovableLabel.vue'
import axios from 'axios'
import * as api from '@/api/verificationPromotion'
import { listSendgridKeys } from '@/api/sendgridKeys'
import { listMailgunKeys } from '@/api/mailgunKeys'
import type {
  EmailProvider,
  UpdateVerificationPromotionEmailPayload,
  VerificationPromotionEmail,
} from '@shared/types/verificationPromotionEmail'
import type { ErrorResponse } from '@shared/types/api'

const toast = useToast()

const fromDomain = ref('example.com')
const maxDelay = ref(43200)
const loading = ref(true)
const saving = ref(false)
const fieldErrors = ref<Record<string, string>>({})

const previewHtml = ref('')
const previewLoading = ref(false)
const previewError = ref('')

const showTest = ref(false)
const testEmail = ref('')
const testName = ref('')
const testSending = ref(false)

const sendgridKeys = ref<{ label: string; value: number }[]>([])
const mailgunKeys = ref<{ label: string; value: number }[]>([])

const sendgridEnvAvailable = ref(false)

/**
 * Only providers this server can actually send with.
 *
 * A provider with nothing behind it — Mailgun with no active key, SendGrid with
 * no SENDGRID_API_KEY — is not offered at all, rather than being selectable and
 * then failing validation. SMTP is always available: it is the .env mail server
 * every install has.
 *
 * The one exception is the provider CURRENTLY SAVED. It stays listed even when
 * it has become unusable (its last key was deleted, say), because hiding it
 * would leave the dropdown blank and misrepresent what the row is set to. The
 * hint under the key selector then explains what is missing.
 */
const providerOptions = computed<{ label: string; value: EmailProvider }[]>(() => {
  const all: { label: string; value: EmailProvider; available: boolean }[] = [
    { label: 'SendGrid (.env API key)', value: 'sendgrid_env', available: sendgridEnvAvailable.value },
    { label: 'Mailgun (stored key)', value: 'mailgun', available: mailgunKeys.value.length > 0 },
    { label: 'SMTP (.env mail server)', value: 'smtp', available: true },
    // Retired for this feature; listed only if a row still carries it.
    { label: 'SendGrid (stored key — retired)', value: 'sendgrid', available: false },
  ]

  return all
    .filter((o) => o.available || o.value === form.provider)
    .map(({ label, value }) => ({ label, value }))
})

type ColorField =
  | 'background_color' | 'heading_color' | 'text_color'
  | 'secondary_text_color' | 'muted_text_color' | 'button_color' | 'accent_color'

// Mirrors SitePromotionEmail::COLOR_DEFAULTS on the server (this template
// inherits that model's palette). The server defaults are authoritative.
const COLOR_DEFAULTS: Record<ColorField, string> = {
  background_color: '#000000',
  heading_color: '#ffffff',
  text_color: '#ffffff',
  secondary_text_color: '#d9d9d9',
  muted_text_color: '#b3b3b3',
  button_color: '#75B636',
  accent_color: '#f3a333',
}

const COLOR_FIELDS = [
  { key: 'background_color', label: 'Background', hint: 'The email canvas.' },
  { key: 'heading_color', label: 'Heading', hint: 'The large title.' },
  { key: 'text_color', label: 'Body text', hint: 'Greeting and intro paragraph.' },
  { key: 'secondary_text_color', label: 'Secondary text', hint: 'The second paragraph.' },
  { key: 'muted_text_color', label: 'Muted text', hint: 'Disclaimer and unsubscribe line.' },
  { key: 'button_color', label: 'Button', hint: 'CTA button fill.' },
  { key: 'accent_color', label: 'Link', hint: 'The unsubscribe link.' },
] as const satisfies ReadonlyArray<{ key: ColorField; label: string; hint: string }>

function emptyForm(): UpdateVerificationPromotionEmailPayload {
  return {
    from_name: '', from_email: '', subject: '', preheader: '',
    hero_image_url: '', hero_url: '', top_button_text: '', heading: '',
    intro_text: '', secondary_text: '', cta_button_text: '', disclaimer_text: '',
    unsubscribe_label: '',
    ...COLOR_DEFAULTS,
    active: false,
    delay_minutes: 60,
    provider: 'sendgrid_env',
    sendgrid_key_id: null,
    mailgun_key_id: null,
  }
}

const form = reactive<UpdateVerificationPromotionEmailPayload>(emptyForm())

// Only placeholders that exist for EVERY site — a global template cannot rely on
// anything site-specific.
const placeholders = '{{site_name}}, {{site_url}}, {{email}}, {{year}}, {{unsubscribe_url}}'

// Literal placeholder tokens shown as documentation in the template. They live
// here rather than inline because Vue's tokenizer would end an interpolation at
// the first `}}` inside the string literal.
const SITE_NAME_TOKEN = '{{site_name}}'
const SITE_URL_TOKEN = '{{site_url}}'

const fromEmailHint = computed(
  () => `For best deliverability, use an address on your sending domain — e.g. offers@${fromDomain.value}`,
)

// Plain-English restatement of the rule, so nobody has to guess whether the
// clock starts at subscription or at verification. It starts at VERIFICATION.
const delayExplanation = computed(() => {
  const m = form.delay_minutes ?? 0
  if (m === 0) return 'Sent as soon as the subscriber verifies (subject to the once-a-minute check).'
  const h = Math.floor(m / 60)
  const rem = m % 60
  const pretty = h > 0 ? `${h}h${rem ? ` ${rem}m` : ''}` : `${m}m`
  return `A visitor who clicks their verify link at 10:00 is emailed at ${eligibleExample(m)} — ${pretty} after they verified. When they originally subscribed does not matter.`
})

function eligibleExample(minutes: number): string {
  const start = new Date(2000, 0, 1, 10, 0)
  start.setMinutes(start.getMinutes() + minutes)
  return `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
}

// Only Mailgun still asks for a stored credential. SendGrid reads .env, and so
// does SMTP, so neither shows a second dropdown.
// ('sendgrid' — a stored SendGrid key — is retired but still handled, so a row
// saved before the change keeps showing its key rather than looking unset.)
const needsKey = computed(() => form.provider === 'mailgun' || form.provider === 'sendgrid')
const selectedKeyId = computed(() =>
  form.provider === 'mailgun' ? form.mailgun_key_id : form.provider === 'sendgrid' ? form.sendgrid_key_id : null,
)
const keyOptions = computed(() =>
  form.provider === 'mailgun' ? mailgunKeys.value : form.provider === 'sendgrid' ? sendgridKeys.value : [],
)

function setKeyId(value: number | null): void {
  if (form.provider === 'mailgun') form.mailgun_key_id = value
  else if (form.provider === 'sendgrid') form.sendgrid_key_id = value
}

onMounted(async () => {
  try {
    const tpl = await api.getVerificationPromotion()
    Object.assign(form, toPayload(tpl))
    fromDomain.value = tpl.from_domain
    maxDelay.value = tpl.max_delay_minutes
    sendgridEnvAvailable.value = tpl.sendgrid_env_available
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load the promotion.', life: 5000 })
  }

  // Key lists are loaded independently: one provider's endpoint failing must not
  // blank out the other's dropdown.
  try {
    const res = await listSendgridKeys('active')
    sendgridKeys.value = res.data.map((k) => ({ label: k.name, value: k.id }))
  } catch { /* leave empty; the form shows the "no keys" hint */ }
  try {
    const res = await listMailgunKeys('active')
    mailgunKeys.value = res.data.map((k) => ({ label: k.name, value: k.id }))
  } catch { /* as above */ }

  loading.value = false
  await refreshPreview()
})

function toPayload(t: VerificationPromotionEmail): UpdateVerificationPromotionEmailPayload {
  return {
    from_name: t.from_name,
    from_email: t.from_email,
    subject: t.subject,
    preheader: t.preheader ?? '',
    hero_image_url: t.hero_image_url ?? '',
    hero_url: t.hero_url ?? '',
    top_button_text: t.top_button_text ?? '',
    heading: t.heading ?? '',
    intro_text: t.intro_text ?? '',
    secondary_text: t.secondary_text ?? '',
    cta_button_text: t.cta_button_text ?? '',
    disclaimer_text: t.disclaimer_text ?? '',
    unsubscribe_label: t.unsubscribe_label,
    background_color: t.background_color ?? COLOR_DEFAULTS.background_color,
    heading_color: t.heading_color ?? COLOR_DEFAULTS.heading_color,
    text_color: t.text_color ?? COLOR_DEFAULTS.text_color,
    secondary_text_color: t.secondary_text_color ?? COLOR_DEFAULTS.secondary_text_color,
    muted_text_color: t.muted_text_color ?? COLOR_DEFAULTS.muted_text_color,
    button_color: t.button_color ?? COLOR_DEFAULTS.button_color,
    accent_color: t.accent_color ?? COLOR_DEFAULTS.accent_color,
    active: t.active,
    delay_minutes: t.delay_minutes,
    provider: t.provider,
    sendgrid_key_id: t.sendgrid_key_id,
    mailgun_key_id: t.mailgun_key_id,
  }
}

function nullIfBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const REMOVABLE_FIELDS = [
  'preheader', 'hero_image_url', 'hero_url', 'top_button_text', 'heading',
  'intro_text', 'secondary_text', 'cta_button_text', 'disclaimer_text',
] as const

function toPayloadForApi(): UpdateVerificationPromotionEmailPayload {
  const payload = { ...form }
  for (const field of REMOVABLE_FIELDS) payload[field] = nullIfBlank(payload[field])
  // Only the chosen provider's credential is sent; the other is cleared so a
  // stale id cannot linger and be picked up after a later provider switch.
  payload.sendgrid_key_id = form.provider === 'sendgrid' ? form.sendgrid_key_id : null
  payload.mailgun_key_id = form.provider === 'mailgun' ? form.mailgun_key_id : null
  return payload
}

function resetColors(): void {
  Object.assign(form, COLOR_DEFAULTS)
}

// ── Debounced live preview ──────────────────────────────────────────────────
let previewTimer: ReturnType<typeof setTimeout> | undefined

async function refreshPreview(): Promise<void> {
  previewLoading.value = true
  try {
    const res = await api.previewVerificationPromotion(toPayloadForApi())
    previewHtml.value = res.html
    previewError.value = ''
  } catch (e: unknown) {
    previewError.value =
      axios.isAxiosError(e) && e.response?.status === 422
        ? ((e.response.data as ErrorResponse).message ?? 'Preview could not be generated.')
        : 'Preview could not be generated.'
  } finally {
    previewLoading.value = false
  }
}

watch(form, () => {
  if (loading.value) return
  clearTimeout(previewTimer)
  previewTimer = setTimeout(refreshPreview, 500)
}, { deep: true })

async function save(): Promise<void> {
  fieldErrors.value = {}
  saving.value = true
  try {
    const saved = await api.updateVerificationPromotion(toPayloadForApi())
    Object.assign(form, toPayload(saved))
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Promotion after verification updated.', life: 3000 })
    await refreshPreview()
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as ErrorResponse
      if (data.errors) {
        for (const [field, messages] of Object.entries(data.errors)) {
          fieldErrors.value[field] = messages[0] ?? ''
        }
      }
      toast.add({ severity: 'warn', summary: 'Check the form', detail: data.message, life: 5000 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save.', life: 5000 })
    }
  } finally {
    saving.value = false
  }
}

async function sendTest(): Promise<void> {
  if (!testEmail.value.trim()) return
  testSending.value = true
  try {
    const res = await api.sendTestVerificationPromotion(testEmail.value.trim(), testName.value.trim() || undefined)
    toast.add({ severity: 'success', summary: 'Sent', detail: res.message, life: 4000 })
    showTest.value = false
    testEmail.value = ''
    testName.value = ''
  } catch (e: unknown) {
    const msg = axios.isAxiosError(e)
      ? ((e.response?.data as { message?: string } | undefined)?.message ?? 'Failed to send test.')
      : 'Failed to send test.'
    toast.add({ severity: 'error', summary: 'Send failed', detail: msg, life: 7000 })
  } finally {
    testSending.value = false
  }
}

function err(field: string): string | undefined {
  return fieldErrors.value[field]
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Promotion After Verification</h2>
        <p class="text-sm text-gray-500">
          One template for every site — sent once, after a subscriber confirms their email.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button label="Send test" icon="pi pi-send" severity="secondary" outlined @click="showTest = true" />
        <Button label="Save Changes" icon="pi pi-check" :loading="saving" @click="save" />
      </div>
    </div>

    <div v-if="loading" class="py-20 text-center text-sm text-gray-400">Loading…</div>

    <div v-else class="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div class="space-y-5">
        <!-- ── Settings ── -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Settings</h3>

          <div class="mb-4 flex items-start justify-between gap-4 rounded-lg bg-gray-50 px-3 py-2.5">
            <div>
              <p class="text-sm font-medium text-gray-800">Enabled</p>
              <p class="text-xs text-gray-500">
                While off, nothing is sent and no subscriber is consumed — turning it on later
                still catches everyone who became eligible in the meantime.
              </p>
            </div>
            <ToggleSwitch v-model="form.active" />
          </div>
          <p v-if="err('active')" class="mb-3 text-xs text-red-600">{{ err('active') }}</p>

          <div class="mb-4">
            <label class="mb-1 block text-xs font-medium text-gray-600">
              Send promotion email this many minutes after verification
            </label>
            <InputNumber
              v-model="form.delay_minutes"
              :min="0"
              :max="maxDelay"
              :step="5"
              show-buttons
              fluid
              suffix=" min"
            />
            <p class="mt-1 text-xs text-gray-500">{{ delayExplanation }}</p>
            <p class="mt-1 text-xs text-gray-400">
              Measured from when the visitor <strong>verified</strong> (the newsletter's
              verified&nbsp;at), not from when they subscribed. Subscribers who verified before
              this feature existed have no verification timestamp and are never sent to, so
              turning this on cannot mail your existing list.
            </p>
            <p v-if="err('delay_minutes')" class="mt-1 text-xs text-red-600">{{ err('delay_minutes') }}</p>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Send with</label>
              <Select
                v-model="form.provider"
                :options="providerOptions"
                option-label="label"
                option-value="value"
                fluid
              />
              <p v-if="err('provider')" class="mt-1 text-xs text-red-600">{{ err('provider') }}</p>
            </div>
            <div v-if="needsKey">
              <label class="mb-1 block text-xs font-medium text-gray-600">
                {{ form.provider === 'mailgun' ? 'Mailgun key' : 'SendGrid key' }}
              </label>
              <Select
                :model-value="selectedKeyId"
                :options="keyOptions"
                option-label="label"
                option-value="value"
                placeholder="Select a key"
                fluid
                @update:model-value="setKeyId"
              />
              <p v-if="keyOptions.length === 0" class="mt-1 text-xs text-amber-600">
                No active keys — add one under
                {{ form.provider === 'mailgun' ? 'Mailgun Keys' : 'SendGrid Keys' }} first.
              </p>
              <p v-if="err('sendgrid_key_id')" class="mt-1 text-xs text-red-600">{{ err('sendgrid_key_id') }}</p>
              <p v-if="err('mailgun_key_id')" class="mt-1 text-xs text-red-600">{{ err('mailgun_key_id') }}</p>
            </div>
          </div>

          <Message severity="info" :closable="false" class="mt-3 text-xs">
            <span v-if="form.provider === 'sendgrid_env'">
              Sends through <code class="font-mono">SENDGRID_API_KEY</code> from the server's
              <code class="font-mono">.env</code> — the same key the subscribe and verify emails
              use. Nothing to select here.
            </span>
            <span v-else-if="form.provider === 'smtp'">
              Sends through the SMTP mail server configured in the server's
              <code class="font-mono">.env</code>.
            </span>
            <span v-else>
              Sends with the key you pick here, managed under
              {{ form.provider === 'mailgun' ? 'Mailgun Keys' : 'SendGrid Keys' }}.
            </span>
          </Message>
        </section>

        <p class="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
          Placeholders you can use anywhere: <code class="font-mono">{{ placeholders }}</code>.
          Body fields also support <code class="font-mono">**bold**</code>.
          <span class="mt-1 block">
            These are the only placeholders available, because one template serves every site —
            <code class="font-mono">{{ SITE_NAME_TOKEN }}</code> resolves to each subscriber's own site.
          </span>
        </p>

        <!-- ── Sender ── -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Sender</h3>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">From name</label>
              <InputText v-model="form.from_name" fluid />
              <p v-if="err('from_name')" class="mt-1 text-xs text-red-600">{{ err('from_name') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">From email</label>
              <InputText v-model="form.from_email" fluid :placeholder="`offers@${fromDomain}`" />
              <p class="mt-1 text-xs text-gray-400">{{ fromEmailHint }}</p>
              <p v-if="err('from_email')" class="mt-1 text-xs text-red-600">{{ err('from_email') }}</p>
            </div>
          </div>
        </section>

        <!-- ── Subject ── -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Subject &amp; preview</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Subject</label>
              <InputText v-model="form.subject" fluid />
              <p v-if="err('subject')" class="mt-1 text-xs text-red-600">{{ err('subject') }}</p>
            </div>
            <div>
              <RemovableLabel label="Preview (preheader) text" :value="form.preheader" @clear="form.preheader = ''" />
              <InputText v-model="form.preheader" fluid />
              <p class="mt-1 text-xs text-gray-400">Hidden snippet shown next to the subject in the inbox.</p>
            </div>
          </div>
        </section>

        <!-- ── Hero ── -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Hero &amp; offer link</h3>
          <div class="space-y-3">
            <div>
              <RemovableLabel label="Hero image URL" :value="form.hero_image_url" @clear="form.hero_image_url = ''" />
              <InputText v-model="form.hero_image_url" fluid placeholder="https://…" />
              <p v-if="err('hero_image_url')" class="mt-1 text-xs text-red-600">{{ err('hero_image_url') }}</p>
            </div>
            <div>
              <RemovableLabel label="Offer link" :value="form.hero_url" @clear="form.hero_url = ''" />
              <InputText v-model="form.hero_url" fluid />
              <p class="mt-1 text-xs text-gray-400">
                Where the hero image and both buttons point. Use
                <code class="font-mono">{{ SITE_URL_TOKEN }}</code> to send each subscriber to their own site.
              </p>
            </div>
            <div>
              <RemovableLabel label="Top button text" :value="form.top_button_text" @clear="form.top_button_text = ''" />
              <InputText v-model="form.top_button_text" fluid />
            </div>
          </div>
        </section>

        <!-- ── Body ── -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Body</h3>
          <div class="space-y-3">
            <div>
              <RemovableLabel label="Heading" :value="form.heading" @clear="form.heading = ''" />
              <InputText v-model="form.heading" fluid />
            </div>
            <div>
              <RemovableLabel label="Intro text" :value="form.intro_text" @clear="form.intro_text = ''" />
              <Textarea v-model="form.intro_text" rows="3" fluid auto-resize />
            </div>
            <div>
              <RemovableLabel label="Secondary text" :value="form.secondary_text" @clear="form.secondary_text = ''" />
              <Textarea v-model="form.secondary_text" rows="3" fluid auto-resize />
            </div>
            <div>
              <RemovableLabel label="CTA button text" :value="form.cta_button_text" @clear="form.cta_button_text = ''" />
              <InputText v-model="form.cta_button_text" fluid />
            </div>
            <div>
              <RemovableLabel label="Disclaimer" :value="form.disclaimer_text" @clear="form.disclaimer_text = ''" />
              <Textarea v-model="form.disclaimer_text" rows="2" fluid auto-resize />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Unsubscribe label</label>
              <InputText v-model="form.unsubscribe_label" fluid />
              <p class="mt-1 text-xs text-gray-400">Required — marketing email must carry an opt-out link.</p>
              <p v-if="err('unsubscribe_label')" class="mt-1 text-xs text-red-600">{{ err('unsubscribe_label') }}</p>
            </div>
          </div>
        </section>

        <!-- ── Colours ── -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-gray-800">Colours</h3>
            <Button label="Reset" size="small" text severity="secondary" @click="resetColors" />
          </div>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div v-for="c in COLOR_FIELDS" :key="c.key">
              <label class="mb-1 block text-xs font-medium text-gray-600">{{ c.label }}</label>
              <div class="flex items-center gap-2">
                <input v-model="form[c.key]" type="color" class="h-8 w-10 cursor-pointer rounded border border-gray-300" />
                <InputText v-model="form[c.key]" class="flex-1 font-mono text-xs" />
              </div>
              <p class="mt-1 text-xs text-gray-400">{{ c.hint }}</p>
              <p v-if="err(c.key)" class="mt-1 text-xs text-red-600">{{ err(c.key) }}</p>
            </div>
          </div>
        </section>
      </div>

      <!-- ── Live preview ── -->
      <div class="lg:sticky lg:top-4 lg:self-start">
        <div class="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div class="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <h3 class="text-sm font-semibold text-gray-800">Preview</h3>
            <span v-if="previewLoading" class="text-xs text-gray-400">Rendering…</span>
          </div>
          <div class="p-3">
            <p v-if="previewError" class="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{{ previewError }}</p>
            <iframe
              v-else
              :srcdoc="previewHtml"
              class="h-[70vh] w-full rounded border border-gray-200 bg-white"
              title="Promotion email preview"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ── Send test ── -->
    <Dialog v-model:visible="showTest" modal header="Send test email" :style="{ width: '26rem' }">
      <div class="space-y-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Send to</label>
          <InputText v-model="testEmail" fluid placeholder="you@example.com" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Recipient name (optional)</label>
          <InputText v-model="testName" fluid />
          <p class="mt-1 text-xs text-gray-400">Drives the “Dear {name},” greeting.</p>
        </div>
        <Message severity="info" :closable="false" class="text-xs">
          Sends the <strong>saved</strong> template through the transport configured above, so this
          also proves that key works.
        </Message>
      </div>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="showTest = false" />
        <Button label="Send" icon="pi pi-send" :loading="testSending" @click="sendTest" />
      </template>
    </Dialog>
  </div>
</template>
