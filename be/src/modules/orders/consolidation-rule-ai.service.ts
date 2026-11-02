import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { AiProviderConfig } from '../../config/ai.config';
import { AppException } from '../../common/exceptions/app-exception';
import { ORD_ERROR_CODES } from './orders.errors';
import {
  CONSOLIDATION_RULE_FIELDS,
  CONSOLIDATION_RULE_MATCHES,
  SYNC_PLATFORMS,
} from './order-sync-policy';
import type { ConsolidationRuleField, ConsolidationRuleMatch } from './order-sync-policy';
import { validateConsolidationRule } from './utils/consolidation-rule.util';

/** Quy tắc nháp, cùng dạng body của POST /order-sync-settings/rules (FE gửi thẳng lên sau khi Admin xác nhận). */
export interface ConsolidationRuleDraft {
  name: string;
  source_text: string | null;
  fields: { field: ConsolidationRuleField; match: ConsolidationRuleMatch }[];
  platforms: string[];
  max_window_hours: number | null;
  enabled: boolean;
}

export interface ConsolidationRuleTranslation {
  source: 'ai';
  model: string;
  /** null khi yêu cầu không làm được — xem `unsupported`. */
  rule: ConsolidationRuleDraft | null;
  unsupported: string[];
  /** Lưu ý cho Admin (VD đơn Lazada bị che tỉnh/quận nên quy tắc ít tác dụng với Lazada). */
  warnings: string[];
}

export type RuleAiFallbackReason = 'no_api_key' | 'ai_error' | 'ai_invalid_output';

/** Quy tắc mẫu dựng sẵn — trả kèm lỗi 503 để Admin chọn hoặc dùng form khi AI không dùng được. */
export const CONSOLIDATION_RULE_SUGGESTIONS: ConsolidationRuleDraft[] = [
  {
    name: 'Cùng SĐT + địa chỉ chi tiết (khác tên vẫn gộp)',
    source_text: null,
    fields: [{ field: 'phone', match: 'normalized' }, { field: 'address_line1', match: 'normalized' }],
    platforms: [],
    max_window_hours: null,
    enabled: true,
  },
  {
    name: 'Cùng SĐT + cùng phường',
    source_text: null,
    fields: [{ field: 'phone', match: 'normalized' }, { field: 'ward_name', match: 'normalized' }],
    platforms: [],
    max_window_hours: null,
    enabled: true,
  },
  {
    name: 'Chỉ cùng SĐT, đặt trong 6 giờ',
    source_text: null,
    fields: [{ field: 'phone', match: 'normalized' }],
    platforms: [],
    max_window_hours: 6,
    enabled: true,
  },
  {
    name: 'Cùng địa chỉ chi tiết + tên người nhận (khác SĐT vẫn gộp)',
    source_text: null,
    fields: [{ field: 'address_line1', match: 'normalized' }, { field: 'full_name', match: 'normalized' }],
    platforms: [],
    max_window_hours: null,
    enabled: true,
  },
];

const SYSTEM_PROMPT = [
  'Bạn chuyển câu mô tả tiếng Việt của quản trị viên một shop thời trang thành 1 QUY TẮC GỘP ĐƠN dạng JSON.',
  'Hệ thống sẽ gộp 2 đơn (luôn cùng sàn, cùng shop) khi TẤT CẢ các trường của quy tắc trùng nhau. Bạn chỉ dịch câu chữ; bạn không thấy và không quyết định đơn cụ thể nào.',
  'Các trường được phép ("field"):',
  '- "phone": số điện thoại người nhận',
  '- "full_name": tên người nhận',
  '- "address_line1": địa chỉ chi tiết (số nhà, tên đường)',
  '- "city": thành phố theo sàn',
  '- "province_name": tỉnh/thành',
  '- "district_name": quận/huyện',
  '- "ward_name": phường/xã',
  'Cách so khớp ("match"): "normalized" (bỏ dấu, không phân biệt hoa thường — mặc định) hoặc "exact" (chỉ khi câu nói rõ phải giống hệt từng chữ). Số điện thoại luôn dùng "normalized".',
  'Quy tắc bắt buộc:',
  '- Câu nói "khác X vẫn gộp" nghĩa là KHÔNG đưa X vào "fields".',
  '- "fields" phải có "phone" hoặc "address_line1". Nếu câu chỉ dựa vào tên/tỉnh/quận/phường thì đặt "supported": false và giải thích là dễ gộp nhầm người khác.',
  '- "platforms": [] nghĩa là mọi sàn; chỉ ghi "lazada" hoặc "aurelle" khi câu nói rõ sàn.',
  '- "max_window_hours": số giờ nguyên 1–720 nếu câu giới hạn thời gian đặt đơn (VD "trong 6 giờ", "trong ngày" = 24); không nói thì 0.',
  '- Không làm được (đặt "supported": false, ghi lý do ngắn bằng tiếng Việt vào "unsupported_reasons"): gộp theo giá trị đơn, theo sản phẩm/SKU, theo phương thức thanh toán, gộp đơn khác sàn hoặc khác shop, so khớp gần đúng/mờ kiểu "địa chỉ gần giống", hoặc bất kỳ trường nào ngoài danh sách trên.',
  '- "name": tên ngắn ≤ 60 ký tự mô tả quy tắc, tiếng Việt.',
  '- Khi "supported": false thì "fields" là [] và "name" là "".',
  'Chỉ trả về JSON {"supported": boolean, "name": string, "fields": [{"field": string, "match": string}], "platforms": [string], "max_window_hours": integer, "unsupported_reasons": [string]}, không kèm chữ nào khác.',
].join('\n');

