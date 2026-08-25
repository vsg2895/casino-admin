// Fields match SiteVerifyEmailResource.php exactly.
// All text fields support placeholders: {{site_name}}, {{site_url}}, {{email}},
// {{year}}, {{unsubscribe_url}}. Body fields (intro/offer/spam/footer notes)
// additionally support a minimal **bold** syntax.
export interface SiteVerifyEmail {
  id: number
  site_id: number
  from_name: string
  from_email: string
  subject: string
  header_title: string | null
  header_subtitle: string | null
  heading: string | null
  intro_text: string | null
  offer_text: string | null
  spam_notice: string | null
  footer_note: string | null
  unsubscribe_label: string
  // Whether the footer unsubscribe LINK is rendered in the body. False hides it;
  // `unsubscribe_label` is kept either way so restoring brings back the same link.
  // Hiding the link never affects the unsubscribe process itself — the
  // List-Unsubscribe headers and the /unsubscribe/{token} endpoint are unchanged.
  unsubscribe_enabled: boolean
  copyright_text: string | null
  accent_color: string
  active: boolean
  // The SendGrid-verified domain the from address must use (read-only hint).
  from_domain: string
  created_at: string
  updated_at: string
}

// Payload for PUT /admin/sites/{id}/verify-email — every editable field.
export type UpdateSiteVerifyEmailPayload = Omit<
  SiteVerifyEmail,
  'id' | 'site_id' | 'from_domain' | 'created_at' | 'updated_at'
>
