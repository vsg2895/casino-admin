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
  // CTA button fill colour and link/accent colour (hex).
  button_color: string
  accent_color: string
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
