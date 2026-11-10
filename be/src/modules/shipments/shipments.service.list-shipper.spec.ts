import { Types } from 'mongoose';
import { ShipmentsService } from './shipments.service';
import { ShipmentStatus } from './enums/shipment-status.enum';

//!=============================================
// 10/11/2026 — App mobile "Việc của tôi" của shipper: GET /shipments?shipper_id=me&before=…
//!=============================================
describe('ShipmentsService.listShipments — lọc theo shipper + con trỏ before', () => {
  let find: jest.Mock;
  let countDocuments: jest.Mock;
  let chain: { sort: jest.Mock; skip: jest.Mock; limit: jest.Mock };
  let service: ShipmentsService;

  beforeEach(() => {
    chain = { sort: jest.fn(), skip: jest.fn(), limit: jest.fn().mockResolvedValue([]) };
    chain.sort.mockReturnValue(chain);
    chain.skip.mockReturnValue(chain);
    find = jest.fn().mockReturnValue(chain);
    countDocuments = jest.fn().mockResolvedValue(0);
    service = new ShipmentsService(
      { find, countDocuments } as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    );
  });

  const filterOf = (): Record<string, unknown> => (find.mock.calls[0] as [Record<string, unknown>])[0];

  it('shipperId hợp lệ → lọc shipper_id kiểu ObjectId, kết hợp được với status', async () => {
    const shipper = new Types.ObjectId();
    await service.listShipments({ shipperId: shipper.toString(), status: ShipmentStatus.OUT_FOR_DELIVERY, page: 1, limit: 20 });
    const f = filterOf();
    expect(f.shipper_id).toBeInstanceOf(Types.ObjectId);
    expect(String(f.shipper_id)).toBe(shipper.toString());
    expect(f.status).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
  });

  it('shipperId không phải ObjectId (VD user id lạ) → trả rỗng, không truy vấn', async () => {
    const res = await service.listShipments({ shipperId: 'not-an-id', page: 1, limit: 20 });
    expect(res).toEqual({ items: [], total: 0 });
    expect(find).not.toHaveBeenCalled();
  });

  it('có before → updated_at < before, bỏ qua page (skip 0); total đếm không tính con trỏ', async () => {
    const before = new Date('2026-11-10T10:00:00Z');
    await service.listShipments({ before, page: 3, limit: 10 });
    expect(filterOf().updated_at).toEqual({ $lt: before });
    expect(chain.skip).toHaveBeenCalledWith(0);
    expect((countDocuments.mock.calls[0] as [Record<string, unknown>])[0]).not.toHaveProperty('updated_at');
  });

  it('không có before → phân trang theo page như cũ', async () => {
    await service.listShipments({ page: 3, limit: 10 });
    expect(chain.skip).toHaveBeenCalledWith(20);
    expect(filterOf()).not.toHaveProperty('shipper_id');
  });
});
