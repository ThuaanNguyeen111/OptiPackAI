import { UserRole } from '../../common/enums/user-role.enum';
import {
  earlyWarningLevel,
  PackagingStockAlertService,
  stockAlertLevel,
  worsenedLevel,
} from './packaging-stock-alert.service';

describe('PackagingStockAlertService — cảnh báo tồn vật liệu (08/11/2026)', () => {
  it('mức báo sớm = ngưỡng + 20%, làm tròn lên, luôn lớn hơn ngưỡng', () => {
    expect(earlyWarningLevel(10)).toBe(12);
    expect(earlyWarningLevel(20)).toBe(24);
    expect(earlyWarningLevel(3)).toBe(4);
    expect(earlyWarningLevel(1)).toBe(2);
    expect(earlyWarningLevel(0)).toBe(0);
  });

  it('phân mức theo tồn', () => {
    expect(stockAlertLevel(13, 10)).toBeNull();
    expect(stockAlertLevel(12, 10)).toBe('near');
    expect(stockAlertLevel(10, 10)).toBe('below');
    expect(stockAlertLevel(0, 10)).toBe('out');
  });

  it('chỉ báo khi mức xấu đi', () => {
    expect(worsenedLevel(null, 'near')).toBe('near');
    expect(worsenedLevel('near', 'near')).toBeNull();
    expect(worsenedLevel('near', 'below')).toBe('below');
    expect(worsenedLevel('out', 'below')).toBeNull();
    expect(worsenedLevel('below', null)).toBeNull();
  });

  function setup(): { service: PackagingStockAlertService; notify: jest.Mock } {
    const notify = jest.fn(() => Promise.resolve({}));
    return { service: new PackagingStockAlertService({ notify } as never), notify };
  }

  it('đóng gói làm tồn 13 → 12 (ngưỡng 10): báo sớm cho Admin, Store Owner, Warehouse Staff', async () => {
    const { service, notify } = setup();
    await service.notifyIfWorse({ kind: 'box', code: 'BOX-M', name: 'BOX-M', before: 13, after: 12, reorderLevel: 10, trigger: 'sau khi niêm phong kiện' });
    expect(notify).toHaveBeenCalledTimes(3);
    const calls = notify.mock.calls as unknown as [{ recipientRole: UserRole; severity: string; title: string; relatedEntityType: string }][];
    expect(calls.map((c) => c[0].recipientRole)).toEqual([UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF]);
    expect(calls[0]?.[0].title).toBe('Thùng BOX-M sắp chạm ngưỡng');
    expect(calls[0]?.[0].relatedEntityType).toBe('packaging_box');
  });

  it('đã ở mức sắp hết mà trừ tiếp trong cùng mức thì không báo lặp', async () => {
    const { service, notify } = setup();
    await service.notifyIfWorse({ kind: 'box', code: 'BOX-M', name: 'BOX-M', before: 12, after: 11, reorderLevel: 10, trigger: 'x' });
    expect(notify).not.toHaveBeenCalled();
  });

  it('hết hàng → mức critical', async () => {
    const { service, notify } = setup();
    await service.notifyIfWorse({ kind: 'material', code: 'FOAM', name: 'Góc xốp', before: 2, after: 0, reorderLevel: 10, trigger: 'x' });
    const first = (notify.mock.calls as unknown as [{ severity: string; title: string }][])[0]?.[0];
    expect(first?.severity).toBe('critical');
    expect(first?.title).toBe('Đã hết vật tư Góc xốp (FOAM)');
  });

  it('sửa ngưỡng 10 → 20 khi còn 15: báo dưới ngưỡng', async () => {
    const { service, notify } = setup();
    await service.notifyIfWorse({ kind: 'box', code: 'BOX-S', name: 'BOX-S', before: 15, after: 15, previousReorderLevel: 10, reorderLevel: 20, trigger: 'vừa sửa ngưỡng' });
    const first = (notify.mock.calls as unknown as [{ title: string }][])[0]?.[0];
    expect(first?.title).toBe('Thùng BOX-S đã xuống ngưỡng cảnh báo');
  });

  it('lỗi gửi thông báo không làm hỏng thao tác', async () => {
    const notify = jest.fn(() => Promise.reject(new Error('mail down')));
    const service = new PackagingStockAlertService({ notify } as never);
    await expect(
      service.notifyIfWorse({ kind: 'box', code: 'B', name: 'B', before: 5, after: 0, reorderLevel: 2, trigger: 'x' }),
    ).resolves.toBeUndefined();
  });
});
