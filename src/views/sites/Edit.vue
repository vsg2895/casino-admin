<script setup lang="ts">
import { computed, ref, reactive, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import MultiSelect from 'primevue/multiselect'
import axios from 'axios'
import * as sitesApi from '@/api/sites'
import { useCountriesStore } from '@/stores/countriesStore'
import type { LegalIdentityField, Site } from '@shared/types/site'
import type { ErrorResponse } from '@shared/types/api'

interface SiteEditForm {
  name: string
  domain: string
  positioning: string
  revalidation_url: string
  newsletter_emails_enabled: boolean
  countries_enabled: boolean
  noindex_country_ids: number[]
  reviews_enabled: boolean
  review_auto_publish: boolean
  operator_profile_enabled: boolean
  byline_enabled: boolean
  guides_enabled: boolean
  news_enabled: boolean
  bonus_enabled: boolean
  noindex_without_override: boolean
  forum_enabled: boolean
  accounts_enabled: boolean
  author_name: string | null
  author_role: string | null
  author_bio: string | null
  methodology_page_slug: string | null
  legal_entity_name: string
  registered_address: string
  company_number: string
  governing_law: string
  contact_email: string
  support_email: string
  privacy_email: string
  analytics_provider: string
}

const props = defineProps<{
  visible: boolean
  site: Site | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  updated: [site: Site]
}>()

const form = reactive<SiteEditForm>({
  name: '',
  domain: '',
  positioning: '',
  revalidation_url: '',
  newsletter_emails_enabled: true,
  countries_enabled: false,
  noindex_country_ids: [],
  reviews_enabled: false,
  review_auto_publish: true,
  operator_profile_enabled: false,
  byline_enabled: false,
  guides_enabled: false,
  news_enabled: false,
  bonus_enabled: false,
  noindex_without_override: false,
  forum_enabled: false,
  accounts_enabled: false,
  author_name: null,
  author_role: null,
  author_bio: null,
  methodology_page_slug: null,
  legal_entity_name: '',
  registered_address: '',
  company_number: '',
  governing_law: '',
  contact_email: '',
  support_email: '',
  privacy_email: '',
  analytics_provider: '',
})

/** Labels for the "still empty" warning; matches LegalIdentity::REQUIRED. */
const LEGAL_LABELS: Record<LegalIdentityField, string> = {
  legal_entity_name: 'Legal entity name',
  registered_address: 'Registered address',
  company_number: 'Company number',
  governing_law: 'Governing law',
  contact_email: 'Contact email',
  support_email: 'Support email',
  privacy_email: 'Privacy email',
}

const legalMissing = computed<string[]>(() =>
  (['legal_entity_name', 'registered_address', 'contact_email'] as const)
    .filter((field) => form[field].trim() === '')
    .map((field) => LEGAL_LABELS[field]),
)

const countriesStore = useCountriesStore()
const countryOptions = computed(() =>
  countriesStore.countries.map((c) => ({ label: c.name, value: c.id })),
)

const loading = ref(false)
const fieldErrors = ref<Record<string, string>>({})
const globalError = ref<string | null>(null)

watch(
  () => props.visible,
  (val) => {
    if (val && props.site) {
      form.name = props.site.name
      form.domain = props.site.domain
      form.positioning = props.site.positioning ?? ''
      form.revalidation_url = props.site.revalidation_url ?? ''
      form.newsletter_emails_enabled = props.site.newsletter_emails_enabled
      form.countries_enabled = props.site.countries_enabled
      form.noindex_country_ids = [...(props.site.noindex_country_ids ?? [])]
      // Options for the "hidden from search" picker; loaded once per session.
      void countriesStore.ensureLoaded()
      form.reviews_enabled = props.site.reviews_enabled
      form.review_auto_publish = props.site.review_auto_publish
      form.operator_profile_enabled = props.site.operator_profile_enabled
      form.byline_enabled = props.site.byline_enabled
      form.guides_enabled = props.site.guides_enabled
      form.news_enabled = props.site.news_enabled
      form.bonus_enabled = props.site.bonus_enabled
      form.noindex_without_override = props.site.noindex_without_override ?? false
      form.forum_enabled = props.site.forum_enabled
      form.accounts_enabled = props.site.accounts_enabled
      form.author_name = props.site.author_name
      form.author_role = props.site.author_role
      form.author_bio = props.site.author_bio
      form.methodology_page_slug = props.site.methodology_page_slug
      form.legal_entity_name = props.site.legal_entity_name ?? ''
      form.registered_address = props.site.registered_address ?? ''
      form.company_number = props.site.company_number ?? ''
      form.governing_law = props.site.governing_law ?? ''
      form.contact_email = props.site.contact_email ?? ''
      form.support_email = props.site.support_email ?? ''
      form.privacy_email = props.site.privacy_email ?? ''
      form.analytics_provider = props.site.analytics_provider ?? ''
      fieldErrors.value = {}
      globalError.value = null
    }
  },
)

async function submit(): Promise<void> {
  if (!props.site) return
  fieldErrors.value = {}
  globalError.value = null
  loading.value = true

  try {
    const response = await sitesApi.updateSite(props.site.id, {
      name: form.name,
      domain: form.domain,
      positioning: form.positioning.trim() || null,
      revalidation_url: form.revalidation_url.trim() || null,
      newsletter_emails_enabled: form.newsletter_emails_enabled,
      countries_enabled: form.countries_enabled,
      // Only when the API sent the set: before its migration runs the field is
      // absent, and sending [] would read as "clear it".
      ...(props.site.noindex_country_ids !== undefined ? { noindex_country_ids: form.noindex_country_ids } : {}),
      reviews_enabled: form.reviews_enabled,
      review_auto_publish: form.review_auto_publish,
      operator_profile_enabled: form.operator_profile_enabled,
      byline_enabled: form.byline_enabled,
      guides_enabled: form.guides_enabled,
      news_enabled: form.news_enabled,
      bonus_enabled: form.bonus_enabled,
      noindex_without_override: form.noindex_without_override,
      forum_enabled: form.forum_enabled,
      accounts_enabled: form.accounts_enabled,
      author_name: form.author_name,
      author_role: form.author_role,
      author_bio: form.author_bio,
      methodology_page_slug: form.methodology_page_slug,
      legal_entity_name: form.legal_entity_name.trim() || null,
      registered_address: form.registered_address.trim() || null,
      company_number: form.company_number.trim() || null,
      governing_law: form.governing_law.trim() || null,
      contact_email: form.contact_email.trim() || null,
      support_email: form.support_email.trim() || null,
      privacy_email: form.privacy_email.trim() || null,
      analytics_provider: form.analytics_provider.trim() || null,
    })
    emit('updated', response.data)
    emit('update:visible', false)
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as ErrorResponse
      globalError.value = data.message
      if (data.errors) {
        for (const [field, messages] of Object.entries(data.errors)) {
          fieldErrors.value[field] = messages[0] ?? ''
        }
      }
    } else if (axios.isAxiosError(e)) {
      const data = e.response?.data as ErrorResponse | undefined
      globalError.value = data?.message ?? 'Failed to update site.'
    } else {
      globalError.value = 'An unexpected error occurred.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <!-- Wider than the PrimeVue default. This form carries long explanatory help
       text under several fields — Positioning alone runs to six lines at 520px
       — and a narrow column turned each one into a wall of grey. The viewport
       cap keeps it usable on a laptop and in a part-width window. -->
  <Dialog
    :visible="visible"
    modal
    :header="site ? `Edit — ${site.name}` : 'Edit Site'"
    :style="{ width: '820px', maxWidth: '95vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="space-y-4" @submit.prevent="submit">
      <div
        v-if="globalError"
        class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
      >
        {{ globalError }}
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">
          Name <span class="text-red-500">*</span>
        </label>
        <InputText v-model="form.name" fluid required />
        <p v-if="fieldErrors.name" class="mt-1 text-xs text-red-600">{{ fieldErrors.name }}</p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Slug</label>
        <InputText :model-value="site?.slug ?? ''" fluid disabled />
        <p class="mt-1 text-xs text-gray-500">Slug cannot be changed after registration.</p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">
          Domain <span class="text-red-500">*</span>
        </label>
        <InputText v-model="form.domain" fluid required />
        <p v-if="fieldErrors.domain" class="mt-1 text-xs text-red-600">{{ fieldErrors.domain }}</p>
      </div>

      <label class="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-3">
        <span>
          <span class="block text-sm font-medium text-gray-900">Send newsletter emails</span>
          <span class="block text-xs text-gray-500">
            Off, the signup form still works and subscribers are still recorded — only the
            outbound email stops. Those subscribers stay unverified, because they never get
            a link to click.
          </span>
        </span>
        <ToggleSwitch class="shrink-0" v-model="form.newsletter_emails_enabled" />
      </label>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Positioning</label>
        <InputText
          v-model="form.positioning"
          fluid
          maxlength="200"
          placeholder="Roulette and live table games, reviewed by players"
        />
        <p v-if="fieldErrors.positioning" class="mt-1 text-xs text-red-600">{{ fieldErrors.positioning }}</p>
        <p v-else class="mt-1 text-xs text-gray-500">
          One short sentence saying what makes this brand different. It is appended to the meta
          description of the eleven standard legal pages, which are otherwise generated from the
          same template on every domain and read as duplicate content. Keep it under ~60
          characters so it survives search-result truncation. Changing it here does not rewrite
          existing pages — run <code class="font-mono">php artisan cms:refresh-page-meta</code>.
        </p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Revalidation URL</label>
        <InputText v-model="form.revalidation_url" fluid placeholder="https://…/api/revalidate" />
        <p v-if="fieldErrors.revalidation_url" class="mt-1 text-xs text-red-600">
          {{ fieldErrors.revalidation_url }}
        </p>
      </div>

      <!-- Per-site feature switch. Off by default, and enforced server-side:
           the public /countries endpoints 404 while it is off. -->
      <div class="rounded-lg border border-gray-200 p-3">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700">Countries filter</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Publish the "browse casinos by country" pages on this site.
            </p>
          </div>
          <ToggleSwitch class="shrink-0" v-model="form.countries_enabled" />
        </div>

        <!-- Per site: countries are shared master data, so this is the only
             place one domain can keep a country page out of search without
             changing the others. -->
        <div
          v-if="site?.noindex_country_ids !== undefined"
          class="mt-3 border-t border-gray-100 pt-3 pl-4"
          :class="form.countries_enabled ? '' : 'opacity-50'"
        >
          <label class="block text-sm font-medium text-gray-700">Countries hidden from search</label>
          <p class="mt-0.5 mb-2 text-xs text-gray-500">
            Their pages stay on the site and in the country list, but are marked
            <code>noindex</code> and left out of the sitemap &mdash; for example countries where
            online gambling is prohibited. Pages with fewer than 3 casinos are hidden from
            search automatically on sites that apply that rule.
          </p>
          <MultiSelect
            v-model="form.noindex_country_ids"
            :options="countryOptions"
            option-label="label"
            option-value="value"
            display="chip"
            filter
            placeholder="None"
            class="w-full"
            :loading="countriesStore.loading"
            :disabled="!form.countries_enabled"
          />
          <p v-if="fieldErrors.noindex_country_ids" class="mt-1 text-xs text-red-600">
            {{ fieldErrors.noindex_country_ids }}
          </p>
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700">Visitor reviews</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Show reviews on this site and accept new ones. How they are moderated is set below.
            </p>
          </div>
          <ToggleSwitch class="shrink-0" v-model="form.reviews_enabled" />
        </div>

        <!-- Only meaningful while "Visitor reviews" is on, so it is nested under
             it and disabled rather than hidden — a control that vanishes reads
             as a bug, one that greys out explains itself. -->
        <div
          class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 pl-4"
          :class="form.reviews_enabled ? '' : 'opacity-50'"
        >
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700">Publish reviews immediately</label>
            <p class="mt-0.5 text-xs text-gray-500">
              On, a visitor's review goes live the moment they write it and you hide anything
              unacceptable from Content &rarr; Reviews. Off, every review waits in the pending
              queue until you approve it. Turning this on does not publish reviews already
              waiting &mdash; approve those yourself.
            </p>
          </div>
          <ToggleSwitch class="shrink-0" v-model="form.review_auto_publish" :disabled="!form.reviews_enabled" />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700">Operator profile</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Show each casino's licence, payment, support and safer-play facts on its review
              page. Only the groups that have values are rendered.
            </p>
          </div>
          <ToggleSwitch class="shrink-0" v-model="form.operator_profile_enabled" />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700">Reviewer byline</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Name the person who checks the casinos. Only appears on a casino that also has a
              review date set — a byline without one would claim more than the record supports.
            </p>
          </div>
          <ToggleSwitch class="shrink-0" v-model="form.byline_enabled" />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700">Bonus area</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Publish the Bonus menu and its home-page sections. The sub-items come from
              Bonus Categories; a category with no visible offer on this site is skipped, so
              the menu never points at an empty section.
            </p>
          </div>
          <ToggleSwitch class="shrink-0" v-model="form.bonus_enabled" />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700">Hide pages without own content</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Casino and offer pages on this site without their own description are hidden from search and the sitemap.
            </p>
          </div>
          <ToggleSwitch class="shrink-0" v-model="form.noindex_without_override" />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700">Community forum</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Open the discussion board at /forum. Not the same as Reviews, which is the
              /reviews feed that used to live at that path. Switching this on also turns off
              this site's /forum &rarr; /reviews redirect, which would otherwise shadow the
              board, and turns member accounts on because the board needs them.
            </p>
          </div>
          <ToggleSwitch class="shrink-0" v-model="form.forum_enabled" />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700">Member accounts</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Publish /login and /register and show the account control in the header.
              Independent of the board, so a site can collect members before discussions
              open. Leaving this off while the forum is on changes nothing — the board
              needs accounts, so it keeps them.
            </p>
          </div>
          <ToggleSwitch class="shrink-0" v-model="form.accounts_enabled" :disabled="form.forum_enabled" />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700">News section</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Publish a /news feed. Unlike guides there is no minimum — one post is a new feed,
              not an abandoned one — so it goes live as soon as something is published.
            </p>
          </div>
          <ToggleSwitch class="shrink-0" v-model="form.news_enabled" />
        </div>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div class="min-w-0">
            <label class="block text-sm font-medium text-gray-700">Editorial guides</label>
            <p class="mt-0.5 text-xs text-gray-500">
              Publish a /guides section. It stays hidden until three guides are published, and
              needs 1–2 new ones a week to stay credible.
            </p>
          </div>
          <ToggleSwitch class="shrink-0" v-model="form.guides_enabled" />
        </div>

        <div class="mt-3 space-y-3 border-t border-gray-100 pt-3">
          <p class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Only fill this in for a real person who genuinely does the checking, and only link a
            methodology page that describes what actually happens. A published process nobody
            follows is the same failure as a self-issued trust badge.
          </p>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Reviewer name</label>
              <InputText v-model="form.author_name" fluid placeholder="Required for the byline" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600">Role</label>
              <InputText v-model="form.author_role" fluid placeholder="e.g. Editor" />
            </div>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Short bio</label>
            <Textarea v-model="form.author_bio" rows="2" fluid />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Methodology page slug</label>
            <InputText v-model="form.methodology_page_slug" fluid placeholder="e.g. how-we-review" />
            <p class="mt-1 text-xs text-gray-400">
              One of this site's CMS pages. Leave empty and the byline links to nothing.
            </p>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 p-4">
        <h3 class="text-sm font-semibold text-gray-800">Legal identity</h3>
        <p class="mt-0.5 text-xs text-gray-500">
          Shown in the legal pages, the footer and the Organization schema. An empty field is
          hidden on the public site — nothing is ever printed in its place. Enter only real,
          verified details.
        </p>
        <p v-if="legalMissing.length" class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <i class="pi pi-exclamation-triangle mr-1" />
          Not set yet: {{ legalMissing.join(', ') }}. The lines that need them are hidden on the site
          until you fill them in.
        </p>
        <div class="mt-3 grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <label class="mb-1 block text-xs font-medium text-gray-600">Legal entity name</label>
            <InputText v-model="form.legal_entity_name" fluid placeholder="e.g. Example Media Ltd" :invalid="!!fieldErrors.legal_entity_name" />
            <small v-if="fieldErrors.legal_entity_name" class="text-red-500">{{ fieldErrors.legal_entity_name }}</small>
          </div>
          <div class="col-span-2">
            <label class="mb-1 block text-xs font-medium text-gray-600">Registered address</label>
            <Textarea v-model="form.registered_address" rows="2" fluid :invalid="!!fieldErrors.registered_address" />
            <small v-if="fieldErrors.registered_address" class="text-red-500">{{ fieldErrors.registered_address }}</small>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Company number (optional)</label>
            <InputText v-model="form.company_number" fluid :invalid="!!fieldErrors.company_number" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Governing law</label>
            <InputText v-model="form.governing_law" fluid placeholder="Used in Terms" :invalid="!!fieldErrors.governing_law" />
          </div>
          <div class="col-span-2">
            <label class="mb-1 block text-xs font-medium text-gray-600">Contact email</label>
            <InputText v-model="form.contact_email" type="email" fluid :invalid="!!fieldErrors.contact_email" />
            <small v-if="fieldErrors.contact_email" class="text-red-500">{{ fieldErrors.contact_email }}</small>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Support email</label>
            <InputText v-model="form.support_email" type="email" fluid placeholder="Defaults to contact email" :invalid="!!fieldErrors.support_email" />
            <small v-if="fieldErrors.support_email" class="text-red-500">{{ fieldErrors.support_email }}</small>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Privacy email</label>
            <InputText v-model="form.privacy_email" type="email" fluid placeholder="Defaults to contact email" :invalid="!!fieldErrors.privacy_email" />
            <small v-if="fieldErrors.privacy_email" class="text-red-500">{{ fieldErrors.privacy_email }}</small>
          </div>
          <div class="col-span-2">
            <label class="mb-1 block text-xs font-medium text-gray-600">Analytics provider (optional)</label>
            <InputText v-model="form.analytics_provider" fluid placeholder="e.g. Google Analytics — leave empty if the site runs none" :invalid="!!fieldErrors.analytics_provider" />
            <small v-if="fieldErrors.analytics_provider" class="text-red-500">{{ fieldErrors.analytics_provider }}</small>
            <small v-else class="text-gray-500">Named in the Privacy and Cookie policies. Empty: they say nothing about analytics.</small>
          </div>
        </div>
      </div>
    </form>

    <template #footer>
      <Button label="Cancel" text @click="emit('update:visible', false)" />
      <Button label="Save Changes" :loading="loading" @click="submit" />
    </template>
  </Dialog>
</template>
