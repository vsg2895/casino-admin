<script setup lang="ts">
/**
 * Member Posts — everything the sites' registered members have written.
 *
 * DISTINCT from Forum → Moderation, which is a triage queue: that screen
 * defaults to pending and exists to be emptied. This one defaults to every
 * status and exists to be searched — "what did this member post, and what
 * happened to it".
 *
 * Staff replies are not here at all. A member post carries `forum_user_id`, a
 * staff one carries `user_id`; the API filters on that, so this screen never
 * has to know the difference.
 *
 * Publishing uses the SAME `moderate()` call the queue uses. A post is
 * published by one operation no matter which screen triggered it — a second
 * code path would be a second set of counters to get wrong.
 */
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/forum'
import { useSitesStore } from '@/stores/sitesStore'
import type { ForumMemberPost, ForumPostStatus, ForumModerationAction } from '@shared/types/community-forum'

const toast = useToast()
const sitesStore = useSitesStore()

const items = ref<ForumMemberPost[]>([])
const loading = ref(false)
const page = ref(1)
const perPage = ref(25)
const meta = ref<{ total: number; last_page: number; by_status: Record<string, number> } | null>(null)
const totalRecords = computed(() => meta.value?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)

const fStatus = ref<ForumPostStatus | null>(null)
const fSite = ref<number | null>(null)
const fSearch = ref('')

const statusOptions = [
  { label: 'Any status', value: null },
  { label: 'Awaiting review', value: 'pending' },
  { label: 'Published', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Spam', value: 'spam' },
]

const SEVERITY: Record<string, string> = {
  pending: 'warn',
  approved: 'success',
  rejected: 'danger',
  spam: 'secondary',
}

const LABEL: Record<string, string> = {
  pending: 'Awaiting review',
  approved: 'Published',
  rejected: 'Rejected',
  spam: 'Spam',
}

const byStatus = computed(() => meta.value?.by_status ?? {})

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await api.listForumMemberPosts({
      page: page.value,
      per_page: perPage.value,
      status: fStatus.value,
      site_id: fSite.value,
      search: fSearch.value || null,
    })
    items.value = res.data
    meta.value = {
      total: res.meta.total,
      last_page: res.meta.last_page,
      by_status: res.meta.by_status ?? {},
    }
  } catch {
    toast.add({ severity: 'error', summary: 'Could not load member posts', life: 4000 })
  } finally {
    loading.value = false
  }
}

function apply(): void {
  page.value = 1
  void load()
}

function onPage(e: { page: number; rows: number }): void {
  page.value = e.page + 1
  perPage.value = e.rows
  void load()
}

async function act(id: number, action: ForumModerationAction): Promise<void> {
  try {
    await api.moderate([id], action)
    toast.add({ severity: 'success', summary: `Post ${action}d`, life: 2500 })
    await load()
  } catch {
    toast.add({ severity: 'error', summary: `Could not ${action} that post`, life: 4000 })
  }
}

