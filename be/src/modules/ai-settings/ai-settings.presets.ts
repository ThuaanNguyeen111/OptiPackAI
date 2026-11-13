/**
 * 13/11/2026 — Nhà cung cấp AI chọn được ở trang Cài đặt đóng gói & AI. Tất cả đều nói
 * chuẩn OpenAI Chat Completions (`POST {baseUrl}/chat/completions`, `GET {baseUrl}/models`),
 * nên đổi nhà cung cấp chỉ là đổi URL + key + tên model. "custom" = tự nhập URL.
 * Model mặc định chỉ là gợi ý ban đầu; Admin chọn lại từ danh sách nút "Kiểm tra" trả về.
 */
export const AI_PROVIDER_VALUES = ['groq', 'openai', 'gemini', 'openrouter', 'custom'] as const;
export type AiProviderKey = (typeof AI_PROVIDER_VALUES)[number];

export interface AiProviderPreset {
  key: AiProviderKey;
  label: string;
  /** Rỗng với "custom": bắt buộc nhập. */
  baseUrl: string;
  defaultModel: string;
  defaultVisionModel: string;
  /** Trang lấy API key, để FE dẫn link. */
  keyUrl: string | null;
}

const CUSTOM_PRESET: AiProviderPreset = {
  key: 'custom',
  label: 'Tự nhập (chuẩn OpenAI)',
  baseUrl: '',
  defaultModel: '',
  defaultVisionModel: '',
  keyUrl: null,
};

export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    key: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    defaultVisionModel: 'qwen/qwen3.8-27b',
    keyUrl: 'https://console.groq.com/keys',
  },
  {
    key: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    defaultVisionModel: 'gpt-4.1-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    key: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    defaultVisionModel: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    key: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4.1-mini',
    defaultVisionModel: 'openai/gpt-4.1-mini',
    keyUrl: 'https://openrouter.ai/keys',
  },
  CUSTOM_PRESET,
];

export function presetOf(key: AiProviderKey): AiProviderPreset {
  return AI_PROVIDER_PRESETS.find((p) => p.key === key) ?? CUSTOM_PRESET;
}

export const AI_TIMEOUT_MIN_MS = 3000;
export const AI_TIMEOUT_MAX_MS = 120000;
export const AI_TIMEOUT_DEFAULT_MS = 20000;
