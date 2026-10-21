<script setup lang="ts">
/**
 * Forum Users — the registered visitor accounts.
 *
 * These are NOT the admin accounts that sign in to this panel. Those live in
 * `users` with Spatie roles and hold `super-admin`; these are visitors, on their
 * own table behind their own auth guard. Keeping the two populations apart is
 * the whole reason for the separate table, and this screen only ever shows the
 * visitors.
 *
 * Registration exists on winpalack ONLY, so there is no site filter — a control
 * with one possible value is noise. The column is still carried per row, so the
 * filter comes back the day a second site opens registration.
 *
 * Everyone registers as `user`. `moderator` is kept as a promotion an operator
 * can make here without a database client, which is the admin-first rule.
 */
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import * as api from '@/api/forum'
import RecordCount from '@/components/RecordCount.vue'
import type {
  ForumMemberRole,
  ForumMemberRow,
  ForumMemberStatus,
  ForumModerationPost,
} from '@shared/types/community-forum'

const toast = useToast()

const items = ref<ForumMemberRow[]>([])
const loading = ref(false)

const page = ref(1)
const perPage = ref(25)
const meta = ref<{ total: number; last_page: number } | null>(null)
const totalRecords = computed(() => meta.value?.total ?? 0)
const first = computed(() => (page.value - 1) * perPage.value)

// ── filters (Apply-driven, matching Reviews and the moderation queue) ────────
const search = ref('')
const status = ref<ForumMemberStatus | null>(null)
const role = ref<ForumMemberRole | null>(null)
const verified = ref<boolean | null>(null)

const statusOptions = [
  { label: 'Any status', value: null },
  { label: 'Active', value: 'active' },
  { label: 'Muted', value: 'muted' },
  { label: 'Banned', value: 'banned' },
]
const roleOptions = [
  { label: 'Any role', value: null },
  { label: 'User', value: 'user' },
  { label: 'Moderator', value: 'moderator' },
]
const verifiedOptions = [
  { label: 'Any', value: null },
  { label: 'Confirmed', value: true },
  { label: 'Not confirmed', value: false },
]

// ── per-member posts drawer ─────────────────────────────────────────────────
const postsDialog = ref(false)
const postsFor = ref<ForumMemberRow | null>(null)
const memberPosts = ref<ForumModerationPost[]>([])
const postsLoading = ref(false)

