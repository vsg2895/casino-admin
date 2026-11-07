<script setup lang="ts">
/**
 * Receiver settings for one credential: who it mails, how many per run, and the
 * message — plus the batch preview and "Run now".
 *
 * The same dialog the Mailgun Credentials and Email Configs screens carry
 * inline, as a component, for a channel WITHOUT the `send_enabled` switch (one
 * that runs only from "Run now"). SendGrid Keys use it. The credential row that
 * opened it is the sender, so there is no credential picker; the list it mails
 * is whichever `listApi` the parent passes.
 */
import { ref, computed, watch } from 'vue'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import type { ReceiverCampaignApi, ReceiverListApi, ReceiverSources } from '@/api/receiverLists'
import type { MailgunReceiver, MailgunReceiverTemplate } from '@shared/types/mailgunReceiver'
import type { SmtpReceiverSettings } from '@shared/types/smtpCredential'

const props = defineProps<{
  /** The credential being configured; null keeps the dialog closed. */
  credential: { id: number; name: string } | null
  api: ReceiverCampaignApi<SmtpReceiverSettings>
  /** The list this credential mails — read for its sources and their counts. */
  listApi: ReceiverListApi
}>()

const emit = defineEmits<{ close: [] }>()

const toast = useToast()

const visible = computed({
  get: () => props.credential !== null,
  set: (open: boolean) => {
    if (!open) emit('close')
  },
})

const loading = ref(false)
const saving = ref(false)
const errors = ref<Record<string, string>>({})
const settings = ref<SmtpReceiverSettings | null>(null)
const sources = ref<ReceiverSources | null>(null)
const previewRows = ref<MailgunReceiver[]>([])
const previewLoading = ref(false)

const NAME_TOKEN = '{{name}}'
const EMAIL_TOKEN = '{{email}}'

const orderOptions = [
  { label: 'Newest added first', value: 'newest' },
  { label: 'Oldest added first', value: 'oldest' },
]

/** Both options, each with its live count on this credential's list. */
const sourceOptions = computed(() =>
  (sources.value?.sources ?? []).map((row) => ({ label: `${row.label} (${row.total})`, value: row.value })),
)

// The palette, declared once. `key` is typed against the template so a renamed
// field is a build error rather than a colour that silently stops applying.
type ColorField = {
  [K in keyof MailgunReceiverTemplate]: MailgunReceiverTemplate[K] extends string ? K : never
}[keyof MailgunReceiverTemplate]

const colorFields: { key: ColorField; label: string }[] = [
  { key: 'background_color', label: 'Background' },
  { key: 'heading_color', label: 'Heading' },
  { key: 'text_color', label: 'Text' },
  { key: 'secondary_text_color', label: 'Secondary' },
  { key: 'muted_text_color', label: 'Muted' },
  { key: 'button_color', label: 'Button' },
  { key: 'accent_color', label: 'Link' },
]

function setColor(key: ColorField, event: Event): void {
  if (settings.value === null) return
  settings.value.message_template[key] = (event.target as HTMLInputElement).value
}

function err(field: string): string {
  return errors.value[field] ?? ''
}

async function load(id: number): Promise<void> {
  settings.value = null
  previewRows.value = []
  errors.value = {}
  loading.value = true
  try {
    // In parallel; a failed sources call only leaves the picker empty, and an
    // empty picker means "every source", which is the safe default anyway.
    const [loaded, loadedSources] = await Promise.all([
      props.api.getSettings(id),
      props.listApi.sources().catch(() => null),
    ])
    settings.value = loaded
    sources.value = loadedSources
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load settings.', life: 4000 })
  } finally {
    loading.value = false
  }
}

watch(
  () => props.credential?.id,
  (id) => {
    if (id !== undefined) void load(id)
  },
  { immediate: true },
)

async function save(): Promise<void> {
  if (settings.value === null || props.credential === null) return
  errors.value = {}
  saving.value = true
  try {
    const res = await props.api.saveSettings(props.credential.id, settings.value)
    settings.value.eligible_count = res.eligible_count
    settings.value.next_batch_count = res.next_batch_count
    settings.value.blocked_reason = res.blocked_reason
    toast.add({ severity: 'success', summary: 'Settings saved', life: 2500 })
  } catch (e: unknown) {
    const fieldErrors = (e as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors
    if (fieldErrors) errors.value = Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0] ?? '']))
    else toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save.', life: 4000 })
  } finally {
    saving.value = false
  }
}

