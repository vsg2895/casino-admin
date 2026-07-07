/**
 * Env-aware base URLs for the admin SPA.
 *
 * localhost when running `vite dev` (import.meta.env.DEV), the live API in a
 * production build. `VITE_API_BASE_URL` still overrides both when set.
 */
const DEV_API = 'http://localhost:8000/api/v1'
const PROD_API = 'https://api.idevaffiliation.com/api/v1'

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.DEV ? DEV_API : PROD_API)

/** Storage/asset origin = API base without the trailing /api/v1. */
export const STORAGE_BASE_URL: string = API_BASE_URL.replace(/\/api\/v1\/?$/, '')
