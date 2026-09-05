// Visitor-written reviews of a casino, submitted on one site.
//
// Two shapes, matching the two backend resources. The admin one carries
// `author_email` and `status`; the public one carries neither, and that split is
// enforced by there being two Laravel Resource classes rather than one with
// conditionals in it.

export type CasinoReviewStatus = 'pending' | 'published' | 'hidden'

/** Admin/moderation shape — CasinoReviewResource.php. */
export interface CasinoReview {
  id: number
  site_id: number
  /** Present when the endpoint eager-loaded the site. */
  site_name?: string
  casino_id: number
  casino_name?: string
  casino_slug?: string
  author_name: string
  /** Moderator-only. Never present in any public response. */
  author_email: string | null
  rating: number
  title: string | null
  body: string
  status: CasinoReviewStatus
  /** When it first went live. Null while pending. */
  published_at: string | null
  created_at: string | null
  updated_at: string | null
}

/** Public shape — PublicCasinoReviewResource.php. No email, no status. */
export interface PublicCasinoReview {
  id: number
  author_name: string
  rating: number
  title: string | null
  body: string
  published_at: string | null
  created_at: string | null
}

/** What a visitor submits. `status` is set server-side and is not accepted here. */
export interface SubmitCasinoReviewPayload {
  author_name: string
  author_email?: string | null
  rating: number
  title?: string | null
  body: string
}

/** GET /public/sites/{slug}/casinos/{slug}/reviews */
export interface PublicCasinoReviewsResponse {
  reviews: PublicCasinoReview[]
  summary: {
    total: number
    /** Null when there are no reviews — distinct from an average of 0. */
    average: number | null
  }
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
}
