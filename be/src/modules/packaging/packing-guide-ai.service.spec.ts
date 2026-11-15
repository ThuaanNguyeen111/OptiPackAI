import axios from 'axios';
import {
  DEFAULT_GUIDE_STYLE_PROMPT,
  PackingGuideAiService,
  buildGuideSystemPrompt,
  extractContent,
  parseGuide,
} from './packing-guide-ai.service';
import type { AiProviderConfig } from '../../config/ai.config';
import type { BoxSpec, GuideStepFacts } from './engine';

jest.mock('axios');
const mockedAxios = jest.mocked(axios);

const box: BoxSpec = {
  code: 'BOX-M',
  name: 'Thùng M',
  inner: { length_mm: 600, width_mm: 300, height_mm: 300 },
  outer: { length_mm: 610, width_mm: 310, height_mm: 310 },
  tare_g: 0,
  max_load_g: 0,
  price_vnd: null,
};

function fact(step: number, sku: string): GuideStepFacts {
  return {
    step,
    item_key: `${sku}#1`,
    sku,
    product_type: null,
    zip_bag: null,
    folded_in_half: false,
    is_fragile: false,
    no_stack_on_top: false,
    position: 'góc trái – phía trước',
    orientation_hint: 'để nguyên chiều như trên kệ, mặt trên hướng lên',
    rests_on: [],
    size_mm: { dx: 300, dy: 200, dz: 120 },
  };
}

const facts = [fact(1, 'GIAY-42'), fact(2, 'AO-M')];
const input = { box, facts, fill_ratio: 0.4, materials: [] };

const groq: AiProviderConfig = {
  name: 'groq',
  apiKey: 'gsk-test',
  baseUrl: 'https://api.groq.test/openai/v1',
  model: 'llama-test',
  timeoutMs: 1000,
};

function makeService(provider: AiProviderConfig | null): PackingGuideAiService {
  return new PackingGuideAiService({ getProvider: () => Promise.resolve(provider) } as never);
}

function reply(content: unknown): { data: unknown } {
  return { data: { choices: [{ message: { content: JSON.stringify(content) } }] } };
}

function httpError(status: number): Error & { response: { status: number } } {
  return Object.assign(new Error(`Request failed with status code ${String(status)}`), { response: { status } });
}

const aiStep1 = { step: 1, instruction: 'Đặt hộp GIAY-42 sát đáy, góc trái phía trước.', tip: '' };
const aiStep2 = { step: 2, instruction: 'Gấp áo AO-M làm ba, đặt cạnh hộp giày.', tip: 'Vuốt phẳng áo.' };
const validAiGuide = { summary: 'Dùng thùng BOX-M cho 2 món.', steps: [aiStep1, aiStep2] };

