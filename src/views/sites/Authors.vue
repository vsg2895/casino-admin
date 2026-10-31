<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import axios from 'axios'
import ImageDropzone from '@/components/ImageDropzone.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import * as api from '@/api/authors'
import * as sitesApi from '@/api/sites'
import type { Author, AuthorProfileLink, UpsertAuthorPayload } from '@shared/types/author'
import type { Site } from '@shared/types/site'
import type { ErrorResponse } from '@shared/types/api'

/**
 * The real people behind ONE site's reviews and articles.
 *
 * An author is hidden until "Visible" is switched on: their page, their byline
 * and their sitemap entry all wait for it, so a profile can be prepared without
 * anything going public.
 */

const route = useRoute()
const router = useRouter()
const toast = useToast()
const siteId = Number(route.params.id)

const site = ref<Site | null>(null)
const items = ref<Author[]>([])
const loading = ref(false)

interface AuthorForm {
  name: string
  slug: string
  photo_path: string | null
  role: string
  short_bio: string
  long_bio: string | null
  expertise: string
  profile_links: AuthorProfileLink[]
  visible: boolean
}

const blank = (): AuthorForm => ({
  name: '', slug: '', photo_path: null, role: '', short_bio: '', long_bio: null,
  expertise: '', profile_links: [], visible: false,
})

const showDialog = ref(false)
const editing = ref<Author | null>(null)
const form = ref<AuthorForm>(blank())
const errors = ref<Record<string, string>>({})
const saving = ref(false)
const deleting = ref<Author | null>(null)

async function reload(): Promise<void> {
  loading.value = true
  try {
    items.value = await api.listAuthors(siteId)
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load authors.', life: 4000 })
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  editing.value = null
  form.value = blank()
  errors.value = {}
  showDialog.value = true
}

function openEdit(row: Author): void {
  editing.value = row
  form.value = {
    name: row.name,
    slug: row.slug,
    photo_path: row.photo_path,
    role: row.role ?? '',
    short_bio: row.short_bio ?? '',
    long_bio: row.long_bio,
    expertise: row.expertise.join(', '),
    profile_links: row.profile_links.map((l) => ({ ...l })),
    visible: row.visible,
  }
  errors.value = {}
  showDialog.value = true
}

function payload(): UpsertAuthorPayload {
  const f = form.value
  return {
    name: f.name.trim(),
    slug: f.slug.trim() || null,
    photo_path: f.photo_path,
    role: f.role.trim() || null,
    short_bio: f.short_bio.trim() || null,
    long_bio: f.long_bio && f.long_bio.replace(/<[^>]*>/g, '').trim() ? f.long_bio : null,
    expertise: f.expertise.split(',').map((t) => t.trim()).filter((t) => t !== ''),
    profile_links: f.profile_links.filter((l) => l.label.trim() !== '' || l.url.trim() !== ''),
    visible: f.visible,
  }
}

async function save(): Promise<void> {
  errors.value = {}
  saving.value = true
  try {
    if (editing.value === null) await api.createAuthor(siteId, payload())
    else await api.updateAuthor(siteId, editing.value.id, payload())
    showDialog.value = false
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Author saved.', life: 3000 })
    await reload()
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const data = e.response.data as ErrorResponse
      for (const [field, messages] of Object.entries(data.errors ?? {})) {
        errors.value[field] = messages[0] ?? ''
      }
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save the author.', life: 4000 })
    }
  } finally {
    saving.value = false
  }
}

async function confirmDelete(): Promise<void> {
  const row = deleting.value
  if (!row) return
  try {
    await api.deleteAuthor(siteId, row.id)
    deleting.value = null
    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not delete the author.', life: 4000 })
  }
}

/** First error among a field and its nested keys (profile_links.0.url …). */
function errorFor(prefix: string): string | undefined {
  return Object.entries(errors.value).find(([k]) => k === prefix || k.startsWith(prefix + '.'))?.[1]
}

