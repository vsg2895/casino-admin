import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    title?: string
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/auth/Login.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      component: () => import('@/components/layout/AppLayout.vue'),
      meta: { requiresAuth: true },
      redirect: '/casinos',
      children: [
        {
          path: 'sites',
          name: 'sites',
          component: () => import('@/views/sites/List.vue'),
          meta: { requiresAuth: true, title: 'Sites' },
        },
        {
          path: 'email-templates',
          name: 'email-templates',
          component: () => import('@/views/sites/EmailTemplates.vue'),
          meta: { requiresAuth: true, title: 'Subscription Emails' },
        },
        {
          path: 'sites/:siteId/email-template',
          name: 'sites-email-template',
          component: () => import('@/views/sites/EmailTemplate.vue'),
          meta: { requiresAuth: true, title: 'Subscription Email' },
        },
        {
          path: 'verify-emails',
          name: 'verify-emails',
          component: () => import('@/views/sites/VerifyEmails.vue'),
          meta: { requiresAuth: true, title: 'Verify Email' },
        },
        {
          path: 'sites/:siteId/verify-email',
          name: 'sites-verify-email',
          component: () => import('@/views/sites/VerifyEmail.vue'),
          meta: { requiresAuth: true, title: 'Verify Email' },
        },
        {
          path: 'promotion-emails',
          name: 'promotion-emails',
          component: () => import('@/views/sites/PromotionEmails.vue'),
          meta: { requiresAuth: true, title: 'Promotion Emails' },
        },
        {
          path: 'sites/:siteId/promotion-email',
          name: 'sites-promotion-email',
          component: () => import('@/views/sites/PromotionEmail.vue'),
          meta: { requiresAuth: true, title: 'Promotion Email' },
        },
        {
          path: 'casinos',
          name: 'casinos',
          component: () => import('@/views/casinos/List.vue'),
          meta: { requiresAuth: true, title: 'Casinos' },
        },
        {
          path: 'casinos/create',
          name: 'casinos-create',
          component: () => import('@/views/casinos/Create.vue'),
          meta: { requiresAuth: true, title: 'New Casino' },
        },
        {
          path: 'casinos/:id/edit',
          name: 'casinos-edit',
          component: () => import('@/views/casinos/Edit.vue'),
          meta: { requiresAuth: true, title: 'Edit Casino' },
        },
        {
          path: 'special-offers',
          name: 'special-offers',
          component: () => import('@/views/specialOffers/List.vue'),
          meta: { requiresAuth: true, title: 'Special Offers' },
        },
        {
          path: 'special-offers/create',
          name: 'special-offers-create',
          component: () => import('@/views/specialOffers/Create.vue'),
          meta: { requiresAuth: true, title: 'New Special Offer' },
        },
        {
          path: 'special-offers/:id/edit',
          name: 'special-offers-edit',
          component: () => import('@/views/specialOffers/Edit.vue'),
          meta: { requiresAuth: true, title: 'Edit Special Offer' },
        },
        {
          path: 'categories',
          name: 'categories',
          component: () => import('@/views/categories/List.vue'),
          meta: { requiresAuth: true, title: 'Categories' },
        },
        {
          path: 'newsletter',
          name: 'newsletter',
          component: () => import('@/views/newsletter/List.vue'),
          meta: { requiresAuth: true, title: 'Newsletter' },
        },
        {
          path: 'unsubscribes',
          name: 'unsubscribes',
          component: () => import('@/views/unsubscribes/List.vue'),
          meta: { requiresAuth: true, title: 'Unsubscribes' },
        },
        {
          path: 'schedules',
          name: 'schedules',
          component: () => import('@/views/schedules/List.vue'),
          meta: { requiresAuth: true, title: 'Schedule Setting' },
        },
        {
          path: 'promotion-history',
          name: 'promotion-history',
          component: () => import('@/views/promotionHistory/List.vue'),
          meta: { requiresAuth: true, title: 'Promotion History' },
        },
        {
          path: 'social-links',
          name: 'social-links',
          component: () => import('@/views/socialLinks/List.vue'),
          meta: { requiresAuth: true, title: 'Social Links' },
        },
        {
          path: 'pages',
          name: 'pages',
          component: () => import('@/views/cmsPages/List.vue'),
          meta: { requiresAuth: true, title: 'Pages' },
        },
        {
          path: 'pages/create',
          name: 'pages-create',
          component: () => import('@/views/cmsPages/Create.vue'),
          meta: { requiresAuth: true, title: 'New Page' },
        },
        {
          path: 'pages/:id/edit',
          name: 'pages-edit',
          component: () => import('@/views/cmsPages/Edit.vue'),
          meta: { requiresAuth: true, title: 'Edit Page' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'casinos' }
  }
})

export default router
