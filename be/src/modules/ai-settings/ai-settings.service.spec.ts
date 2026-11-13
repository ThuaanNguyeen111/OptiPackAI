import axios from 'axios';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { AiSettingsService, parseModelIds } from './ai-settings.service';


const ENV_PROVIDER = { name: 'groq', apiKey: 'env-key', baseUrl: 'https://env.test/v1', model: 'env-model', timeoutMs: 20000 };

describe('AiSettingsService', () => {
  let stored: Record<string, unknown> | null;
  let service: AiSettingsService;
  let activity: { create: jest.Mock };
  let userPasswordHash: string | undefined;
  const actor = new Types.ObjectId().toHexString();

  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    userPasswordHash = bcrypt.hashSync('dung-mat-khau', 4);
  });

  function make(envProvider: typeof ENV_PROVIDER | null = ENV_PROVIDER): AiSettingsService {
    const config = {
      get: (key: string): unknown => (key === 'ai.provider' ? envProvider : key === 'ai.visionModel' ? 'env-vision' : undefined),
    };
    const model = {
      findOne: () => ({ select: () => ({ lean: () => Promise.resolve(stored) }) }),
      updateOne: jest.fn((_f: unknown, update: { $set: Record<string, unknown> }) => {
        stored = { ...(stored ?? {}), ...update.$set, updatedAt: new Date() };
        return Promise.resolve({});
      }),
    };
    activity = { create: jest.fn().mockResolvedValue({}) };
    const users = {
      findById: () => ({ select: () => ({ lean: () => Promise.resolve({ password: userPasswordHash }) }) }),
    };
    return new AiSettingsService(config as never, model as never, activity as never, users as never);
  }

  beforeEach(() => {
    stored = null;
    service = make();
  });

  it('dùng .env khi chưa lưu gì trên web', async () => {
    expect(await service.getProvider()).toEqual(ENV_PROVIDER);
    expect(await service.getVisionModel()).toBe('env-vision');
    const view = await service.view();
    expect(view.source).toBe('env');
    expect(view.hasApiKey).toBe(true);
    expect(view.apiKeyLast4).toBeNull();
  });

  it('không có gì cả → AI tắt', async () => {
    service = make(null);
    expect(await service.getProvider()).toBeNull();
    expect((await service.view()).source).toBe('none');
  });

  it('lưu key trên web: mã hoá khi lưu, chỉ trả 4 ký tự cuối, và ghi đè .env', async () => {
    const view = await service.update({ provider: 'openai', api_key: 'sk-test-1234' }, actor);
    expect(stored?.api_key_enc).not.toContain('sk-test');
    expect(view).toMatchObject({ source: 'db', provider: 'openai', apiKeyLast4: '1234', hasApiKey: true });
    expect(view.baseUrl).toBe('https://api.openai.com/v1');
    expect(view.model).toBe('gpt-4.1-mini');
    expect(JSON.stringify(view)).not.toContain('sk-test');
    expect(await service.getProvider()).toMatchObject({ name: 'openai', apiKey: 'sk-test-1234', model: 'gpt-4.1-mini' });
    expect(await service.getVisionModel()).toBe('gpt-4.1-mini');
  });

  it('không gửi api_key thì giữ key cũ; đổi model giữ nguyên nhà cung cấp', async () => {
    await service.update({ provider: 'gemini', api_key: 'gem-key-9999' }, actor);
    const view = await service.update({ model: 'gemini-2.5-pro', vision_model: 'gemini-2.5-flash' }, actor);
    expect(view).toMatchObject({ provider: 'gemini', model: 'gemini-2.5-pro', visionModel: 'gemini-2.5-flash', apiKeyLast4: '9999' });
  });

  it('xoá key (null) → quay về .env', async () => {
    await service.update({ provider: 'openai', api_key: 'sk-x-0000' }, actor);
    const view = await service.update({ api_key: null }, actor);
    expect(view.source).toBe('env');
    expect(await service.getProvider()).toEqual(ENV_PROVIDER);
  });

  it('nhà cung cấp tự nhập bắt buộc có URL', async () => {
    await expect(service.update({ provider: 'custom', model: 'm' }, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ error_code: 'AI_BASE_URL_REQUIRED' }) as unknown,
    });
  });

  it('kiểm tra kết nối: dùng key đang nhập, trả danh sách model và báo model có tồn tại', async () => {
    const get = jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: { data: [{ id: 'models/b' }, { id: 'a' }] } });
    const result = await service.test({ provider: 'gemini', api_key: 'typed', model: 'b' });
    expect(get).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/openai/models',
      expect.objectContaining({ headers: { Authorization: 'Bearer typed' } }),
    );
    expect(result).toMatchObject({ ok: true, models: ['a', 'b'], modelFound: true, error: null });
  });

  it('kiểm tra kết nối thất bại không ném lỗi, trả lý do dễ hiểu', async () => {
    const err = Object.assign(new Error('401'), { isAxiosError: true, response: { status: 401 } });
    jest.spyOn(axios, 'get').mockRejectedValueOnce(err);
    const result = await service.test({});
    expect(result).toMatchObject({ ok: false, error: 'API key sai hoặc không có quyền.' });
  });
});

