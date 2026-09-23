import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { AiProviderConfig } from '../../config/ai.config';
import type { BoxSpec, GuideStepFacts, GuideText } from './engine';
import { buildTemplateGuide } from './engine';

export type GuideFallbackReason = 'no_api_key' | 'ai_error' | 'ai_invalid_output';

export interface PackingGuideResult extends GuideText {
  source: 'ai' | 'template';
  /** `nhà-cung-cấp/model` đã viết, VD `groq/openai/gpt-oss-120b`; null nếu là câu mẫu. */
  model: string | null;
  fallback_reason: GuideFallbackReason | null;
}

export interface PackingGuideInput {
  box: BoxSpec;
  facts: GuideStepFacts[];
  fill_ratio: number | null;
  bubble_wrap_count: number;
}

const MAX_INSTRUCTION_LENGTH = 400;

const SYSTEM_PROMPT = [
  'Bạn viết hướng dẫn đóng gói cho nhân viên kho một shop thời trang (giày dép, quần áo) tại Việt Nam.',
  'Thuật toán đã quyết định sẵn thùng, thứ tự, vị trí và cách xoay từng món. Nhiệm vụ của bạn CHỈ là diễn đạt lại thành câu tiếng Việt ngắn, rõ, dễ làm theo.',
  'Quy tắc bắt buộc:',
  '- Giữ đúng số bước và đúng thứ tự được cho; bước i trong kết quả ứng với bước i trong dữ liệu.',
  '- Mỗi câu hướng dẫn phải chứa nguyên văn mã SKU của món ở bước đó.',
  '- Không đổi vị trí, cách xoay hay món đặt bên dưới; không thêm món, không thêm bước.',
  '- Mỗi câu phải nói đủ: đặt ở đâu ("position"), xoay thế nào ("orientation_hint"), và đặt "sát đáy thùng" nếu "rests_on" rỗng, ngược lại "đặt lên trên" các món trong "rests_on".',
  '- Món có "is_fragile": true thì câu phải bắt đầu bằng việc bọc xốp hơi trước khi đặt; món có "no_stack_on_top": true thì "tip" phải nhắc không đặt món khác đè lên.',
  '- Món có "zip_bag" khác null thì câu phải bắt đầu bằng việc cho món đó vào túi zip (nêu tên túi), và nếu "zip_bag.folded": true thì nói gập đôi túi, rồi mới đặt vào thùng.',
  '- Món có "folded_in_half": true thì câu phải nói gập đôi món (hoặc cả gói túi zip) theo chiều dài TRƯỚC khi đặt vào thùng.',
  '- Gọi món theo "product_type" (VD "áo thun", "quần dài/jean") kèm mã SKU cho tự nhiên; "product_type" null thì chỉ dùng mã SKU.',
  '- Mỗi câu hướng dẫn tối đa khoảng 40 từ, giọng chuyên nghiệp, không đùa.',
  '- "tip" là một lưu ý ngắn khi thật sự cần (hàng dễ vỡ, không được đè lên, cách gấp quần áo gọn); không cần thì để chuỗi rỗng "".',
  '- "summary" là 1–2 câu tổng quan: dùng thùng nào, bao nhiêu món, lưu ý chung trước khi dán thùng.',
  'Chỉ trả về JSON dạng {"summary": string, "steps": [{"step": number, "instruction": string, "tip": string}]}, không kèm chữ nào khác.',
].join('\n');

// Không dùng kiểu hợp (string|null) để tương thích nhiều model;
// tip rỗng được chuẩn hoá về null ở parseGuide().
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'steps'],
  properties: {
    summary: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['step', 'instruction', 'tip'],
        properties: {
          step: { type: 'integer' },
          instruction: { type: 'string' },
          tip: { type: 'string' },
        },
      },
    },
  },
} as const;

type Attempt = { ok: true; guide: GuideText } | { ok: false; reason: 'ai_error' | 'ai_invalid_output' };

/**
 * ===================================================================
 * PackingGuideAiService — viết lời hướng dẫn đóng gói bằng mô hình ngôn ngữ
 * ===================================================================
 * Ranh giới trách nhiệm (chốt 21/09/2026):
 *  - Engine greedy 3D + validator quyết định HÌNH HỌC (thùng, vị trí,
 *    thứ tự). Mô hình ngôn ngữ KHÔNG được tính cách xếp.
 *  - Chỉ gửi dữ kiện đã tính sẵn (SKU, kích thước, vị trí dạng chữ) —
 *    KHÔNG gửi thông tin khách hàng.
 *  - Gọi Groq (`ai.provider`). Thiếu key, lỗi mạng hoặc trả sai → câu
 *    mẫu `buildTemplateGuide()`, không làm hỏng màn hình đóng gói.
 * ===================================================================
 */
