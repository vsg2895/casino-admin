<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import * as forumApi from '@/api/siteForum'
import * as sitesApi from '@/api/sites'
import type { SiteForum, UpdateSiteForumPayload } from '@shared/types/forum'
import type { Site } from '@shared/types/site'
import type { ErrorResponse } from '@shared/types/api'

/**
 * The rules for one site's player-forum page.
 *
 * Every field here is nullable in the database and falls back to the shipped
 * wording, which is why each input carries its default as a placeholder: an
 * empty box is a valid, meaningful state, and the placeholder is what tells the
 * editor what visitors will see if they leave it that way.
 *
 * The forum needs BOTH switches — the site must collect reviews at all
 * (`reviews_enabled`, on the site's own edit screen) and publish the combined
 * page (`enabled`, here). The banner below says so when the first one is off,
 * because otherwise turning this on appears to do nothing.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()

const siteId = Number(route.params.id)
const site = ref<Site | null>(null)
const forum = ref<SiteForum | null>(null)
const loading = ref(false)
const saving = ref(false)
const fieldErrors = ref<Record<string, string>>({})

const form = ref<UpdateSiteForumPayload>({})

// Defaults shown as placeholders. Duplicated from SiteForum.php on purpose:
// they are UI hints, and importing them would mean an API call before the form
// can render.
const PLACEHOLDERS = {
  title: 'Player Forum',
  eyebrow: 'Straight From The Players',
  intro:
    'Every review below was written by a visitor and checked before it went live. Nothing is edited, and nothing is removed for being unflattering.',
  meta_title: 'Player Forum — Casino Reviews From Real Players',
  meta_description:
    'Player-written reviews of every casino listed here, grouped by operator. Payouts, verification and support, in the words of the people who played there.',
  empty_title: 'No reviews have been published yet',
  empty_body:
    'The forum fills up as players write about the casinos listed here. Open any casino and use the review form at the bottom of its page — every submission is read before it appears.',
  empty_cta_label: 'Browse casinos',
  empty_cta_url: '/casinos',
}

/** Reviews must be on for the forum to exist at all — see the controller. */
const reviewsOff = computed(() => site.value !== null && !site.value.reviews_enabled)

const publicUrl = computed(() =>
  site.value ? `https://${site.value.domain}/forum` : '',
)