// Không dùng kiểu hợp (null) để tương thích nhiều model; max_window_hours = 0 nghĩa là không giới hạn riêng.
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['supported', 'name', 'fields', 'platforms', 'max_window_hours', 'unsupported_reasons'],
  properties: {
    supported: { type: 'boolean' },
    name: { type: 'string' },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'match'],
        properties: {
          field: { type: 'string', enum: [...CONSOLIDATION_RULE_FIELDS] },
          match: { type: 'string', enum: [...CONSOLIDATION_RULE_MATCHES] },
        },
      },
    },
    platforms: { type: 'array', items: { type: 'string', enum: [...SYNC_PLATFORMS] } },
    max_window_hours: { type: 'integer' },
    unsupported_reasons: { type: 'array', items: { type: 'string' } },
  },
} as const;

const GEO_FIELDS: readonly string[] = ['province_name', 'district_name', 'ward_name'];

/**
 * ===================================================================
 * Dịch câu chữ của Admin thành quy tắc gộp đơn (31/10/2026)
 * ===================================================================
 * Cùng khuôn PackingGuideAiService: Groq (`ai.provider`), JSON schema chặt,
 * HTTP 400 → thử lại `json_object`, BE luôn tự kiểm kết quả bằng đúng hàm
 * `validateConsolidationRule` của form. CHỈ gửi câu chữ — không gửi dữ liệu
 * đơn/khách. AI không bao giờ quyết định đơn nào gộp với đơn nào: lúc đồng bộ
 * hệ thống áp quy tắc đã lưu, không gọi AI.
 * Thiếu key / AI lỗi / trả sai → 503 kèm quy tắc mẫu để Admin dùng form.
 * ===================================================================
 */
@Injectable()
export class ConsolidationRuleAiService {
  private readonly logger = new Logger(ConsolidationRuleAiService.name);

  constructor(private readonly configService: ConfigService) {}

  async translate(text: string): Promise<ConsolidationRuleTranslation> {
    const sourceText = text.trim();
    const provider = this.configService.get<AiProviderConfig | null>('ai.provider', null);
    if (!provider) throw unavailable('no_api_key');

    let raw: unknown;
    try {
      raw = await this.callProvider(provider, sourceText);
    } catch (error: unknown) {
      this.logger.warn(`AI "${provider.name}" lỗi khi dịch quy tắc gộp đơn: ${describeError(error)}`);
      throw unavailable('ai_error');
    }
    const parsed = parseRuleTranslation(raw, sourceText);
    if (!parsed) {
      this.logger.warn(`AI "${provider.name}" trả quy tắc gộp đơn sai định dạng — bỏ qua.`);
      throw unavailable('ai_invalid_output');
    }
    return { source: 'ai', model: `${provider.name}/${provider.model}`, ...parsed };
  }

  private async callProvider(provider: AiProviderConfig, text: string): Promise<unknown> {
    const body = {
      model: provider.model,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
    };
    const post = async (responseFormat: object): Promise<unknown> => {
      const response = await axios.post<unknown>(
        `${provider.baseUrl}/chat/completions`,
        { ...body, response_format: responseFormat },
        { headers: { Authorization: `Bearer ${provider.apiKey}` }, timeout: provider.timeoutMs },
      );
      return extractJsonContent(response.data);
    };
    try {
      return await post({ type: 'json_schema', json_schema: { name: 'consolidation_rule', strict: true, schema: RESPONSE_SCHEMA } });
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        return post({ type: 'json_object' });
      }
      throw error;
    }
  }
}

