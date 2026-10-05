import { apiRequest } from '../lib/api'
import type { LazadaConnectResponse } from '../types/marketplace-orders'

export async function fetchLazadaConnectUrl(): Promise<LazadaConnectResponse> {
  return apiRequest<LazadaConnectResponse>('/marketplace/lazada/connect', {
    auth: true,
  })
}
