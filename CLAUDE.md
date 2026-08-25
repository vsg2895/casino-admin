# Admin Panel (Vue 3) — context for Claude Code

Private SPA. No SEO, no public exposure. The whole job is UX for managing content and
messaging across many registered sites.

Root context: [../CLAUDE.md](../CLAUDE.md) · Endpoints: [../docs/API.md](../docs/API.md) ·
Conventions: [../docs/CONVENTIONS.md](../docs/CONVENTIONS.md)

---

## What the panel manages

| Area | Screens |
|------|---------|
| **Sites** | list, register (one-time key modal), edit, rotate key, deactivate |
| **Content** | Casinos (+ Attach to Sites), Special Offers, Categories, CMS/Legal Pages, Social Links |
| **Email templates** | per site: Email Template (welcome), Verify Email, Promotion Email; plus the **global** Promotion-after-verification |
| **Audience** | Newsletter (email), Newsletter Phones (SMS), Unsubscribes |
| **Delivery** | Schedules, Promotion History, SendGrid Keys, Mailgun Keys, Twilio Configs, SMS Templates, Warmup |

Routes live in `src/router/index.ts`; each area has a folder under `src/views/`.

---

## Site registration flow — the key UI pattern

1. "Register Domain" → modal: `name`, `slug`, `domain`, `revalidation_url`.
2. Submit → the backend creates the site and returns the **plain API key once**.
3. Show a one-time modal that explicitly says: **"Copy this key now — it will not be
   shown again. Paste it into your Next.js `.env.local` as `API_SITE_KEY`."**
4. The key is hashed in the DB and unrecoverable afterwards. A lost key can only be
   **rotated** (same one-time-display flow; the old key dies immediately).

Security UX rules:

- Any key or credential renders as `••••••••`. Never the real value.
- **Rotate Key** requires typing the site name to confirm.
- **Delete Site** requires double confirmation, and cascades to detach content.
- Provider credentials (SendGrid / Mailgun / Twilio) are never displayed after saving —
  the operator proves they work with the **Test** button, which sends a real message.

---

## Attachment UI pattern

The casino edit form is tabbed:

- **Details** — global fields (name, images, rating, bonuses, description, SEO).
- **Attach to Sites** — one row per registered site with a "show on this site" checkbox
  and the per-site overrides: `affiliate_url`, `position`, `featured`, `active`, plus an
  "apply to all selected" shortcut.

Save posts the **full** attachment array to
`POST /api/v1/admin/casinos/{id}/sites/sync` — the backend replaces the pivot state in
one transaction. Do not emit per-row attach/detach calls from the form.

`components/attachments/SitesAttachmentTable.vue` is generic and is the component any
future many-to-many entity should reuse. It takes the entity type/id and a declarative
list of override fields, loads sites from `sitesStore`, and emits `update:attachments`.

---

## Technologies

Vue 3 (Composition API), Vite 7, TypeScript (strict), Pinia, Vue Router, Tailwind 4,
PrimeVue 4 (DataTable, Dialog, MultiSelect), TinyMCE (rich text), Chart.js + vue-chartjs,
Axios, `@vueuse/core`.

---

## Structure

```
src/
├── api/           one file per API surface — all go through client.ts
│                  auth, sites, casinos, casinoAttachments, categories, specialOffers,
│                  cmsPages, socialLinks, newsletter, newsletterPhones, smsTemplates,
│                  twilioConfigs, sendgridKeys, mailgunKeys, emailSchedules,
│                  siteEmailTemplates, siteVerifyEmails, sitePromotionEmails,
│                  verificationPromotion, warmupEmails, promotionHistory, unsubscribes,
│                  emailTemplateTypes, uploads, download
├── stores/        Pinia — auth, sites, casinos, categories, specialOffers, cmsPages,
│                  newsletter, socialLinks   (only where state is genuinely shared)
├── views/         one folder per area (see the table above)
├── components/
│   ├── layout/        Sidebar, Topbar, AppLayout
│   ├── attachments/   SitesAttachmentTable.vue — REUSABLE
│   ├── modals/        ApiKeyDisplayModal.vue — one-time key display
│   └── forms/
├── router/index.ts
├── config/        runtime config
├── shared-types/  VENDORED copy of /shared/types — see below
├── types/
└── utils/
```

---

## `@shared/types` is vendored

`@shared/types` resolves to **`admin/src/shared-types/`**, not to `shared/types/` at the
repo root. Editing the root alone changes nothing here.

```bash
# 1. edit shared/types/<thing>.ts   ← source of truth
./scripts/sync-shared-types.sh      # 2. propagate
cd admin && npm run build           # 3. verify
```

---

## Conventions

- **`<script setup lang="ts">` only.** Never the Options API.
- **No `any`.** Import API shapes from `@shared/types` — never redeclare them locally.
- Components PascalCase · composables `useX()` in `use{X}.ts` · stores
  `use{Name}Store()` in `{name}Store.ts`.
- **Every request goes through `src/api/client.ts`**, which attaches the bearer token and
  handles `401 → logout`. Never call `axios` from a component.
- API JSON is snake_case; convert at the boundary, don't reshape the API.
- A Pinia store is for state more than one view needs. A one-off list doesn't need one.
- Long lists use PrimeVue DataTable with server-side paging where a `count` endpoint
  exists (`casinos/count`, `newsletters/count`, `promotion-history/count`, …).
- Queued work (imports) exposes a status endpoint — poll `…/imports/{import}` until
  `finished_at` and show real progress rather than a spinner.

## Auth flow

1. `POST /api/v1/admin/auth/login` → Sanctum token.
2. Stored in `authStore` + localStorage.
3. Axios interceptor adds `Authorization: Bearer {token}`.
4. `401` → auto-logout → redirect to `/login`.

---

## Commands

```bash
pnpm dev            # http://localhost:5173
npm run build       # vue-tsc -b + vite build — THE verification gate
pnpm preview
```

`npm run build` is the single most valuable check in the repo: it type-checks the whole
SPA and is what catches a shared type that drifted from a changed Laravel API Resource.
Run it after **any** change that touches the API contract, and before reporting work as
done — there is no CI.
