// A kind of bonus — "Special Offers", "No Deposit", "Free Spins".
//
// ONE row drives two surfaces: an entry under the Bonus menu, and a section on
// the home page listing the offers filed under it.
export interface BonusCategory {
  id: number
  name: string
  /** In the public URL and every cache key — never regenerated on rename. */
  slug: string
  description: string | null
  /**
   * Path to the type's SVG icon on the public disk, or null.
   *
   * Resolved against the API origin's /storage mount, exactly like
   * `Category.logo_path` — one resolver serves both. It is the chip artwork in
   * the bonus strip on a site's home page.
   */
  icon_path: string | null
  position: number
  /** Shown on the site. Off removes the menu entry AND the section. */
  active: boolean
  /** Only when the endpoint counted them (the admin list does). */
  offers_count?: number
  created_at: string
  updated_at: string
}

export interface UpsertBonusCategoryPayload {
  name?: string
  description?: string | null
  /** Stored path from the SVG upload. Explicit null clears the icon. */
  icon_path?: string | null
  position?: number
  active?: boolean
}
