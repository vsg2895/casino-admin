<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import OptionalBlockLabel from '@/components/forms/OptionalBlockLabel.vue'
import axios from 'axios'
import * as api from '@/api/sitePromotionEmails'
import * as sitesApi from '@/api/sites'
import type {
  SitePromotionEmail,
  UpdateSitePromotionEmailPayload,
} from '@shared/types/sitePromotionEmail'
import type { ErrorResponse } from '@shared/types/api'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const siteId = Number(route.params.siteId)

const siteName = ref('')
const fromDomain = ref('example.com')
const loading = ref(true)
const saving = ref(false)
const fieldErrors = ref<Record<string, string>>({})

// Live-preview state
const previewHtml = ref('')
const previewLoading = ref(false)
const previewError = ref('')

// Send-test dialog
const showTest = ref(false)
const testEmail = ref('')
const testName = ref('')
const testSending = ref(false)

type ColorField =
  | 'background_color'
  | 'heading_color'
  | 'text_color'
  | 'secondary_text_color'
  | 'muted_text_color'
  | 'button_color'
  | 'accent_color'

// Mirrors SitePromotionEmail::COLOR_DEFAULTS on the server — the original dark
// design. Kept in sync by hand; the server defaults are authoritative.
const COLOR_DEFAULTS: Record<ColorField, string> = {
  background_color: '#000000',
  heading_color: '#ffffff',
  text_color: '#ffffff',
  secondary_text_color: '#d9d9d9',
  muted_text_color: '#b3b3b3',
  button_color: '#75B636',
  accent_color: '#f3a333',
}

// Order here drives the order of the swatches in the Colours panel.
const COLOR_FIELDS = [
  { key: 'background_color', label: 'Background', hint: 'The email canvas.' },
  { key: 'heading_color', label: 'Heading', hint: 'The large title.' },
  { key: 'text_color', label: 'Body text', hint: 'Greeting and intro paragraph.' },
  { key: 'secondary_text_color', label: 'Secondary text', hint: 'The second paragraph.' },
  { key: 'muted_text_color', label: 'Muted text', hint: 'Disclaimer and unsubscribe line.' },
  { key: 'button_color', label: 'Button', hint: 'CTA button fill.' },
  { key: 'accent_color', label: 'Link', hint: 'The unsubscribe link.' },
] as const satisfies ReadonlyArray<{ key: ColorField; label: string; hint: string }>

function emptyForm(): UpdateSitePromotionEmailPayload {
  return {
    from_name: '',
    from_email: '',
    subject: '',
    preheader: '',
    hero_image_url: '',
    hero_url: '',
    top_button_text: '',
    heading: '',
    intro_text: '',
    secondary_text: '',
    cta_button_url: '',
    hidden_blocks: [],
    disclaimer_text: '',
    unsubscribe_label: '',
    ...COLOR_DEFAULTS,
    active: true,
  }
}

function resetColors(): void {
  Object.assign(form, COLOR_DEFAULTS)
}

const form = reactive<UpdateSitePromotionEmailPayload>(emptyForm())

const placeholders = '{{site_name}}, {{site_url}}, {{email}}, {{year}}, {{unsubscribe_url}}'

const fromEmailHint = computed(
  () => `For best deliverability, use an address on your sending domain — e.g. offers@${fromDomain.value}`,
)

onMounted(async () => {
  try {
    const [tplRes, siteRes] = await Promise.all([
      api.getPromotionEmail(siteId),
      sitesApi.getSite(siteId),
    ])
    Object.assign(form, toPayload(tplRes.data))
    fromDomain.value = tplRes.data.from_domain
    siteName.value = siteRes.data.name
    await refreshPreview()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load promotion email.', life: 5000 })
  } finally {
    loading.value = false
  }
})

