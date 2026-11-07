import { receiverCampaignApi, receiverListApi } from './receiverLists'
import type { SendgridReceiverSettings } from '@shared/types/sendgridKey'

/**
 * The SendGrid receiver list — Custom Receivers → Sendgrid Receivers.
 *
 * The same endpoints and shapes as the Mailgun list, against its own table, so
 * both are built by the shared Custom Receivers factories. The campaign half is
 * addressed by SendGrid key id: the key IS the configuration.
 */
export const sendgridReceiverList = receiverListApi('/admin/sendgrid-receivers')

export const sendgridReceiverCampaign = receiverCampaignApi<SendgridReceiverSettings>('/admin/sendgrid-keys')
