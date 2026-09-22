<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const auth = useAuthStore()

interface NavItem {
  label: string
  to: string
  icon: string
}

/**
 * A collapsible group of nav items.
 *
 * The FIRST grouping in this sidebar, added with the community forum. The flat
 * list had reached 29 entries; four more top-level rows for Moderation,
 * Discussions, Boards and the rest would have pushed it to 33 and made the
 * whole menu harder to scan for the sake of one feature.
 *
 * Only the forum is grouped. Grouping everything else at the same time would be
 * a large, unrequested reshuffle of a menu people already know by position —
 * the pattern is here now, and the rest can adopt it when someone asks.
 */
interface NavGroup {
  label: string
  icon: string
  /** Any child route matching this prefix keeps the group open. */
  match: string
  children: NavItem[]
}

const navItems: NavItem[] = [
  { label: 'Casinos',        to: '/casinos',        icon: 'pi-th-large' },
  { label: 'Special Offers', to: '/special-offers', icon: 'pi-percentage' },
  { label: 'Categories',     to: '/categories',     icon: 'pi-tags' },
  { label: 'Bonus Categories', to: '/bonus-categories', icon: 'pi-gift' },
  { label: 'Countries',      to: '/countries',      icon: 'pi-globe' },
  { label: 'Users',          to: '/users',          icon: 'pi-users' },
  { label: 'Reviews',        to: '/reviews',        icon: 'pi-star' },
  { label: 'Newsletter',     to: '/newsletter',     icon: 'pi-envelope' },
  { label: 'Phone Newsletters', to: '/newsletter-phones', icon: 'pi-mobile' },
  { label: 'SMS Templates', to: '/sms-templates', icon: 'pi-comment' },
  { label: 'Twilio Configs', to: '/twilio-configs', icon: 'pi-key' },
  { label: 'Unsubscribes',   to: '/unsubscribes',   icon: 'pi-ban' },
  { label: 'Subscription Emails', to: '/email-templates', icon: 'pi-inbox' },
  { label: 'Verify Email', to: '/verify-emails', icon: 'pi-verified' },
  { label: 'Promotion Emails', to: '/promotion-emails', icon: 'pi-megaphone' },
  { label: 'Promotion After Verification', to: '/promotion-after-verification', icon: 'pi-verified' },
  { label: 'Schedule Setting', to: '/schedules',        icon: 'pi-clock' },
  { label: 'Validate Email', to: '/validate-email', icon: 'pi-check-circle' },
  { label: 'Email Validation Stats', to: '/email-validation-stats', icon: 'pi-chart-bar' },
  { label: 'Email Validation Log', to: '/email-validation', icon: 'pi-list' },
  { label: 'SendGrid Keys', to: '/sendgrid-keys', icon: 'pi-key' },
  // ── UniOne: two ADDITIVE entries. No existing entry is changed. ──
  { label: 'UniOne',         to: '/unione',         icon: 'pi-send' },
  { label: 'UniOne Receivers', to: '/unione-receivers', icon: 'pi-address-book' },
  { label: 'Mailgun Credentials', to: '/mailgun-keys', icon: 'pi-key' },
  { label: 'Mailgun Receivers', to: '/mailgun-receivers', icon: 'pi-users' },
  { label: 'Email Configs', to: '/smtp-credentials', icon: 'pi-server' },
  { label: 'Warmup', to: '/warmup', icon: 'pi-sun' },
  { label: 'Warmup History', to: '/warmup/history', icon: 'pi-history' },
  { label: 'Promotion History', to: '/promotion-history', icon: 'pi-history' },
  { label: 'Social Links',   to: '/social-links',   icon: 'pi-share-alt' },
  { label: 'Pages',          to: '/pages',          icon: 'pi-file' },
  { label: 'Sites',          to: '/sites',          icon: 'pi-server' },
  { label: 'Change Password', to: '/change-password', icon: 'pi-lock' },
]

const navGroups: NavGroup[] = [
  {
    label: 'Forum',
    icon: 'pi-comments',
    match: '/forum',
    children: [
      { label: 'Moderation',  to: '/forum/moderation',  icon: 'pi-flag' },
      { label: 'Discussions', to: '/forum/articles',    icon: 'pi-book' },
      { label: 'Boards',      to: '/forum/boards',      icon: 'pi-sitemap' },
    ],
  },
]

// Open when the current route is inside the group, so arriving by deep link or
// refresh never leaves the active item hidden inside a collapsed section.
const open = ref<Record<string, boolean>>(
  Object.fromEntries(navGroups.map((g) => [g.label, router.currentRoute.value.path.startsWith(g.match)])),
)

function toggle(group: NavGroup): void {
  open.value[group.label] = !open.value[group.label]
}

async function handleLogout(): Promise<void> {
  await auth.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <aside class="flex h-screen w-64 flex-shrink-0 flex-col bg-gray-900 text-white">
    <!-- Brand -->
    <div class="flex h-16 items-center gap-3 px-6 border-b border-gray-700">
      <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
        <i class="pi pi-briefcase text-white text-sm" />
      </div>
      <span class="text-sm font-semibold tracking-wide">Casino Admin</span>
    </div>

    <!-- Nav -->
    <nav class="flex-1 overflow-y-auto py-4">
      <ul class="space-y-0.5 px-3">
        <!-- Collapsible groups, rendered before the flat items. -->
        <li v-for="group in navGroups" :key="group.label">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400
                   hover:bg-gray-800 hover:text-white transition-colors"
            :aria-expanded="open[group.label]"
            @click="toggle(group)"
          >
            <i :class="['pi', group.icon, 'text-base w-4 text-center']" />
            <span class="flex-1 text-left">{{ group.label }}</span>
            <i :class="['pi', open[group.label] ? 'pi-chevron-down' : 'pi-chevron-right', 'text-xs']" />
          </button>
          <ul v-show="open[group.label]" class="mt-0.5 space-y-0.5 border-l border-gray-700 pl-3 ml-5">
            <li v-for="child in group.children" :key="child.to">
              <RouterLink
                :to="child.to"
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400
                       hover:bg-gray-800 hover:text-white transition-colors"
                active-class="bg-gray-800 text-white"
              >
                <i :class="['pi', child.icon, 'text-sm w-4 text-center']" />
                {{ child.label }}
              </RouterLink>
            </li>
          </ul>
        </li>

        <li v-for="item in navItems" :key="item.to">
          <RouterLink
            :to="item.to"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400
                   hover:bg-gray-800 hover:text-white transition-colors"
            active-class="bg-gray-800 text-white"
          >
            <i :class="['pi', item.icon, 'text-base w-4 text-center']" />
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>

    <!-- Logout -->
    <div class="border-t border-gray-700 p-3">
      <button
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400
               hover:bg-gray-800 hover:text-white transition-colors"
        @click="handleLogout"
      >
        <i class="pi pi-sign-out text-base w-4 text-center" />
        Logout
      </button>
    </div>
  </aside>
</template>
