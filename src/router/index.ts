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
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/views/auth/ForgotPassword.vue'),
      meta: { requiresAuth: false },
    },
    {
      // Opened from the emailed link, which carries ?token= and ?email=.
      // The API builds this URL from FRONTEND_URL — see AppServiceProvider.
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('@/views/auth/ResetPassword.vue'),
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
          // Nested under the site: a menu belongs to exactly one domain.
          path: 'sites/:id/navigation',
          name: 'site-navigation',
          component: () => import('@/views/sites/Navigation.vue'),
          meta: { requiresAuth: true, title: 'Navigation' },
        },
        {
          path: 'sites/:id/seo-templates',
          name: 'site-seo-templates',
          component: () => import('@/views/sites/SeoTemplates.vue'),
          meta: { requiresAuth: true, title: 'SEO patterns' },
        },
        {
          path: 'sites/:id/redirects',
          name: 'site-redirects',
          component: () => import('@/views/sites/Redirects.vue'),
          meta: { requiresAuth: true, title: 'Redirects' },
        },
        {
          // The forum page's rules. Nested under the site: the page belongs to
          // exactly one domain, the same reason navigation is.
          path: 'sites/:id/forum',
          name: 'site-forum',
          component: () => import('@/views/sites/Forum.vue'),
          meta: { requiresAuth: true, title: 'Forum page' },
        },
        {
          path: 'sites/:id/guides',
          name: 'site-guides',
          component: () => import('@/views/sites/Articles.vue'),
          meta: { requiresAuth: true, title: 'Guides', articleType: 'guide' },
        },
        {
          path: 'sites/:id/news-categories',
          name: 'site-news-categories',
          component: () => import('@/views/newsCategories/List.vue'),
          meta: { requiresAuth: true, title: 'News categories' },
        },
        {
          // The SAME screen as guides. The two sections differ only in their
          // labels, their feature flag and the minimum-count rule, so one
          // component reads those from route meta rather than existing twice
          // and drifting apart.
          path: 'sites/:id/news',
          name: 'site-news',
          component: () => import('@/views/sites/Articles.vue'),
          meta: { requiresAuth: true, title: 'News', articleType: 'news' },
        },
        {
          path: 'sites/:id/cache',
          name: 'site-cache',
          component: () => import('@/views/sites/CacheHealth.vue'),
          meta: { requiresAuth: true, title: 'Cache & revalidation' },
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
          // The ONE global post-verification promotion — no :siteId, by design.
          path: 'promotion-after-verification',
          name: 'promotion-after-verification',
          component: () => import('@/views/verificationPromotion/Edit.vue'),
          meta: { requiresAuth: true, title: 'Promotion After Verification' },
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
          path: 'countries',
          name: 'countries',
          component: () => import('@/views/countries/List.vue'),
          meta: { requiresAuth: true, title: 'Countries' },
        },
        /*
         * The community forum — a different feature from the Reviews section
         * above, which is the per-casino review feed that used to live at
         * /forum on the public site.
         *
         * Registered as three ROOT routes under a /forum prefix rather than
         * nested under sites/:id, because the moderation queue is cross-cutting
         * (one backlog across the network) and the other two carry their own
         * site picker. They appear in the sidebar's first collapsible group.
         */
        {
          path: 'forum/moderation',
          name: 'forum-moderation',
          component: () => import('@/views/forum/Moderation.vue'),
          meta: { requiresAuth: true, title: 'Forum Moderation' },
        },
        {
          path: 'forum/articles',
          name: 'forum-articles',
          component: () => import('@/views/forum/Articles.vue'),
          meta: { requiresAuth: true, title: 'Forum Discussions' },
        },
        {
          path: 'forum/boards',
          name: 'forum-boards',
          component: () => import('@/views/forum/Boards.vue'),
          meta: { requiresAuth: true, title: 'Forum Boards' },
        },
        /*
         * Registered visitors.
         *
         * A TOP-LEVEL section rather than a child of Forum: accounts are not a
         * forum setting, and an operator looking for "who signed up" should not
         * have to know which feature created the account.
         */
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/users/List.vue'),
          meta: { requiresAuth: true, title: 'Users' },
        },
        {
          path: 'reviews',
          name: 'reviews',
          component: () => import('@/views/reviews/List.vue'),
          meta: { requiresAuth: true, title: 'Reviews' },
        },
        {
          path: 'newsletter',
          name: 'newsletter',
          component: () => import('@/views/newsletter/List.vue'),
          meta: { requiresAuth: true, title: 'Newsletter' },
        },
        {
          // Account-level, not content: it acts on the signed-in user rather
          // than on anything site-scoped, so it sits at the end of the nav
          // beside Sites rather than among the email screens it resembles.
          path: 'change-password',
          name: 'change-password',
          component: () => import('@/views/account/ChangePassword.vue'),
          meta: { requiresAuth: true, title: 'Change Password' },
        },
        {
          path: 'bonus-categories',
          name: 'bonus-categories',
          component: () => import('@/views/bonusCategories/List.vue'),
          meta: { requiresAuth: true, title: 'Bonus Categories' },
        },
        {
          path: 'validate-email',
          name: 'validate-email',
          component: () => import('@/views/emailValidation/Check.vue'),
        },
        {
          path: 'email-validation-stats',
          name: 'email-validation-stats',
          component: () => import('@/views/emailValidation/Stats.vue'),
        },
        {
          path: 'email-validation',
          name: 'email-validation',
          component: () => import('@/views/emailValidation/List.vue'),
        },
        {
          path: 'unsubscribes',
          name: 'unsubscribes',
          component: () => import('@/views/unsubscribes/List.vue'),
          meta: { requiresAuth: true, title: 'Unsubscribes' },
        },
        {
          // Standalone SMS list — backed by `newsletters_based_on_phone`, with no
          // relationship to the email newsletter above.
          path: 'newsletter-phones',
          name: 'newsletter-phones',
          component: () => import('@/views/newsletterPhone/List.vue'),
          meta: { requiresAuth: true, title: 'Newsletters Based on Phone' },
        },
        {
          path: 'sms-templates',
          name: 'sms-templates',
          component: () => import('@/views/smsTemplates/List.vue'),
          meta: { requiresAuth: true, title: 'SMS Templates' },
        },
        {
          path: 'twilio-configs',
          name: 'twilio-configs',
          component: () => import('@/views/twilioConfigs/List.vue'),
          meta: { requiresAuth: true, title: 'Twilio Configs' },
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
        /*
         * UniOne — two ADDITIVE route records.
         *
         * Nothing above or below is modified. The sections are independent of
         * SendGrid Keys, Mailgun, Email Configs and Warmup.
         */
        {
          path: 'unione',
          name: 'unione',
          component: () => import('@/views/unione/Keys.vue'),
          meta: { requiresAuth: true, title: 'UniOne' },
        },
        {
          path: 'unione-receivers',
          name: 'unione-receivers',
          component: () => import('@/views/unione/Receivers.vue'),
          meta: { requiresAuth: true, title: 'UniOne Receivers' },
        },
        {
          path: 'sendgrid-keys',
          name: 'sendgrid-keys',
          component: () => import('@/views/sendgridKeys/List.vue'),
          meta: { requiresAuth: true, title: 'SendGrid Keys' },
        },
                {
          path: 'mailgun-receivers',
          name: 'mailgun-receivers',
          component: () => import('@/views/mailgunReceivers/List.vue'),
        },
        {
          path: 'mailgun-keys',
          name: 'mailgun-keys',
          component: () => import('@/views/mailgunKeys/List.vue'),
          meta: { requiresAuth: true, title: 'Mailgun Keys' },
        },
        {
          path: 'smtp-credentials',
          name: 'smtp-credentials',
          component: () => import('@/views/smtpCredentials/List.vue'),
          meta: { requiresAuth: true, title: 'Email Configs' },
        },
        {
          path: 'warmup',
          name: 'warmup',
          component: () => import('@/views/warmup/List.vue'),
          meta: { requiresAuth: true, title: 'Warmup' },
        },
        {
          path: 'warmup/history',
          name: 'warmup-history',
          component: () => import('@/views/warmup/History.vue'),
          meta: { requiresAuth: true, title: 'Warmup History' },
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
