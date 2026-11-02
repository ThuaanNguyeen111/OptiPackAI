import axios, { AxiosError, AxiosHeaders } from 'axios';
import {
  CONSOLIDATION_RULE_SUGGESTIONS,
  ConsolidationRuleAiService,
  parseRuleTranslation,
} from './consolidation-rule-ai.service';
import { AppException } from '../../common/exceptions/app-exception';
import { ORD_ERROR_CODES } from './orders.errors';
import { validateConsolidationRule } from './utils/consolidation-rule.util';

//!=============================================
// 31/10/2026 — AI dịch câu chữ → quy tắc gộp đơn (chỉ dịch, BE tự kiểm lại).
//!=============================================

const TEXT = 'Gộp đơn cùng SĐT và cùng phường, khác tên vẫn gộp';

function ai(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    supported: true,
    name: 'Cùng SĐT + phường',
    fields: [{ field: 'phone', match: 'normalized' }, { field: 'ward_name', match: 'normalized' }],
    platforms: [],
    max_window_hours: 0,
    unsupported_reasons: [],
    ...overrides,
  };
}

describe('parseRuleTranslation', () => {
  it('kết quả hợp lệ → quy tắc nháp, giữ câu gốc, 0 giờ = dùng giới hạn chung, cảnh báo Lazada bị che', () => {
    const r = parseRuleTranslation(ai(), TEXT);
    expect(r?.rule).toEqual({
      name: 'Cùng SĐT + phường',
      source_text: TEXT,
      fields: [{ field: 'phone', match: 'normalized' }, { field: 'ward_name', match: 'normalized' }],
      platforms: [],
      max_window_hours: null,
      enabled: true,
    });
    expect(r?.warnings.some((w) => w.includes('Lazada'))).toBe(true);
  });

  it('AI báo không hỗ trợ → rule null + lý do', () => {
    const r = parseRuleTranslation(ai({ supported: false, name: '', fields: [], unsupported_reasons: ['Không gộp theo giá trị đơn.'] }), 'gộp đơn trên 500k');
    expect(r).toEqual({ rule: null, unsupported: ['Không gộp theo giá trị đơn.'], warnings: [] });
  });

  it('AI trả quy tắc quá rộng (chỉ cùng tỉnh) → BE tự chặn, coi là không hỗ trợ', () => {
    const r = parseRuleTranslation(ai({ fields: [{ field: 'province_name', match: 'normalized' }] }), 'gộp đơn cùng tỉnh');
    expect(r?.rule).toBeNull();
    expect(r?.unsupported.join(' ')).toContain('Số điện thoại hoặc Địa chỉ');
  });

  it('SĐT luôn so khớp normalized dù AI ghi exact; trường trùng bị gộp lại', () => {
    const r = parseRuleTranslation(ai({ fields: [{ field: 'phone', match: 'exact' }, { field: 'phone', match: 'normalized' }, { field: 'address_line1', match: 'exact' }] }), TEXT);
    expect(r?.rule?.fields).toEqual([{ field: 'phone', match: 'normalized' }, { field: 'address_line1', match: 'exact' }]);
  });

  it('chỉ cùng SĐT, không giới hạn thời gian → cảnh báo nên đặt giới hạn', () => {
    const r = parseRuleTranslation(ai({ fields: [{ field: 'phone', match: 'normalized' }] }), 'cùng SĐT là gộp');
    expect(r?.warnings.some((w) => w.includes('giới hạn thời gian'))).toBe(true);
  });

  it('giới hạn thời gian > 720 → cắt về 720', () => {
    expect(parseRuleTranslation(ai({ max_window_hours: 9999 }), TEXT)?.rule?.max_window_hours).toBe(720);
  });

  it.each<[string, unknown]>([
    ['không phải object', 'xin chào'],
    ['thiếu supported', { ...ai(), supported: undefined }],
    ['trường lạ', ai({ fields: [{ field: 'sku', match: 'normalized' }] })],
    ['sàn lạ', ai({ platforms: ['shopee'] })],
    ['giờ âm', ai({ max_window_hours: -1 })],
  ])('sai định dạng → null: %s', (_label, raw) => {
    expect(parseRuleTranslation(raw, TEXT)).toBeNull();
  });
});

describe('CONSOLIDATION_RULE_SUGGESTIONS', () => {
  it('mọi quy tắc mẫu đều qua giới hạn an toàn', () => {
    for (const s of CONSOLIDATION_RULE_SUGGESTIONS) {
      expect(validateConsolidationRule({ id: 'x', name: s.name, sourceText: s.source_text, fields: s.fields, platforms: s.platforms, maxWindowHours: s.max_window_hours, enabled: true })).toEqual([]);
    }
  });
});

describe('ConsolidationRuleAiService.translate', () => {
  const provider = { name: 'groq', apiKey: 'k', baseUrl: 'https://ai.test', model: 'm', timeoutMs: 1000 };
  const reply = (content: unknown): { data: unknown } => ({ data: { choices: [{ message: { content: JSON.stringify(content) } }] } });
  const make = (p: typeof provider | null): ConsolidationRuleAiService =>
    new ConsolidationRuleAiService({ get: () => p } as never);

  async function failure(promise: Promise<unknown>): Promise<{ code: string; reason: unknown; suggestions: unknown }> {
    try {
      await promise;
    } catch (e) {
      if (!(e instanceof AppException)) throw e;
      const res = e.getResponse() as { error_code: string; details: { reason: unknown; suggestions: unknown } };
      expect(e.getStatus()).toBe(503);
      return { code: res.error_code, reason: res.details.reason, suggestions: res.details.suggestions };
    }
    throw new Error('không ném lỗi');
  }

  afterEach(() => { jest.restoreAllMocks(); });

  it('chỉ gửi câu chữ của Admin lên AI', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue(reply(ai()));
    const r = await make(provider).translate(`  ${TEXT}  `);
    expect(r).toMatchObject({ source: 'ai', model: 'groq/m', unsupported: [] });
    const [, body] = post.mock.calls[0] as [string, { messages: { role: string; content: string }[] }];
    expect(body.messages[1]).toEqual({ role: 'user', content: TEXT });
  });

  it('json_schema bị 400 → thử lại json_object', async () => {
    const bad = new AxiosError('bad', 'ERR_BAD_REQUEST', undefined, undefined, { status: 400, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: {} });
    const post = jest.spyOn(axios, 'post').mockRejectedValueOnce(bad).mockResolvedValueOnce(reply(ai()));
    await make(provider).translate(TEXT);
    expect(post).toHaveBeenCalledTimes(2);
    const [, retryBody] = post.mock.calls[1] as [string, { response_format: { type: string } }];
    expect(retryBody.response_format.type).toBe('json_object');
  });

  it('thiếu key → 503 no_api_key kèm quy tắc mẫu, không gọi mạng', async () => {
    const post = jest.spyOn(axios, 'post');
    const f = await failure(make(null).translate(TEXT));
    expect(f).toEqual({ code: ORD_ERROR_CODES.CONSOLIDATION_RULE_AI_UNAVAILABLE, reason: 'no_api_key', suggestions: CONSOLIDATION_RULE_SUGGESTIONS });
    expect(post).not.toHaveBeenCalled();
  });

  it('lỗi mạng → 503 ai_error; trả sai định dạng → 503 ai_invalid_output', async () => {
    const service = make(provider);
    jest.spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(axios, 'post').mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(reply({ hello: 1 }));
    expect((await failure(service.translate(TEXT))).reason).toBe('ai_error');
    expect((await failure(service.translate(TEXT))).reason).toBe('ai_invalid_output');
  });
});