// Re-seed every field from the source site's promotion email. Destructive by
// design — it is the "start over" control — so it replaces the subject too.
const templateResetLoading = ref(false)

async function resetTemplate(): Promise<void> {
  if (settings.value === null || props.credential === null) return
  templateResetLoading.value = true
  try {
    const seed = await props.api.templateSource(props.credential.id)
    settings.value.message_template = seed.template
    settings.value.message_subject = seed.subject
    settings.value.template_source = seed.site_name
    errors.value = {}
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load the promotion template.', life: 4000 })
  } finally {
    templateResetLoading.value = false
  }
}

const showMessagePreview = ref(false)
const messagePreviewLoading = ref(false)
const messagePreviewHtml = ref('')

async function loadMessagePreview(): Promise<void> {
  if (settings.value === null || props.credential === null) return
  messagePreviewLoading.value = true
  try {
    messagePreviewHtml.value = await props.api.previewMessage(props.credential.id, settings.value.message_template)
    showMessagePreview.value = true
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not render the preview.', life: 4000 })
  } finally {
    messagePreviewLoading.value = false
  }
}

/** The exact receivers the next run would take, via the shared selector. */
async function loadPreview(): Promise<void> {
  if (props.credential === null) return
  previewLoading.value = true
  try {
    const res = await props.api.previewBatch(props.credential.id)
    previewRows.value = res.data
    if (settings.value) {
      settings.value.eligible_count = res.meta.eligible_count
      settings.value.next_batch_count = res.meta.next_batch_count
    }
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load the batch preview.', life: 4000 })
  } finally {
    previewLoading.value = false
  }
}

async function runNow(): Promise<void> {
  if (props.credential === null) return
  try {
    const res = await props.api.run(props.credential.id)
    toast.add({ severity: 'success', summary: res.message, life: 3000 })
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    toast.add({ severity: 'warn', summary: msg ?? 'Could not queue the run.', life: 4000 })
  }
}

/**
 * A never-null view of `settings` for the guarded block only. The `v-else-if`
 * narrowing does not survive into the v-for and slot scopes the SFC compiler
 * generates — see the same alias in views/mailgunKeys/List.vue. Nothing outside
 * that block may read it.
 */
