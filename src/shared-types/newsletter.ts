import type { Site } from './site'

// Fields match NewsletterResource.php — a newsletter subscriber for a site.
export interface Newsletter {
  id: number
  site_id: number
  site?: Site
  email: string
  full_name: string | null
  verified: boolean
  created_at: string
  deleted_at?: string | null
}
