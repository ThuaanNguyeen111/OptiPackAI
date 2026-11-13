import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { AiProviderConfig } from '../../config/ai.config';
import { AiSettingsService } from '../ai-settings/ai-settings.service';
import type { BoxSpec, GuideMaterial, GuideStepFacts, GuideText } from './engine';
import { buildTemplateGuide, cutBoxNote } from './engine';

/** `mailer_template` (AOFP-224) = kiện túi niêm phong luôn dùng câu mẫu — lời AI viết cho thùng. */
export type GuideFallbackReason = 'no_api_key' | 'ai_error' | 'ai_invalid_output' | 'mailer_template';

/**
 * (05/11/2026) Truy vết 1 lần viết hướng dẫn — trả lời "dữ liệu nào đã đưa cho AI":
 * đúng system prompt, đúng JSON dữ kiện (user message) và phản hồi thô của model.
 */
export interface GuideTrace {
  system_prompt: string;
  /** JSON dữ kiện của kiện đã gửi (chuỗi, đúng như gửi đi). */
  user_payload: string;
  /** Nội dung thô model trả; null = không gọi AI hoặc gọi lỗi. */
  raw_response: string | null;
  /** Số ví dụ mẫu (few-shot) đã gửi kèm. */
  examples_used: number;
  latency_ms: number;
}

export interface PackingGuideResult extends GuideText {
  source: 'ai' | 'template';
  /** `nhà-cung-cấp/model` đã viết, VD `groq/openai/gpt-oss-120b`; null nếu là câu mẫu. */
  model: string | null;
  fallback_reason: GuideFallbackReason | null;
  trace: GuideTrace;
}

/**
 * (05/11/2026) Ví dụ mẫu = 1 hướng dẫn AI đã viết và được nhân viên đóng gói chấm
 * "dễ làm theo". Gửi kèm dạng few-shot (cặp user/assistant) — "dataset" do chính
 * kho tạo ra; KHÔNG fine-tune model.
 */
export interface GuideExample {
  /** JSON dữ kiện của kiện mẫu, đúng như đã gửi cho AI lúc viết (xem `GuideTrace.user_payload`). */
  user_payload: string;
  guide: { summary: string; steps: { step: number; instruction: string; tip: string }[] };
}

export interface PackingGuideInput {
  box: BoxSpec;
  facts: GuideStepFacts[];
  fill_ratio: number | null;
  /** (28/09/2026) Vật tư chèn cần chuẩn bị cho kiện — thay `bubble_wrap_count`. */
  materials: GuideMaterial[];
  /** (05/11/2026) Ví dụ mẫu đã được chấm tốt; bỏ qua = không có. */
  examples?: GuideExample[];
  /** (09/11/2026) Phần văn phong của system prompt (từ packing_settings); bỏ qua = mặc định. */
  style_prompt?: string;
}

/** Trần số ví dụ gửi kèm — giữ prompt ngắn (tốc độ + hạn token bậc miễn phí). */
export const MAX_GUIDE_EXAMPLES = 2;

const MAX_INSTRUCTION_LENGTH = 400;

/** Phần lõi CỐ ĐỊNH — parseGuide() dựa vào các luật này (số bước, thứ tự, SKU). */
export const GUIDE_PROMPT_CORE_HEAD = [
  'Bạn viết hướng dẫn đóng gói cho nhân viên kho một shop thời trang (giày dép, quần áo) tại Việt Nam.',
  'Thuật toán đã quyết định sẵn thùng, thứ tự, vị trí và cách xoay từng món. Nhiệm vụ của bạn CHỈ là diễn đạt lại thành câu tiếng Việt ngắn, rõ, dễ làm theo.',
  'Quy tắc bắt buộc:',
  '- Giữ đúng số bước và đúng thứ tự được cho; bước i trong kết quả ứng với bước i trong dữ liệu.',
  '- Mỗi câu hướng dẫn phải chứa nguyên văn mã SKU của món ở bước đó.',
  '- Không đổi vị trí, cách xoay hay món đặt bên dưới; không thêm món, không thêm bước.',
].join('\n');

