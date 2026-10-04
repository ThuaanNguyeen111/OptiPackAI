import { Types } from 'mongoose';
import { ShipmentsService } from './shipments.service';
import { SHP_ERROR_CODES } from './shipments.errors';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import type { ServiceQuote } from '../shipping/utils/shipping-cost.util';

//!=============================================
// Mục 9.5 (29/09/2026): giao chung chuyến — happy path, các case lỗi.
// 30/09/2026: bắt buộc hãng + dịch vụ, cước từ kiện thật, ETA, lịch lấy hàng.
//!=============================================
describe('ShipmentsService', () => {
  let service: ShipmentsService;
  const userId = new Types.ObjectId().toString();

  let shipmentModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let orderGroupsService: {
    findOrderGroupById: jest.Mock;
    transitionFulfillmentStatus: jest.Mock;
  };
  let shippingService: {
    quoteChosenService: jest.Mock;
    persistCosts: jest.Mock;
  };
  let connection: { startSession: jest.Mock };

  interface MockGroup {
    _id: Types.ObjectId;
    fulfillment_status: GroupFulfillmentStatus;
    recipient_key: string | null;
    __v: number;
  }

  function makeGroup(overrides: Partial<MockGroup> = {}): MockGroup {
    return {
      _id: new Types.ObjectId(),
      fulfillment_status: GroupFulfillmentStatus.PACKED,
      recipient_key: 'recipient-abc',
      __v: 0,
      ...overrides,
    };
  }

  function quote(overrides: Partial<ServiceQuote> = {}): ServiceQuote {
    return {
      carrierCode: 'C1',
      carrierName: 'Hãng mẫu',
      serviceCode: 'STD',
      serviceName: 'Tiêu chuẩn',
      etaMinDays: 2,
      etaMaxDays: 4,
      parcels: [
        {
          orderId: 'o1',
          cartonIndex: 0,
          actualG: 500,
          volumetricG: 600,
          chargeableG: 600,
          costVnd: 25000,
        },
        {
          orderId: 'o1',
          cartonIndex: 1,
          actualG: 900,
          volumetricG: 300,
          chargeableG: 900,
          costVnd: 25000,
        },
      ],
      totalChargeableG: 1500,
      totalCostVnd: 50000,
      isSample: true,
      ...overrides,
    };
  }

  const ship = (
    ids: string[],
    opts: { pickupAt?: Date; note?: string } = {},
  ): ReturnType<ShipmentsService['createBatch']> =>
    service.createBatch(ids, 'C1', 'STD', opts.note, userId, opts.pickupAt);

  beforeEach(() => {
    shipmentModel = {
      create: jest
        .fn()
        .mockImplementation((docs: unknown[]) =>
          Promise.resolve(
            docs.map((d) => ({ ...(d as object), _id: new Types.ObjectId() })),
          ),
        ),
      findOne: jest.fn(),
      find: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    orderGroupsService = {
      findOrderGroupById: jest.fn(),
      transitionFulfillmentStatus: jest.fn().mockResolvedValue({}),
    };
    shippingService = {
      quoteChosenService: jest.fn().mockResolvedValue(quote()),
      persistCosts: jest.fn().mockResolvedValue(undefined),
    };
    const session = {
      withTransaction: jest.fn(async (fn: () => Promise<unknown>) => fn()),
      endSession: jest.fn(),
    };
    connection = { startSession: jest.fn().mockResolvedValue(session) };

    service = new ShipmentsService(
      shipmentModel as never,
      orderGroupsService as never,
      connection as never,
      shippingService as never,
    );
  });

  it('order_group_ids rỗng -> SHP_EMPTY_GROUP_LIST', async () => {
    await expect(ship([])).rejects.toMatchObject({
      errorCode: SHP_ERROR_CODES.EMPTY_GROUP_LIST,
    });
  });

  it('1 group đã packed -> tạo 1 shipment, chuyển SHIPPED, không cần kiểm tra recipient_key', async () => {
    const group = makeGroup();
    orderGroupsService.findOrderGroupById.mockResolvedValue(group);

    const result = await ship([group._id.toString()], { note: 'note test' });

    expect(result.shipments).toHaveLength(1);
    expect(result.tripCode).toMatch(/^TRIP-\d{6}-[0-9A-F]{4}$/);
    expect(orderGroupsService.transitionFulfillmentStatus).toHaveBeenCalledWith(
      group._id.toString(),
      GroupFulfillmentStatus.SHIPPED,
      0,
      expect.anything(),
    );
  });

  it('lưu hãng, dịch vụ, số kiện, khối lượng tính cước, cước, ETA và cờ cước mẫu lên vận đơn', async () => {
    const group = makeGroup();
    orderGroupsService.findOrderGroupById.mockResolvedValue(group);

    const result = await ship([group._id.toString()]);

    const [docs] = shipmentModel.create.mock.calls[0] as [
      Record<string, unknown>[],
    ];
    expect(docs[0]).toMatchObject({
      carrier_code: 'C1',
      service_code: 'STD',
      parcel_count: 2,
      chargeable_weight_g: 1500,
      estimated_cost_vnd: 50000,
      is_sample_rate: true,
      pickup_at: null,
    });
    const etaFrom = docs[0]?.eta_from as Date;
    const etaTo = docs[0]?.eta_to as Date;
    expect((etaTo.getTime() - etaFrom.getTime()) / 86_400_000).toBeCloseTo(
      2,
      5,
    ); // 4 ngày - 2 ngày
    expect(result.totalCostVnd).toBe(50000);
    expect(result.shipments[0]).toMatchObject({
      parcelCount: 2,
      estimatedCostVnd: 50000,
    });
  });

  it('ghi cước ước tính lên phương án đóng gói của từng đơn (thay cho null)', async () => {
    const group = makeGroup();
    orderGroupsService.findOrderGroupById.mockResolvedValue(group);
    await ship([group._id.toString()]);
    expect(shippingService.persistCosts).toHaveBeenCalledWith(
      group._id.toString(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('hãng/dịch vụ không tồn tại -> lỗi từ báo giá, KHÔNG tạo vận đơn, KHÔNG đổi trạng thái', async () => {
    const group = makeGroup();
    orderGroupsService.findOrderGroupById.mockResolvedValue(group);
    shippingService.quoteChosenService.mockRejectedValue(
      new Error('SHIP_SERVICE_NOT_FOUND'),
    );

    await expect(ship([group._id.toString()])).rejects.toThrow(
      'SHIP_SERVICE_NOT_FOUND',
    );
    expect(shipmentModel.create).not.toHaveBeenCalled();
    expect(
      orderGroupsService.transitionFulfillmentStatus,
    ).not.toHaveBeenCalled();
  });

  it('lịch lấy hàng ở quá khứ -> SHP_PICKUP_IN_PAST', async () => {
    await expect(
      ship([new Types.ObjectId().toString()], {
        pickupAt: new Date(Date.now() - 3_600_000),
      }),
    ).rejects.toMatchObject({
      errorCode: SHP_ERROR_CODES.PICKUP_IN_PAST,
    });
  });

  it('lịch lấy hàng hợp lệ được lưu vào vận đơn', async () => {
    const group = makeGroup();
    orderGroupsService.findOrderGroupById.mockResolvedValue(group);
    const pickup = new Date(Date.now() + 3_600_000);

    await ship([group._id.toString()], { pickupAt: pickup });

    const [docs] = shipmentModel.create.mock.calls[0] as [
      Record<string, unknown>[],
    ];
    expect(docs[0]?.pickup_at).toEqual(pickup);
  });

  it('group chưa packed -> SHP_GROUP_NOT_PACKED, KHÔNG tạo shipment', async () => {
    const group = makeGroup({
      fulfillment_status: GroupFulfillmentStatus.PICKING,
    });
    orderGroupsService.findOrderGroupById.mockResolvedValue(group);

    await expect(ship([group._id.toString()])).rejects.toMatchObject({
      errorCode: SHP_ERROR_CODES.GROUP_NOT_PACKED,
    });
    expect(shipmentModel.create).not.toHaveBeenCalled();
  });

  it('2 group cùng recipient_key -> tạo 2 shipment CHUNG 1 trip_code', async () => {
    const group1 = makeGroup({ recipient_key: 'cung-1-nguoi' });
    const group2 = makeGroup({ recipient_key: 'cung-1-nguoi' });
    orderGroupsService.findOrderGroupById
      .mockResolvedValueOnce(group1)
      .mockResolvedValueOnce(group2);

    const result = await ship([group1._id.toString(), group2._id.toString()]);

    expect(result.shipments).toHaveLength(2);
    expect(result.shipments[0]?.trackingCode).not.toBe(
      result.shipments[1]?.trackingCode,
    );
    expect(result.totalCostVnd).toBe(100000);
  });

  it('2 group KHÁC recipient_key -> SHP_RECIPIENT_MISMATCH, không tạo shipment nào', async () => {
    const group1 = makeGroup({ recipient_key: 'nguoi-a' });
    const group2 = makeGroup({ recipient_key: 'nguoi-b' });
    orderGroupsService.findOrderGroupById
      .mockResolvedValueOnce(group1)
      .mockResolvedValueOnce(group2);

    await expect(
      ship([group1._id.toString(), group2._id.toString()]),
    ).rejects.toMatchObject({
      errorCode: SHP_ERROR_CODES.RECIPIENT_MISMATCH,
    });
    expect(shipmentModel.create).not.toHaveBeenCalled();
  });

  it('2 group nhưng recipient_key = null -> SHP_RECIPIENT_MISMATCH', async () => {
    const group1 = makeGroup({ recipient_key: null });
    const group2 = makeGroup({ recipient_key: null });
    orderGroupsService.findOrderGroupById
      .mockResolvedValueOnce(group1)
      .mockResolvedValueOnce(group2);

    await expect(
      ship([group1._id.toString(), group2._id.toString()]),
    ).rejects.toMatchObject({
      errorCode: SHP_ERROR_CODES.RECIPIENT_MISMATCH,
    });
  });

  it('group đã có shipment từ trước (E11000) -> SHP_GROUP_ALREADY_SHIPPED', async () => {
    const group = makeGroup();
    orderGroupsService.findOrderGroupById.mockResolvedValue(group);
    shipmentModel.create.mockRejectedValue({ code: 11000 });

    await expect(ship([group._id.toString()])).rejects.toMatchObject({
      errorCode: SHP_ERROR_CODES.GROUP_ALREADY_SHIPPED,
    });
  });

  it('schedulePickup: id sai -> SHP_SHIPMENT_NOT_FOUND; quá khứ -> SHP_PICKUP_IN_PAST; không có vận đơn -> NOT_FOUND', async () => {
    await expect(
      service.schedulePickup(
        'khong-phai-objectid',
        new Date(Date.now() + 1000),
      ),
    ).rejects.toMatchObject({
      errorCode: SHP_ERROR_CODES.SHIPMENT_NOT_FOUND,
    });
    await expect(
      service.schedulePickup(
        new Types.ObjectId().toString(),
        new Date(Date.now() - 3_600_000),
      ),
    ).rejects.toMatchObject({
      errorCode: SHP_ERROR_CODES.PICKUP_IN_PAST,
    });
    shipmentModel.findByIdAndUpdate.mockResolvedValue(null);
    await expect(
      service.schedulePickup(
        new Types.ObjectId().toString(),
        new Date(Date.now() + 3_600_000),
      ),
    ).rejects.toMatchObject({
      errorCode: SHP_ERROR_CODES.SHIPMENT_NOT_FOUND,
    });
  });

  it('schedulePickup hợp lệ trả vận đơn đã cập nhật', async () => {
    const updated = { _id: new Types.ObjectId() };
    shipmentModel.findByIdAndUpdate.mockResolvedValue(updated);
    await expect(
      service.schedulePickup(
        updated._id.toString(),
        new Date(Date.now() + 3_600_000),
      ),
    ).resolves.toBe(updated);
  });
});
