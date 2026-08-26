<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import RemovableLabel from '@/components/forms/RemovableLabel.vue'
import OptionalBlockLabel from '@/components/forms/OptionalBlockLabel.vue'
import axios from 'axios'
import * as api from '@/api/siteVerifyEmails'
import * as sitesApi from '@/api/sites'
import type { SiteVerifyEmail, UpdateSiteVerifyEmailPayload } from '@shared/types/siteVerifyEmail'
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

function emptyForm(): UpdateSiteVerifyEmailPayload {
  return {
    from_name: '',
    from_email: '',
    subject: '',
    header_title: '',
    header_subtitle: '',
    heading: '',
    intro_text: '',
    offer_text: '',
    spam_notice: '',
    footer_note: '',
    unsubscribe_label: '',
    unsubscribe_enabled: true,
    postal_address: '',
    contact_email: '',
    copyright_text: '',
    // Nothing hidden by default — a block is only ever hidden by an explicit
    // Remove, and the server treats an absent key as visible.
    hidden_blocks: [],
    accent_color: '#4f1d96',
    active: true,
  }
}

const form = reactive<UpdateSiteVerifyEmailPayload>(emptyForm())

const placeholders = '{{site_name}}, {{site_url}}, {{email}}, {{year}}, {{unsubscribe_url}}, {{verify_url}}'

const fromEmailHint = computed(
  () => `For best deliverability, use an address on your sending domain — e.g. verify@${fromDomain.value}`,
)

onMounted(async () => {
  try {
    const [tplRes, siteRes] = await Promise.all([
      api.getVerifyEmail(siteId),
      sitesApi.getSite(siteId),
    ])
    Object.assign(form, toPayload(tplRes.data))
    fromDomain.value = tplRes.data.from_domain
    siteName.value = siteRes.data.name
    await refreshPreview()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load template.', life: 5000 })
  } finally {
    loading.value = false
  }
})

// Pick only the editable fields off the server resource.
function toPayload(t: SiteVerifyEmail): UpdateSiteVerifyEmailPayload {
  return {
    from_name: t.from_name,
    from_email: t.from_email,
    subject: t.subject,
    header_title: t.header_title ?? '',
    header_subtitle: t.header_subtitle ?? '',
    heading: t.heading ?? '',
    intro_text: t.intro_text ?? '',
    offer_text: t.offer_text ?? '',
    spam_notice: t.spam_notice ?? '',
    footer_note: t.footer_note ?? '',
    unsubscribe_label: t.unsubscribe_label,
    // Defaulted so a row written before the column existed reads as "shown",
    // matching how the server coalesces it.
    unsubscribe_enabled: t.unsubscribe_enabled ?? true,
    postal_address: t.postal_address ?? '',
    contact_email: t.contact_email ?? '',
    copyright_text: t.copyright_text ?? '',
    // Copied, not referenced: OptionalBlockLabel emits a new array, and the
    // deep watcher that drives the live preview must see it change.
    hidden_blocks: [...(t.hidden_blocks ?? [])],
    accent_color: t.accent_color,
    active: t.active,
  }
}

// ── Debounced live preview ──────────────────────────────────────────────────
let previewTimer: ReturnType<typeof setTimeout> | undefined

