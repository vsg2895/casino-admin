<script setup lang="ts">
import { computed } from 'vue'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { countryFlag, IP_TYPE_LABELS } from './labels'
import type { SpecialOfferVisit, SpecialOfferVisitIp } from '@shared/types/specialOfferVisit'

const props = defineProps<{ visible: boolean; visit: SpecialOfferVisit | null }>()
const emit = defineEmits<{ 'update:visible': [boolean] }>()

/**
 * Server-seen rows first, then client-reported.
 *
 * Not cosmetic: the two groups carry different evidential weight, and reading
 * them interleaved invites an operator to treat a value anyone could have
 * POSTed as equivalent to one the connection itself carried.
 */
const orderedIps = computed<SpecialOfferVisitIp[]>(() => {
  const rows = props.visit?.ips ?? []
  return [...rows].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'server_seen' ? -1 : 1
    return a.type.localeCompare(b.type)
  })
})

const headerRows = computed<Array<[string, string]>>(() =>
  Object.entries(props.visit?.headers_raw ?? {}).map(([k, v]) => [k, v ?? '—']),
)

/*
 * PrimeVue's DataTable slot hands the row through as `any`, so indexing the
 * label map directly from the template is an implicit-any under `strict`.
 * Narrowing here keeps the template honest and the lookup total.
 */
function typeLabel(row: SpecialOfferVisitIp): string {
  return IP_TYPE_LABELS[row.type] ?? row.type
}

