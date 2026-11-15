import { apiRequest } from '../lib/api'

export type AiProviderKey = 'groq' | 'openai' | 'gemini' | 'openrouter' | 'custom'

export type AiProviderPreset = {
  key: AiProviderKey
  label: string
  baseUrl: string
  defaultModel: string
  defaultVisionModel: string
  keyUrl: string | null
}

/** db = nhập trên web · env = biến AI_* của server · none = chưa có key, AI tắt. */
export type AiSettingsSource = 'db' | 'env' | 'none'

export type AiSettings = {
  provider: AiProviderKey
  baseUrl: string
  model: string
  visionModel: string | null
  timeoutMs: number
  hasApiKey: boolean
  apiKeyLast4: string | null
  source: AiSettingsSource
  presets: AiProviderPreset[]
  updatedAt: string | null
}

export type AiConnectionTest = {
  ok: boolean
  latencyMs: number
  models: string[]
  modelFound: boolean | null
  error: string | null
}

export type AiSettingsInput = {
  provider?: AiProviderKey
  base_url?: string
  model?: string
  vision_model?: string | null
  /** Không gửi = giữ key cũ · null = xoá key. */
  api_key?: string | null
  timeout_ms?: number
}

export async function getAiSettings(): Promise<AiSettings> {
  const res = await apiRequest<{ settings: AiSettings }>('/ai-settings', { auth: true })
  return res.settings
}

export async function updateAiSettings(body: AiSettingsInput): Promise<AiSettings> {
  const res = await apiRequest<{ settings: AiSettings }>('/ai-settings', {
    method: 'PUT',
    auth: true,
    body,
  })
  return res.settings
}

export async function testAiSettings(
  body: Omit<AiSettingsInput, 'vision_model' | 'timeout_ms' | 'api_key'> & { api_key?: string },
): Promise<AiConnectionTest> {
  const res = await apiRequest<{ result: AiConnectionTest }>('/ai-settings/test', {
    method: 'POST',
    auth: true,
    body,
  })
  return res.result
}

export type RevealedAiKey = { apiKey: string; source: 'db' | 'env' }

/** Xem API key thật — bắt nhập lại mật khẩu; BE ghi lịch sử thao tác mỗi lần thử. */
export async function revealAiKey(password: string): Promise<RevealedAiKey> {
  const res = await apiRequest<{ key: RevealedAiKey }>('/ai-settings/reveal-key', {
    method: 'POST',
    auth: true,
    body: { password },
  })
  return res.key
}
