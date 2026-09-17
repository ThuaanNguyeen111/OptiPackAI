import { Types } from 'mongoose';
import { WarehouseService } from './warehouse.service';

describe('WarehouseService — listZones', () => {
  const warehouseId = new Types.ObjectId();

  it('gọi find một lần với warehouse_id đã parse (không để string thô)', async () => {
    const zoneModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    };

    const service = new WarehouseService(
      {} as never,
      zoneModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.listZones(warehouseId.toHexString());

    expect(zoneModel.find).toHaveBeenCalledTimes(1);
    expect(zoneModel.find).toHaveBeenCalledWith({
      warehouse_id: new Types.ObjectId(warehouseId.toHexString()),
    });
  });
});

describe('WarehouseService — findUnassignedSkus', () => {
  it('SKU catalog thiếu platform vẫn trả lazada, không để FE gửi field rỗng', async () => {
    const assignmentModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    };
    const productMasterModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { platform: undefined, shop_id: '201171264532', seller_sku: 'GIAY-01' },
          ]),
        }),
      }),
    };

    const service = new WarehouseService(
      {} as never,
      {} as never,
      {} as never,
      assignmentModel as never,
      productMasterModel as never,
      {} as never,
    );

    const rows = await service.findUnassignedSkus();
    const [first] = rows;
    expect(first).toBeDefined();
    expect(first?.platform).toBe('lazada');
    expect(first?.seller_sku).toBe('GIAY-01');
  });
});
