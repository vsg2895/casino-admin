<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
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
const testSending = ref(false)

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
    cta_button_text: '',
    disclaimer_text: '',
    unsubscribe_label: '',
    button_color: '#75B636',
    accent_color: '#f3a333',
    active: true,
  }
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
    preheader: t.preheader,
    hero_image_url: t.hero_image_url ?? '',
    hero_url: t.hero_url,
    top_button_text: t.top_button_text,
    heading: t.heading,
    intro_text: t.intro_text,
    secondary_text: t.secondary_text,
    cta_button_text: t.cta_button_text,
    disclaimer_text: t.disclaimer_text,
    unsubscribe_label: t.unsubscribe_label,
    button_color: t.button_color,
    accent_color: t.accent_color,
    active: t.active,
  }
}

// Empty hero image must go to the API as null (column is nullable).
function toPayloadForApi(): UpdateSitePromotionEmailPayload {
  return { ...form, hero_image_url: form.hero_image_url?.trim() ? form.hero_image_url.trim() : null }
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
    const res = await api.sendTestPromotionEmail(siteId, testEmail.value.trim())
    toast.add({ severity: 'success', summary: 'Sent', detail: res.message, life: 4000 })
    showTest.value = false
    testEmail.value = ''
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
              <label class="mb-1 block text-xs font-medium text-gray-600">Preview (preheader) text</label>
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
              <label class="mb-1 block text-xs font-medium text-gray-600">Hero image URL (optional)</label>
              <InputText v-model="form.hero_image_url" fluid placeholder="https://…/banner.jpeg" />
              <p class="mt-1 text-xs text-gray-400">Leave empty to hide the top banner image.</p>
              <p v-if="err('hero_image_url')" class="mt-1 text-xs text-red-600">{{ err('hero_image_url') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Offer link (hero + buttons)</label>
              <InputText v-model="form.hero_url" fluid placeholder="https://affiliate.example/offer/123" />
              <p class="mt-1 text-xs text-gray-400">Where the image and both CTA buttons point. You may use <code v-pre class="font-mono">{{site_url}}</code>.</p>
              <p v-if="err('hero_url')" class="mt-1 text-xs text-red-600">{{ err('hero_url') }}</p>
            </div>
          </div>
        </section>

        <!-- Body -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Body</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Top button text</label>
              <InputText v-model="form.top_button_text" fluid />
              <p v-if="err('top_button_text')" class="mt-1 text-xs text-red-600">{{ err('top_button_text') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Heading</label>
              <InputText v-model="form.heading" fluid />
              <p v-if="err('heading')" class="mt-1 text-xs text-red-600">{{ err('heading') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Intro paragraph</label>
              <Textarea v-model="form.intro_text" rows="2" auto-resize fluid />
              <p v-if="err('intro_text')" class="mt-1 text-xs text-red-600">{{ err('intro_text') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Secondary paragraph</label>
              <Textarea v-model="form.secondary_text" rows="2" auto-resize fluid />
              <p v-if="err('secondary_text')" class="mt-1 text-xs text-red-600">{{ err('secondary_text') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">CTA button text</label>
              <InputText v-model="form.cta_button_text" fluid />
              <p v-if="err('cta_button_text')" class="mt-1 text-xs text-red-600">{{ err('cta_button_text') }}</p>
            </div>
          </div>
        </section>

        <!-- Footer + colours -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Footer &amp; colours</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Disclaimer</label>
              <Textarea v-model="form.disclaimer_text" rows="2" auto-resize fluid />
              <p v-if="err('disclaimer_text')" class="mt-1 text-xs text-red-600">{{ err('disclaimer_text') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Unsubscribe label</label>
              <InputText v-model="form.unsubscribe_label" fluid />
              <p v-if="err('unsubscribe_label')" class="mt-1 text-xs text-red-600">{{ err('unsubscribe_label') }}</p>
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="flex items-center gap-3">
                <label class="text-xs font-medium text-gray-600">Button color</label>
                <input
                  type="color"
                  v-model="form.button_color"
                  class="h-9 w-14 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                />
                <InputText v-model="form.button_color" class="w-28" />
              </div>
              <div class="flex items-center gap-3">
                <label class="text-xs font-medium text-gray-600">Accent color</label>
                <input
                  type="color"
                  v-model="form.accent_color"
                  class="h-9 w-14 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                />
                <InputText v-model="form.accent_color" class="w-28" />
              </div>
            </div>
            <p v-if="err('button_color')" class="text-xs text-red-600">{{ err('button_color') }}</p>
            <p v-if="err('accent_color')" class="text-xs text-red-600">{{ err('accent_color') }}</p>
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
          (the <code>MAIL_*</code> settings in <code>.env</code>) to the address below.
          Real promotion blasts are delivered through SendGrid.
        </p>
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
