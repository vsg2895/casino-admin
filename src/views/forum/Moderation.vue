<script setup lang="ts">
/**
 * Forum moderation queue.
 *
 * The screen a moderator lives in, so it is built around one question: can this
 * post be judged WITHOUT opening anything else? Everything needed is on the row —
 * the full body, the author's age and accepted-post count, the thread, the IP,
 * the report count. Nothing is truncated behind a "view" button, because the
 * click to expand is the cost, not the reading.
 *
 * KEYBOARD FIRST. j/k move, a/r/s/d act on the focused row, x toggles selection,
 * Enter acts on the whole selection. A moderator clearing a spam flood should
 * never need the mouse.
 *
 * Filters follow the Apply-driven pattern used by Reviews and Warmup: typing
 * changes a draft and nothing refetches until Apply, so a half-typed search
 * never fires a query.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/forum'
import { useSitesStore } from '@/stores/sitesStore'
import type {
  ForumModerationAction,
  ForumModerationCounts,
  ForumModerationPost,
  ForumPostStatus,
} from '@shared/types/community-forum'

const toast = useToast()
const sitesStore = useSitesStore()

const items = ref<ForumModerationPost[]>([])
const selected = ref<ForumModerationPost[]>([])
const loading = ref(false)
const counts = ref<ForumModerationCounts>({ pending: 0, reported: 0, spam: 0 })

// ── pagination ───────────────────────────────────────────────────────────────
const page = ref(1)
const perPage = ref(25)
const meta = ref<{ total: number; last_page: number } | null>(null)
const totalRecords = computed(() => meta.value?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)

// ── filters ──────────────────────────────────────────────────────────────────
const search = ref('')
const status = ref<ForumPostStatus>('pending')
const siteId = ref<number | null>(null)
const reportedOnly = ref(false)

const statusOptions = [
  { label: 'Pending review', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Spam', value: 'spam' },
]

// ── keyboard ─────────────────────────────────────────────────────────────────
const cursor = ref(0)

const banDialog = ref(false)
const banTarget = ref<ForumModerationPost | null>(null)
const banStatus = ref<'muted' | 'banned'>('muted')
const banReason = ref('')

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await api.listModerationPosts({
      page: page.value,
      per_page: perPage.value,
      site_id: siteId.value,
      status: status.value,
      reported: reportedOnly.value ? true : null,
      search: search.value.trim() || null,
    })
    items.value = res.data
    meta.value = { total: res.meta.total, last_page: res.meta.last_page }
    // Keep the cursor inside the new page rather than pointing past its end.
    cursor.value = Math.min(cursor.value, Math.max(0, res.data.length - 1))
    counts.value = await api.moderationCounts(siteId.value)
  } catch {
    toast.add({ severity: 'error', summary: 'Could not load the queue', life: 4000 })
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

/**
 * Act, then remove the rows from view.
 *
 * A post that has just been approved does not belong in the pending list, so it
 * is spliced out rather than refetched — the moderator's place in the queue
 * survives, which a full reload would destroy on every single click.
 */
async function act(ids: number[], action: ForumModerationAction): Promise<void> {
  if (ids.length === 0) return

  try {
    const res = await api.moderate(ids, action)
    items.value = items.value.filter((i) => !ids.includes(i.id))
    selected.value = selected.value.filter((i) => !ids.includes(i.id))
    counts.value = await api.moderationCounts(siteId.value)
    if (meta.value) meta.value.total = Math.max(0, meta.value.total - res.affected)
    toast.add({ severity: 'success', summary: `${res.affected} post(s) ${action}d`, life: 2500 })
    // Pull the next page in once the current one empties, so a long backlog
    // clears without the moderator paging manually.
    if (items.value.length === 0 && (meta.value?.total ?? 0) > 0) void load()
  } catch {
    toast.add({ severity: 'error', summary: `Could not ${action} those posts`, life: 4000 })
  }
}

function openBan(row: ForumModerationPost): void {
  if (!row.author) return
  banTarget.value = row
  banStatus.value = 'muted'
  banReason.value = ''
  banDialog.value = true
}

async function confirmBan(): Promise<void> {
  if (!banTarget.value?.author) return
  try {
    await api.setMemberStatus(banTarget.value.author.id, banStatus.value, { reason: banReason.value || null })
    toast.add({ severity: 'success', summary: `Member ${banStatus.value}`, life: 2500 })
    banDialog.value = false
  } catch {
    toast.add({ severity: 'error', summary: 'Could not change that member', life: 4000 })
  }
}

