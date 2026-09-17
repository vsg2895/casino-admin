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
  position?: number
  active?: boolean
}
