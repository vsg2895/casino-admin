// Fields match VerificationPromotionEmailResource.php exactly.
//
// This is the ONE global post-verification promotion — there is deliberately no
// `site_id`. Subscribers from every registered site receive this same template,
// so only placeholders available on every site may be used:
// {{site_name}}, {{site_url}}, {{email}}, {{year}}, {{unsubscribe_url}}.
// Body fields (intro/secondary/disclaimer) additionally support **bold**.
export interface VerificationPromotionEmail {
  id: number
  from_name: string
  from_email: string
  subject: string
  // Removable content blocks — null means the email omits that block entirely.
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
  // Palette (hex). Never null; the API fills in the design default.
  button_color: string
  accent_color: string
  background_color: string
  heading_color: string
  text_color: string
  secondary_text_color: string
  muted_text_color: string

  // ── Settings ───────────────────────────────────────────────────────────────
  // Master switch for the whole feature. False = nothing is ever sent.
  active: boolean
  // Minutes after `newsletters.verified_at` (the moment the subscriber clicked
  // the verify link) at which the promotion becomes eligible — not measured
  // from when they subscribed.
  delay_minutes: number
  // Transport:
  //   'sendgrid_env' — SendGrid via the .env SENDGRID_API_KEY (no key to pick)
  //   'mailgun'      — a Mailgun credential stored in the admin
  //   'smtp'         — the .env SMTP mailer
  // 'sendgrid' (a stored SendGrid key) is retired for this feature but still
  // recognised, so a row saved before the change keeps working.
  provider: EmailProvider
  sendgrid_key_id: number | null
  mailgun_key_id: number | null
  // Server-side cap, surfaced so the form can validate against the same bound.
  max_delay_minutes: number
  // Whether SENDGRID_API_KEY is set on the server. False hides the SendGrid
  // option, matching how a provider with no stored keys is hidden. Never
  // carries the key itself.
  sendgrid_env_available: boolean

  // The SendGrid-verified domain the from address should use (read-only hint).
  from_domain: string
  created_at: string
  updated_at: string
}

export type EmailProvider = 'smtp' | 'sendgrid_env' | 'mailgun' | 'sendgrid'

// Payload for PUT /admin/verification-promotion — every editable field.
export type UpdateVerificationPromotionEmailPayload = Omit<
  VerificationPromotionEmail,
  'id' | 'from_domain' | 'max_delay_minutes' | 'sendgrid_env_available' | 'created_at' | 'updated_at'
>
