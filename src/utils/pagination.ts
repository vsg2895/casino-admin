/**
 * Paging for the simple-paginated admin listings.
 *
 * Those listings return a page WITHOUT a total (the server runs no COUNT for
 * them); every such screen already calls the listing's `/count` endpoint in
 * parallel, and that number is what sizes the paginator. This turns the two
 * responses into the `{ total, last_page }` the screens have always used.
 */
import type { SimplePaginatedResponse } from '@shared/types/pagination'

/** What a page says about where it sits — enough to page on without a total. */
export interface PageWindow {
  current_page: number
  per_page: number
  /** Rows on this page. */
  rows: number
  /** Whether the server has a next page. */
  has_more: boolean
}

export interface PagerMeta {
  total: number
  last_page: number
}

export function pageWindow<T>(res: SimplePaginatedResponse<T>): PageWindow {
  return {
    current_page: res.meta.current_page,
    per_page: res.meta.per_page,
    rows: res.data.length,
    has_more: res.links.next !== null,
  }
}

/**
 * The same, for the hand-built listings (forum, articles, UniOne) that report
 * `meta.has_more` instead of Laravel's `links.next`.
 */
export function handPageWindow(res: {
  data: unknown[]
  meta: { current_page: number; per_page: number; has_more: boolean }
}): PageWindow {
  return {
    current_page: res.meta.current_page,
    per_page: res.meta.per_page,
    rows: res.data.length,
    has_more: res.meta.has_more,
  }
}

/**
 * `{ total, last_page }` from a page and the separate COUNT.
 *
 * Never smaller than the rows this page proves exist: the two requests run
 * concurrently, and a row added between them must not leave the paginator
 * claiming fewer rows than are on screen. When the COUNT failed (`null`), the
 * total is what the page proves plus one if there is a next page — so the
 * paginator still offers "next" one page at a time instead of going dead.
 */
export function pagerMeta(window: PageWindow | null, total: number | null): PagerMeta {
  if (window === null) {
    return { total: total ?? 0, last_page: 1 }
  }

  // An empty page proves nothing about the pages before it — it is what a
  // page past the end returns after a delete, and the screen steps back on it.
  const seen = window.rows === 0
    ? 0
    : (window.current_page - 1) * window.per_page + window.rows + (window.has_more ? 1 : 0)
  const known = Math.max(total ?? 0, seen)

  return { total: known, last_page: Math.max(1, Math.ceil(known / window.per_page)) }
}