// Pick only the editable fields off the server resource.
function toPayload(t: SitePromotionEmail): UpdateSitePromotionEmailPayload {
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
    cta_button_url: t.cta_button_url ?? '',
    // Fresh array: the form must never share a reference with the loaded
    // resource, or restoring a block would not trip the preview watcher.
    hidden_blocks: [...(t.hidden_blocks ?? [])],
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
  }
}

// A cleared removable element goes to the API as null — that is what tells the
// email layout to drop the image / button instead of rendering it empty.
function nullIfBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

// Every removable block: cleared → null. Structural fields (sender, subject,
// unsubscribe label, colours) are never in this list — they cannot be removed.
const REMOVABLE_FIELDS = [
  'preheader',
  'hero_image_url',
  'hero_url',
  'top_button_text',
  'heading',
  'intro_text',
  'secondary_text',
  'cta_button_url',
  'disclaimer_text',
] as const

function toPayloadForApi(): UpdateSitePromotionEmailPayload {
  const payload = { ...form }
  for (const field of REMOVABLE_FIELDS) {
    payload[field] = nullIfBlank(payload[field])
  }
  return payload
}

// ── Debounced live preview ──────────────────────────────────────────────────
let previewTimer: ReturnType<typeof setTimeout> | undefined

async function refreshPreview(): Promise<void> {
  previewLoading.value = true
  try {
    const res = await api.previewPromotionEmail(siteId, toPayloadForApi())
    previewHtml.value = res.html
    previewError.value = ''
  } catch (e: unknown) {
    // Surface the reason (e.g. from_email not on the verified domain) instead of
    // silently leaving the pane blank.
    previewError.value =
      axios.isAxiosError(e) && e.response?.status === 422
        ? ((e.response.data as ErrorResponse).message ?? 'Preview could not be generated.')
        : 'Preview could not be generated.'
  } finally {
    previewLoading.value = false
  }
}

watch(
  form,
  () => {
    if (loading.value) return
    clearTimeout(previewTimer)
    previewTimer = setTimeout(refreshPreview, 500)
  },
  { deep: true },
)

// ── Save ────────────────────────────────────────────────────────────────────
async function save(): Promise<void> {
  fieldErrors.value = {}
  saving.value = true
  try {
    await api.updatePromotionEmail(siteId, toPayloadForApi())
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Promotion email updated.', life: 3000 })
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
      toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save promotion email.', life: 5000 })
    }
  } finally {
    saving.value = false
  }
}