describe('AiSettingsService.revealKey', () => {
  const actor = new Types.ObjectId().toHexString();
  const hash = bcrypt.hashSync('dung-mat-khau', 4);

  function make(password: string | undefined, stored: Record<string, unknown> | null): { service: AiSettingsService; logs: jest.Mock } {
    process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    const config = { get: (key: string): unknown => (key === 'ai.provider' ? ENV_PROVIDER : undefined) };
    const model = { findOne: () => ({ select: () => ({ lean: () => Promise.resolve(stored) }) }) };
    const logs = jest.fn().mockResolvedValue({});
    const users = { findById: () => ({ select: () => ({ lean: () => Promise.resolve({ password }) }) }) };
    return { service: new AiSettingsService(config as never, model as never, { create: logs } as never, users as never), logs };
  }

  it('sai mật khẩu → 400 và vẫn ghi log lần thử', async () => {
    const { service, logs } = make(hash, null);
    await expect(service.revealKey({ password: 'sai' }, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ error_code: 'AI_REVEAL_PASSWORD_INVALID' }) as unknown,
    });
    expect(logs).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logs.mock.calls)).toContain('ai_settings.key_reveal_failed');
  });

  it('đúng mật khẩu → trả key .env, log chỉ ghi 4 ký tự cuối', async () => {
    const { service, logs } = make(hash, null);
    await expect(service.revealKey({ password: 'dung-mat-khau' }, actor)).resolves.toEqual({ apiKey: 'env-key', source: 'env' });
    const logged = JSON.stringify(logs.mock.calls);
    expect(logged).toContain('ai_settings.key_revealed');
    expect(logged).toContain('••••-key');
    expect(logged).not.toContain('env-key');
  });

  it('key lưu trên web được ưu tiên hơn .env', async () => {
    const { encryptToken } = jest.requireActual<typeof import('../marketplace-integration/common/utils/token-encryption.util')>(
      '../marketplace-integration/common/utils/token-encryption.util',
    );
    process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    const { service } = make(hash, { api_key_enc: encryptToken('sk-web-7777') });
    await expect(service.revealKey({ password: 'dung-mat-khau' }, actor)).resolves.toEqual({ apiKey: 'sk-web-7777', source: 'db' });
  });

  it('tài khoản Google chưa có mật khẩu → báo đặt mật khẩu trước', async () => {
    const { service } = make(undefined, null);
    await expect(service.revealKey({ password: 'x' }, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ error_code: 'AI_REVEAL_PASSWORD_NOT_SET' }) as unknown,
    });
  });
});

describe('parseModelIds', () => {
  it('bỏ trùng, bỏ tiền tố models/, sắp xếp; body lạ → rỗng', () => {
    expect(parseModelIds({ data: [{ id: 'z' }, { id: 'models/a' }, { id: 'z' }, { foo: 1 }] })).toEqual(['a', 'z']);
    expect(parseModelIds(null)).toEqual([]);
    expect(parseModelIds({ data: 'x' })).toEqual([]);
  });
});
