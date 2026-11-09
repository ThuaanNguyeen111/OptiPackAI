import { Types } from 'mongoose';
import { MarketplaceIntegrationService } from './marketplace-integration.service';
import { MarketplacePlatform } from './enums/platform.enum';
import { MKT_ERROR_CODES } from './marketplace-integration.errors';

//!=============================================
// 31/10/2026 — sàn kết nối thẳng (Tiki app Inhouse): "Kết nối" lưu shop ngay (token mã hoá),
// trả về URL trang "kết nối thành công" của FE thay cho trang đăng nhập của sàn.
//!=============================================
describe('MarketplaceIntegrationService — kết nối thẳng (Tiki)', () => {
  const OLD = process.env.TOKEN_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
  });
  afterAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = OLD;
  });

  function build(connectDirect: jest.Mock) {
    const findOneAndUpdate = jest.fn((_f: unknown, update: Record<string, unknown>) => Promise.resolve({ shop_id: update.shop_id, shop_name: update.shop_name }));
    const oauthCreate = jest.fn();
    const service = new MarketplaceIntegrationService(
      { findOneAndUpdate } as never,
      { create: oauthCreate } as never,
      { [MarketplacePlatform.TIKI]: { platform: MarketplacePlatform.TIKI, connectDirect } } as never,
      { get: (k: string, d?: unknown) => (k === 'CLIENT_MARKETPLACE_REDIRECT_CALLBACK' ? 'http://fe/ok' : d) } as never,
    );
    return { service, findOneAndUpdate, oauthCreate };
  }

  it('lưu shop + trả URL thành công của FE, không tạo state OAuth', async () => {
    const connectDirect = jest.fn().mockResolvedValue({
      shopId: '365980', shopName: 'OptiPackAI Test Shop', shopCipher: null, sellerCode: null,
      accessToken: 'AT', refreshToken: 'client_credentials',
      accessTokenExpiresAt: new Date(Date.now() + 1000), refreshTokenExpiresAt: new Date(Date.now() + 2000),
    });
    const { service, findOneAndUpdate, oauthCreate } = build(connectDirect);
    const adminId = new Types.ObjectId().toString();
    const url = await service.createConnectUrl(MarketplacePlatform.TIKI, adminId);
    expect(url).toBe('http://fe/ok?shopId=365980&shopName=OptiPackAI+Test+Shop&connected=true&platform=tiki');
    expect(oauthCreate).not.toHaveBeenCalled();
    const [filter, update] = findOneAndUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(filter).toMatchObject({ platform: MarketplacePlatform.TIKI, shop_id: '365980', environment: 'production' });
    expect(update.access_token_encrypted).not.toBe('AT');
    expect(update.is_active).toBe(true);
  });

  it('Tiki từ chối (chưa đồng ý kết nối / sai Secret) → 502 MKT_TOKEN_EXCHANGE_FAILED', async () => {
    const { service } = build(jest.fn().mockRejectedValue(new Error('401 Unauthorized')));
    const err = await service.createConnectUrl(MarketplacePlatform.TIKI, new Types.ObjectId().toString()).catch((e: unknown) => e);
    expect((err as { getResponse: () => { error_code: string } }).getResponse().error_code).toBe(MKT_ERROR_CODES.TOKEN_EXCHANGE_FAILED);
  });
});
