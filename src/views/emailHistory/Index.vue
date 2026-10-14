<script setup lang="ts">
/**
 * Email History — every message log the platform keeps, in one place.
 *
 * They were separate sections reached from different parts of the sidebar — and
 * the SMS log was not a section at all, but a dialog buried in Newsletter
 * Phones. That made "did we send this person anything" a four-screen question.
 * They answer the same kind of question about different streams, so they belong
 * behind one heading with a tab each.
 *
 * The section keeps the name Email History even with SMS in it: three of the
 * four tabs are email, and it is the heading an operator already looks for.
 *
 * ── Each tab is the EXISTING screen, not a copy ─────────────────────────────
 *
 * The children are imported unchanged and rendered with `embedded`, which only
 * hides their own heading — the tab already names the log. Their filters,
 * paging, counts and exports are untouched, so there is one implementation of
 * each history and nothing to keep in sync.
 *
 * ── `lazy`, and what it costs ───────────────────────────────────────────────
 *
 * Without it PrimeVue renders every panel and merely hides the inactive ones,
 * so opening this section would mount all three histories and fire six requests
 * — three listings and three counts — over tables that grow without anybody
 * editing. With `lazy` only the selected panel exists, so one history loads.
 *
 * The cost is honest: leaving a tab DESTROYS it, so returning re-queries and
 * the filters on it reset. That is the right trade for logs an operator opens
 * to answer one question, and it is why the tab is kept in the URL — the view
 * you arrived at is the one a refresh or a shared link reproduces.
 *
 * ── The tab lives in the URL ────────────────────────────────────────────────
 *
 * `?tab=` is read on arrival and written on every change, so a tab can be
 * linked, bookmarked and survives a refresh. The old per-history routes
 * redirect here with the right tab, which is what keeps existing links — and
 * the History buttons on the Warmup and Promotion-after-verification screens —
 * working.
 */
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import PromotionHistory from '@/views/promotionHistory/List.vue'
import SmsHistory from '@/views/smsHistory/List.vue'
import WarmupHistory from '@/views/warmup/History.vue'
import VerificationPromotionHistory from '@/views/verificationPromotion/History.vue'

const route = useRoute()
const router = useRouter()

/** The tab keys, which are also the `?tab=` values. */
const TABS = ['promotion', 'post-verification', 'warmup', 'sms'] as const
type TabKey = (typeof TABS)[number]

function tabFromRoute(): TabKey {
  const requested = String(route.query.tab ?? '')

  // An unknown value falls back to the first tab rather than rendering nothing:
  // a stale link should open the section, not break it.
  return (TABS as readonly string[]).includes(requested) ? (requested as TabKey) : 'promotion'
}

const activeTab = ref<TabKey>(tabFromRoute())

// `replace`, not `push`: switching tabs is not a navigation an operator wants to
// step back through one tab at a time.
watch(activeTab, (tab) => {
  if (String(route.query.tab ?? '') !== tab) {
    void router.replace({ query: { ...route.query, tab } })
  }
})

// And the other direction, for the redirects from the old routes and for the
// browser's own back button.
watch(
  () => route.query.tab,
  () => {
    const tab = tabFromRoute()
    if (activeTab.value !== tab) activeTab.value = tab
  },
)
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-gray-900">Email History</h2>
      <p class="text-sm text-gray-500">
        Every message the platform has sent, by stream. Each tab has its own filters.
      </p>
    </div>

    <Tabs v-model:value="activeTab" lazy>
      <TabList>
        <Tab value="promotion">Promotion</Tab>
        <Tab value="post-verification">After verification</Tab>
        <Tab value="warmup">Warmup</Tab>
        <Tab value="sms">SMS</Tab>
      </TabList>

      <TabPanels class="!px-0 !pt-4">
        <TabPanel value="promotion">
          <PromotionHistory embedded />
        </TabPanel>
        <TabPanel value="post-verification">
          <VerificationPromotionHistory embedded />
        </TabPanel>
        <TabPanel value="warmup">
          <WarmupHistory embedded />
        </TabPanel>
        <TabPanel value="sms">
          <SmsHistory embedded />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
