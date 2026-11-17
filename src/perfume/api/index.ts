/**
/**
 * The store's routes live OUTSIDE the platform's `/api/v1` prefix, so the
 * shared client's baseURL does not apply and every call below passes an
 * ABSOLUTE url. The client is still the one imported: its interceptors (bearer
 * token, 401 handling) run for absolute urls too. Calling these with a relative
 * path is what made every Big Glow Day screen fail with a 404.
 */
const ADMIN = API_BASE_URL.replace(/\/api\/v1\/?$/, '') + '/api/perfume/admin'

/**
 * Big Glow Day — admin API client. Every call goes to /api/perfume/admin/*
 * through the existing axios client (bearer token, 401 handling), which is
 * imported and never modified. One generic CRUD per simple resource; the
 * product editor and the settings form have their own calls.
 */
import client from '@/api/client'
import { API_BASE_URL } from '@/config/urls'
import type { ApiResponse } from '@shared/types/api'
import type { PerfumeOrder, PerfumeProduct, PerfumeSettings, PerfumeSubscriber } from '@shared/types/perfume'

export type PerfumeResource =
  | 'brands'
  | 'categories'
  | 'scent-families'
  | 'scent-notes'
  | 'perfumers'
  | 'home-cards'
  | 'nav-items'
  | 'stores'
  | 'pages'

export interface Crud<T extends { id: number }> {
  list(): Promise<T[]>
  create(payload: Record<string, unknown>): Promise<T>
  update(id: number, payload: Record<string, unknown>): Promise<T>
  remove(id: number): Promise<void>
}

export function crud<T extends { id: number }>(resource: PerfumeResource): Crud<T> {
  const base = `${ADMIN}/${resource}`
  return {
    list: () => client.get<ApiResponse<T[]>>(base).then((r) => r.data.data),
    create: (payload) => client.post<ApiResponse<T>>(base, payload).then((r) => r.data.data),
    update: (id, payload) => client.patch<ApiResponse<T>>(`${base}/${id}`, payload).then((r) => r.data.data),
    remove: (id) => client.delete(`${base}/${id}`).then(() => undefined),
  }
}

// ── Settings ───────────────────────────────────────────────────────────────
export const getSettings = (): Promise<PerfumeSettings> =>
  client.get<ApiResponse<PerfumeSettings>>(`${ADMIN}/settings`).then((r) => r.data.data)

export const updateSettings = (payload: Partial<PerfumeSettings>): Promise<PerfumeSettings> =>
  client.put<ApiResponse<PerfumeSettings>>(`${ADMIN}/settings`, payload).then((r) => r.data.data)

// ── Products ───────────────────────────────────────────────────────────────
export interface ProductListMeta {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export interface ProductListParams {
  search?: string
  brand_id?: number
  gender?: string
  page?: number
  per_page?: number
}

export function listProducts(params: ProductListParams): Promise<{ data: PerfumeProduct[]; meta: ProductListMeta }> {
  return client
    .get<{ data: PerfumeProduct[]; meta: ProductListMeta }>(`${ADMIN}/products`, { params })
    .then((r) => r.data)
}

export const getProduct = (id: number): Promise<PerfumeProduct> =>
  client.get<ApiResponse<PerfumeProduct>>(`${ADMIN}/products/${id}`).then((r) => r.data.data)

export const createProduct = (payload: Record<string, unknown>): Promise<PerfumeProduct> =>
  client.post<ApiResponse<PerfumeProduct>>(`${ADMIN}/products`, payload).then((r) => r.data.data)

export const updateProduct = (id: number, payload: Record<string, unknown>): Promise<PerfumeProduct> =>
  client.put<ApiResponse<PerfumeProduct>>(`${ADMIN}/products/${id}`, payload).then((r) => r.data.data)

export const deleteProduct = (id: number): Promise<void> =>
  client.delete(`${ADMIN}/products/${id}`).then(() => undefined)

// ── Helpers ────────────────────────────────────────────────────────────────
/** "Terre d’Hermès" → "terre-dhermes": the backend's slug rule is [a-z0-9-]. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Validation errors from a 422, keyed by field (nested keys flattened to their first segment). */
export function fieldErrors(e: unknown): Record<string, string> {
  const err = e as { response?: { status?: number; data?: { errors?: Record<string, string[]> } } }
  if (err.response?.status !== 422 || !err.response.data?.errors) return {}
  const out: Record<string, string> = {}
  for (const [key, messages] of Object.entries(err.response.data.errors)) {
    const top = key.split('.')[0] ?? key
    if (!out[top]) out[top] = messages[0] ?? 'Invalid value'
  }
  return out
}

// ── Orders ─────────────────────────────────────────────────────────────────
export interface OrderListParams {
  search?: string
  status?: string
  page?: number
  per_page?: number
}

export function listOrders(params: OrderListParams): Promise<{ data: PerfumeOrder[]; meta: ProductListMeta }> {
  return client.get<{ data: PerfumeOrder[]; meta: ProductListMeta }>(`${ADMIN}/orders`, { params }).then((r) => r.data)
}

export const updateOrder = (id: number, payload: Record<string, unknown>): Promise<PerfumeOrder> =>
  client.patch<ApiResponse<PerfumeOrder>>(`${ADMIN}/orders/${id}`, payload).then((r) => r.data.data)

export const deleteOrder = (id: number): Promise<void> =>
  client.delete(`${ADMIN}/orders/${id}`).then(() => undefined)

// ── Subscribers ────────────────────────────────────────────────────────────
export interface SubscriberListParams {
  search?: string
  page?: number
  per_page?: number
}

export function listSubscribers(params: SubscriberListParams): Promise<{ data: PerfumeSubscriber[]; meta: ProductListMeta }> {
  return client
    .get<{ data: PerfumeSubscriber[]; meta: ProductListMeta }>(`${ADMIN}/subscribers`, { params })
    .then((r) => r.data)
}

export const createSubscriber = (payload: Record<string, unknown>): Promise<PerfumeSubscriber> =>
  client.post<ApiResponse<PerfumeSubscriber>>(`${ADMIN}/subscribers`, payload).then((r) => r.data.data)

export const updateSubscriber = (id: number, payload: Record<string, unknown>): Promise<PerfumeSubscriber> =>
  client.patch<ApiResponse<PerfumeSubscriber>>(`${ADMIN}/subscribers/${id}`, payload).then((r) => r.data.data)

export const deleteSubscriber = (id: number): Promise<void> =>
  client.delete(`${ADMIN}/subscribers/${id}`).then(() => undefined)
