import { Types } from 'mongoose';
import { WarehouseService } from './warehouse.service';

// (14/10/2026) binCodesByIds — mã ô cho danh sách tồn theo kho (FE đọc `binCode`).
describe('WarehouseService.binCodesByIds', () => {
  const binA = new Types.ObjectId();
  const binB = new Types.ObjectId();
  let find: jest.Mock;
  let service: WarehouseService;

  beforeEach(() => {
    find = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: binA, bin_code: 'KA-D1-P02-T03-1' },
          { _id: binB, bin_code: 'KB-D2-T01-T01-2' },
        ]),
      }),
    });
    service = new WarehouseService(
      {} as never, {} as never, { find } as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never,
    );
  });

  it('trả Map id ô -> mã ô, gộp id trùng thành 1 truy vấn', async () => {
    const map = await service.binCodesByIds([binA, binB, new Types.ObjectId(binA.toString())]);
    expect(find).toHaveBeenCalledTimes(1);
    const filter = (find.mock.calls[0] as [{ _id: { $in: Types.ObjectId[] } }])[0];
    expect(filter._id.$in).toHaveLength(2);
    expect(filter._id.$in.every((id) => id instanceof Types.ObjectId)).toBe(true);
    expect(map.get(binA.toString())).toBe('KA-D1-P02-T03-1');
    expect(map.get(binB.toString())).toBe('KB-D2-T01-T01-2');
  });

  it('danh sách rỗng thì không truy vấn DB', async () => {
    const map = await service.binCodesByIds([]);
    expect(map.size).toBe(0);
    expect(find).not.toHaveBeenCalled();
  });
});
