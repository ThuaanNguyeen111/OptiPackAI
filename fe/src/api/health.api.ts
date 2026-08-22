import { API_BASE_URL } from '../lib/api'

export async function checkHealth(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/`)
  if (!res.ok) {
    throw new Error('Health check failed')
  }
  return res.text()
}
