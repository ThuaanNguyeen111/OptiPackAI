import { LazadaOrderSyncScheduler } from './lazada-order-sync.scheduler';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';

//!=============================================
// FIX (AOFP-XX, 2026-09-16): notify(SYNC_FAILED) cho lỗi sync cron —
// PHẢI có cơ chế chống spam (cooldown 20 phút), vì cron chạy mỗi 10
// phút — không giới hạn sẽ bắn Notification trùng lặp mỗi lần cron
// chạy trong lúc CÙNG 1 sự cố (VD token hết hạn) chưa được xử lý.
//
// SỬA LẠI (16/09/2026) — bản đầu dùng jest.useFakeTimers() +
// advanceTimersByTime() bị lỗi thật khi chạy (Date.now() bên trong
// code + chuỗi await lồng nhau tương tác không ổn định với cơ chế
// fake timer toàn cục, khiến notify() không được gọi đúng như kỳ
// vọng dù logic thật đúng). Đổi sang jest.spyOn(Date, 'now') — kiểm
// soát trực tiếp giá trị trả về của Date.now() theo từng lần gọi,
// không đụng gì tới hệ thống timer toàn cục — cách làm chuẩn, đáng
// tin cậy hơn cho đúng loại logic "so sánh mốc thời gian" thế này.
//!=============================================
describe('LazadaOrderSyncScheduler — chống spam Notification khi sync lỗi', () => {
  let scheduler: LazadaOrderSyncScheduler;

  let ordersService: { syncLazadaOrders: jest.Mock };
  let marketplaceIntegrationService: { listConnectedShops: jest.Mock };
  let notificationsService: { notify: jest.Mock };
  let nowSpy: jest.SpyInstance<number, []>;

  const shop = { shop_id: 'shop-1' };
  const T0 = 1_700_000_000_000; // mốc thời gian cố định bất kỳ, chỉ cần 1 số lớn hợp lệ

  beforeEach(() => {
    ordersService = {
      syncLazadaOrders: jest.fn().mockRejectedValue(new Error('token hết hạn')),
    };
    marketplaceIntegrationService = {
      listConnectedShops: jest.fn().mockResolvedValue([shop]),
    };
    notificationsService = { notify: jest.fn().mockResolvedValue(undefined) };

    scheduler = new LazadaOrderSyncScheduler(
      ordersService as never,
      marketplaceIntegrationService as never,
      notificationsService as never,
    );
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('lần lỗi ĐẦU TIÊN cho 1 shop -> bắn Notification ngay', async () => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(T0);

    await scheduler.autoSyncAllConnectedShops();

    expect(notificationsService.notify).toHaveBeenCalledTimes(1);
    expect(notificationsService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientRole: UserRole.STORE_OWNER,
        type: NotificationType.SYNC_FAILED,
        severity: 'warning',
      }),
    );
  });

  it('lỗi LẶP LẠI trong vòng 20 phút -> KHÔNG bắn lại (chống spam)', async () => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(T0);
    await scheduler.autoSyncAllConnectedShops(); // lần 1 — bắn

    nowSpy.mockReturnValue(T0 + 19 * 60 * 1000); // 19 phút sau, vẫn trong cooldown
    await scheduler.autoSyncAllConnectedShops(); // lần 2 — vẫn lỗi

    expect(notificationsService.notify).toHaveBeenCalledTimes(1); // vẫn chỉ 1
  });

  it('lỗi vẫn còn SAU KHI qua 20 phút -> bắn lại đúng 1 lần nữa', async () => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(T0);
    await scheduler.autoSyncAllConnectedShops(); // lần 1 — bắn

    nowSpy.mockReturnValue(T0 + 21 * 60 * 1000); // qua khỏi cooldown
    await scheduler.autoSyncAllConnectedShops(); // lần 2 — hết cooldown, bắn lại

    expect(notificationsService.notify).toHaveBeenCalledTimes(2);
  });
});
