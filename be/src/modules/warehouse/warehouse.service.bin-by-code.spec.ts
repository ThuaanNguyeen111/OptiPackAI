import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { WarehouseService } from './warehouse.service';

// 09/11/2026 — tra ô theo mã quét (app mobile).
describe('WarehouseService.findBinByCode', () => {
  const warehouseId = new Types.ObjectId().toString();
  const binId = new Types.ObjectId();
  const zoneId = new Types.ObjectId();
  const bin = { _id: binId, zone_id: zoneId, bin_code: 'A-03-01-01' };
  const rows = [
    { _id: new Types.ObjectId(), seller_sku: 'SKU-1', quantity_on_hand: 4 },
  ];
  let binFind: jest.Mock;
  let assignmentFind: jest.Mock;
  let service: WarehouseService;

  function build(bins: unknown[]): void {
    binFind = jest
      .fn()
      .mockReturnValue({ lean: jest.fn().mockResolvedValue(bins) });
    assignmentFind = jest.fn().mockReturnValue({
      sort: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue(rows) }),
    });
    const zoneFindById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ zone_code: 'A', zone_name: 'Áo' }),
      }),
    });
    service = new WarehouseService(
      {} as never,
      { findById: zoneFindById } as never,
      { find: binFind } as never,
      { find: assignmentFind } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('trả ô, khu và tồn trên ô; mã có khoảng trắng / chữ thường vẫn tìm được', async () => {
    build([bin]);
    const result = await service.findBinByCode(warehouseId, '  a-03-01-01 ');
    const filter = (
      binFind.mock.calls[0] as [{ bin_code: { $in: string[] } }]
    )[0];
    expect(filter.bin_code.$in).toEqual(['a-03-01-01', 'A-03-01-01']);
    expect(result.bin).toBe(bin);
    expect(result.zone).toEqual({ zone_code: 'A', zone_name: 'Áo' });
    expect(result.assignments).toBe(rows);
    const assignmentFilter = (
      assignmentFind.mock.calls[0] as [{ bin_location_id: Types.ObjectId }]
    )[0];
    expect(assignmentFilter.bin_location_id).toBe(binId);
  });

  it('không có ô → 404 WH_BIN_NOT_FOUND', async () => {
    build([]);
    await expect(
      service.findBinByCode(warehouseId, 'Z-99'),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
    await expect(
      service.findBinByCode(warehouseId, 'Z-99'),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('id kho sai hoặc mã rỗng → 400, không truy vấn', async () => {
    build([bin]);
    await expect(
      service.findBinByCode('bad', 'A-03-01-01'),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    await expect(
      service.findBinByCode(warehouseId, '   '),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    expect(binFind).not.toHaveBeenCalled();
  });
});
