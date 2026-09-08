<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import * as revalidationsApi from '@/api/siteRevalidations'
import * as sitesApi from '@/api/sites'
import type { SiteRevalidation } from '@shared/types/siteRevalidation'
import type { Site } from '@shared/types/site'

/**
 * Whether this site is actually picking up admin changes.
 *
 * The contract in docs/admin-first.md requires this: "an editor must be able to
 * see that the site did not pick up their change." Until this screen existed,
 * every save reported success whether or not the front end ever heard about it.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()

const siteId = Number(route.params.id)
const site = ref<Site | null>(null)
const items = ref<SiteRevalidation[]>([])
const loading = ref(false)
const rebuilding = ref(false)

function formatWhen(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    const [history, siteRes] = await Promise.all([
      revalidationsApi.listRevalidations(siteId),
      sitesApi.getSite(siteId),
    ])
    items.value = history.data
    site.value = siteRes.data
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load cache history.', life: 4000 })
  } finally {
    loading.value = false
  }
}

async function rebuild(): Promise<void> {
  rebuilding.value = true
  try {
    const attempt = await revalidationsApi.rebuildSiteCache(siteId)

    // The response carries the real outcome, so a failure is reported as one
    // instead of a cheerful "done" over a site that never answered.
    if (attempt && attempt.status === 'success') {
      toast.add({
        severity: 'success',
        summary: 'Cache rebuilt',
        detail: `The site responded in ${attempt.duration_ms}ms.`,
        life: 4000,
      })
    } else {
      toast.add({
        severity: 'error',
        summary: 'Rebuild failed',
        detail: attempt?.error ?? 'The site did not respond. Check its revalidation URL and secret.',
        life: 8000,
      })
    }

    await reload()
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not reach the API.', life: 4000 })
  } finally {
    rebuilding.value = false
  }
}

onMounted(reload)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <Button label="Back to sites" icon="pi pi-arrow-left" text severity="secondary" @click="router.push({ name: 'sites' })" />
      <h2 class="text-lg font-semibold text-gray-900">
        Cache &amp; revalidation<span v-if="site" class="text-gray-400"> — {{ site.name }}</span>
      </h2>
      <Button
        label="Rebuild cache"
        icon="pi pi-refresh"
        :loading="rebuilding"
        @click="rebuild"
      />
    </div>

    <!-- Current state, front and centre: this is the question the screen exists
         to answer. -->
    <div
      v-if="site"
      class="rounded-xl border p-4"
      :class="site.last_revalidation_status === 'failed'
        ? 'border-red-200 bg-red-50'
        : site.last_revalidation_status === 'success'
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-gray-200 bg-gray-50'"
    >
      <p class="text-sm font-medium"
         :class="site.last_revalidation_status === 'failed' ? 'text-red-800' : site.last_revalidation_status === 'success' ? 'text-emerald-800' : 'text-gray-600'">
        <template v-if="site.last_revalidation_status === 'success'">
          This site is picking up changes. Last confirmed {{ formatWhen(site.last_revalidated_at) }}.
        </template>
        <template v-else-if="site.last_revalidation_status === 'failed'">
          This site is NOT picking up changes. Edits saved in the admin are not reaching it.
        </template>
        <template v-else>
          No revalidation has been attempted yet. Save a casino, or press Rebuild cache.
        </template>
      </p>
      <p v-if="site.last_revalidation_error" class="mt-2 font-mono text-xs text-red-700">
        {{ site.last_revalidation_error }}
      </p>
      <p v-if="site.last_revalidation_status === 'failed'" class="mt-2 text-xs text-red-700">
        Usual causes: the site's revalidation URL points somewhere else (a production domain while
        you are working locally), or its REVALIDATE_SECRET does not match the backend's.
      </p>
    </div>

    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable :value="items" :loading="loading" striped-rows data-key="id" :pt="{ root: { class: 'text-sm' } }">
        <template #empty>
          <div class="py-10 text-center text-sm text-gray-400">No attempts recorded yet.</div>
        </template>

        <Column header="When" :style="{ width: '180px' }">
          <template #body="{ data }">
            <span class="text-gray-600">{{ formatWhen(data.created_at) }}</span>
          </template>
        </Column>

        <Column header="Result" :style="{ width: '120px' }">
          <template #body="{ data }">
            <Tag
              :value="data.status === 'success' ? `OK ${data.http_status ?? ''}`.trim() : 'Failed'"
              :severity="data.status === 'success' ? 'success' : 'danger'"
            />
          </template>
        </Column>

        <Column header="Trigger" :style="{ width: '110px' }">
          <template #body="{ data }">
            <span class="text-gray-500">{{ data.triggered_by === 'manual' ? 'Rebuild' : 'Save' }}</span>
          </template>
        </Column>

        <Column header="Took" :style="{ width: '90px' }">
          <template #body="{ data }">
            <span class="tabular-nums text-gray-500">{{ data.duration_ms }}ms</span>
          </template>
        </Column>

        <Column header="Tags / error">
          <template #body="{ data }">
            <span v-if="data.error" class="font-mono text-xs text-red-700">{{ data.error }}</span>
            <span v-else class="font-mono text-xs text-gray-400">{{ (data.tags ?? []).join(', ') }}</span>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>
