import client from './client'
import type { ApiResponse } from '@shared/types/api'
import type { SimplePaginatedResponse } from '@shared/types/pagination'
import type {
  MailgunReceiver,
  MailgunReceiverImport,
  MailgunReceiverTemplate,
  MailgunReceiverTemplateSeed,
  ReceiverSourceLabel,
  UpsertMailgunReceiverPayload,
} from '@shared/types/mailgunReceiver'

/**
 * Custom Receivers — the two address lists, Mailgun and SendGrid.
 *
 * Both lists expose the SAME endpoints under their own prefix
 * (`/admin/mailgun-receivers`, `/admin/sendgrid-receivers`) and return the same
 * resource shape, so one factory builds the client for either. The credentials
 * that mail a list expose the same campaign endpoints too, under their own
 * prefix — see {@link receiverCampaignApi}.
 */

/** Whether an address has ever been mailed. Keyed on `last_sent_at`. */
export type ReceiverSentFilter = 'yes' | 'no'

export interface ReceiverListFilters {
  page?: number
  per_page?: number
  search?: string
  /** 'yes' = has been sent to, 'no' = never sent to. Omit for both. */
  sent?: ReceiverSentFilter
  /** Inclusive `YYYY-MM-DD` bounds on the last-sent date. */
  last_sent_from?: string
  last_sent_to?: string
  /**
   * The operator's IANA timezone, so the server can place the day boundaries
   * of the date filters above against the UTC column they compare. Set
   * automatically from the browser; never a user-facing control.
   * See utils/dayFilters.
   */
  tz?: string
  source?: 'import' | 'manual'
  /** Whose list an address came from. */
  source_label?: ReceiverSourceLabel
}

/** The two sources with their counts — what the pickers are built from. */
export interface ReceiverSources {
  sources: { value: ReceiverSourceLabel; label: string; total: number }[]
}

export interface ReceiverListApi {
  list(params?: ReceiverListFilters): Promise<SimplePaginatedResponse<MailgunReceiver>>
  count(params?: Omit<ReceiverListFilters, 'page' | 'per_page'>): Promise<number>
  sources(): Promise<ReceiverSources>
  create(payload: UpsertMailgunReceiverPayload): Promise<ApiResponse<MailgunReceiver>>
  update(id: number, payload: UpsertMailgunReceiverPayload): Promise<ApiResponse<MailgunReceiver>>
  remove(id: number): Promise<void>
  /** Delete is the only bulk action: every receiver is active, so there is nothing to toggle. */
  bulkDelete(ids: number[]): Promise<number>
  /**
   * Clear "Last sent" and "Sent" on EVERY receiver of this list. Returns the
   * rows changed. Drops the cooldown for everyone — always confirm first.
   */
  resetSends(clearErrors?: boolean): Promise<number>
  /** Upload a spreadsheet. The work is queued; poll `importStatus` until `finished_at`. */
  importFile(file: File, sourceLabel?: ReceiverSourceLabel): Promise<ApiResponse<MailgunReceiverImport>>
  importStatus(id: number): Promise<ApiResponse<MailgunReceiverImport>>
}

/** @param base e.g. `/admin/mailgun-receivers` */
export function receiverListApi(base: string): ReceiverListApi {
  return {
    list: (params) =>
      client.get<SimplePaginatedResponse<MailgunReceiver>>(base, { params }).then((r) => r.data),

    // Dedicated COUNT, issued separately so the paginated query never carries
    // its weight — the same split the newsletter and warmup lists use.
    count: (params) => client.get<{ total: number }>(`${base}/count`, { params }).then((r) => r.data.total),

    sources: () => client.get<ApiResponse<ReceiverSources>>(`${base}/sources`).then((r) => r.data.data),

    create: (payload) => client.post<ApiResponse<MailgunReceiver>>(base, payload).then((r) => r.data),

    update: (id, payload) =>
      client.put<ApiResponse<MailgunReceiver>>(`${base}/${id}`, payload).then((r) => r.data),

    remove: (id) => client.delete(`${base}/${id}`).then(() => undefined),

    bulkDelete: (ids) =>
      client.post<{ affected: number }>(`${base}/bulk`, { action: 'delete', ids }).then((r) => r.data.affected),

    resetSends: (clearErrors = false) =>
      client
        .post<{ affected: number }>(`${base}/reset-sends`, { clear_errors: clearErrors })
        .then((r) => r.data.affected),

    importFile: (file, sourceLabel) => {
      const form = new FormData()
      form.append('file', file)
      // Omitted when absent, so the column's own default applies.
      if (sourceLabel) form.append('source_label', sourceLabel)

      return client.post<ApiResponse<MailgunReceiverImport>>(`${base}/import`, form).then((r) => r.data)
    },

    importStatus: (id) =>
      client.get<ApiResponse<MailgunReceiverImport>>(`${base}/imports/${id}`).then((r) => r.data),
  }
}

/** The figures every settings save and batch preview report back. */
export interface ReceiverCampaignCounts {
  eligible_count: number
  next_batch_count: number
}

/**
 * The per-credential campaign endpoints, for a credential prefix such as
 * `/admin/sendgrid-keys`. `S` is that channel's settings shape.
 */
export interface ReceiverCampaignApi<S> {
  getSettings(credentialId: number): Promise<S>
  saveSettings(
    credentialId: number,
    payload: Partial<S>,
  ): Promise<ReceiverCampaignCounts & { blocked_reason: string | null }>
  /** The source site's promotion template, for re-seeding the form. */
  templateSource(credentialId: number): Promise<MailgunReceiverTemplateSeed>
  /** Render the message from the CURRENT, unsaved fields. */
  previewMessage(credentialId: number, template: MailgunReceiverTemplate): Promise<string>
  /** The exact receivers the next run would take — the same selector the job uses. */
  previewBatch(credentialId: number): Promise<{ data: MailgunReceiver[]; meta: ReceiverCampaignCounts }>
  run(credentialId: number): Promise<{ ok: boolean; message: string }>
}

export function receiverCampaignApi<S>(base: string): ReceiverCampaignApi<S> {
  return {
    getSettings: (id) => client.get<ApiResponse<S>>(`${base}/${id}/receiver-settings`).then((r) => r.data.data),

    saveSettings: (id, payload) =>
      client
        .put<ApiResponse<ReceiverCampaignCounts & { blocked_reason: string | null }>>(
          `${base}/${id}/receiver-settings`,
          payload,
        )
        .then((r) => r.data.data),

    templateSource: (id) =>
      client
        .get<ApiResponse<MailgunReceiverTemplateSeed>>(`${base}/${id}/receiver-template-source`)
        .then((r) => r.data.data),

    // A POST because the draft template travels in the body.
    previewMessage: (id, template) =>
      client
        .post<{ html: string }>(`${base}/${id}/receiver-message-preview`, { message_template: template })
        .then((r) => r.data.html),

    previewBatch: (id) =>
      client
        .get<{ data: MailgunReceiver[]; meta: ReceiverCampaignCounts }>(`${base}/${id}/receiver-preview`)
        .then((r) => r.data),

    run: (id) => client.post<{ ok: boolean; message: string }>(`${base}/${id}/receiver-run`).then((r) => r.data),
  }
}
