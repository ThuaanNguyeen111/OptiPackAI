import { MarketplaceWebhooksService, MarketplaceWebhookPayload } from './marketplace-webhooks.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { AppException } from '../../common/exceptions/app-exception';
import { MKT_ERROR_CODES } from '../marketplace-integration/marketplace-integration.errors';
import { NotificationType } from '../notifications/enums/notification-type.enum';

//!=============================================
// MỚI (29/09/2026, Giai đoạn 3 — AURELLE_MARKETPLACE_DESIGN.md Mục 8):
// verify chữ ký đúng/sai, chống replay, dedupe (Rule #17), dispatch theo
// 3 giá trị message_type.
//!=============================================
describe('MarketplaceWebhooksService', () => {
  let service: MarketplaceWebhooksService;

  let processedEventModel: { create: jest.Mock };
  let adapter: { verifyWebhookSignature: jest.Mock };
  let marketplaceIntegrationService: { getConnectedShop: jest.Mock };
  let ordersService: { syncSingleOrder: jest.Mock };
  let notificationsService: { notify: jest.Mock<Promise<unknown>, [{ type: NotificationType }]> };

  function makePayload(overrides: Partial<MarketplaceWebhookPayload> = {}): MarketplaceWebhookPayload {
    return {
      message_id: 'msg_001',
      seller_id: '200000000101',
      message_type: 'order_status_changed',
      timestamp: Date.now(),
      data: { trade_order_id: '710000017', order_status: 'pending' },
      ...overrides,
    };
  }

  beforeEach(() => {
    processedEventModel = { create: jest.fn().mockResolvedValue({}) };
    adapter = { verifyWebhookSignature: jest.fn().mockReturnValue(true) };
    marketplaceIntegrationService = {
      getConnectedShop: jest.fn().mockResolvedValue({}),
    };
    ordersService = { syncSingleOrder: jest.fn().mockResolvedValue({}) };
    notificationsService = {
      notify: jest.fn<Promise<unknown>, [{ type: NotificationType }]>().mockResolvedValue({}),
    };

    service = new MarketplaceWebhooksService(
      processedEventModel as never,
      { [MarketplacePlatform.AURELLE]: adapter } as never,
      marketplaceIntegrationService as never,
      ordersService as never,
      notificationsService as never,
    );
  });

  it('chữ ký sai -> ném MKT_WEBHOOK_SIGNATURE_INVALID (401), KHÔNG ghi dedupe, KHÔNG gọi sync', async () => {
    adapter.verifyWebhookSignature.mockReturnValue(false);
    const body = makePayload();

    await expect(
      service.handleWebhook(MarketplacePlatform.AURELLE, Buffer.from('{}'), 'sai-chu-ky', body),
    ).rejects.toMatchObject({ errorCode: MKT_ERROR_CODES.WEBHOOK_SIGNATURE_INVALID });

    expect(processedEventModel.create).not.toHaveBeenCalled();
    expect(ordersService.syncSingleOrder).not.toHaveBeenCalled();
  });

  it('thiếu header Authorization -> ném MKT_WEBHOOK_SIGNATURE_INVALID', async () => {
    const body = makePayload();
    await expect(
      service.handleWebhook(MarketplacePlatform.AURELLE, Buffer.from('{}'), undefined, body),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('timestamp lệch quá 5 phút -> từ chối (replay), KHÔNG ghi dedupe', async () => {
    const body = makePayload({ timestamp: Date.now() - 10 * 60 * 1000 });
    await expect(
      service.handleWebhook(MarketplacePlatform.AURELLE, Buffer.from('{}'), 'chu-ky-dung', body),
    ).rejects.toMatchObject({ errorCode: MKT_ERROR_CODES.WEBHOOK_SIGNATURE_INVALID });
    expect(processedEventModel.create).not.toHaveBeenCalled();
  });

  it('message_id đã xử lý trước đó (E11000) -> ack {received:true}, KHÔNG gọi sync lại', async () => {
    processedEventModel.create.mockRejectedValue({ code: 11000 });
    const body = makePayload();

    const result = await service.handleWebhook(
      MarketplacePlatform.AURELLE,
      Buffer.from('{}'),
      'chu-ky-dung',
      body,
    );

    expect(result).toEqual({ received: true });
    expect(ordersService.syncSingleOrder).not.toHaveBeenCalled();
  });

  it('order_status_changed, shop đã kết nối -> gọi syncSingleOrder đúng tham số', async () => {
    const body = makePayload({ message_type: 'order_status_changed' });

    const result = await service.handleWebhook(
      MarketplacePlatform.AURELLE,
      Buffer.from('{}'),
      'chu-ky-dung',
      body,
    );

    expect(result).toEqual({ received: true });
    expect(ordersService.syncSingleOrder).toHaveBeenCalledWith(
      MarketplacePlatform.AURELLE,
      '200000000101',
      '710000017',
    );
  });

  it('shop KHÔNG kết nối (MKT_SHOP_NOT_CONNECTED) -> ack 200, KHÔNG gọi sync, KHÔNG throw', async () => {
    marketplaceIntegrationService.getConnectedShop.mockRejectedValue(
      new AppException(MKT_ERROR_CODES.SHOP_NOT_CONNECTED, 'not connected'),
    );
    const body = makePayload();

    const result = await service.handleWebhook(
      MarketplacePlatform.AURELLE,
      Buffer.from('{}'),
      'chu-ky-dung',
      body,
    );

    expect(result).toEqual({ received: true });
    expect(ordersService.syncSingleOrder).not.toHaveBeenCalled();
  });

  it('authorization_revoked -> notify CONNECTION_LOST cho STORE_OWNER và ADMIN, KHÔNG gọi sync', async () => {
    const body = makePayload({ message_type: 'authorization_revoked' });

    const result = await service.handleWebhook(
      MarketplacePlatform.AURELLE,
      Buffer.from('{}'),
      'chu-ky-dung',
      body,
    );

    expect(result).toEqual({ received: true });
    expect(ordersService.syncSingleOrder).not.toHaveBeenCalled();
    expect(notificationsService.notify).toHaveBeenCalledTimes(2);
    const [firstCallArg] = notificationsService.notify.mock.calls[0] ?? [];
    expect(firstCallArg?.type).toBe(NotificationType.CONNECTION_LOST);
  });

  it('message_type lạ (chưa biết) -> vẫn ack 200, không throw', async () => {
    const body = makePayload({ message_type: 'some_future_event' });

    const result = await service.handleWebhook(
      MarketplacePlatform.AURELLE,
      Buffer.from('{}'),
      'chu-ky-dung',
      body,
    );

    expect(result).toEqual({ received: true });
  });
});