/**
 * (09/11/2026) Phần văn phong mặc định — Admin/Store Owner thay được qua
 * `packing_settings.guide_style_prompt` (null = dùng bản này).
 */
export const DEFAULT_GUIDE_STYLE_PROMPT = [
  '- Mỗi câu phải nói đủ: đặt ở đâu ("position"), xoay thế nào ("orientation_hint"), và đặt "sát đáy thùng" nếu "rests_on" rỗng, ngược lại "đặt lên trên" các món trong "rests_on".',
  '- Món có "is_fragile": true thì câu phải bắt đầu bằng việc bọc xốp hơi trước khi đặt; món có "no_stack_on_top": true thì "tip" phải nhắc không đặt món khác đè lên.',
  '- Món có "zip_bag" khác null thì câu phải bắt đầu bằng việc cho món đó vào túi zip (nêu tên túi), và nếu "zip_bag.folded": true thì nói gập đôi túi, rồi mới đặt vào thùng.',
  '- Món có "folded_in_half": true thì câu phải nói gập đôi món (hoặc cả gói túi zip) theo chiều dài TRƯỚC khi đặt vào thùng.',
  '- Gọi món theo "product_type" (VD "áo thun", "quần dài/jean") kèm mã SKU cho tự nhiên; "product_type" null thì chỉ dùng mã SKU.',
  '- Mỗi câu hướng dẫn tối đa khoảng 40 từ, giọng chuyên nghiệp, không đùa.',
  '- Dữ liệu cho kích thước bằng mm và khối lượng bằng g; nếu câu có nhắc số đo thì đổi sang cm (tối đa 1 chữ số lẻ) và kg (tối đa 2 chữ số lẻ), dùng dấu phẩy thập phân, không viết mm hay g.',
  '- "tip" là một lưu ý ngắn khi thật sự cần (hàng dễ vỡ, không được đè lên, cách gấp quần áo gọn); không cần thì để chuỗi rỗng "".',
  '- "summary" là 1–2 câu tổng quan: dùng thùng nào, bao nhiêu món, lưu ý chung trước khi dán thùng.',
  '- Nếu "materials" không rỗng thì "summary" phải liệt kê đúng tên và số lượng từng vật tư chèn cần chuẩn bị (góc xốp, tấm ngăn, gối hơi, tem...) theo dữ liệu; không tự thêm vật tư khác.',
].join('\n');

/** Đặt CUỐI để khuôn JSON luôn thắng phần văn phong do người dùng viết. */
export const GUIDE_PROMPT_CORE_TAIL =
  'Chỉ trả về JSON dạng {"summary": string, "steps": [{"step": number, "instruction": string, "tip": string}]}, không kèm chữ nào khác.';

/** System prompt gửi model = lõi + văn phong + khuôn JSON. */
export function buildGuideSystemPrompt(style: string = DEFAULT_GUIDE_STYLE_PROMPT): string {
  return [GUIDE_PROMPT_CORE_HEAD, style, GUIDE_PROMPT_CORE_TAIL].join('\n');
}

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

type Attempt =
  | { ok: true; guide: GuideText; raw: string }
  | { ok: false; reason: 'ai_error' | 'ai_invalid_output'; raw: string | null };

