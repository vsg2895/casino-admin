# Admin — Casino Platform

Private Vue 3 SPA for managing every registered site: content, attachments, email/SMS
templates, campaigns and audiences.

Vue 3 (Composition API) · Vite 7 · TypeScript (strict) · Pinia · Vue Router ·
Tailwind 4 · PrimeVue 4. Part of the [casino-platform](../README.md) monorepo.

## Documentation

| Doc | Covers |
|-----|--------|
| [CLAUDE.md](CLAUDE.md) | working rules for this app — read first |
| [../docs/API.md](../docs/API.md) | the endpoints this SPA consumes |
| [../docs/CONVENTIONS.md](../docs/CONVENTIONS.md) | code style |
| [../docs/OPERATIONS.md](../docs/OPERATIONS.md) | what the screens are used for |
| [../docs/SECURITY.md](../docs/SECURITY.md) | key handling and the one-time key modal |

## Setup

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

Point it at the API with `VITE_API_URL=http://localhost:8000/api/v1` in `.env`.
Backend setup first: [../docs/SETUP.md](../docs/SETUP.md).

## Commands

```bash
pnpm dev
npm run build       # vue-tsc -b && vite build — THE verification gate
pnpm preview
```

`npm run build` type-checks the whole SPA and is the highest-value check in the repo:
it is what catches a shared type that drifted from a changed Laravel API Resource. There
is no CI — run it before reporting work as done.

## Two things that surprise people

1. **`@shared/types` resolves to `src/shared-types/`**, a vendored copy — not to
   `shared/types/` at the repo root. Edit the root, then run
   `./scripts/sync-shared-types.sh`, then rebuild.
2. **Secrets are write-only.** API keys, SendGrid/Mailgun keys and Twilio tokens are
   never returned after saving. The UI shows a name, a status, and a **Test** button that
   sends a real message to prove the credential works.