async function reload(): Promise<void> {
  loading.value = true
  try {
    const [forumRes, siteRes] = await Promise.all([
      forumApi.getSiteForum(siteId),
      sitesApi.getSite(siteId),
    ])
    forum.value = forumRes
    site.value = siteRes.data
    form.value = {
      enabled: forumRes.enabled,
      title: forumRes.title,
      eyebrow: forumRes.eyebrow,
      show_eyebrow: forumRes.show_eyebrow,
      intro: forumRes.intro,
      meta_title: forumRes.meta_title,
      meta_description: forumRes.meta_description,
      noindex: forumRes.noindex,
      empty_title: forumRes.empty_title,
      empty_body: forumRes.empty_body,
      empty_cta_label: forumRes.empty_cta_label,
      empty_cta_url: forumRes.empty_cta_url,
      show_stats: forumRes.show_stats,
      threads_per_page: forumRes.threads_per_page,
      preview_reviews: forumRes.preview_reviews,
    }
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load the forum settings.', life: 4000 })
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  saving.value = true
  fieldErrors.value = {}
  try {
    forum.value = await forumApi.updateSiteForum(siteId, form.value)
    toast.add({
      severity: 'success',
      summary: 'Saved',
      // Names what happens next, because the whole point of this screen is that
      // a save reaches the public site.
      detail: 'The forum page was updated and the site has been asked to rebuild it.',
      life: 3500,
    })
  } catch (e: unknown) {
    const data = axios.isAxiosError(e) ? (e.response?.data as ErrorResponse | undefined) : undefined
    if (data?.errors) {
      fieldErrors.value = Object.fromEntries(
        Object.entries(data.errors).map(([k, v]) => [k, v[0] ?? '']),
      )
      toast.add({ severity: 'warn', summary: 'Check the form', detail: 'Some fields need attention.', life: 4000 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save the forum settings.', life: 4000 })
    }
  } finally {
    saving.value = false
  }
}

onMounted(reload)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <Button label="Back to sites" icon="pi pi-arrow-left" text severity="secondary" @click="router.push({ name: 'sites' })" />
      <h2 class="text-lg font-semibold text-gray-900">
        Forum page<span v-if="site" class="text-gray-400"> — {{ site.name }}</span>
      </h2>
      <Button label="Save" icon="pi pi-check" :loading="saving" :disabled="loading" @click="save" />
    </div>

    <!-- The dependency an editor cannot see from here. Without this, switching
         the forum on while reviews are off looks like a broken save. -->
    <Message v-if="reviewsOff" severity="warn" :closable="false">
      This site has <strong>visitor reviews switched off</strong>, so the forum page will not
      appear no matter what is set here. Turn on “Reviews” on the site’s edit screen first.
    </Message>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <!-- ── Publication ─────────────────────────────────────────────── -->
      <section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500">Publication</h3>

        <label class="flex items-start justify-between gap-4">
          <span>
            <span class="block text-sm font-medium text-gray-900">Publish the forum page</span>
            <span class="block text-xs text-gray-500">
              Off, <code>/forum</code> returns 404 and the link disappears from the menu.
            </span>
          </span>
          <ToggleSwitch v-model="form.enabled" />
        </label>

        <label class="flex items-start justify-between gap-4">
          <span>
            <span class="block text-sm font-medium text-gray-900">Hide from search engines</span>
            <span class="block text-xs text-gray-500">
              Keeps the page for visitors but adds <code>noindex</code>. Useful while it is still thin.
            </span>
          </span>
          <ToggleSwitch v-model="form.noindex" />
        </label>

        <label class="flex items-start justify-between gap-4">
          <span>
            <span class="block text-sm font-medium text-gray-900">Show the totals</span>
            <span class="block text-xs text-gray-500">
              The “N reviews across M casinos” row under the intro.
            </span>
          </span>
          <ToggleSwitch v-model="form.show_stats" />
        </label>

        <div class="grid grid-cols-2 gap-4 pt-2">
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-900">Casinos per page</label>
            <InputNumber v-model="form.threads_per_page" :min="1" :max="30" show-buttons class="w-full" />
            <p class="mt-1 text-xs text-gray-500">The page paginates casinos, not reviews.</p>
            <small v-if="fieldErrors.threads_per_page" class="text-red-600">{{ fieldErrors.threads_per_page }}</small>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-900">Reviews shown per casino</label>
            <InputNumber v-model="form.preview_reviews" :min="1" :max="10" show-buttons class="w-full" />
            <p class="mt-1 text-xs text-gray-500">The rest sit behind “Read all N reviews”.</p>
            <small v-if="fieldErrors.preview_reviews" class="text-red-600">{{ fieldErrors.preview_reviews }}</small>
          </div>
        </div>

        <p v-if="site" class="border-t border-gray-100 pt-3 text-xs text-gray-500">
          Public URL: <span class="font-mono">{{ publicUrl }}</span>
        </p>
      </section>

      <!-- ── Page content ────────────────────────────────────────────── -->
      <section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500">Page content</h3>
        <p class="-mt-2 text-xs text-gray-500">
          Leave a box empty to use the wording shown in grey.
        </p>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-900">Heading</label>
          <InputText v-model="form.title" :placeholder="PLACEHOLDERS.title" class="w-full" />
          <small v-if="fieldErrors.title" class="text-red-600">{{ fieldErrors.title }}</small>
        </div>

        <div>
          <div class="mb-1 flex items-center justify-between gap-3">
            <label class="block text-sm font-medium text-gray-900">Eyebrow</label>
            <!-- Its own switch rather than "clear the box": an empty field
                 arrives as null and means "use the default", so hiding the
                 label has to be said explicitly. -->
            <span class="flex items-center gap-2 text-xs text-gray-500">
              Show
              <ToggleSwitch v-model="form.show_eyebrow" />
            </span>
          </div>
          <InputText
            v-model="form.eyebrow"
            :placeholder="PLACEHOLDERS.eyebrow"
            :disabled="form.show_eyebrow === false"
            class="w-full"
          />
          <p class="mt-1 text-xs text-gray-500">The small label above the heading.</p>
          <small v-if="fieldErrors.eyebrow" class="text-red-600">{{ fieldErrors.eyebrow }}</small>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-900">Intro</label>
          <Textarea v-model="form.intro" :placeholder="PLACEHOLDERS.intro" rows="3" auto-resize class="w-full" />
          <small v-if="fieldErrors.intro" class="text-red-600">{{ fieldErrors.intro }}</small>
        </div>
      </section>

      <!-- ── Empty state ─────────────────────────────────────────────── -->
      <section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500">When there are no reviews</h3>
        <p class="-mt-2 text-xs text-gray-500">
          What the page shows before anyone has written one. It is the only route to the
          first review, so it should point somewhere.
        </p>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-900">Heading</label>
          <InputText v-model="form.empty_title" :placeholder="PLACEHOLDERS.empty_title" class="w-full" />
          <small v-if="fieldErrors.empty_title" class="text-red-600">{{ fieldErrors.empty_title }}</small>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-900">Body</label>
          <Textarea v-model="form.empty_body" :placeholder="PLACEHOLDERS.empty_body" rows="3" auto-resize class="w-full" />
          <small v-if="fieldErrors.empty_body" class="text-red-600">{{ fieldErrors.empty_body }}</small>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-900">Button label</label>
            <InputText v-model="form.empty_cta_label" :placeholder="PLACEHOLDERS.empty_cta_label" class="w-full" />
            <small v-if="fieldErrors.empty_cta_label" class="text-red-600">{{ fieldErrors.empty_cta_label }}</small>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-900">Button link</label>
            <InputText v-model="form.empty_cta_url" :placeholder="PLACEHOLDERS.empty_cta_url" class="w-full" />
            <p class="mt-1 text-xs text-gray-500">A path on this site, starting with “/”.</p>
            <small v-if="fieldErrors.empty_cta_url" class="text-red-600">{{ fieldErrors.empty_cta_url }}</small>
          </div>
        </div>
      </section>

      <!-- ── SEO ─────────────────────────────────────────────────────── -->
      <section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500">Search results</h3>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-900">Meta title</label>
          <InputText v-model="form.meta_title" :placeholder="PLACEHOLDERS.meta_title" class="w-full" />
          <p class="mt-1 text-xs text-gray-500">The site name is appended automatically.</p>
          <small v-if="fieldErrors.meta_title" class="text-red-600">{{ fieldErrors.meta_title }}</small>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-900">Meta description</label>
          <Textarea v-model="form.meta_description" :placeholder="PLACEHOLDERS.meta_description" rows="3" auto-resize class="w-full" />
          <small v-if="fieldErrors.meta_description" class="text-red-600">{{ fieldErrors.meta_description }}</small>
        </div>

        <!-- What visitors actually get, defaults resolved. Without this an
             editor cannot tell an empty box from an empty page. -->
        <div v-if="forum" class="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          <p class="mb-1 font-semibold text-gray-700">Live on the site right now</p>
          <p><span class="text-gray-400">Heading:</span> {{ forum.resolved.title }}</p>
          <p><span class="text-gray-400">Title tag:</span> {{ forum.resolved.meta_title }}</p>
          <p>
            <span class="text-gray-400">Indexed:</span>
            {{ forum.resolved.noindex ? 'no — hidden from search engines' : 'yes' }}
          </p>
        </div>
      </section>
    </div>

    <p class="text-xs text-gray-500">
      The menu link itself lives in
      <button type="button" class="font-medium text-indigo-600 hover:underline" @click="router.push({ name: 'site-navigation', params: { id: siteId } })">
        Navigation
      </button>
      — rename, reorder or remove it there.
    </p>
  </div>
</template>