/** Is anything narrowing the list? Drives the wording of the count. */
const hasFilters = computed(
  () => status.value !== null || role.value !== null || verified.value !== null || search.value.trim() !== '',
)

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await api.listMembers({
      page: page.value,
      per_page: perPage.value,
      status: status.value,
      role: role.value,
      verified: verified.value,
      search: search.value.trim() || null,
    })
    items.value = res.data
    meta.value = { total: res.meta.total, last_page: res.meta.last_page }
  } catch {
    toast.add({ severity: 'error', summary: 'Could not load members', life: 4000 })
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

async function changeRole(row: ForumMemberRow, next: ForumMemberRole): Promise<void> {
  if (next === row.role) return
  try {
    await api.setMemberRole(row.id, next)
    row.role = next
    toast.add({ severity: 'success', summary: `${row.display_name} is now ${next}`, life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Could not change that role', life: 4000 })
  }
}

async function changeStatus(row: ForumMemberRow, next: ForumMemberStatus): Promise<void> {
  if (next === row.status) return
  if (next === 'banned' && !confirm(`Ban ${row.display_name}? This also signs them out everywhere.`)) return
  try {
    const res = await api.setMemberStatus(row.id, next)
    row.status = res.status
    row.banned_until = res.banned_until
    toast.add({ severity: 'success', summary: `${row.display_name} is now ${next}`, life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: 'Could not change that member', life: 4000 })
  }
}

async function openPosts(row: ForumMemberRow): Promise<void> {
  postsFor.value = row
  postsDialog.value = true
  postsLoading.value = true
  memberPosts.value = []
  try {
    memberPosts.value = (await api.listMemberPosts(row.id)).data
  } catch {
    toast.add({ severity: 'error', summary: 'Could not load their posts', life: 4000 })
  } finally {
    postsLoading.value = false
  }
}

/**
 * Date AND time, in the reader's own zone.
 *
 * The API sends every timestamp as UTC ISO-8601 with its `Z`, so `new Date()`
 * parses the instant correctly and `toLocaleString` renders it wherever the
 * operator happens to be sitting. That is the whole conversion — there is no
 * zone arithmetic to do here, and any added by hand would double-shift it.
 *
 * This screen used to print the DATE only, which is what made a confirmation
 * unreadable: registering and confirming happen minutes apart, so "21 Oct"
 * against "21 Oct" answers nothing about whether the link was clicked at all
 * promptly. `dateStyle: 'short'` + `timeStyle: 'short'` is the same pairing
 * every other history screen in this panel uses.
 */
function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

onMounted(() => void load())
</script>

<template>
  <div class="p-6">
    <div class="mb-4">
      <h1 class="text-xl font-semibold text-gray-900">Users</h1>
      <p class="mt-1 text-sm text-gray-500">
        <template v-if="meta">
          <span class="font-medium text-gray-700">{{ meta.total.toLocaleString() }}</span>
          {{ hasFilters ? 'matching the filters' : 'registered' }} ·
        </template>
        Visitor accounts registered on winpalack.com. Separate from the admin
        accounts that sign in to this panel.
      </p>
    </div>

    <div class="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700">Search</label>
        <InputText v-model="search" placeholder="name or email" class="w-56" @keyup.enter="apply" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700">Status</label>
        <Select v-model="status" :options="statusOptions" option-label="label" option-value="value" class="w-36" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700">Role</label>
        <Select v-model="role" :options="roleOptions" option-label="label" option-value="value" class="w-36" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-gray-700">Email</label>
        <Select v-model="verified" :options="verifiedOptions" option-label="label" option-value="value" class="w-40" />
      </div>
      <Button label="Apply" icon="pi pi-filter" @click="apply" />

      <!-- The count of what the FILTERS match, not of the table.
           `meta.total` is the server's count of the filtered set — the same
           number the paginator is built from — so it already moves with every
           filter and never has to be requested separately. -->
      <RecordCount
        label="Users"
        :total="meta ? meta.total : null"
        :loading="loading"
        class="ml-auto"
      />
    </div>

    <DataTable
      :value="items" :loading="loading" data-key="id"
      lazy paginator :rows="perPage" :first="first" :total-records="totalRecords"
      :rows-per-page-options="[25, 50, 100]" @page="onPage"
    >
      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-users mb-3 text-3xl text-gray-400" />
          <p class="font-medium text-gray-900">No members yet.</p>
          <p class="mt-1 text-sm text-gray-500">Accounts appear here as visitors register on the forum.</p>
        </div>
      </template>

      <Column header="Member" style="min-width:16rem">
        <template #body="{ data }: { data: ForumMemberRow }">
          <div class="flex items-center gap-2">
            <span class="font-medium text-gray-900">{{ data.display_name }}</span>
            <Tag v-if="!data.verified" value="unconfirmed" severity="warn" />
          </div>
          <p class="text-xs text-gray-500">{{ data.email }}</p>
        </template>
      </Column>

      <Column header="Role" style="width:11rem">
        <template #body="{ data }: { data: ForumMemberRow }">
          <Select
            :model-value="data.role"
            :options="roleOptions.filter(o => o.value !== null)"
            option-label="label" option-value="value" class="w-full"
            @update:model-value="(v: ForumMemberRole) => changeRole(data, v)"
          />
        </template>
      </Column>

      <Column header="Status" style="width:11rem">
        <template #body="{ data }: { data: ForumMemberRow }">
          <Select
            :model-value="data.status"
            :options="statusOptions.filter(o => o.value !== null)"
            option-label="label" option-value="value" class="w-full"
            @update:model-value="(v: ForumMemberStatus) => changeStatus(data, v)"
          />
          <p v-if="data.ban_reason" class="mt-1 text-xs text-gray-400">{{ data.ban_reason }}</p>
        </template>
      </Column>

      <Column header="Posts" style="width:9rem">
        <template #body="{ data }: { data: ForumMemberRow }">
          <!-- Denormalised columns, maintained by the observers — this list
               never runs a COUNT over forum_posts. -->
          <p class="text-sm tabular-nums text-gray-800">{{ data.approved_posts_count }} accepted</p>
          <p class="text-xs tabular-nums text-gray-400">of {{ data.posts_count }} written</p>
        </template>
      </Column>

      <!-- Registered and Verified at sit together, in that order, because the
           question this screen is actually asked is about the GAP between
           them: a member who signed up and confirmed four minutes later is a
           healthy signup, and one who confirmed three days later is a
           deliverability problem. They were previously one line of small grey
           text inside the Member cell, carrying no time of day, which is why
           neither question could be answered from here. -->
      <Column header="Registered" style="width:11rem">
        <template #body="{ data }: { data: ForumMemberRow }">
          <span class="text-sm tabular-nums text-gray-600">{{ formatDateTime(data.created_at) }}</span>
        </template>
      </Column>

      <Column header="Verified at" style="width:11rem">
        <template #body="{ data }: { data: ForumMemberRow }">
          <span v-if="data.email_verified_at" class="text-sm tabular-nums text-gray-600">
            {{ formatDateTime(data.email_verified_at) }}
          </span>
          <!-- "not confirmed", not a dash. An empty cell here reads as missing
               data; this is a real state, and it is the one that explains why
               a member gets no mail. It also matches the `unconfirmed` tag on
               the Member cell rather than restating it in different words. -->
          <span
            v-else
            class="text-sm text-amber-600"
            title="This member has not clicked the link in their confirmation email"
          >
            not confirmed
          </span>
        </template>
      </Column>

      <Column header="Last seen" style="width:11rem">
        <template #body="{ data }: { data: ForumMemberRow }">
          <!-- "never", not a bare dash.
               This column is written by sign-in and by the authenticated
               heartbeat — never by registration, and never by confirming an
               address. A member who signed up, confirmed by email and has not
               signed in yet is therefore correctly blank, and a dash made that
               read as missing data rather than as the answer. -->
          <span v-if="data.last_seen_at" class="text-sm tabular-nums text-gray-600">
            {{ formatDateTime(data.last_seen_at) }}
          </span>
          <span
            v-else
            class="text-sm text-gray-400"
            title="No sign-in yet — confirming an email address does not create a session"
          >
            never
          </span>
        </template>
      </Column>

      <Column header="" style="width:7rem">
        <template #body="{ data }: { data: ForumMemberRow }">
          <Button size="small" text icon="pi pi-list" label="Posts" @click="openPosts(data)" />
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="postsDialog" modal :header="`Posts by ${postsFor?.display_name ?? ''}`" :style="{ width: '44rem' }">
      <p v-if="postsLoading" class="py-8 text-center text-gray-500">Loading…</p>
      <p v-else-if="memberPosts.length === 0" class="py-8 text-center text-gray-500">
        This member has not posted yet.
      </p>
      <ul v-else class="divide-y divide-gray-100">
        <li v-for="post in memberPosts" :key="post.id" class="py-3">
          <div class="mb-1 flex items-center gap-2">
            <Tag :value="post.status" :severity="post.status === 'approved' ? 'success' : post.status === 'pending' ? 'warn' : 'danger'" />
            <span v-if="post.article" class="text-xs text-gray-500">{{ post.article.title }}</span>
            <span v-if="post.deleted_at" class="text-xs text-gray-400">· deleted</span>
          </div>
          <p class="whitespace-pre-wrap break-words text-sm text-gray-800">{{ post.body }}</p>
        </li>
      </ul>
      <template #footer>
        <Button label="Close" text @click="postsDialog = false" />
      </template>
    </Dialog>
  </div>
</template>
