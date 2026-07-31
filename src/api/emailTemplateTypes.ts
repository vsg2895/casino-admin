import client from './client'
import type { EmailTemplateType } from '@shared/types/emailTemplateType'

// Email templates that can be rendered for a site (Subscribe, Verify,
// Promotion, …). Sourced from the backend catalog.
export function listEmailTemplateTypes(): Promise<EmailTemplateType[]> {
  return client
    .get<{ data: EmailTemplateType[] }>('/admin/email-template-types')
    .then((r) => r.data.data)
}
