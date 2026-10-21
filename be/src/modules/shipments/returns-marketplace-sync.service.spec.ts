import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import type { MarketplaceReturnRaw } from '../marketplace-integration/interfaces/marketplace-adapter.interface';
import { ReturnsMarketplaceSyncService } from './returns-marketplace-sync.service';

const raw = (id: string): MarketplaceReturnRaw => ({
  return_id: id,
  order_id: 720000001,
  type: 'return_refund',
  status: 'requested',
  customer_note: '',
  rma_code: null,
  items: [{ seller_sku: 'A', quantity: 1, reason_code: 'defective' }],
  created_at: '2026-10-20T01:00:00.000Z',
  updated_at: '2026-10-20T01:00:00.000Z',
});

function build(pages: MarketplaceReturnRaw[][], outcomes: Record<string, { outcome: string; reason?: string }>) {
  const listReturns = jest.fn<Promise<{ returns: MarketplaceReturnRaw[]; count: number }>, [string, { status?: string; updateAfter?: Date; offset: number; limit: number }]>();
  pages.forEach((page) => listReturns.mockResolvedValueOnce({ returns: page, count: page.length }));
  listReturns.mockResolvedValue({ returns: [], count: 0 });
  const updateReturnStatus = jest.fn<Promise<void>, [string, Record<string, unknown>]>().mockResolvedValue(undefined);
  const createFromMarketplace = jest.fn((_p: MarketplacePlatform, _s: string, r: MarketplaceReturnRaw) =>
    Promise.resolve(outcomes[r.return_id] ?? { outcome: 'created' }),
  );
  const cancelFromMarketplace = jest.fn().mockResolvedValue('canceled');
  const integration = {
    getValidAccessToken: jest.fn().mockResolvedValue('tok'),
    listConnectedShops: jest.fn().mockResolvedValue([{ shop_id: 'S1' }, { shop_id: 'S2' }]),
  };
  const service = new ReturnsMarketplaceSyncService(
    { [MarketplacePlatform.AURELLE]: { listReturns, updateReturnStatus } } as never,
    integration as never,
    { createFromMarketplace, cancelFromMarketplace } as never,
  );
  return { service, listReturns, updateReturnStatus, createFromMarketplace, cancelFromMarketplace, integration };
}

describe('ReturnsMarketplaceSyncService.syncShop', () => {
  it('sàn không hỗ trợ trả hàng (Lazada) → không làm gì', async () => {
    const service = new ReturnsMarketplaceSyncService({ [MarketplacePlatform.LAZADA]: {} } as never, {} as never, {} as never);
    expect(await service.syncShop(MarketplacePlatform.LAZADA, 'S1')).toEqual({ pulled: 0, created: 0, rejected: 0, pending: 0, canceled: 0 });
  });

  it('chỉ kéo yêu cầu đang "requested" và đếm đúng từng kết quả', async () => {
    const { service, listReturns } = build([[raw('r1'), raw('r2'), raw('r3'), raw('r4')]], {
      r2: { outcome: 'exists' },
      r3: { outcome: 'busy', reason: 'đang có phiếu khác' },
      r4: { outcome: 'order_not_ready' },
    });
    const result = await service.syncShop(MarketplacePlatform.AURELLE, 'S1');
    expect(result).toEqual({ pulled: 4, created: 1, rejected: 0, pending: 2, canceled: 0 });
    expect(listReturns.mock.calls[0]?.[1]).toMatchObject({ status: 'requested', offset: 0 });
  });

  it('yêu cầu không thể hợp lệ → báo TỪ CHỐI ngược cho khách kèm lý do (idempotent theo id)', async () => {
    const { service, updateReturnStatus } = build([[raw('r9')]], { r9: { outcome: 'rejected', reason: 'Đã quá 15 ngày' } });
    const result = await service.syncShop(MarketplacePlatform.AURELLE, 'S1');
    expect(result.rejected).toBe(1);
    expect(updateReturnStatus.mock.calls[0]?.[1]).toMatchObject({
      returnId: 'r9',
      status: 'rejected',
      decisionNote: 'Đã quá 15 ngày',
      idempotencyKey: 'autoreject:r9',
    });
  });

  it('báo từ chối lỗi thì không làm hỏng lượt đồng bộ (lượt sau gặp lại)', async () => {
    const { service, updateReturnStatus } = build([[raw('r9')]], { r9: { outcome: 'rejected', reason: 'x' } });
    updateReturnStatus.mockRejectedValue(new Error('502'));
    await expect(service.syncShop(MarketplacePlatform.AURELLE, 'S1')).resolves.toMatchObject({ rejected: 1 });
  });

  it('nhiều trang: offset chỉ cộng số phiếu còn "requested" (phiếu bị từ chối đã rời danh sách)', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => raw(`a${String(i)}`));
    const outcomes: Record<string, { outcome: string; reason?: string }> = { a0: { outcome: 'rejected', reason: 'x' } };
    const { service, listReturns } = build([page1, [raw('b0')]], outcomes);
    await service.syncShop(MarketplacePlatform.AURELLE, 'S1');
    expect(listReturns).toHaveBeenCalledTimes(3); // 2 trang "requested" + 1 lượt "canceled"
    expect(listReturns.mock.calls[1]?.[1].offset).toBe(49);
  });

  it('21/10/2026 — kéo thêm yêu cầu khách đã HỦY (3 ngày gần nhất) và hủy phiếu bên kho', async () => {
    const { service, listReturns, cancelFromMarketplace } = build([[], [{ ...raw('c1'), status: 'canceled' }, { ...raw('c2'), status: 'canceled' }]], {});
    cancelFromMarketplace.mockResolvedValueOnce('canceled').mockResolvedValueOnce('too_late');
    const result = await service.syncShop(MarketplacePlatform.AURELLE, 'S1');
    expect(result.canceled).toBe(1);
    const params = listReturns.mock.calls[1]?.[1];
    expect(params?.status).toBe('canceled');
    expect(params?.updateAfter).toBeInstanceOf(Date);
    expect(cancelFromMarketplace).toHaveBeenCalledWith(MarketplacePlatform.AURELLE, 'c1');
  });
});

describe('ReturnsMarketplaceSyncService.syncAllShops', () => {
  it('lỗi 1 shop không chặn shop khác', async () => {
    const { service, integration, listReturns } = build([], {});
    integration.getValidAccessToken.mockRejectedValueOnce(new Error('token hết hạn')).mockResolvedValue('tok');
    await service.syncAllShops();
    expect(listReturns).toHaveBeenCalledTimes(2); // chỉ shop thứ 2 gọi tới sàn (requested + canceled)
  });
});
