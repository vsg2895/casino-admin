<script setup lang="ts">
/**
 * Total-records badge for an admin listing.
 *
 * The number comes from a dedicated COUNT endpoint, never from the paginated
 * listing response — see the `count` actions on the admin controllers. Keeping
 * it in one component means every list reports its total the same way, and a
 * new list only has to pass a label and a number.
 *
 * `total` is null while the count is in flight, which is why it is not simply
 * defaulted to 0: showing "0" and then flicking to "48,920" reads as a bug.
 */
defineProps<{
  /** e.g. "Total Newsletters" */
  label: string
  /** null while loading */
  total: number | null
  loading?: boolean
}>()
</script>

<template>
  <span
    class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm"
    :aria-busy="loading || total === null"
  >
    <span class="text-gray-500">{{ label }}</span>
    <span v-if="loading || total === null" class="text-gray-300">—</span>
    <!-- tabular-nums keeps the badge from jittering as the number changes -->
    <span v-else class="font-semibold tabular-nums text-gray-900">{{ total.toLocaleString() }}</span>
  </span>
</template>
