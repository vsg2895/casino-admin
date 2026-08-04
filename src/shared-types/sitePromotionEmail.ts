// Fields match SitePromotionEmailResource.php exactly.
// All text fields support placeholders: {{site_name}}, {{site_url}}, {{email}},
// {{year}}, {{unsubscribe_url}}. Body fields (intro/secondary/disclaimer)
// additionally support a minimal **bold** syntax.
export interface SitePromotionEmail {
  id: number
  site_id: number
  from_name: string
  from_email: string
  subject: string
  // Removable content blocks — null means the email omits that block entirely.
  // Each is independent: any combination can be cleared.
  preheader: string | null
  hero_image_url: string | null
  hero_url: string | null
  top_button_text: string | null
  heading: string | null
  intro_text: string | null
  secondary_text: string | null
  cta_button_text: string | null
  disclaimer_text: string | null
  // Structural — the opt-out link is legally required and cannot be removed.
  unsubscribe_label: string
  // Palette (hex). Never null: the API falls back to the design default for any
  // colour a row predates, so the email always renders a complete palette.
  button_color: string          // CTA button fill
  accent_color: string          // unsubscribe link
  background_color: string      // the email canvas
  heading_color: string         // the heading
  text_color: string            // greeting + intro paragraph
  secondary_text_color: string  // secondary paragraph
  muted_text_color: string      // disclaimer + the line around the unsubscribe link
  active: boolean
  // The SendGrid-verified domain the from address must use (read-only hint).
  from_domain: string
  created_at: string
  updated_at: string
}

// Payload for PUT /admin/sites/{id}/promotion-email — every editable field.
export type UpdateSitePromotionEmailPayload = Omit<
  SitePromotionEmail,
  'id' | 'site_id' | 'from_domain' | 'created_at' | 'updated_at'
>