function unavailable(reason: RuleAiFallbackReason): AppException {
  const message =
    reason === 'no_api_key'
      ? 'Chưa cấu hình AI — hãy dựng quy tắc bằng form hoặc chọn 1 quy tắc mẫu.'
      : 'AI tạm thời không dịch được câu này — hãy dựng quy tắc bằng form hoặc chọn 1 quy tắc mẫu.';
  return new AppException(ORD_ERROR_CODES.CONSOLIDATION_RULE_AI_UNAVAILABLE, message, HttpStatus.SERVICE_UNAVAILABLE, {
    reason,
    suggestions: CONSOLIDATION_RULE_SUGGESTIONS,
  });
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
export function extractJsonContent(data: unknown): unknown {
  if (!isRecord(data) || !Array.isArray(data.choices)) throw new Error('Response AI thiếu choices.');
  const first: unknown = data.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) throw new Error('Response AI thiếu message.');
  const content = first.message.content;
  if (typeof content !== 'string') throw new Error('AI không trả nội dung (có thể đã từ chối).');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
  return JSON.parse(fenced?.[1] ?? content) as unknown;
}

function isIn<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/**
 * Kiểm output AI. Sai định dạng → null (503). Đúng định dạng nhưng vi phạm giới hạn an
 * toàn (VD chỉ cùng tỉnh) → coi là "không hỗ trợ", trả lý do từ validateConsolidationRule.
 */
export function parseRuleTranslation(raw: unknown, sourceText: string): Omit<ConsolidationRuleTranslation, 'source' | 'model'> | null {
  if (!isRecord(raw) || typeof raw.supported !== 'boolean' || !Array.isArray(raw.unsupported_reasons)) return null;
  const reasons = raw.unsupported_reasons
    .filter((r): r is string => typeof r === 'string')
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
    .slice(0, 5);
  if (!raw.supported) {
    return { rule: null, unsupported: reasons.length > 0 ? reasons : ['Yêu cầu này chưa được hỗ trợ.'], warnings: [] };
  }

  if (typeof raw.name !== 'string' || !Array.isArray(raw.fields) || !Array.isArray(raw.platforms)) return null;
  const fields: ConsolidationRuleDraft['fields'] = [];
  for (const f of raw.fields) {
    if (!isRecord(f) || !isIn(CONSOLIDATION_RULE_FIELDS, f.field) || !isIn(CONSOLIDATION_RULE_MATCHES, f.match)) return null;
    if (!fields.some((x) => x.field === f.field)) fields.push({ field: f.field, match: f.field === 'phone' ? 'normalized' : f.match });
  }
  const platforms: string[] = [];
  for (const p of raw.platforms) {
    if (!isIn(SYNC_PLATFORMS, p)) return null;
    if (!platforms.includes(p)) platforms.push(p);
  }
  const hours = Number(raw.max_window_hours);
  if (!Number.isInteger(hours) || hours < 0) return null;

  const name = raw.name.trim().slice(0, 80) || 'Quy tắc gộp đơn';
  const rule: ConsolidationRuleDraft = {
    name,
    source_text: sourceText.slice(0, 500),
    fields,
    platforms,
    max_window_hours: hours === 0 ? null : Math.min(hours, 720),
    enabled: true,
  };
  const errors = validateConsolidationRule({
    id: 'draft',
    name: rule.name,
    sourceText: rule.source_text,
    fields: rule.fields,
    platforms: rule.platforms,
    maxWindowHours: rule.max_window_hours,
    enabled: true,
  });
  if (errors.length > 0) return { rule: null, unsupported: errors, warnings: [] };

  const warnings: string[] = [];
  if (fields.some((f) => GEO_FIELDS.includes(f.field)) && (platforms.length === 0 || platforms.includes('lazada'))) {
    warnings.push('Đơn Lazada thường bị che tỉnh/quận (và đôi khi phường) — quy tắc này sẽ bỏ qua phần lớn đơn Lazada.');
  }
  if (fields.length === 1 && fields[0]?.field === 'phone' && rule.max_window_hours === null) {
    warnings.push('Chỉ dựa vào SĐT, không giới hạn thời gian: 2 đơn cùng số giao tới 2 địa chỉ khác nhau cũng bị gộp. Nên đặt giới hạn thời gian.');
  }
  return { rule, unsupported: [], warnings };
}
