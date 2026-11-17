import type { RouteRecordRaw } from 'vue-router'

/**
 * Big Glow Day admin routes, spread into the authenticated layout's children
 * in router/index.ts (the one line that file gains). All under /perfume/*.
 */
const page = (path: string, name: string, title: string, component: () => Promise<unknown>): RouteRecordRaw => ({
  path: `perfume/${path}`,
  name,
  component,
  meta: { requiresAuth: true, title },
})

export const perfumeRoutes: RouteRecordRaw[] = [
  page('settings', 'perfume-settings', 'Big Glow Day · Settings', () => import('./views/Settings.vue')),
  page('home', 'perfume-home', 'Big Glow Day · Home page', () => import('./views/Home.vue')),
  page('orders', 'perfume-orders', 'Big Glow Day · Orders', () => import('./views/Orders.vue')),
  page('subscribers', 'perfume-subscribers', 'Big Glow Day · Subscribers', () => import('./views/Subscribers.vue')),
  page('products', 'perfume-products', 'Big Glow Day · Products', () => import('./views/Products.vue')),
  page('products/create', 'perfume-product-create', 'Big Glow Day · New product', () => import('./views/ProductEdit.vue')),
  page('products/:id/edit', 'perfume-product-edit', 'Big Glow Day · Edit product', () => import('./views/ProductEdit.vue')),
  page('brands', 'perfume-brands', 'Big Glow Day · Brands', () => import('./views/Brands.vue')),
  page('categories', 'perfume-categories', 'Big Glow Day · Categories', () => import('./views/Categories.vue')),
  page('scent-notes', 'perfume-scent-notes', 'Big Glow Day · Scent notes', () => import('./views/ScentNotes.vue')),
  page('scent-families', 'perfume-scent-families', 'Big Glow Day · Scent families', () => import('./views/ScentFamilies.vue')),
  page('perfumers', 'perfume-perfumers', 'Big Glow Day · Perfumers', () => import('./views/Perfumers.vue')),
  page('navigation', 'perfume-navigation', 'Big Glow Day · Navigation', () => import('./views/Nav.vue')),
  page('stores', 'perfume-stores', 'Big Glow Day · Stores', () => import('./views/Stores.vue')),
  page('pages', 'perfume-pages', 'Big Glow Day · Pages', () => import('./views/Pages.vue')),
]
