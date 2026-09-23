import axios from 'axios';
import type { ConfigService } from '@nestjs/config';
import { PackingGuideAiService, extractContent, parseGuide } from './packing-guide-ai.service';
import type { AiProviderConfig } from '../../config/ai.config';
import type { BoxSpec, GuideStepFacts } from './engine';

jest.mock('axios');
const mockedAxios = jest.mocked(axios);

const box: BoxSpec = {
  code: 'SAMPLE-M',
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
const input = { box, facts, fill_ratio: 0.4, bubble_wrap_count: 0 };

const groq: AiProviderConfig = {
  name: 'groq',
  apiKey: 'gsk-test',
  baseUrl: 'https://api.groq.test/openai/v1',
  model: 'llama-test',
  timeoutMs: 1000,
};

function makeService(provider: AiProviderConfig | null): PackingGuideAiService {
  const config = { get: (key: string): unknown => (key === 'ai.provider' ? provider : undefined) };
  return new PackingGuideAiService(config as unknown as ConfigService);
}

function reply(content: unknown): { data: unknown } {
  return { data: { choices: [{ message: { content: JSON.stringify(content) } }] } };
}

function httpError(status: number): Error & { response: { status: number } } {
  return Object.assign(new Error(`Request failed with status code ${String(status)}`), { response: { status } });
}

const aiStep1 = { step: 1, instruction: 'Đặt hộp GIAY-42 sát đáy, góc trái phía trước.', tip: '' };
const aiStep2 = { step: 2, instruction: 'Gấp áo AO-M làm ba, đặt cạnh hộp giày.', tip: 'Vuốt phẳng áo.' };
const validAiGuide = { summary: 'Dùng thùng SAMPLE-M cho 2 món.', steps: [aiStep1, aiStep2] };

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