describe('PackingGuideAiService.writeGuide', () => {
  beforeEach(() => {
    mockedAxios.post.mockReset();
    mockedAxios.isAxiosError.mockImplementation((e: unknown) => e instanceof Error && 'response' in e);
  });

  it('chưa có AI_API_KEY -> câu mẫu, không gọi mạng', async () => {
    const result = await makeService(null).writeGuide(input);
    expect(mockedAxios.post.mock.calls).toHaveLength(0);
    expect(result).toMatchObject({ source: 'template', fallback_reason: 'no_api_key' });
    expect(result.steps).toHaveLength(2);
  });

  it('Groq trả đúng -> dùng lời của AI, gửi key qua header, dùng structured output', async () => {
    mockedAxios.post.mockResolvedValueOnce(reply(validAiGuide));
    const result = await makeService(groq).writeGuide(input);
    expect(result).toMatchObject({ source: 'ai', model: 'groq/llama-test', fallback_reason: null });
    expect(result.steps[0]?.tip).toBeNull();
    expect(result.steps[1]?.tip).toBe('Vuốt phẳng áo.');
    const call = mockedAxios.post.mock.calls[0];
    expect(call?.[0]).toBe('https://api.groq.test/openai/v1/chat/completions');
    expect(call?.[1]).toMatchObject({ model: 'llama-test', response_format: { type: 'json_schema' } });
    expect(call?.[2]).toMatchObject({ headers: { Authorization: 'Bearer gsk-test' } });
  });

  it('lỗi mạng/timeout -> câu mẫu, không ném lỗi', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('timeout of 1000ms exceeded'));
    const result = await makeService(groq).writeGuide(input);
    expect(result).toMatchObject({ source: 'template', fallback_reason: 'ai_error' });
  });

  it('AI trả sai số bước -> câu mẫu', async () => {
    mockedAxios.post.mockResolvedValueOnce(reply({ ...validAiGuide, steps: [aiStep1] }));
    const result = await makeService(groq).writeGuide(input);
    expect(result).toMatchObject({ source: 'template', fallback_reason: 'ai_invalid_output' });
  });

  it('05/11/2026 — ví dụ mẫu đã được nhân viên chấm tốt gửi kèm dạng few-shot TRƯỚC dữ liệu kiện thật', async () => {
    mockedAxios.post.mockResolvedValueOnce(reply(validAiGuide));
    const example = {
      user_payload: JSON.stringify({ box: { code: 'BOX-S' }, steps: [fact(1, 'QUAN-30')] }),
      guide: { summary: 'Dùng thùng S.', steps: [{ step: 1, instruction: 'Gấp quần QUAN-30 làm đôi rồi đặt sát đáy.', tip: '' }] },
    };
    const result = await makeService(groq).writeGuide({ ...input, examples: [example] });

    const messages = (mockedAxios.post.mock.calls[0]?.[1] as { messages: { role: string; content: string }[] }).messages;
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(messages[1]?.content).toContain('QUAN-30');
    expect(messages[2]?.content).toContain('Gấp quần QUAN-30');
    expect(messages[3]?.content).toContain('GIAY-42');
    expect(result.trace.examples_used).toBe(1);
  });

  it('05/11/2026 — trả bản ghi truy vết: system prompt, JSON dữ liệu đã gửi, phản hồi thô, model', async () => {
    mockedAxios.post.mockResolvedValueOnce(reply(validAiGuide));
    const result = await makeService(groq).writeGuide(input);
    expect(result.trace.system_prompt).toContain('Thuật toán đã quyết định sẵn thùng');
    expect(JSON.parse(result.trace.user_payload)).toMatchObject({ box: { code: 'BOX-M' }, steps: [{ sku: 'GIAY-42' }, { sku: 'AO-M' }] });
    expect(result.trace.raw_response).toContain('Dùng thùng BOX-M');
    expect(result.trace.examples_used).toBe(0);
  });

  it('09/11/2026 — văn phong tuỳ chỉnh nằm giữa phần lõi và khuôn JSON; không truyền thì dùng mặc định', async () => {
    mockedAxios.post.mockResolvedValueOnce(reply(validAiGuide));
    const custom = await makeService(groq).writeGuide({ ...input, style_prompt: '- Giọng thân thiện, xưng "bạn".' });
    const prompt = custom.trace.system_prompt;
    expect(prompt.indexOf('Mỗi câu hướng dẫn phải chứa nguyên văn mã SKU')).toBeGreaterThanOrEqual(0);
    expect(prompt.indexOf('Giọng thân thiện')).toBeGreaterThan(prompt.indexOf('nguyên văn mã SKU'));
    expect(prompt.endsWith('không kèm chữ nào khác.')).toBe(true);
    expect(prompt).not.toContain(DEFAULT_GUIDE_STYLE_PROMPT);
    const sent = (mockedAxios.post.mock.calls.at(-1)?.[1] as { messages: { role: string; content: string }[] }).messages;
    expect(sent[0]?.content).toBe(prompt);

    const fallback = await makeService(null).writeGuide(input);
    expect(fallback.trace.system_prompt).toBe(buildGuideSystemPrompt());
    expect(fallback.trace.system_prompt).toContain(DEFAULT_GUIDE_STYLE_PROMPT);
  });

  it('05/11/2026 — câu mẫu (không gọi AI) vẫn có truy vết với dữ liệu đầu vào, không có phản hồi thô', async () => {
    const result = await makeService(null).writeGuide(input);
    expect(result.trace.raw_response).toBeNull();
    expect(JSON.parse(result.trace.user_payload)).toMatchObject({ steps: [{ sku: 'GIAY-42' }, { sku: 'AO-M' }] });
  });

  it('model không nhận json_schema (400) -> thử lại 1 lần với json_object', async () => {
    mockedAxios.post.mockRejectedValueOnce(httpError(400));
    mockedAxios.post.mockResolvedValueOnce(reply(validAiGuide));
    const result = await makeService(groq).writeGuide(input);
    expect(result).toMatchObject({ source: 'ai', model: 'groq/llama-test' });
    expect(mockedAxios.post.mock.calls[1]?.[1]).toMatchObject({ response_format: { type: 'json_object' } });
  });
});

describe('extractContent', () => {
  it('đọc được JSON bị bao trong khối ```json', () => {
    const data = { choices: [{ message: { content: '```json\n{"summary":"x","steps":[]}\n```' } }] };
    expect(extractContent(data)).toEqual({ summary: 'x', steps: [] });
  });
});

describe('parseGuide', () => {
  it('từ chối khi đảo thứ tự bước', () => {
    expect(parseGuide({ ...validAiGuide, steps: [aiStep2, aiStep1] }, facts)).toBeNull();
  });

  it('từ chối khi câu hướng dẫn không nhắc đúng SKU của bước', () => {
    const wrongSku = { step: 2, instruction: 'Đặt chiếc áo lên trên.', tip: '' };
    expect(parseGuide({ ...validAiGuide, steps: [aiStep1, wrongSku] }, facts)).toBeNull();
  });
});
