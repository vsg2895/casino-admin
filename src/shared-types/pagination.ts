/**
 * A page from a SIMPLE-paginated admin listing (Laravel `simplePaginate()`).
 *
 * No `total`, no `last_page`, no `links.last`: the listing never runs a COUNT.
 * Each of these screens takes its total from the listing's dedicated `/count`
 * endpoint instead, so the server counts once per reload rather than twice.
 * `links.next` is null on the last page.
 */
export interface SimplePaginatedResponse<T> {
  data: T[]
  links: {
    first: string | null
    prev: string | null
    next: string | null
  }
  meta: {
    current_page: number
    from: number | null
    per_page: number
    to: number | null
  }
}