function siteName(id: number): string {
  return sitesStore.sites.find((s) => s.id === id)?.name ?? `Site ${id}`
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

onMounted(async () => {
  await sitesStore.fetchSites().catch(() => undefined)
  await load()
})
</script>

<template>
  <div>
    <div class="mb-4">
      <h1 class="text-2xl font-semibold text-gray-900">Member Posts</h1>
      <p class="mt-1 text-sm text-gray-500">
        Posts written by registered members. Staff replies live under Discussions.
        <span v-if="byStatus.pending" class="font-medium text-amber-700">
          · {{ byStatus.pending }} awaiting review
        </span>
      </p>
    </div>

    <div class="filters mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div class="filter-field">
        <label class="mb-1 block text-xs font-medium text-gray-700">Status</label>
        <Select v-model="fStatus" :options="statusOptions" option-label="label" option-value="value" class="w-48" />
      </div>
      <div class="filter-field">
        <label class="mb-1 block text-xs font-medium text-gray-700">Site</label>
        <Select
          v-model="fSite"
          :options="[{ name: 'All sites', id: null }, ...sitesStore.sites]"
          option-label="name"
          option-value="id"
          class="w-56"
        />
      </div>
      <div class="filter-field">
        <label class="mb-1 block text-xs font-medium text-gray-700">Search body</label>
        <InputText v-model="fSearch" class="w-64" placeholder="text in the post…" @keyup.enter="apply" />
      </div>
      <Button label="Apply" icon="pi pi-filter" class="self-end" @click="apply" />
    </div>

    <DataTable
      :value="items" :loading="loading" data-key="id"
      lazy paginator :rows="perPage" :first="first" :total-records="totalRecords"
      :rows-per-page-options="[25, 50, 100]" @page="onPage"
    >
      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-comments mb-3 text-3xl text-gray-400" />
          <p class="font-medium text-gray-700">No member posts.</p>
          <p class="text-sm text-gray-500">Nothing matches these filters yet.</p>
        </div>
      </template>

      <Column header="Post">
        <template #body="{ data }: { data: ForumMemberPost }">
          <p class="max-w-xl whitespace-pre-line text-sm text-gray-800">{{ data.body }}</p>
          <p class="mt-1 text-xs text-gray-500">
            <span v-if="data.article">
              in <span class="font-medium text-gray-700">{{ data.article.title }}</span>
              <span v-if="data.article.board"> · {{ data.article.board }}</span>
            </span>
            <span v-else class="italic">discussion removed</span>
            · {{ siteName(data.site_id) }}
          </p>
          <p class="mt-0.5 text-xs text-gray-400">
            Posted {{ when(data.created_at) }}
            <span v-if="data.edited_at"> · edited {{ when(data.edited_at) }}</span>
            <span v-if="data.approved_at"> · published {{ when(data.approved_at) }}</span>
          </p>
        </template>
      </Column>

      <Column header="Member" style="width:14rem">
        <template #body="{ data }: { data: ForumMemberPost }">
          <template v-if="data.author">
            <p class="text-sm font-medium text-gray-800">{{ data.author.display_name }}</p>
            <p class="text-xs text-gray-500">{{ data.author.email }}</p>
            <p class="mt-0.5 text-xs tabular-nums text-gray-400">
              {{ data.author.approved_posts_count }} accepted · joined {{ when(data.author.registered_at) }}
            </p>
          </template>
          <span v-else class="text-xs italic text-gray-400">deleted member</span>
        </template>
      </Column>

      <Column header="Status" style="width:10rem">
        <template #body="{ data }: { data: ForumMemberPost }">
          <Tag :severity="SEVERITY[data.status] ?? 'secondary'" :value="LABEL[data.status] ?? data.status" />
          <p v-if="data.open_reports_count" class="mt-1 text-xs font-medium text-red-600">
            {{ data.open_reports_count }} report(s)
          </p>
        </template>
      </Column>

      <Column header="Actions" style="width:13rem">
        <template #body="{ data }: { data: ForumMemberPost }">
          <div class="flex flex-wrap gap-1">
            <Button
              v-if="data.status !== 'approved'"
              size="small" severity="success" label="Publish" icon="pi pi-check"
              @click="act(data.id, 'approve')"
            />
            <Button
              v-if="data.status !== 'rejected'"
              size="small" severity="warn" outlined label="Reject" icon="pi pi-times"
              @click="act(data.id, 'reject')"
            />
            <Button
              v-if="data.status !== 'spam'"
              size="small" severity="danger" text label="Spam" icon="pi pi-ban"
              @click="act(data.id, 'spam')"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
/* Same one-height filter bar as the other forum screens. */
.filter-field {
  display: flex;
  flex-direction: column;
}

.filter-field > label {
  flex: 0 0 auto;
  line-height: 1rem;
}

.filter-field > :deep(.p-select),
.filter-field > :deep(.p-inputtext) {
  flex: 1 1 auto;
}

.filter-field :deep(.p-select) {
  align-items: center;
}
</style>
