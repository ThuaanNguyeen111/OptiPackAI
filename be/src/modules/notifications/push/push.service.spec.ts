import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { Types } from 'mongoose';
import { MAX_DEVICES_PER_USER, PushService } from './push.service';

const post = jest.spyOn(axios, 'post') as unknown as jest.Mock;

const axiosError = (status: number, data: unknown): AxiosError =>
  new AxiosError('fail', 'ERR', undefined, undefined, { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } });

describe('PushService — token thiết bị + gửi FCM', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const dir = mkdtempSync(join(tmpdir(), 'fcm-'));
  const keyFile = join(dir, 'sa.json');
  writeFileSync(keyFile, JSON.stringify({
    project_id: 'optipack-demo',
    client_email: 'push@optipack-demo.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }));

  const content = { title: 'T', body: 'B', data: { type: 'packing_assigned' }, highPriority: false };
  let deviceModel: { updateOne: jest.Mock; find: jest.Mock; deleteMany: jest.Mock; deleteOne: jest.Mock };
  let devices: { token: string }[];
  const originalEnv = process.env.FCM_SERVICE_ACCOUNT_FILE;

  beforeEach(() => {
    post.mockReset();
    devices = [];
    const query = { sort: jest.fn(), skip: jest.fn(), select: jest.fn(), lean: jest.fn(() => Promise.resolve(devices)) };
    query.sort.mockReturnValue(query);
    query.skip.mockReturnValue(query);
    query.select.mockReturnValue(query);
    deviceModel = {
      updateOne: jest.fn().mockResolvedValue({}),
      find: jest.fn(() => query),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    process.env.FCM_SERVICE_ACCOUNT_FILE = keyFile;
  });
  afterAll(() => {
    post.mockRestore();
    if (originalEnv === undefined) delete process.env.FCM_SERVICE_ACCOUNT_FILE;
    else process.env.FCM_SERVICE_ACCOUNT_FILE = originalEnv;
  });

  it('đăng ký: upsert theo token, gán cho người gọi; quá 10 máy → xoá máy cũ nhất', async () => {
    const userId = new Types.ObjectId().toString();
    devices = [{ token: 'old' }];
    await new PushService(deviceModel as never).registerDevice(userId, { token: 'tok-1', platform: 'android', appVersion: '1.0.0' });
    const [filter, update, opts] = deviceModel.updateOne.mock.calls[0] as [Record<string, unknown>, { $set: Record<string, unknown> }, Record<string, unknown>];
    expect(filter).toEqual({ token: 'tok-1' });
    expect(String(update.$set.user_id)).toBe(userId);
    expect(update.$set).toMatchObject({ platform: 'android', app_version: '1.0.0' });
    expect(opts).toEqual({ upsert: true });
    const query = deviceModel.find.mock.results[0]?.value as { skip: jest.Mock };
    expect(query.skip).toHaveBeenCalledWith(MAX_DEVICES_PER_USER);
    expect(deviceModel.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('gỡ máy chỉ theo token CỦA người gọi', async () => {
    const userId = new Types.ObjectId().toString();
    await new PushService(deviceModel as never).unregisterDevice(userId, 'tok-1');
    const [filter] = deviceModel.deleteOne.mock.calls[0] as [Record<string, unknown>];
    expect(filter.token).toBe('tok-1');
    expect(String(filter.user_id)).toBe(userId);
  });

  it('chưa cấu hình FCM_SERVICE_ACCOUNT_FILE → không gửi gì', async () => {
    delete process.env.FCM_SERVICE_ACCOUNT_FILE;
    const service = new PushService(deviceModel as never);
    expect(service.isConfigured()).toBe(false);
    expect(await service.sendToUsers([new Types.ObjectId()], content)).toBe(0);
    expect(post).not.toHaveBeenCalled();
  });

  it('gửi: xin access token 1 lần rồi dùng lại, gọi đúng URL project, xoá token chết, giữ token lỗi tạm', async () => {
    devices = [{ token: 'alive' }, { token: 'dead' }, { token: 'busy' }];
    post.mockImplementation((url: string, body: { message?: { token: string } }) => {
      if (url.includes('oauth2')) return Promise.resolve({ data: { access_token: 'at-1', expires_in: 3600 } });
      const token = body.message?.token;
      if (token === 'dead') return Promise.reject(axiosError(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }));
      if (token === 'busy') return Promise.reject(axiosError(503, { error: { status: 'UNAVAILABLE' } }));
      return Promise.resolve({ data: { name: 'projects/x/messages/1' } });
    });
    const service = new PushService(deviceModel as never);
    expect(await service.sendToUsers([new Types.ObjectId()], content)).toBe(1);
    await service.sendToUsers([new Types.ObjectId()], content);

    const calls = post.mock.calls as [string, unknown, { headers: Record<string, string> } | undefined][];
    const oauthCalls = calls.filter((c) => c[0].includes('oauth2'));
    expect(oauthCalls).toHaveLength(1);
    const assertion = new URLSearchParams(String(oauthCalls[0]?.[1])).get('grant_type');
    expect(assertion).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const send = calls.find((c) => c[0].includes('fcm.googleapis.com'));
    expect(send?.[0]).toBe('https://fcm.googleapis.com/v1/projects/optipack-demo/messages:send');
    expect(send?.[2]?.headers.Authorization).toBe('Bearer at-1');
    expect(deviceModel.deleteMany).toHaveBeenCalledWith({ token: { $in: ['dead'] } });
  });

  it('không lấy được access token → không gửi, không ném lỗi', async () => {
    devices = [{ token: 'alive' }];
    post.mockRejectedValue(axiosError(400, { error: 'invalid_grant' }));
    expect(await new PushService(deviceModel as never).sendToUsers([new Types.ObjectId()], content)).toBe(0);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
