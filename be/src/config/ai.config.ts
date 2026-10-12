import { registerAs } from '@nestjs/config';

/** Nhà cung cấp mô hình ngôn ngữ theo chuẩn API kiểu OpenAI (Chat Completions). */
export interface AiProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

/** `KEY=` rỗng trong .env được coi như chưa cấu hình (Rule #14). */
function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : null;
}

/**
 * ===================================================================
 * AI viết lời hướng dẫn đóng gói (21/09/2026) — Groq
 * ===================================================================
 * Groq có bậc miễn phí và endpoint tương thích chuẩn OpenAI. Thiếu
 * `AI_API_KEY` → `provider: null`, hệ thống dùng câu mẫu.
 * ===================================================================
 */
export default registerAs('ai', () => {
  const apiKey = nonEmpty(process.env.AI_API_KEY);
  const timeout = Number(process.env.AI_TIMEOUT_MS);
  const provider: AiProviderConfig | null = apiKey
    ? {
        name: 'groq',
        apiKey,
        baseUrl: nonEmpty(process.env.AI_BASE_URL) ?? 'https://api.groq.com/openai/v1',
        model: nonEmpty(process.env.AI_MODEL) ?? 'openai/gpt-oss-120b',
        timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 20000,
      }
    : null;
  return { provider };
});
