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
import OptionalBlockLabel from '@/components/forms/OptionalBlockLabel.vue'
import axios from 'axios'
import * as api from '@/api/verificationPromotion'
import { listSendgridKeys } from '@/api/sendgridKeys'
import { listMailgunKeys } from '@/api/mailgunKeys'
import { useSitesStore } from '@/stores/sitesStore'
import type {
  EmailProvider,
  UpdateVerificationPromotionEmailPayload,
  VerificationPromotionEmail,
} from '@shared/types/verificationPromotionEmail'
import type { ErrorResponse } from '@shared/types/api'

const toast = useToast()
const sitesStore = useSitesStore()

// Which registered site the preview + test render against, so {{site_name}} /
// {{site_url}} resolve to that site's values. Defaults to the first site once
// loaded (matching the server's fallback); null only while sites are loading.
const siteOptions = computed(() =>
  sitesStore.sites.map((s) => ({ label: `${s.name} (${s.domain})`, value: s.id })),
)
const previewSiteName = computed(
  () => sitesStore.sites.find((s) => s.id === form.preview_site_id)?.name ?? '',
)

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
  | 'background_color' | 'body_background_color' | 'header_color' | 'heading_color'
  | 'text_color' | 'secondary_text_color' | 'muted_text_color' | 'button_color'
  | 'accent_color' | 'footer_background_color' | 'footer_text_color' | 'footer_link_color'

// Mirrors VerificationPromotionEmail::COLOR_DEFAULTS on the server (the light
// "thanks for subscribing" design). The server defaults are authoritative.
const COLOR_DEFAULTS: Record<ColorField, string> = {
  background_color: '#f4f5f7',
  body_background_color: '#ffffff',
  header_color: '#059669',
  heading_color: '#111827',
  text_color: '#374151',
  secondary_text_color: '#4b5563',
  muted_text_color: '#6b7280',
  button_color: '#059669',
  accent_color: '#059669',
  footer_background_color: '#111827',
  footer_text_color: '#b8bcba',
  footer_link_color: '#d6dad8',
}

const COLOR_FIELDS = [
  { key: 'background_color', label: 'Page canvas', hint: 'Behind the email card.' },
  { key: 'body_background_color', label: 'Body card', hint: 'The white content card.' },
  { key: 'header_color', label: 'Header band', hint: 'The brand band at the top.' },
  { key: 'heading_color', label: 'Heading', hint: 'The large title.' },
  { key: 'text_color', label: 'Body text', hint: 'Greeting and intro paragraph.' },
  { key: 'secondary_text_color', label: 'Secondary text', hint: 'The second paragraph.' },
  { key: 'muted_text_color', label: 'Muted text', hint: 'Fine print and notice.' },
  { key: 'button_color', label: 'Button', hint: 'CTA fill + rating highlight.' },
  { key: 'accent_color', label: 'Accent', hint: 'Eyebrow label and links.' },
  { key: 'footer_background_color', label: 'Footer band', hint: 'The dark footer.' },
  { key: 'footer_text_color', label: 'Footer text', hint: 'Footer body copy (raised for contrast).' },
  { key: 'footer_link_color', label: 'Footer links', hint: 'Nav, Unsubscribe, contact — kept readable.' },
] as const satisfies ReadonlyArray<{ key: ColorField; label: string; hint: string }>

function emptyForm(): UpdateVerificationPromotionEmailPayload {
  return {
    from_name: '', from_email: '', subject: '', preheader: '',
    hero_image_url: '', hero_url: '', top_button_text: '', heading: '',
    intro_text: '', secondary_text: '', cta_button_text: '', cta_button_url: '',
    disclaimer_text: '',
    unsubscribe_label: '',
    preview_site_id: null,
    // New design components
    header_brand_text: '', confirmation_text: '', eyebrow_text: '',
    hidden_blocks: [],
    highlight_text: '', offer_terms: [],
    responsible_notice_text: '', footer_tagline: '', footer_links: [],
    affiliate_disclosure_text: '',
    // Footer legal / contact lines
    reason_text: '', age_disclaimer_text: '', postal_address: '', contact_email: '',
    email_preferences_label: '', email_preferences_url: '',
    copyright_text: '',
    ...COLOR_DEFAULTS,
    active: false,
    delay_minutes: 60,
    provider: 'sendgrid_env',
    sendgrid_key_id: null,
    mailgun_key_id: null,
  }
}