/** JSON dữ kiện của 1 kiện — dùng cho cả kiện thật lẫn ví dụ mẫu (cùng khuôn). */
function payloadOf(
  box: { code: string; name: string; inner_mm: BoxSpec['inner'] },
  fillRatio: number | null,
  materials: GuideMaterial[],
  facts: GuideStepFacts[],
): string {
  return JSON.stringify({ box, fill_ratio: fillRatio, materials, steps: facts });
}

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

  constructor(private readonly aiSettings: AiSettingsService) {}

  async writeGuide(input: PackingGuideInput): Promise<PackingGuideResult> {
    const started = Date.now();
    const examples = (input.examples ?? []).slice(0, MAX_GUIDE_EXAMPLES);
    const systemPrompt = buildGuideSystemPrompt(input.style_prompt);
    const userPayload = payloadOf(
      { code: input.box.code, name: input.box.name, inner_mm: input.box.inner },
      input.fill_ratio,
      input.materials,
      input.facts,
    );
    const trace = (raw: string | null, used: number): GuideTrace => ({
      system_prompt: systemPrompt,
      user_payload: userPayload,
      raw_response: raw,
      examples_used: used,
      latency_ms: Date.now() - started,
    });
    const template = buildTemplateGuide(input.facts, input.box, input.fill_ratio, input.materials);
    if (input.box.kind === 'mailer') {
      return { ...template, source: 'template', model: null, fallback_reason: 'mailer_template', trace: trace(null, 0) };
    }
    const provider = await this.aiSettings.getProvider();
    if (!provider) {
      return { ...template, source: 'template', model: null, fallback_reason: 'no_api_key', trace: trace(null, 0) };
    }

    const attempt = await this.tryProvider(provider, input, systemPrompt, userPayload, examples);
    if (attempt.ok) {
      return {
        ...attempt.guide,
        summary: `${attempt.guide.summary}${cutBoxNote(input.box)}`,
        source: 'ai',
        model: `${provider.name}/${provider.model}`,
        fallback_reason: null,
        trace: trace(attempt.raw, examples.length),
      };
    }
    return { ...template, source: 'template', model: null, fallback_reason: attempt.reason, trace: trace(attempt.raw, examples.length) };
  }

  private async tryProvider(
    provider: AiProviderConfig,
    input: PackingGuideInput,
    systemPrompt: string,
    userPayload: string,
    examples: GuideExample[],
  ): Promise<Attempt> {
    let raw: string;
    try {
      raw = await this.callProvider(provider, systemPrompt, userPayload, examples);
    } catch (error: unknown) {
      this.logger.warn(`AI "${provider.name}" lỗi khi viết hướng dẫn đóng gói: ${describeError(error)}`);
      return { ok: false, reason: 'ai_error', raw: null };
    }
    let parsed: unknown;
    try {
      parsed = parseContent(raw);
    } catch {
      return { ok: false, reason: 'ai_invalid_output', raw };
    }
    const guide = parseGuide(parsed, input.facts);
    if (!guide) {
      this.logger.warn(`AI "${provider.name}" trả hướng dẫn sai số bước/thứ tự/SKU — bỏ qua.`);
      return { ok: false, reason: 'ai_invalid_output', raw };
    }
    return { ok: true, guide, raw };
  }

  /** Gọi model, trả NỘI DUNG THÔ (chuỗi) để vừa kiểm tra vừa lưu truy vết. */
  private async callProvider(
    provider: AiProviderConfig,
    systemPrompt: string,
    userPayload: string,
    examples: GuideExample[],
  ): Promise<string> {
    // Few-shot: mỗi ví dụ = 1 cặp (dữ kiện → hướng dẫn đã được chấm tốt), đặt TRƯỚC kiện thật.
    const shots = examples.flatMap((e) => [
      { role: 'user', content: e.user_payload },
      { role: 'assistant', content: JSON.stringify(e.guide) },
    ]);
    const body = {
      model: provider.model,
      temperature: 0.3,
      messages: [{ role: 'system', content: systemPrompt }, ...shots, { role: 'user', content: userPayload }],
    };
    const post = async (responseFormat: object): Promise<string> => {
      const response = await axios.post<unknown>(
        `${provider.baseUrl}/chat/completions`,
        { ...body, response_format: responseFormat },
        { headers: { Authorization: `Bearer ${provider.apiKey}` }, timeout: provider.timeoutMs },
      );
      return extractRawContent(response.data);
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

/** Chuỗi `choices[0].message.content` của phản hồi Chat Completions. */
export function extractRawContent(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.choices)) throw new Error('Response AI thiếu choices.');
  const first: unknown = data.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) throw new Error('Response AI thiếu message.');
  const content = first.message.content;
  if (typeof content !== 'string') throw new Error('AI không trả nội dung (có thể đã từ chối).');
  return content;
}

/** Đọc JSON trong nội dung; chịu được khối ```json bao quanh. */
export function parseContent(content: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  return JSON.parse(fenced?.[1] ?? content) as unknown;
}

/** Lấy JSON trong `choices[0].message.content`; chịu được khối ```json bao quanh. */
export function extractContent(data: unknown): unknown {
  return parseContent(extractRawContent(data));
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