function geoSummary(row: SpecialOfferVisitIp): string {
  if (row.is_mdns) return 'mDNS hostname — never looked up'
  if (row.is_private) return 'Private range — never looked up'
  if (!row.geo_resolved_at) return 'Not resolved yet'

  const parts = [row.city, row.region, row.country ?? row.country_code].filter(Boolean)
  return parts.length ? parts.join(', ') : 'Provider returned nothing'
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :style="{ width: '72rem' }"
    :breakpoints="{ '1199px': '90vw', '640px': '96vw' }"
    header="Visit detail"
    @update:visible="emit('update:visible', $event)"
  >
    <div v-if="visit" class="space-y-6">
      <!-- Verdicts first: they are why an operator opened this row. -->
      <div class="flex flex-wrap items-center gap-2">
        <Tag v-if="visit.vpn_suspected" severity="warn" value="VPN suspected" />
        <Tag v-if="visit.ip_mismatch" severity="danger" value="IP mismatch" />
        <Tag v-if="visit.is_proxy" severity="danger" value="Proxy" />
        <Tag v-if="visit.is_hosting" severity="info" value="Hosting range" />
        <Tag
          v-if="visit.timezone_mismatch === true"
          severity="warn"
          value="Browser timezone ≠ IP timezone"
        />
        <Tag
          :severity="visit.consent === 'all' ? 'success' : 'secondary'"
          :value="`Consent: ${visit.consent ?? 'unknown'}`"
        />
        <span v-if="!visit.vpn_suspected && !visit.ip_mismatch" class="text-sm text-gray-500">
          Nothing flagged on this visit.
        </span>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <dl class="space-y-1.5 text-sm">
          <div class="flex gap-2">
            <dt class="w-40 shrink-0 text-gray-500">Offer</dt>
            <dd class="font-medium">{{ visit.special_offer?.title ?? '—' }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-40 shrink-0 text-gray-500">Casino</dt>
            <dd>{{ visit.special_offer?.casino?.name ?? '—' }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-40 shrink-0 text-gray-500">Site</dt>
            <dd>{{ visit.site?.name ?? '—' }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-40 shrink-0 text-gray-500">Primary IP</dt>
            <dd class="font-mono">{{ visit.primary_ip ?? '—' }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-40 shrink-0 text-gray-500">Page</dt>
            <dd class="break-all">{{ visit.page_url ?? '—' }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-40 shrink-0 text-gray-500">Referer</dt>
            <dd class="break-all">{{ visit.referer ?? '—' }}</dd>
          </div>
        </dl>

        <dl class="space-y-1.5 text-sm">
          <div class="flex gap-2">
            <dt class="w-40 shrink-0 text-gray-500">Device</dt>
            <dd>{{ [visit.device_type, visit.os, visit.browser].filter(Boolean).join(' · ') || '—' }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-40 shrink-0 text-gray-500">Browser timezone</dt>
            <dd>{{ visit.browser_timezone ?? '—' }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-40 shrink-0 text-gray-500">Screen</dt>
            <dd>{{ visit.screen_size ?? '—' }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-40 shrink-0 text-gray-500">Platform</dt>
            <dd>{{ visit.platform ?? '—' }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-40 shrink-0 text-gray-500">Accept-Language</dt>
            <dd>{{ visit.accept_language ?? '—' }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-40 shrink-0 text-gray-500">User agent</dt>
            <dd class="break-all text-xs">{{ visit.user_agent ?? '—' }}</dd>
          </div>
        </dl>
      </div>

      <!-- EVERY address, with its provenance. -->
      <div>
        <h3 class="mb-2 text-sm font-semibold text-gray-900">
          All addresses ({{ orderedIps.length }})
        </h3>
        <DataTable :value="orderedIps" data-key="id" striped-rows :pt="{ root: { class: 'text-sm' } }">
          <Column header="Address">
            <template #body="{ data }">
              <span class="font-mono">{{ data.ip }}</span>
              <div class="mt-0.5 flex flex-wrap gap-1">
                <Tag v-if="data.ip_version" :value="`IPv${data.ip_version}`" severity="secondary" />
                <Tag v-if="data.is_private" value="Private" severity="secondary" />
                <Tag v-if="data.is_mdns" value="mDNS" severity="secondary" />
              </div>
            </template>
          </Column>
          <Column header="Seen as">
            <template #body="{ data }">{{ typeLabel(data) }}</template>
          </Column>
          <Column header="Source">
            <template #body="{ data }">
              <!-- The badge that stops a client claim reading as a fact. -->
              <Tag
                :severity="data.source === 'server_seen' ? 'success' : 'warn'"
                :value="data.source === 'server_seen' ? 'Server seen' : 'Client reported'"
              />
            </template>
          </Column>
          <Column header="Location">
            <template #body="{ data }">
              <span v-if="data.country_code" class="mr-1">{{ countryFlag(data.country_code) }}</span>
              {{ geoSummary(data) }}
            </template>
          </Column>
          <Column header="Network">
            <template #body="{ data }">
              <div>{{ data.isp ?? '—' }}</div>
              <div v-if="data.asn" class="text-xs text-gray-500">{{ data.asn }}</div>
            </template>
          </Column>
          <Column header="Flags">
            <template #body="{ data }">
              <div class="flex flex-wrap gap-1">
                <Tag v-if="data.is_vpn" value="VPN" severity="warn" />
                <Tag v-if="data.is_proxy" value="Proxy" severity="danger" />
                <Tag v-if="data.is_hosting" value="Hosting" severity="info" />
                <span v-if="!data.is_vpn && !data.is_proxy && !data.is_hosting" class="text-gray-400">—</span>
              </div>
            </template>
          </Column>
        </DataTable>
      </div>

      <!-- The audit trail for primary_ip. -->
      <details class="rounded-lg border border-gray-200 p-3">
        <summary class="cursor-pointer text-sm font-semibold text-gray-900">
          Raw request headers
        </summary>
        <dl class="mt-3 space-y-1 font-mono text-xs">
          <div v-for="[name, value] in headerRows" :key="name" class="flex gap-2">
            <dt class="w-48 shrink-0 text-gray-500">{{ name }}</dt>
            <dd class="break-all">{{ value }}</dd>
          </div>
        </dl>
      </details>

      <details
        v-for="row in orderedIps.filter((r) => r.geo_raw)"
        :key="`raw-${row.id}`"
        class="rounded-lg border border-gray-200 p-3"
      >
        <summary class="cursor-pointer text-sm font-semibold text-gray-900">
          Provider payload — {{ row.ip }}
        </summary>
        <pre class="mt-3 overflow-x-auto text-xs">{{ JSON.stringify(row.geo_raw, null, 2) }}</pre>
      </details>
    </div>
  </Dialog>
</template>
