import { apiRequest } from '../lib/api'

export type StorefrontConnection = {
  platform: 'storefront'
  shop_id: string
  store_name: string
  connected: boolean
  connection_type: 'internal'
}

export async function fetchStorefrontConnection(): Promise<StorefrontConnection> {
  return apiRequest<StorefrontConnection>('/storefront/settings', {
    auth: true,
  })
}