const draft = computed(() => settings.value!)
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="`Receiver settings — ${credential?.name ?? ''}`"
    :style="{ width: '760px' }"
  >
    <div v-if="loading" class="py-8 text-center text-sm text-gray-400">Loading…</div>

    <div v-else-if="settings" class="space-y-4">
      <div v-if="draft.blocked_reason" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        This credential will not send: {{ draft.blocked_reason }}.
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Receivers per run</label>
          <InputNumber v-model="draft.batch_size" :min="1" :max="100000" fluid />
          <p v-if="err('batch_size')" class="mt-1 text-xs text-red-600">{{ err('batch_size') }}</p>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Order</label>
          <Select v-model="draft.selection_order" :options="orderOptions" option-label="label" option-value="value" fluid />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Cooldown (days)</label>
          <InputNumber v-model="draft.cooldown_days" :min="0" :max="365" fluid />
          <p class="mt-1 text-xs text-gray-400">Skip anyone mailed within N days. Leave empty for no cooldown.</p>
        </div>
      </div>

      <!-- Empty means every source, so an untouched credential keeps its whole audience. -->
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">Send to sources</label>
        <MultiSelect
          v-model="draft.receiver_sources"
          :options="sourceOptions"
          option-label="label"
          option-value="value"
          display="chip"
          placeholder="Every source"
          class="w-full"
          :show-toggle-all="false"
        />
        <p class="mt-1 text-xs text-gray-400">Leave empty to mail every source. The counts below update when you save.</p>
        <p v-if="err('receiver_sources')" class="mt-1 text-xs text-red-600">{{ err('receiver_sources') }}</p>
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">Subject</label>
        <InputText v-model="draft.message_subject" fluid />
        <p v-if="err('message_subject')" class="mt-1 text-xs text-red-600">{{ err('message_subject') }}</p>
      </div>

      <!-- The admin fills in blocks; the backend renders the HTML from them. -->
      <div class="rounded-lg border border-gray-200">
        <div class="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
          <span class="text-sm font-medium text-gray-700">Email template</span>
          <div class="flex items-center gap-1">
            <Button
              label="Reset to promotion template"
              icon="pi pi-replay"
              size="small"
              text
              severity="secondary"
              :loading="templateResetLoading"
              @click="resetTemplate"
            />
            <Button
              label="Preview email"
              icon="pi pi-eye"
              size="small"
              text
              :loading="messagePreviewLoading"
              @click="loadMessagePreview"
            />
          </div>
        </div>

        <div class="space-y-3 p-3">
          <p v-if="draft.template_source" class="text-xs text-gray-400">
            Starting copy and colours come from the <strong>{{ draft.template_source }}</strong>
            promotion email. Everything below is editable and nothing is saved until you press
            Save settings.
          </p>

          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Preview line</label>
            <InputText v-model="draft.message_template.preheader" fluid />
            <p class="mt-1 text-xs text-gray-400">Shown under the subject in the inbox list. Not visible in the message itself.</p>
            <p v-if="err('message_template.preheader')" class="mt-1 text-xs text-red-600">{{ err('message_template.preheader') }}</p>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Heading</label>
            <InputText v-model="draft.message_template.heading" fluid />
            <p v-if="err('message_template.heading')" class="mt-1 text-xs text-red-600">{{ err('message_template.heading') }}</p>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Greeting</label>
            <InputText v-model="draft.message_template.greeting" placeholder="Hi {{name}}," fluid />
            <!-- v-pre: the braces are the EMAIL template's placeholder syntax, not Vue's. -->
            <p v-pre class="mt-1 text-xs text-gray-400">
              Sits between the heading and the body. <code>{{name}}</code> and <code>{{email}}</code>
              are filled in per recipient.
            </p>
            <p v-if="err('message_template.greeting')" class="mt-1 text-xs text-red-600">{{ err('message_template.greeting') }}</p>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Message text</label>
            <Textarea v-model="draft.message_template.intro_text" rows="4" fluid />
            <p class="mt-1 text-xs text-gray-400">
              <code>**bold**</code> becomes bold. <code>{{ NAME_TOKEN }}</code> and
              <code>{{ EMAIL_TOKEN }}</code> are substituted per recipient.
            </p>
            <p v-if="err('message_template.intro_text')" class="mt-1 text-xs text-red-600">{{ err('message_template.intro_text') }}</p>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Secondary text</label>
            <Textarea v-model="draft.message_template.secondary_text" rows="3" fluid />
            <p v-if="err('message_template.secondary_text')" class="mt-1 text-xs text-red-600">{{ err('message_template.secondary_text') }}</p>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Button label</label>
              <InputText v-model="draft.message_template.button_text" fluid />
              <p v-if="err('message_template.button_text')" class="mt-1 text-xs text-red-600">{{ err('message_template.button_text') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Button link</label>
              <InputText v-model="draft.message_template.button_url" placeholder="https://…" fluid />
              <p v-if="err('message_template.button_url')" class="mt-1 text-xs text-red-600">{{ err('message_template.button_url') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Banner image URL</label>
              <InputText v-model="draft.message_template.hero_image_url" placeholder="https://…" fluid />
              <p v-if="err('message_template.hero_image_url')" class="mt-1 text-xs text-red-600">{{ err('message_template.hero_image_url') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Banner link</label>
              <InputText v-model="draft.message_template.hero_url" placeholder="https://…" fluid />
              <p v-if="err('message_template.hero_url')" class="mt-1 text-xs text-red-600">{{ err('message_template.hero_url') }}</p>
            </div>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Disclaimer</label>
            <Textarea v-model="draft.message_template.disclaimer_text" rows="2" fluid />
            <p v-if="err('message_template.disclaimer_text')" class="mt-1 text-xs text-red-600">{{ err('message_template.disclaimer_text') }}</p>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Footer</label>
            <Textarea v-model="draft.message_template.footer_text" rows="2" fluid />
            <p class="mt-1 text-xs text-gray-400">
              Sender name, postal address and a monitored contact belong here. The unsubscribe
              link is added automatically and cannot be removed.
            </p>
            <p v-if="err('message_template.footer_text')" class="mt-1 text-xs text-red-600">{{ err('message_template.footer_text') }}</p>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Postal address</label>
              <InputText v-model="draft.message_template.postal_address" fluid />
              <p v-if="err('message_template.postal_address')" class="mt-1 text-xs text-red-600">{{ err('message_template.postal_address') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Contact email</label>
              <InputText v-model="draft.message_template.contact_email" placeholder="hello@example.com" fluid />
              <p v-if="err('message_template.contact_email')" class="mt-1 text-xs text-red-600">{{ err('message_template.contact_email') }}</p>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Copyright line</label>
              <InputText v-model="draft.message_template.copyright_text" placeholder="© 2026 Example Ltd" fluid />
              <p v-if="err('message_template.copyright_text')" class="mt-1 text-xs text-red-600">{{ err('message_template.copyright_text') }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Unsubscribe wording</label>
              <InputText v-model="draft.message_template.unsubscribe_label" placeholder="Unsubscribe" fluid />
              <p class="mt-1 text-xs text-gray-400">Wording only — the link itself is always added.</p>
              <p v-if="err('message_template.unsubscribe_label')" class="mt-1 text-xs text-red-600">{{ err('message_template.unsubscribe_label') }}</p>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-xs font-medium text-gray-600">Colours</label>
            <div class="flex flex-wrap gap-3">
              <label v-for="c in colorFields" :key="c.key" class="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="color"
                  class="h-7 w-9 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                  :value="draft.message_template[c.key]"
                  @input="setColor(c.key, $event)"
                />
                {{ c.label }}
              </label>
            </div>
            <div class="mt-3 w-40">
              <label class="mb-1 block text-xs font-medium text-gray-600">Button text size</label>
              <InputNumber v-model="draft.message_template.button_text_font_size" :min="12" :max="24" suffix=" px" fluid />
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-lg bg-gray-50 px-3 py-2 text-sm">
        <span class="text-gray-600">Matching receivers now:</span>
        <strong class="ml-1 tabular-nums">{{ draft.eligible_count.toLocaleString() }}</strong>
        <span class="ml-3 text-gray-600">Next run would take:</span>
        <strong class="ml-1 tabular-nums">{{ draft.next_batch_count.toLocaleString() }}</strong>
      </div>

      <div>
        <Button label="Preview batch" icon="pi pi-eye" size="small" outlined :loading="previewLoading" @click="loadPreview" />
        <div v-if="previewRows.length" class="mt-2 max-h-44 overflow-auto rounded-lg border border-gray-200">
          <table class="w-full text-xs">
            <tbody>
              <tr v-for="r in previewRows" :key="r.id" class="border-b border-gray-100 last:border-0">
                <td class="px-3 py-1.5 text-gray-800">{{ r.email }}</td>
                <td class="px-3 py-1.5 text-right text-gray-400">sent {{ r.sent_count }}×</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <template #footer>
      <Button label="Close" text @click="visible = false" />
      <Button label="Run now" icon="pi pi-play" outlined severity="secondary" @click="runNow" />
      <Button label="Save settings" icon="pi pi-check" :loading="saving" @click="save" />
    </template>
  </Dialog>

  <!-- srcdoc + empty sandbox: the email carries its own document and must not
       inherit the admin's stylesheet or run anything. -->
  <Dialog v-model:visible="showMessagePreview" modal header="Email preview" :style="{ width: '700px' }">
    <iframe
      :srcdoc="messagePreviewHtml"
      sandbox=""
      title="Email preview"
      class="h-[560px] w-full rounded-lg border border-gray-200 bg-white"
    ></iframe>
    <template #footer>
      <Button label="Close" text @click="showMessagePreview = false" />
    </template>
  </Dialog>
</template>
