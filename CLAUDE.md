# Admin Panel (Vue 3) — context for Claude Code

Private SPA. No SEO. Focus is on UX for content management across many registered sites.

## Core admin workflow

1. **Sites section** — register new domains, view list of registered sites, rotate API keys, deactivate sites.
2. **Casinos / Bonuses / Banners / Articles** — create and manage master content. Each entity has an "Attach to Sites" tab.
3. **Attachments** — multi-select which sites a piece of content appears on, set per-site overrides (affiliate URL, position, zone, featured).
4. **Analytics** — clicks and conversions broken down by site.

## Site registration flow (key UI pattern)

1. User clicks "Register Domain" → modal opens
2. Fills: `name`, `slug`, `domain`, `currency`, `revalidation_url` (the Next.js webhook URL)
3. Submits → backend creates the site and returns the **plain API key once** in the response
4. UI shows a one-time modal: "**Copy this key now — it will not be shown again.** Paste into your Next.js .env.local as `API_SITE_KEY`."
5. After the user confirms they copied it, the modal closes. The key is hashed in DB and unrecoverable.

If a user later loses the key, they use "Rotate Key" — same one-time-display flow with a new key. The old key is invalidated immediately.

## Attachment UI pattern (for Casinos, Bonuses, Banners)

The entity edit form has tabs:
- **Details** — global fields (name, logo, rating, etc.)
- **Attach to Sites** — table with one row per registered site, each row has:
    - Checkbox: "Show on this site"
    - Site-specific override fields (e.g. for Casino: `affiliate_url`, `position`, `featured`)
    - Quick actions: "Apply same overrides to all selected"

Save sends a `POST /api/v1/admin/casinos/{id}/sites/sync` with the full attachment array — backend replaces the pivot state in one transaction.

## Technologies

- Vue 3 (Composition API + `<script setup>` only)
- Vite
- TypeScript (strict, no `any`)
- Pinia
- Vue Router 4
- Tailwind CSS
- PrimeVue (UI components, DataTable, Dialog, MultiSelect)
- TinyMCE (article editor)
- Chart.js + vue-chartjs (analytics)
- Axios with interceptors

## Folder structure

```
src/
├── api/
│   ├── client.ts                — axios with auth interceptor
│   ├── sites.ts                 — register, list, rotate
│   ├── casinos.ts
│   ├── casinoAttachments.ts     — attach/detach/sync for casino_site pivot
│   ├── bonuses.ts
│   ├── bonusAttachments.ts
│   ├── banners.ts
│   ├── bannerAttachments.ts
│   ├── articles.ts
│   ├── analytics.ts
│   └── auth.ts
├── stores/
│   ├── authStore.ts
│   ├── sitesStore.ts            — list of registered sites, cached
│   ├── casinosStore.ts
│   └── uiStore.ts
├── views/
│   ├── auth/Login.vue
│   ├── sites/{List,Register,Edit}.vue
│   ├── casinos/{List,Edit,Create}.vue
│   ├── bonuses/...
│   ├── banners/...
│   ├── articles/...
│   └── analytics/Dashboard.vue
├── components/
│   ├── layout/{Sidebar,Topbar,AppLayout}.vue
│   ├── attachments/SitesAttachmentTable.vue   — REUSABLE across entities
│   ├── modals/ApiKeyDisplayModal.vue          — one-time key display
│   └── forms/...
├── router/index.ts
├── composables/
├── types/                       — re-exports from shared/types
└── utils/
```

## Reusable attachment component

`SitesAttachmentTable.vue` is generic and used by Casino/Bonus/Banner edit views.

Props:
- `entity-type: 'casino' | 'bonus' | 'banner'`
- `entity-id: number`
- `override-fields: FormField[]` — declarative list of per-site override fields

It loads the list of sites from `sitesStore` and the current attachments for the entity, renders a table, and emits `update:attachments`.

## Conventions

- **Components:** PascalCase
- **Composables:** `use{X}.ts`, exported as `useX()`
- **Stores:** `{name}Store.ts`, exported as `use{Name}Store()`
- **Never use Options API.** Only `<script setup lang="ts">`
- **No `any`.** Type everything. Import shared types from `@shared/types`
- **All requests through `src/api/client.ts`** — Bearer token added automatically

## Auth flow

1. Login → POST `/api/v1/auth/login` → receive Sanctum token
2. Token stored in `authStore` + localStorage
3. Axios interceptor: `Authorization: Bearer {token}` on every request
4. 401 → auto-logout → redirect to `/login`

## Security UX rules

- **API key display modal** must explicitly warn the user the key won't be shown again
- **API key field** in any list/edit view shows `••••••••` placeholder — never the actual key
- **Rotate Key button** requires confirmation (typed site name) before proceeding
- **Delete Site button** requires double confirmation — and cascades to detach all content

## Commands

```bash
pnpm dev
pnpm build
pnpm preview
pnpm lint
pnpm type-check
```