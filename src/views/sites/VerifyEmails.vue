<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useSitesStore } from '@/stores/sitesStore'
import type { Site } from '@shared/types/site'

const store = useSitesStore()
const router = useRouter()

onMounted(() => store.fetchSites())

function editTemplate(site: Site): void {
  router.push({ name: 'sites-verify-email', params: { siteId: site.id } })
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div>
      <h2 class="text-lg font-semibold text-gray-900">Verify Email</h2>
      <p class="text-sm text-gray-500">
        Edit the "verify your email" template each site uses to confirm an address.
      </p>
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <DataTable
        :value="store.sites"
        :loading="store.loading"
        striped-rows
        :pt="{ root: { class: 'text-sm' } }"
      >
        <template #empty>
          <div class="py-12 text-center text-sm text-gray-400">No sites registered yet.</div>
        </template>

        <Column field="name" header="Site" class="font-medium" />

        <Column field="domain" header="Domain">
          <template #body="{ data: site }: { data: Site }">
            <span class="font-mono text-xs text-gray-700">{{ site.domain }}</span>
          </template>
        </Column>

        <Column header="Status">
          <template #body="{ data: site }: { data: Site }">
            <Tag
              :severity="site.active ? 'success' : 'danger'"
              :value="site.active ? 'Active' : 'Inactive'"
            />
          </template>
        </Column>

        <Column header="" style="width: 180px">
          <template #body="{ data: site }: { data: Site }">
            <Button
              label="Edit template"
              icon="pi pi-envelope"
              size="small"
              text
              @click="editTemplate(site)"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>
