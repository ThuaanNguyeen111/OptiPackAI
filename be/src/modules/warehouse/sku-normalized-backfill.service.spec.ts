import { Types } from 'mongoose';
import { SkuNormalizedBackfillService } from './sku-normalized-backfill.service';

describe('SkuNormalizedBackfillService — bổ sung seller_sku_normalized cho dòng tồn cũ', () => {
  it('ghi mã chuẩn hoá cho dòng còn thiếu theo lô, dừng khi hết; lỗi DB không làm hỏng khởi động', async () => {
    const a = { _id: new Types.ObjectId(), seller_sku: ' ao-m ' };
    const b = { _id: new Types.ObjectId(), seller_sku: 'Quan-L' };
    const lean = jest.fn().mockResolvedValueOnce([a, b]);
    const bulkWrite = jest.fn().mockResolvedValue({});
    const model = { find: jest.fn(() => ({ select: () => ({ limit: () => ({ lean }) }) })), collection: { bulkWrite } };
    const service = new SkuNormalizedBackfillService(model as never);

    expect(await service.backfill()).toBe(2);
    const [ops] = bulkWrite.mock.calls[0] as [{ updateOne: { filter: { _id: Types.ObjectId }; update: { $set: { seller_sku_normalized: string } } } }[]];
    expect(ops.map((o) => o.updateOne.update.$set.seller_sku_normalized)).toEqual(['AO-M', 'QUAN-L']);

    model.find.mockImplementationOnce(() => { throw new Error('db down'); });
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