const form = reactive<UpdateVerificationPromotionEmailPayload>(emptyForm())

// Placeholders that exist for EVERY site — a global template cannot rely on
// anything site-specific — plus two derived offer variables ({{bonus_amount}} =
// the ticket bonus, {{offer_brand}} = the brand) so the CTA can stay specific.
const placeholders = '{{site_name}}, {{site_url}}, {{site_domain}}, {{email}}, {{year}}, {{unsubscribe_url}}, {{bonus_amount}}, {{offer_brand}}'

// Literal placeholder tokens shown as documentation in the template. They live
// here rather than inline because Vue's tokenizer would end an interpolation at
// the first `}}` inside the string literal.
const SITE_NAME_TOKEN = '{{site_name}}'
const SITE_URL_TOKEN = '{{site_url}}'
const SITE_DOMAIN_TOKEN = '{{site_domain}}'
const YEAR_TOKEN = '{{year}}'
const BONUS_AMOUNT_TOKEN = '{{bonus_amount}}'
const OFFER_BRAND_TOKEN = '{{offer_brand}}'

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

  // Sites for the preview picker. Default to the first site so the initial
  // render matches the server's fallback; a failure just leaves it on the
  // server default.
  try {
    await sitesStore.fetchSites()
    // Only default when the saved template names no site — otherwise this would
    // overwrite the admin's stored choice on every load, which is the bug that
    // made the picker look like it never saved.
    if (form.preview_site_id === null) {
      form.preview_site_id = sitesStore.sites[0]?.id ?? null
    }
  } catch { /* preview falls back to a representative site server-side */ }

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
    preview_site_id: t.preview_site_id ?? null,
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
    cta_button_url: t.cta_button_url ?? '',
    disclaimer_text: t.disclaimer_text ?? '',
    unsubscribe_label: t.unsubscribe_label,
    // New design components
    header_brand_text: t.header_brand_text ?? '',
    confirmation_text: t.confirmation_text ?? '',
    eyebrow_text: t.eyebrow_text ?? '',
    // Fresh array: the reactive form must never share a reference with the
    // loaded resource, or restoring a block would not trip the preview watcher.
    hidden_blocks: [...(t.hidden_blocks ?? [])],
    highlight_text: t.highlight_text ?? '',
    offer_terms: (t.offer_terms ?? []).map((o) => ({ label: o.label, value: o.value })),
    responsible_notice_text: t.responsible_notice_text ?? '',
    footer_tagline: t.footer_tagline ?? '',
    footer_links: (t.footer_links ?? []).map((l) => ({ label: l.label, url: l.url })),
    affiliate_disclosure_text: t.affiliate_disclosure_text ?? '',
    reason_text: t.reason_text ?? '',
    age_disclaimer_text: t.age_disclaimer_text ?? '',
    postal_address: t.postal_address ?? '',
    contact_email: t.contact_email ?? '',
    email_preferences_label: t.email_preferences_label ?? '',
    email_preferences_url: t.email_preferences_url ?? '',
    copyright_text: t.copyright_text ?? '',
    background_color: t.background_color ?? COLOR_DEFAULTS.background_color,
    body_background_color: t.body_background_color ?? COLOR_DEFAULTS.body_background_color,
    header_color: t.header_color ?? COLOR_DEFAULTS.header_color,
    heading_color: t.heading_color ?? COLOR_DEFAULTS.heading_color,
    text_color: t.text_color ?? COLOR_DEFAULTS.text_color,
    secondary_text_color: t.secondary_text_color ?? COLOR_DEFAULTS.secondary_text_color,
    muted_text_color: t.muted_text_color ?? COLOR_DEFAULTS.muted_text_color,
    button_color: t.button_color ?? COLOR_DEFAULTS.button_color,
    accent_color: t.accent_color ?? COLOR_DEFAULTS.accent_color,
    footer_background_color: t.footer_background_color ?? COLOR_DEFAULTS.footer_background_color,
    footer_text_color: t.footer_text_color ?? COLOR_DEFAULTS.footer_text_color,
    footer_link_color: t.footer_link_color ?? COLOR_DEFAULTS.footer_link_color,
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
  'intro_text', 'secondary_text', 'cta_button_text', 'cta_button_url', 'disclaimer_text',
  'header_brand_text', 'confirmation_text', 'eyebrow_text',
  'highlight_text', 'responsible_notice_text', 'footer_tagline',
  'affiliate_disclosure_text', 'reason_text', 'age_disclaimer_text',
  'postal_address', 'contact_email', 'email_preferences_label',
  'email_preferences_url', 'copyright_text',
] as const