async function refreshPreview(): Promise<void> {
  previewLoading.value = true
  try {
    const res = await api.previewVerifyEmail(siteId, { ...form })
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

watch(
  form,
  () => {
    if (loading.value) return
    clearTimeout(previewTimer)
    previewTimer = setTimeout(refreshPreview, 500)
  },
  { deep: true },
)

/**
 * Whether an optional block is currently switched off. Only greys the input out —
 * the text stays in the form and is still saved, which is what makes Restore
 * bring back the original wording rather than a default.
 */
function hidden(block: string): boolean {
  return form.hidden_blocks.includes(block)
}

// ── Save ────────────────────────────────────────────────────────────────────
async function save(): Promise<void> {
  fieldErrors.value = {}
  saving.value = true
  try {
    await api.updateVerifyEmail(siteId, { ...form })
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Verify email updated.', life: 3000 })
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
      toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save template.', life: 5000 })
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
    const res = await api.sendTestVerifyEmail(siteId, testEmail.value.trim(), testName.value.trim() || undefined)
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
        <Button icon="pi pi-arrow-left" text severity="secondary" @click="router.push('/verify-emails')" />
        <div>
          <h2 class="text-lg font-semibold text-gray-900">Verify Email</h2>
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

    <div v-if="loading" class="py-20 text-center text-sm text-gray-400">Loading template…</div>

    <div v-else class="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <!-- ── Form ── -->
      <div class="space-y-5">
        <p class="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
          Placeholders you can use anywhere: <code class="font-mono">{{ placeholders }}</code>.
          Body fields also support <code class="font-mono">**bold**</code>. A
          <strong>“Verify My Email”</strong> button with the verification link is added to the email
          automatically.
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
              <InputText v-model="form.from_email" fluid :placeholder="`verify@${fromDomain}`" />
              <p class="mt-1 text-xs text-gray-400">{{ fromEmailHint }}</p>
              <p v-if="err('from_email')" class="mt-1 text-xs text-red-600">{{ err('from_email') }}</p>
            </div>
          </div>
        </section>

        <!-- Subject + header -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Subject &amp; header band</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Subject</label>
              <InputText v-model="form.subject" fluid />
              <p v-if="err('subject')" class="mt-1 text-xs text-red-600">{{ err('subject') }}</p>
            </div>
            <div>
              <RemovableLabel label="Header title" :value="form.header_title" @clear="form.header_title = ''" />
              <InputText v-model="form.header_title" fluid />
              <p v-if="err('header_title')" class="mt-1 text-xs text-red-600">{{ err('header_title') }}</p>
            </div>
            <div>
              <RemovableLabel label="Header subtitle" :value="form.header_subtitle" @clear="form.header_subtitle = ''" />
              <InputText v-model="form.header_subtitle" fluid />
              <p v-if="err('header_subtitle')" class="mt-1 text-xs text-red-600">{{ err('header_subtitle') }}</p>
            </div>
            <div class="flex items-center gap-3">
              <label class="text-xs font-medium text-gray-600">Accent color</label>
              <input
                type="color"
                v-model="form.accent_color"
                class="h-9 w-14 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
              />
              <InputText v-model="form.accent_color" class="w-32" />
              <p v-if="err('accent_color')" class="text-xs text-red-600">{{ err('accent_color') }}</p>
            </div>
          </div>
        </section>

        <!-- Body -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Body</h3>
          <div class="space-y-3">
            <div>
              <RemovableLabel label="Heading" :value="form.heading" @clear="form.heading = ''" />
              <InputText v-model="form.heading" fluid />
              <p v-if="err('heading')" class="mt-1 text-xs text-red-600">{{ err('heading') }}</p>
            </div>
            <div>
              <RemovableLabel label="Intro paragraph" :value="form.intro_text" @clear="form.intro_text = ''" />
              <Textarea v-model="form.intro_text" rows="2" auto-resize fluid />
              <p v-if="err('intro_text')" class="mt-1 text-xs text-red-600">{{ err('intro_text') }}</p>
            </div>
            <div>
              <RemovableLabel label="Offer paragraph" :value="form.offer_text" @clear="form.offer_text = ''" />
              <Textarea v-model="form.offer_text" rows="2" auto-resize fluid />
              <p v-if="err('offer_text')" class="mt-1 text-xs text-red-600">{{ err('offer_text') }}</p>
            </div>
            <div>
              <RemovableLabel label="Spam notice" :value="form.spam_notice" @clear="form.spam_notice = ''" />
              <Textarea v-model="form.spam_notice" rows="2" auto-resize fluid />
              <p v-if="err('spam_notice')" class="mt-1 text-xs text-red-600">{{ err('spam_notice') }}</p>
            </div>
          </div>
        </section>

        <!-- Footer -->
        <section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-gray-800">Footer &amp; unsubscribe</h3>
          <div class="space-y-3">
            <div>
              <RemovableLabel label="Footer note" :value="form.footer_note" @clear="form.footer_note = ''" />
              <Textarea v-model="form.footer_note" rows="2" auto-resize fluid />
              <p v-if="err('footer_note')" class="mt-1 text-xs text-red-600">{{ err('footer_note') }}</p>
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <!-- Remove / Restore rather than clearing the field: the label has
                     to survive removal, or "restore" could only put back a default
                     instead of the wording that was actually there. -->
                <div class="mb-1 flex items-center justify-between gap-2">
                  <label class="block text-xs font-medium text-gray-600">Unsubscribe link</label>
                  <Button
                    v-if="form.unsubscribe_enabled"
                    label="Remove"
                    icon="pi pi-trash"
                    text
                    severity="danger"
                    size="small"
                    @click="form.unsubscribe_enabled = false"
                  />
                  <Button
                    v-else
                    label="Restore"
                    icon="pi pi-replay"
                    text
                    severity="secondary"
                    size="small"
                    @click="form.unsubscribe_enabled = true"
                  />
                </div>
                <InputText
                  v-model="form.unsubscribe_label"
                  fluid
                  :disabled="!form.unsubscribe_enabled"
                />
                <p v-if="err('unsubscribe_label')" class="mt-1 text-xs text-red-600">{{ err('unsubscribe_label') }}</p>
                <p v-else-if="!form.unsubscribe_enabled" class="mt-1 text-xs text-gray-500">
                  Hidden from the email footer. The wording is kept, so Restore brings back the
                  same link. Recipients can still unsubscribe from their mail client — the
                  one-click header and the unsubscribe page are unchanged.
                </p>
              </div>
              <div>
                <!-- Remove / Restore rather than clearing: the wording is kept in
                     the database while hidden, so Restore brings back exactly what
                     was written instead of a default. -->
                <OptionalBlockLabel
                  label="Copyright line"
                  block="copyright_text"
                  v-model:hidden="form.hidden_blocks"
                />
                <InputText
                  v-model="form.copyright_text"
                  fluid
                  :disabled="hidden('copyright_text')"
                />
                <p v-if="err('copyright_text')" class="mt-1 text-xs text-red-600">{{ err('copyright_text') }}</p>
              </div>
            </div>

            <!-- Footer identity — the sender's postal address and a monitored
                 contact address. Both are removable and both keep their text. -->
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <OptionalBlockLabel
                  label="Postal address"
                  block="postal_address"
                  v-model:hidden="form.hidden_blocks"
                />
                <InputText
                  v-model="form.postal_address"
                  fluid
                  placeholder="1234 Example Ave, Suite 100, City, ST 00000"
                  :disabled="hidden('postal_address')"
                />
                <p v-if="err('postal_address')" class="mt-1 text-xs text-red-600">{{ err('postal_address') }}</p>
                <p v-else class="mt-1 text-xs text-gray-500">
                  Shown after the site name. A physical mailing address is required by
                  CAN-SPAM for commercial email.
                </p>
              </div>
              <div>
                <OptionalBlockLabel
                  label="Contact email"
                  block="contact_email"
                  v-model:hidden="form.hidden_blocks"
                />
                <InputText
                  v-model="form.contact_email"
                  fluid
                  placeholder="support@example.com"
                  :disabled="hidden('contact_email')"
                />
                <p v-if="err('contact_email')" class="mt-1 text-xs text-red-600">{{ err('contact_email') }}</p>
                <p v-else class="mt-1 text-xs text-gray-500">
                  Rendered as a mailto link. Use a mailbox someone actually reads.
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Active -->
        <section class="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <p class="text-sm font-medium text-gray-800">Verify email active</p>
            <p class="text-xs text-gray-500">When off, no verify email is sent.</p>
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
            title="Email preview"
            class="h-[640px] w-full bg-gray-100"
          />
        </div>
      </div>
    </div>

    <!-- Send test dialog -->
    <Dialog v-model:visible="showTest" modal header="Send test email" :style="{ width: '420px' }">
      <div class="space-y-3">
        <p class="text-sm text-gray-600">
          Sends the <strong>saved</strong> template via your configured SMTP server
          (the <code>MAIL_*</code> settings in <code>.env</code>) to the address below,
          It is sent from your server's mailbox (<code>MAIL_FROM_ADDRESS</code>) with this
          template's <strong>From name</strong> — so your mail server accepts it.
          Real subscriber emails are delivered through SendGrid.
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
