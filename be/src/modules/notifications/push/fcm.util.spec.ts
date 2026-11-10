import { createPublicKey, createVerify, generateKeyPairSync } from 'crypto';
import { buildFcmMessage, buildServiceAccountJwt, clip, FCM_SCOPE, GOOGLE_TOKEN_URL, isDeadTokenError, readFcmServiceAccount } from './fcm.util';

describe('fcm.util', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const account = { projectId: 'optipack-demo', clientEmail: 'push@optipack-demo.iam.gserviceaccount.com', privateKey: pem };

  it('đọc service account từ file; thiếu biến / file hỏng / thiếu field → null', () => {
    const file = JSON.stringify({ project_id: 'p', client_email: 'e@x', private_key: 'k' });
    expect(readFcmServiceAccount({ FCM_SERVICE_ACCOUNT_FILE: '/x.json' }, () => file)).toEqual({ projectId: 'p', clientEmail: 'e@x', privateKey: 'k' });
    expect(readFcmServiceAccount({})).toBeNull();
    expect(readFcmServiceAccount({ FCM_SERVICE_ACCOUNT_FILE: '/x.json' }, () => 'không phải json')).toBeNull();
    expect(readFcmServiceAccount({ FCM_SERVICE_ACCOUNT_FILE: '/x.json' }, () => '{"project_id":"p"}')).toBeNull();
    expect(readFcmServiceAccount({ FCM_SERVICE_ACCOUNT_FILE: '/khong-co.json' }, () => { throw new Error('ENOENT'); })).toBeNull();
  });

  it('JWT RS256 đúng claim Google yêu cầu, chữ ký kiểm được bằng public key', () => {
    const jwt = buildServiceAccountJwt(account, 1_800_000_000);
    const [h, c, sig] = jwt.split('.') as [string, string, string];
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toEqual({
      iss: account.clientEmail, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL, iat: 1_800_000_000, exp: 1_800_003_600,
    });
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${h}.${c}`);
    expect(verifier.verify(createPublicKey(publicKey.export({ type: 'spki', format: 'pem' })), Buffer.from(sig, 'base64url'))).toBe(true);
  });

  it('message: token, title/body, data chuỗi, kênh Android, ưu tiên cao khi cần', () => {
    const msg = buildFcmMessage('tok', { title: 'T', body: 'B', data: { type: 'packing_assigned' }, highPriority: true }) as {
      message: { token: string; notification: unknown; data: unknown; android: { priority: string; notification: { channel_id: string } } };
    };
    expect(msg.message.token).toBe('tok');
    expect(msg.message.notification).toEqual({ title: 'T', body: 'B' });
    expect(msg.message.data).toEqual({ type: 'packing_assigned' });
    expect(msg.message.android.priority).toBe('HIGH');
    expect(msg.message.android.notification.channel_id).toBe('optipack_alerts');
  });

  it('nhận diện token chết: 404 UNREGISTERED, 400 INVALID_ARGUMENT; 5xx / 429 / 401 giữ token', () => {
    const fcm = (status: string, code: string): unknown => ({ error: { status, details: [{ errorCode: code }] } });
    expect(isDeadTokenError(404, fcm('NOT_FOUND', 'UNREGISTERED'))).toBe(true);
    expect(isDeadTokenError(400, fcm('INVALID_ARGUMENT', 'INVALID_ARGUMENT'))).toBe(true);
    expect(isDeadTokenError(503, fcm('UNAVAILABLE', 'UNAVAILABLE'))).toBe(false);
    expect(isDeadTokenError(429, fcm('RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED'))).toBe(false);
    expect(isDeadTokenError(401, undefined)).toBe(false);
    expect(isDeadTokenError(undefined, undefined)).toBe(false);
  });

  it('clip cắt chuỗi dài, giữ chuỗi ngắn', () => {
    expect(clip('abc', 5)).toBe('abc');
    expect(clip('abcdef', 4)).toBe('abc…');
  });
});