// ── Offer ticket terms editor ───────────────────────────────────────────────
function addOfferTerm(): void {
  form.offer_terms.push({ label: '', value: '' })
}

function removeOfferTerm(index: number): void {
  form.offer_terms.splice(index, 1)
}

// ── Footer navigation links editor ──────────────────────────────────────────
function addFooterLink(): void {
  form.footer_links.push({ label: '', url: '' })
}

function removeFooterLink(index: number): void {
  form.footer_links.splice(index, 1)
}

function toPayloadForApi(): UpdateVerificationPromotionEmailPayload {
  const payload = { ...form }
  for (const field of REMOVABLE_FIELDS) payload[field] = nullIfBlank(payload[field])
  // Drop blank footer links / offer terms (a half-filled row would fail server
  // validation) and send fresh arrays so the reactive source is never mutated.
  payload.footer_links = form.footer_links
    .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
    .filter((l) => l.label !== '' && l.url !== '')
  payload.offer_terms = form.offer_terms
    .map((o) => ({ label: o.label.trim(), value: o.value.trim() }))
    .filter((o) => o.label !== '' && o.value !== '')
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
    const res = await api.previewVerificationPromotion(toPayloadForApi(), form.preview_site_id)
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

// Re-render immediately when the preview site changes — no debounce, it is a
// deliberate single action, not typing. The deep `form` watcher above has already
// queued a debounced refresh for this same edit, so cancel it first: without the
// clearTimeout, one site change would cost two preview requests.
watch(() => form.preview_site_id, () => {
  if (loading.value) return
  clearTimeout(previewTimer)
  refreshPreview()
})

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
    const res = await api.sendTestVerificationPromotion(
      testEmail.value.trim(),
      testName.value.trim() || undefined,
      form.preview_site_id,
    )
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
              :step="1"
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
              <OptionalBlockLabel
                label="Preview (preheader) text"
                block="preheader"
                v-model:hidden="form.hidden_blocks"
              />
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
              <OptionalBlockLabel
                label="Banner image URL"
                block="hero_image_url"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText v-model="form.hero_image_url" fluid placeholder="https://…" />
              <p class="mt-1 text-xs text-gray-400">
                Recommended <strong>600×300</strong>. The banner sits below the heading, so the message still
                reads when a client blocks images.
              </p>
              <p v-if="err('hero_image_url')" class="mt-1 text-xs text-red-600">{{ err('hero_image_url') }}</p>
            </div>
            <div>
              <OptionalBlockLabel
                label="Offer link"
                block="hero_url"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText v-model="form.hero_url" fluid />
              <p class="mt-1 text-xs text-gray-400">
                Where the hero image and both buttons point. Use
                <code class="font-mono">{{ SITE_URL_TOKEN }}</code> to send each subscriber to their own site.
              </p>
            </div>
            <div>
              <OptionalBlockLabel
                label="Top button text"
                block="top_button_text"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText v-model="form.top_button_text" fluid />
            </div>
            <div>
              <OptionalBlockLabel
                label="Header brand text"
                block="header_brand_text"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText v-model="form.header_brand_text" fluid />
              <p class="mt-1 text-xs text-gray-400">
                Shown in the coloured header band and linked to the offer. Use
                <code class="font-mono">{{ SITE_NAME_TOKEN }}</code> to show each subscriber's own site name.
              </p>
            </div>
            <div>
              <OptionalBlockLabel
                label="Confirmation strip"
                block="confirmation_text"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText v-model="form.confirmation_text" fluid placeholder="✓ Your email is confirmed — your offer is unlocked" />
              <p class="mt-1 text-xs text-gray-400">
                Thin coloured bar at the very top: the one confirmation line, so the heading can focus on the offer.
              </p>
            </div>
          </div>
        </section>

        <!-- ── Offer ticket ── -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-1 text-sm font-semibold text-gray-800">Offer ticket</h3>
          <p class="mb-3 text-xs text-gray-400">
            The boxed callout under the banner: the bonus amount headline over the terms a subscriber checks
            before clicking. Clear everything here to hide the box.
          </p>
          <div class="space-y-3">
            <div>
              <OptionalBlockLabel
                label="Eyebrow label"
                block="eyebrow_text"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText v-model="form.eyebrow_text" fluid placeholder="Exclusive subscriber offer" />
              <p class="mt-1 text-xs text-gray-400">Small uppercase line above the heading.</p>
            </div>
            <div>
              <OptionalBlockLabel
                label="Bonus amount"
                block="highlight_text"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText v-model="form.highlight_text" fluid placeholder="100 Free Spins" />
              <p class="mt-1 text-xs text-gray-400">
                The big headline at the top of the ticket. Also available as
                <code class="font-mono">{{ BONUS_AMOUNT_TOKEN }}</code> in the button and other fields.
              </p>
            </div>

            <div>
              <div class="mb-1 flex items-center justify-between">
                <label class="block text-xs font-medium text-gray-600">Ticket terms (columns)</label>
                <Button label="Add term" icon="pi pi-plus" size="small" text @click="addOfferTerm" />
              </div>
              <p v-if="form.offer_terms.length === 0" class="text-xs text-gray-400">
                No terms. Add up to six, e.g. Wagering / 40x, Min deposit / None, Offer ends / 7 days.
              </p>
              <div v-for="(term, i) in form.offer_terms" :key="i" class="mb-2 flex items-center gap-2">
                <InputText v-model="term.label" class="w-2/5" placeholder="Label (e.g. Wagering)" />
                <InputText v-model="term.value" class="flex-1" placeholder="Value (e.g. 40x)" />
                <Button icon="pi pi-trash" size="small" text severity="danger" @click="removeOfferTerm(i)" />
              </div>
              <p v-if="err('offer_terms')" class="mt-1 text-xs text-red-600">{{ err('offer_terms') }}</p>
            </div>
          </div>
        </section>

        <!-- ── Body ── -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Body</h3>
          <div class="space-y-3">
            <div>
              <OptionalBlockLabel
                label="Heading"
                block="heading"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText v-model="form.heading" fluid />
            </div>
            <div>
              <OptionalBlockLabel
                label="Intro text"
                block="intro_text"
                v-model:hidden="form.hidden_blocks"
              />
              <Textarea v-model="form.intro_text" rows="3" fluid auto-resize />
            </div>
            <div>
              <OptionalBlockLabel
                label="Secondary text"
                block="secondary_text"
                v-model:hidden="form.hidden_blocks"
              />
              <Textarea v-model="form.secondary_text" rows="3" fluid auto-resize />
            </div>
            <div>
              <OptionalBlockLabel
                label="CTA button text"
                block="cta_button_text"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText v-model="form.cta_button_text" fluid />
              <p class="mt-1 text-xs text-gray-400">
                Keep it specific by building it from the offer:
                <code class="font-mono">Claim {{ BONUS_AMOUNT_TOKEN }} at {{ OFFER_BRAND_TOKEN }}</code>
                (bonus amount + brand).
              </p>
            </div>
            <div>
              <OptionalBlockLabel
                label="CTA button link"
                block="cta_button_url"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText
                v-model="form.cta_button_url"
                fluid
                placeholder="https://example.com/offer"
              />
              <p v-if="err('cta_button_url')" class="mt-1 text-xs text-red-600">
                {{ err('cta_button_url') }}
              </p>
              <p v-else class="mt-1 text-xs text-gray-400">
                Where the button sends the reader. Leave empty to reuse the banner link, then
                the site URL. Tracking macros and
                <code class="font-mono">{{ SITE_URL_TOKEN }}</code> are allowed.
              </p>
            </div>
            <div>
              <OptionalBlockLabel
                label="Disclaimer"
                block="disclaimer_text"
                v-model:hidden="form.hidden_blocks"
              />
              <Textarea v-model="form.disclaimer_text" rows="2" fluid auto-resize />
            </div>
            <div>
              <OptionalBlockLabel
                label="Responsible gambling notice"
                block="responsible_notice_text"
                v-model:hidden="form.hidden_blocks"
              />
              <Textarea v-model="form.responsible_notice_text" rows="2" fluid auto-resize />
              <p class="mt-1 text-xs text-gray-400">Boxed notice below the body. Supports <code class="font-mono">**bold**</code>.</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Unsubscribe label</label>
              <InputText v-model="form.unsubscribe_label" fluid />
              <p class="mt-1 text-xs text-gray-400">Required — marketing email must carry an opt-out link.</p>
              <p v-if="err('unsubscribe_label')" class="mt-1 text-xs text-red-600">{{ err('unsubscribe_label') }}</p>
            </div>
          </div>
        </section>

        <!-- ── Footer ── -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Footer</h3>
          <div class="space-y-3">
            <div>
              <OptionalBlockLabel
                label="Footer tagline"
                block="footer_tagline"
                v-model:hidden="form.hidden_blocks"
              />
              <Textarea v-model="form.footer_tagline" rows="2" fluid auto-resize />
            </div>

            <div>
              <div class="mb-1 flex items-center justify-between">
                <label class="block text-xs font-medium text-gray-600">Footer navigation links</label>
                <Button label="Add link" icon="pi pi-plus" size="small" text @click="addFooterLink" />
              </div>
              <p v-if="form.footer_links.length === 0" class="text-xs text-gray-400">
                No footer links. Add one, or leave empty to hide the row.
                Use <code class="font-mono">{{ SITE_URL_TOKEN }}</code> in a URL to point at each subscriber's own site.
              </p>
              <div v-for="(link, i) in form.footer_links" :key="i" class="mb-2 flex items-center gap-2">
                <InputText v-model="link.label" class="w-2/5" placeholder="Label" />
                <InputText v-model="link.url" class="flex-1" placeholder="https://example.com/about" />
                <Button icon="pi pi-trash" size="small" text severity="danger" @click="removeFooterLink(i)" />
              </div>
              <p v-if="err('footer_links')" class="mt-1 text-xs text-red-600">{{ err('footer_links') }}</p>
            </div>

            <div>
              <OptionalBlockLabel
                label="Affiliate disclosure"
                block="affiliate_disclosure_text"
                v-model:hidden="form.hidden_blocks"
              />
              <Textarea v-model="form.affiliate_disclosure_text" rows="2" fluid auto-resize />
            </div>

            <div class="mt-1 border-t border-gray-100 pt-3">
              <p class="mb-2 text-xs font-semibold text-gray-500">Legal &amp; contact (required for deliverability)</p>
            </div>

            <div>
              <OptionalBlockLabel
                label="Reason for receipt"
                block="reason_text"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText v-model="form.reason_text" fluid />
              <p class="mt-1 text-xs text-gray-400">
                Reminds the reader they opted in, so they unsubscribe instead of reporting spam. Use
                <code class="font-mono">{{ SITE_DOMAIN_TOKEN }}</code> for the bare domain.
              </p>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <OptionalBlockLabel
                label="Email preferences label"
                block="email_preferences_label"
                v-model:hidden="form.hidden_blocks"
              />
                <InputText v-model="form.email_preferences_label" fluid placeholder="Email preferences" />
              </div>
              <div>
                <OptionalBlockLabel
                label="Email preferences URL"
                block="email_preferences_url"
                v-model:hidden="form.hidden_blocks"
              />
                <InputText v-model="form.email_preferences_url" fluid placeholder="https://example.com/email-preferences" />
              </div>
            </div>
            <p class="text-xs text-gray-400">
              Shown next to Unsubscribe, at the same weight — a "fewer emails" option so readers cut back
              instead of leaving. Both must be set for the link to appear.
            </p>

            <div>
              <OptionalBlockLabel
                label="Age disclaimer"
                block="age_disclaimer_text"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText v-model="form.age_disclaimer_text" fluid placeholder="18+ only. Gambling can be addictive — play responsibly." />
            </div>

            <div>
              <OptionalBlockLabel
                label="Postal address"
                block="postal_address"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText v-model="form.postal_address" fluid />
              <p class="mt-1 text-xs text-gray-400">
                The company's registered postal address — mandatory under CAN-SPAM and weighed by Gmail/Outlook.
                Shown after the site name.
              </p>
            </div>

            <div>
              <OptionalBlockLabel
                label="Contact email"
                block="contact_email"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText v-model="form.contact_email" fluid placeholder="info@example.com" />
              <p class="mt-1 text-xs text-gray-400">
                A <strong>monitored</strong> mailbox that accepts replies — never no-reply@ / promo@. Use
                <code class="font-mono">{{ SITE_DOMAIN_TOKEN }}</code>, e.g. <code class="font-mono">info@{{ SITE_DOMAIN_TOKEN }}</code>.
              </p>
            </div>

            <div>
              <OptionalBlockLabel
                label="Copyright line"
                block="copyright_text"
                v-model:hidden="form.hidden_blocks"
              />
              <InputText v-model="form.copyright_text" fluid />
              <p class="mt-1 text-xs text-gray-400">
                Use <code class="font-mono">{{ YEAR_TOKEN }}</code> and
                <code class="font-mono">{{ SITE_NAME_TOKEN }}</code>.
              </p>
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
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-semibold text-gray-800">Preview</h3>
              <span v-if="previewLoading" class="text-xs text-gray-400">Rendering…</span>
            </div>
            <div class="flex items-center gap-2">
              <label class="text-xs font-medium text-gray-500">Preview as</label>
              <Select
                v-model="form.preview_site_id"
                :options="siteOptions"
                option-label="label"
                option-value="value"
                placeholder="Select a site"
                class="w-56"
                :disabled="siteOptions.length === 0"
              />
            </div>
          </div>
          <p class="border-b border-gray-100 px-4 py-1.5 text-xs text-gray-400">
            <code class="font-mono">{{ SITE_NAME_TOKEN }}</code> and
            <code class="font-mono">{{ SITE_URL_TOKEN }}</code> resolve to the selected site. Each
            subscriber still receives their own site's values when the promotion is sent.
          </p>
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
          <span v-if="previewSiteName" class="mt-1 block">
            Placeholders resolve to <strong>{{ previewSiteName }}</strong> (the site selected in the preview).
          </span>
        </Message>
      </div>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="showTest = false" />
        <Button label="Send" icon="pi pi-send" :loading="testSending" @click="sendTest" />
      </template>
    </Dialog>
  </div>
</template>