function onKey(e: KeyboardEvent): void {
  // Never hijack typing in a filter box.
  const t = e.target as HTMLElement | null
  if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (items.value.length === 0) return

  const row = items.value[cursor.value]

  switch (e.key) {
    case 'j': cursor.value = Math.min(cursor.value + 1, items.value.length - 1); break
    case 'k': cursor.value = Math.max(cursor.value - 1, 0); break
    case 'x':
      if (!row) return
      selected.value = selected.value.some((s) => s.id === row.id)
        ? selected.value.filter((s) => s.id !== row.id)
        : [...selected.value, row]
      break
    case 'a': if (row) void act([row.id], 'approve'); break
    case 'r': if (row) void act([row.id], 'reject'); break
    case 's': if (row) void act([row.id], 'spam'); break
    case 'd': if (row) void act([row.id], 'delete'); break
    case 'Enter':
      if (selected.value.length > 0) void act(selected.value.map((s) => s.id), 'approve')
      break
    default: return
  }

  e.preventDefault()
}

function ageInDays(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

/** A brand-new account with nothing accepted is the strongest spam signal here. */
function isSuspicious(row: ForumModerationPost): boolean {
  const age = ageInDays(row.author?.registered_at ?? null)
  return row.author !== null && row.author.approved_posts_count === 0 && age !== null && age < 2
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  void load()
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="p-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-gray-900">Forum Moderation</h1>
        <p class="mt-1 text-sm text-gray-500">
          <span class="font-medium text-gray-700">{{ counts.pending }}</span> awaiting review ·
          <span class="font-medium text-gray-700">{{ counts.reported }}</span> reported ·
          <span class="font-medium text-gray-700">{{ counts.spam }}</span> marked spam
        </p>
      </div>
      <p class="text-xs text-gray-400">
        <kbd class="rounded border px-1">j</kbd>/<kbd class="rounded border px-1">k</kbd> move ·
        <kbd class="rounded border px-1">a</kbd> approve ·
        <kbd class="rounded border px-1">r</kbd> reject ·
        <kbd class="rounded border px-1">s</kbd> spam ·
        <kbd class="rounded border px-1">d</kbd> delete ·
        <kbd class="rounded border px-1">x</kbd> select ·
        <kbd class="rounded border px-1">↵</kbd> approve selected
      </p>
    </div>

    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700">Status</label>
        <Select v-model="status" :options="statusOptions" option-label="label" option-value="value" class="w-48" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700">Site</label>
        <Select
          v-model="siteId"
          :options="[{ name: 'All sites', id: null }, ...sitesStore.sites]"
          option-label="name" option-value="id" class="w-48"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700">Search body</label>
        <InputText v-model="search" placeholder="text in the post…" class="w-64" @keyup.enter="apply" />
      </div>
      <div class="flex items-center gap-2 pb-2">
        <input id="reported" v-model="reportedOnly" type="checkbox" class="h-4 w-4" />
        <label for="reported" class="text-sm text-gray-700">Reported only</label>
      </div>
      <Button label="Apply" icon="pi pi-filter" @click="apply" />
    </div>

    <!-- Bulk bar: only present when there is a selection to act on. -->
    <div v-if="selected.length" class="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 p-3">
      <span class="text-sm font-medium text-indigo-900">{{ selected.length }} selected</span>
      <Button size="small" severity="success" label="Approve" icon="pi pi-check"
              @click="act(selected.map(s => s.id), 'approve')" />
      <Button size="small" severity="warn" label="Reject" icon="pi pi-times"
              @click="act(selected.map(s => s.id), 'reject')" />
      <Button size="small" severity="danger" label="Spam" icon="pi pi-ban"
              @click="act(selected.map(s => s.id), 'spam')" />
      <Button size="small" severity="secondary" outlined label="Delete" icon="pi pi-trash"
              @click="act(selected.map(s => s.id), 'delete')" />
    </div>

    <DataTable
      v-model:selection="selected"
      :value="items"
      :loading="loading"
      data-key="id"
      lazy paginator
      :rows="perPage"
      :first="first"
      :total-records="totalRecords"
      :rows-per-page-options="[25, 50, 100]"
      :row-class="(row: ForumModerationPost) => items[cursor]?.id === row.id ? 'bg-indigo-50/60' : ''"
      @page="onPage"
    >
      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-check-circle mb-3 text-3xl text-green-500" />
          <p class="font-medium text-gray-900">Nothing to review.</p>
          <p class="mt-1 text-sm text-gray-500">The queue is empty for these filters.</p>
        </div>
      </template>

      <Column selection-mode="multiple" header-style="width:3rem" />

      <Column header="Post" style="min-width:26rem">
        <template #body="{ data }: { data: ForumModerationPost }">
          <div class="flex items-start gap-2">
            <Tag v-if="data.is_comment" value="reply" severity="secondary" class="mt-0.5 shrink-0" />
            <div class="min-w-0">
              <!-- Whole body, never truncated: the truncation is what costs the
                   moderator a click, not the reading. -->
              <p class="whitespace-pre-wrap break-words text-sm text-gray-900">{{ data.body }}</p>
              <p class="mt-1 text-xs text-gray-400">
                {{ formatDate(data.created_at) }}
                <span v-if="data.article"> · in
                  <span class="font-medium text-gray-600">{{ data.article.title }}</span>
                </span>
                <span v-if="data.open_reports_count > 0" class="ml-1 font-semibold text-red-600">
                  · {{ data.open_reports_count }} report(s)
                </span>
              </p>
            </div>
          </div>
        </template>
      </Column>

      <Column header="Author" style="width:16rem">
        <template #body="{ data }: { data: ForumModerationPost }">
          <div v-if="data.author" class="text-sm">
            <div class="flex items-center gap-1.5">
              <span class="font-medium text-gray-900">{{ data.author.display_name }}</span>
              <Tag v-if="isSuspicious(data)" value="new" severity="danger" />
              <Tag v-if="data.author.status !== 'active'" :value="data.author.status" severity="warn" />
            </div>
            <p class="text-xs text-gray-500">{{ data.author.email }}</p>
            <p class="text-xs text-gray-400">
              {{ data.author.approved_posts_count }} accepted of {{ data.author.posts_count }}
              <span v-if="ageInDays(data.author.registered_at) !== null">
                · joined {{ ageInDays(data.author.registered_at) }}d ago
              </span>
            </p>
            <p v-if="data.ip_address" class="font-mono text-[11px] text-gray-400">{{ data.ip_address }}</p>
            <Button label="Mute / ban" link size="small" class="!px-0 !text-xs" @click="openBan(data)" />
          </div>
          <span v-else class="text-sm text-gray-400">—</span>
        </template>
      </Column>

      <Column header="Actions" style="width:13rem">
        <template #body="{ data }: { data: ForumModerationPost }">
          <div class="flex flex-wrap gap-1">
            <Button v-if="data.status !== 'approved'" size="small" severity="success" text
                    icon="pi pi-check" v-tooltip.top="'Approve (a)'" @click="act([data.id], 'approve')" />
            <Button size="small" severity="warn" text icon="pi pi-times"
                    v-tooltip.top="'Reject (r)'" @click="act([data.id], 'reject')" />
            <Button size="small" severity="danger" text icon="pi pi-ban"
                    v-tooltip.top="'Mark spam (s)'" @click="act([data.id], 'spam')" />
            <Button v-if="!data.deleted_at" size="small" severity="secondary" text icon="pi pi-trash"
                    v-tooltip.top="'Delete (d)'" @click="act([data.id], 'delete')" />
            <Button v-else size="small" severity="secondary" text icon="pi pi-replay"
                    v-tooltip.top="'Restore'" @click="act([data.id], 'restore')" />
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="banDialog" modal header="Restrict member" :style="{ width: '26rem' }">
      <p class="mb-3 text-sm text-gray-600">
        {{ banTarget?.author?.display_name }} — a mute can be lifted; a ban also revokes every
        signed-in session.
      </p>
      <label class="mb-1 block text-xs font-medium text-gray-700">Action</label>
      <Select
        v-model="banStatus" class="mb-3 w-full"
        :options="[{ label: 'Mute', value: 'muted' }, { label: 'Ban', value: 'banned' }]"
        option-label="label" option-value="value"
      />
      <label class="mb-1 block text-xs font-medium text-gray-700">Reason (logged)</label>
      <InputText v-model="banReason" class="w-full" placeholder="why" />
      <template #footer>
        <Button label="Cancel" text @click="banDialog = false" />
        <Button label="Confirm" severity="danger" @click="confirmBan" />
      </template>
    </Dialog>
  </div>
</template>
