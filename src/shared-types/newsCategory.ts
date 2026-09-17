// An editorial section for one site's news — "Licensing", "Industry", "Payments".
//
// Per site, unlike BonusCategory: a bonus type describes the offer and means the
// same on every domain, while each site's editorial sections are its own.
export interface NewsCategory {
  id: number
  site_id: number
  name: string
  /** In /news?category=… — never regenerated on rename. */
  slug: string
  position: number
  active: boolean
  /** Only when the endpoint counted them (the admin list does). */
  articles_count?: number
  created_at: string
  updated_at: string
}

export interface UpsertNewsCategoryPayload {
  name?: string
  position?: number
  active?: boolean
}