@Injectable()
export class PackingGuideAiService {
  private readonly logger = new Logger(PackingGuideAiService.name);

  constructor(private readonly configService: ConfigService) {}

  async writeGuide(input: PackingGuideInput): Promise<PackingGuideResult> {
    const template = buildTemplateGuide(input.facts, input.box, input.fill_ratio, input.bubble_wrap_count);
    const provider = this.configService.get<AiProviderConfig | null>('ai.provider', null);
    if (!provider) return { ...template, source: 'template', model: null, fallback_reason: 'no_api_key' };

    const attempt = await this.tryProvider(provider, input);
    if (attempt.ok) {
      return { ...attempt.guide, source: 'ai', model: `${provider.name}/${provider.model}`, fallback_reason: null };
    }
    return { ...template, source: 'template', model: null, fallback_reason: attempt.reason };
  }

  private async tryProvider(provider: AiProviderConfig, input: PackingGuideInput): Promise<Attempt> {
    let raw: unknown;
    try {
      raw = await this.callProvider(provider, input);
    } catch (error: unknown) {
      this.logger.warn(`AI "${provider.name}" lỗi khi viết hướng dẫn đóng gói: ${describeError(error)}`);
      return { ok: false, reason: 'ai_error' };
    }
    const guide = parseGuide(raw, input.facts);
    if (!guide) {
      this.logger.warn(`AI "${provider.name}" trả hướng dẫn sai số bước/thứ tự/SKU — bỏ qua.`);
      return { ok: false, reason: 'ai_invalid_output' };
    }
    return { ok: true, guide };
  }

  private async callProvider(provider: AiProviderConfig, input: PackingGuideInput): Promise<unknown> {
    const userPayload = {
      box: { code: input.box.code, name: input.box.name, inner_mm: input.box.inner },
      fill_ratio: input.fill_ratio,
      bubble_wrap_count: input.bubble_wrap_count,
      steps: input.facts,
    };
    const body = {
      model: provider.model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
    };
    const post = async (responseFormat: object): Promise<unknown> => {
      const response = await axios.post<unknown>(
        `${provider.baseUrl}/chat/completions`,
        { ...body, response_format: responseFormat },
        { headers: { Authorization: `Bearer ${provider.apiKey}` }, timeout: provider.timeoutMs },
      );
      return extractContent(response.data);
    };

    try {
      return await post({ type: 'json_schema', json_schema: { name: 'packing_guide', strict: true, schema: RESPONSE_SCHEMA } });
    } catch (error: unknown) {
      // Một số model/nhà cung cấp không nhận json_schema (HTTP 400) —
      // thử lại 1 lần với chế độ JSON thường; parseGuide() vẫn kiểm tra kỹ.
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        return post({ type: 'json_object' });
      }
      throw error;
    }
  }
}

function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return status === undefined ? error.message : `HTTP ${String(status)} — ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Lấy JSON trong `choices[0].message.content`; chịu được khối ```json bao quanh. */
export function extractContent(data: unknown): unknown {
  if (!isRecord(data) || !Array.isArray(data.choices)) throw new Error('Response AI thiếu choices.');
  const first: unknown = data.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) throw new Error('Response AI thiếu message.');
  const content = first.message.content;
  if (typeof content !== 'string') throw new Error('AI không trả nội dung (có thể đã từ chối).');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  return JSON.parse(fenced?.[1] ?? content) as unknown;
}

/**
 * Kiểm tra output của AI khớp dữ kiện: đủ số bước, đúng thứ tự, mỗi câu
 * nhắc đúng SKU của bước đó. Sai bất kỳ điều nào → null (dùng câu mẫu).
 */
export function parseGuide(raw: unknown, facts: GuideStepFacts[]): GuideText | null {
  if (!isRecord(raw) || typeof raw.summary !== 'string' || !Array.isArray(raw.steps)) return null;
  const summary = raw.summary.trim();
  if (summary.length === 0 || raw.steps.length !== facts.length) return null;

  const steps: GuideText['steps'] = [];
  for (const [index, fact] of facts.entries()) {
    const item: unknown = raw.steps[index];
    if (!isRecord(item) || Number(item.step) !== fact.step || typeof item.instruction !== 'string') return null;
    const instruction = item.instruction.trim();
    if (instruction.length === 0 || instruction.length > MAX_INSTRUCTION_LENGTH) return null;
    if (!instruction.includes(fact.sku)) return null;
    const tip = typeof item.tip === 'string' && item.tip.trim().length > 0 ? item.tip.trim() : null;
    steps.push({ step: fact.step, instruction, tip });
  }
  return { summary, steps };
}
