<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const auth = useAuthStore()

interface NavItem {
  label: string
  to: string
  icon: string
}

const navItems: NavItem[] = [
  { label: 'Casinos',        to: '/casinos',        icon: 'pi-th-large' },
  { label: 'Special Offers', to: '/special-offers', icon: 'pi-percentage' },
  { label: 'Categories',     to: '/categories',     icon: 'pi-tags' },
  { label: 'Newsletter',     to: '/newsletter',     icon: 'pi-envelope' },
  { label: 'Unsubscribes',   to: '/unsubscribes',   icon: 'pi-ban' },
  { label: 'Subscription Emails', to: '/email-templates', icon: 'pi-inbox' },
  { label: 'Verify Email', to: '/verify-emails', icon: 'pi-verified' },
  { label: 'Promotion Emails', to: '/promotion-emails', icon: 'pi-megaphone' },
  { label: 'Schedule Setting', to: '/schedules',        icon: 'pi-clock' },
  { label: 'Promotion History', to: '/promotion-history', icon: 'pi-history' },
  { label: 'Social Links',   to: '/social-links',   icon: 'pi-share-alt' },
  { label: 'Pages',          to: '/pages',          icon: 'pi-file' },
  { label: 'Sites',          to: '/sites',          icon: 'pi-server' },
]

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