onMounted(async () => {
  site.value = await sitesApi.getSite(siteId).then((r) => r.data).catch(() => null)
  await reload()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <Button label="Sites" icon="pi pi-arrow-left" text severity="secondary" @click="router.push({ name: 'sites' })" />
      <h2 class="text-lg font-semibold text-gray-900">
        Authors<span v-if="site" class="text-gray-400"> — {{ site.name }}</span>
      </h2>
      <Button label="New author" icon="pi pi-plus" @click="openCreate" />
    </div>

    <Message severity="warn" :closable="false" class="text-sm">
      Add only real people who actually write or check this site's content, with details they have
      approved. Never invent a person, a credential or years of experience. An author appears on the
      site (byline, <code>/authors/…</code> page, sitemap) only while <strong>Visible</strong> is on.
    </Message>

    <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <DataTable :value="items" :loading="loading" striped-rows data-key="id" :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No authors yet.</div>
        </template>
        <Column header="Name">
          <template #body="{ data }">
            <span class="font-medium text-gray-900">{{ data.name }}</span>
            <span v-if="data.role" class="text-gray-500"> · {{ data.role }}</span>
            <p class="font-mono text-xs text-gray-400">/authors/{{ data.slug }}</p>
          </template>
        </Column>
        <Column header="Expertise">
          <template #body="{ data }">
            <div class="flex flex-wrap gap-1">
              <Tag v-for="t in data.expertise" :key="t" :value="t" severity="secondary" />
            </div>
          </template>
        </Column>
        <Column header="Visible" :style="{ width: '100px' }">
          <template #body="{ data }">
            <Tag :value="data.visible ? 'Visible' : 'Hidden'" :severity="data.visible ? 'success' : 'warn'" />
          </template>
        </Column>
        <Column header="Actions" :style="{ width: '110px' }">
          <template #body="{ data }">
            <Button icon="pi pi-pencil" text severity="secondary" size="small" @click="openEdit(data)" />
            <Button icon="pi pi-trash" text severity="danger" size="small" @click="deleting = data" />
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog v-model:visible="showDialog" modal :header="editing ? 'Edit author' : 'New author'" :style="{ width: '720px' }">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Name</label>
            <InputText v-model="form.name" fluid :invalid="!!errors.name" />
            <small v-if="errors.name" class="text-red-500">{{ errors.name }}</small>
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-gray-600">Role</label>
            <InputText v-model="form.role" fluid placeholder="e.g. Casino reviewer" />
          </div>
          <div class="col-span-2">
            <label class="mb-1 block text-xs font-medium text-gray-600">Slug</label>
            <InputText v-model="form.slug" fluid placeholder="Generated from the name" :disabled="!!editing?.visible" :invalid="!!errors.slug" />
            <small v-if="errors.slug" class="text-red-500">{{ errors.slug }}</small>
            <p v-else-if="editing?.visible" class="mt-1 text-xs text-gray-400">Frozen while the profile is public — it is the page's URL.</p>
          </div>
        </div>

        <ImageDropzone v-model="form.photo_path" label="Photo" type="image" />

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Short bio</label>
          <Textarea v-model="form.short_bio" rows="2" fluid maxlength="300" :invalid="!!errors.short_bio" />
          <p class="mt-1 text-xs text-gray-400">One or two sentences, shown on the author page header.</p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Long bio</label>
          <RichTextEditor v-model="form.long_bio" />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Expertise</label>
          <InputText v-model="form.expertise" fluid placeholder="Comma-separated, e.g. Payments, Bonus terms" :invalid="!!errorFor('expertise')" />
          <small v-if="errorFor('expertise')" class="text-red-500">{{ errorFor('expertise') }}</small>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">Profile links</label>
          <div v-for="(link, i) in form.profile_links" :key="i" class="mb-2 flex gap-2">
            <InputText v-model="link.label" placeholder="LinkedIn" class="w-40" />
            <InputText v-model="link.url" placeholder="https://…" class="flex-1" />
            <Button icon="pi pi-times" text severity="secondary" @click="form.profile_links.splice(i, 1)" />
          </div>
          <Button label="Add link" icon="pi pi-plus" text size="small" @click="form.profile_links.push({ label: '', url: '' })" />
          <small v-if="errorFor('profile_links')" class="block text-red-500">{{ errorFor('profile_links') }}</small>
        </div>

        <div class="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-3">
          <div>
            <label class="text-sm text-gray-700">Visible on the site</label>
            <p class="mt-0.5 text-xs text-gray-500">Off keeps the profile, its page and its bylines private.</p>
          </div>
          <ToggleSwitch v-model="form.visible" />
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" text @click="showDialog = false" />
        <Button :label="editing ? 'Save' : 'Create author'" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>

    <Dialog :visible="deleting !== null" modal header="Delete author" :style="{ width: '440px' }" @update:visible="deleting = null">
      <p class="text-sm text-gray-700">Delete <strong>{{ deleting?.name }}</strong>?</p>
      <p class="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
        Their bylines are removed from every casino, article and page. The content itself stays published.
      </p>
      <template #footer>
        <Button label="Cancel" text @click="deleting = null" />
        <Button label="Delete" severity="danger" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>