// ── Send test ───────────────────────────────────────────────────────────────
async function sendTest(): Promise<void> {
  if (!testEmail.value.trim()) return
  testSending.value = true
  try {
    const res = await api.sendTestPromotionEmail(siteId, testEmail.value.trim(), testName.value.trim() || undefined)
    toast.add({ severity: 'success', summary: 'Sent', detail: res.message, life: 4000 })
    showTest.value = false
    testEmail.value = ''
    testName.value = ''
  } catch (e: unknown) {
    const msg =
      axios.isAxiosError(e)
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
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <Button icon="pi pi-arrow-left" text severity="secondary" @click="router.push('/promotion-emails')" />
        <div>
          <h2 class="text-lg font-semibold text-gray-900">Promotion Email</h2>
          <p class="text-sm text-gray-500">
            Template for <span class="font-medium">{{ siteName || '…' }}</span>
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Button label="Send test" icon="pi pi-send" severity="secondary" outlined @click="showTest = true" />
        <Button label="Save Changes" icon="pi pi-check" :loading="saving" @click="save" />
      </div>
    </div>

    <div v-if="loading" class="py-20 text-center text-sm text-gray-400">Loading promotion email…</div>

    <div v-else class="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <!-- ── Form ── -->
      <div class="space-y-5">
        <p class="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
          Placeholders you can use anywhere: <code class="font-mono">{{ placeholders }}</code>.
          Body fields also support <code class="font-mono">**bold**</code>.
        </p>

        <!-- Sender -->
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

        <!-- Subject + preview -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Subject &amp; preview</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Subject</label>
              <InputText v-model="form.subject" fluid />
              <p v-if="err('subject')" class="mt-1 text-xs text-red-600">{{ err('subject') }}</p>
            </div>
            <div>
              <OptionalBlockLabel label="Preview (preheader) text" block="preheader" v-model:hidden="form.hidden_blocks" />
              <InputText v-model="form.preheader" fluid />
              <p class="mt-1 text-xs text-gray-400">Hidden snippet shown next to the subject in the inbox.</p>
              <p v-if="err('preheader')" class="mt-1 text-xs text-red-600">{{ err('preheader') }}</p>
            </div>
          </div>
        </section>

        <!-- Hero + links -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Hero &amp; offer link</h3>
          <div class="space-y-3">
            <div>
              <OptionalBlockLabel label="Hero image URL (optional)" block="hero_image_url" v-model:hidden="form.hidden_blocks" remove-label="Remove image" />
              <InputText v-model="form.hero_image_url" fluid placeholder="https://…/banner.jpeg" />
              <img
                v-if="form.hero_image_url"
                :src="form.hero_image_url"
                alt="Hero preview"
                class="mt-2 max-h-28 w-full rounded-md border border-gray-200 object-cover"
              />
              <p class="mt-1 text-xs text-gray-400">Every block here can be removed independently — cleared blocks are dropped from the email.</p>
              <p v-if="err('hero_image_url')" class="mt-1 text-xs text-red-600">{{ err('hero_image_url') }}</p>
            </div>
            <div>
              <OptionalBlockLabel label="Offer link (hero + buttons)" block="hero_url" v-model:hidden="form.hidden_blocks" remove-label="Remove link" />
              <InputText v-model="form.hero_url" fluid placeholder="https://affiliate.example/offer/123" />
              <p class="mt-1 text-xs text-gray-400">Where the image and buttons point. You may use <code v-pre class="font-mono">{{site_url}}</code>. Remove it and any remaining buttons simply render without a link.</p>
              <p v-if="err('hero_url')" class="mt-1 text-xs text-red-600">{{ err('hero_url') }}</p>
            </div>
          </div>
        </section>

        <!-- Body -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Body</h3>
          <div class="space-y-3">
            <div>
              <OptionalBlockLabel label="Top button text" block="top_button_text" v-model:hidden="form.hidden_blocks" remove-label="Remove button" />
              <InputText v-model="form.top_button_text" fluid placeholder="Leave empty to hide this button" />
              <p v-if="err('top_button_text')" class="mt-1 text-xs text-red-600">{{ err('top_button_text') }}</p>
            </div>
            <div>
              <OptionalBlockLabel label="Heading" block="heading" v-model:hidden="form.hidden_blocks" />
              <InputText v-model="form.heading" fluid />
              <p v-if="err('heading')" class="mt-1 text-xs text-red-600">{{ err('heading') }}</p>
            </div>
            <div>
              <OptionalBlockLabel label="Intro paragraph" block="intro_text" v-model:hidden="form.hidden_blocks" />
              <Textarea v-model="form.intro_text" rows="2" auto-resize fluid />
              <p v-if="err('intro_text')" class="mt-1 text-xs text-red-600">{{ err('intro_text') }}</p>
            </div>
            <div>
              <OptionalBlockLabel label="Secondary paragraph" block="secondary_text" v-model:hidden="form.hidden_blocks" />
              <Textarea v-model="form.secondary_text" rows="2" auto-resize fluid />
              <p v-if="err('secondary_text')" class="mt-1 text-xs text-red-600">{{ err('secondary_text') }}</p>
            </div>
            <div>
              <OptionalBlockLabel
                label="CTA button link"
                block="cta_button_url"
                v-model:hidden="form.hidden_blocks"
                remove-label="Remove link"
              />
              <InputText v-model="form.cta_button_url" fluid placeholder="https://example.com/offer" />
              <p v-if="err('cta_button_url')" class="mt-1 text-xs text-red-600">
                {{ err('cta_button_url') }}
              </p>
              <p v-else class="mt-1 text-xs text-gray-400">
                Where the CTA button sends the reader. Leave empty to reuse the offer link above.
                Tracking macros and placeholders are allowed.
              </p>
            </div>
          </div>
        </section>

        <!-- Footer -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Footer</h3>
          <div class="space-y-3">
            <div>
              <OptionalBlockLabel label="Disclaimer" block="disclaimer_text" v-model:hidden="form.hidden_blocks" />
              <Textarea v-model="form.disclaimer_text" rows="2" auto-resize fluid />
              <p v-if="err('disclaimer_text')" class="mt-1 text-xs text-red-600">{{ err('disclaimer_text') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Unsubscribe label</label>
              <InputText v-model="form.unsubscribe_label" fluid />
              <p v-if="err('unsubscribe_label')" class="mt-1 text-xs text-red-600">{{ err('unsubscribe_label') }}</p>
            </div>
          </div>
        </section>

        <!-- Palette -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-gray-800">Colours</h3>
            <Button label="Reset to defaults" text size="small" severity="secondary" @click="resetColors" />
          </div>
          <p class="mb-3 text-xs text-gray-400">
            Every colour in the email is editable. The preview updates as you change them —
            keep an eye on the contrast between the background and each text colour.
          </p>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div v-for="field in COLOR_FIELDS" :key="field.key">
              <label class="mb-1 block text-xs font-medium text-gray-600">{{ field.label }}</label>
              <div class="flex items-center gap-2">
                <input
                  type="color"
                  v-model="form[field.key]"
                  class="h-9 w-12 shrink-0 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                  :aria-label="`${field.label} colour`"
                />
                <InputText v-model="form[field.key]" class="w-28" />
              </div>
              <p class="mt-1 text-xs text-gray-400">{{ field.hint }}</p>
              <p v-if="err(field.key)" class="mt-1 text-xs text-red-600">{{ err(field.key) }}</p>
            </div>
          </div>
        </section>

        <!-- Active -->
        <section class="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <p class="text-sm font-medium text-gray-800">Promotion enabled</p>
            <p class="text-xs text-gray-500">When off, the template is saved but test sends are blocked.</p>
          </div>
          <ToggleSwitch v-model="form.active" />
        </section>
      </div>

      <!-- ── Live preview ── -->
      <div class="lg:sticky lg:top-4 lg:self-start">
        <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div class="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <span class="text-sm font-semibold text-gray-800">Live preview</span>
            <span v-if="previewLoading" class="text-xs text-gray-400">Updating…</span>
          </div>
          <div v-if="previewError" class="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
            {{ previewError }}
          </div>
          <iframe
            :srcdoc="previewHtml"
            title="Promotion email preview"
            class="h-[640px] w-full bg-gray-100"
          />
        </div>
      </div>
    </div>

    <!-- Send test dialog -->
    <Dialog v-model:visible="showTest" modal header="Send test email" :style="{ width: '420px' }">
      <div class="space-y-3">
        <p class="text-sm text-gray-600">
          Sends the <strong>saved</strong> promotion via your configured SMTP server
          (the <code>MAIL_*</code> settings in <code>.env</code>) to the address below,
          It is sent from your server's mailbox (<code>MAIL_FROM_ADDRESS</code>) with this
          template's <strong>From name</strong> — so your mail server accepts it.
          Real promotion blasts are delivered through SendGrid.
        </p>
        <InputText
          v-model="testName"
          fluid
          placeholder="Recipient name (optional) — adds “Dear name,”"
          @keyup.enter="sendTest"
        />
        <InputText
          v-model="testEmail"
          fluid
          placeholder="you@example.com"
          @keyup.enter="sendTest"
        />
      </div>
      <template #footer>
        <Button label="Cancel" text @click="showTest = false" />
        <Button label="Send" icon="pi pi-send" :loading="testSending" @click="sendTest" />
      </template>
    </Dialog>
  </div>
</template>
