import { Types } from 'mongoose';
import { ShippingService } from './shipping.service';
import { SHIP_ERROR_CODES } from './shipping.errors';

//!=============================================
// 30/09/2026 — báo giá vận chuyển theo TỪNG KIỆN (đa kiện), cân thật ưu tiên hơn
// cân ước tính, chiến lược đề xuất, validate bảng cước, ghi cước lên phương án.
// 04/10/2026 — đọc kiện từ `packing_plans` (kế hoạch 1/nhóm) qua parcelsOfPlan().
//!=============================================
describe('ShippingService', () => {
  const groupId = new Types.ObjectId().toString();
  const orderA = new Types.ObjectId();

  let carrierModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let settingsModel: { findOne: jest.Mock; updateOne: jest.Mock };
  let planModel: { findOne: jest.Mock; updateOne: jest.Mock };
  let orderGroupsService: { findOrderGroupById: jest.Mock };
  let service: ShippingService;

  const outerSmall = { length_mm: 200, width_mm: 150, height_mm: 100 }; // 3000 cm³ → 600 g @5000
  const outerBig = { length_mm: 400, width_mm: 300, height_mm: 200 }; // 24000 cm³ → 4800 g @5000

  const carrier = {
    code: 'C1',
    name: 'Hãng mẫu',
    volumetric_divisor: 5000,
    is_sample: true,
    services: [
      {
        code: 'ECO',
        name: 'Tiết kiệm',
        eta_min_days: 3,
        eta_max_days: 5,
        bands: [
          { up_to_g: 1000, price_vnd: 20000 },
          { up_to_g: 2000, price_vnd: 30000 },
        ],
        extra_price_vnd_per_500g: 5000,
      },
      {
        code: 'EXP',
        name: 'Nhanh',
        eta_min_days: 1,
        eta_max_days: 2,
        bands: [{ up_to_g: 2000, price_vnd: 50000 }],
        extra_price_vnd_per_500g: 9000,
      },
    ],
  };

  function parcel(
    parcelNo: number,
    outer: typeof outerSmall,
    estimatedG: number,
    actualKg: number | null = null,
    orderId: Types.ObjectId = orderA,
  ): Record<string, unknown> {
    return {
      parcel_no: parcelNo,
      order_id: orderId,
      platform_order_id: 'P-' + orderId.toString().slice(-4),
      box: { code: 'M', name: 'M', inner_mm: outer, outer_mm: outer, tare_g: 100, max_load_g: 20000, price_vnd: 4500 },
      placements: [],
      estimated_weight_g: estimatedG,
      actual_weight_kg: actualKg,
      shipping_cost_vnd: null,
    };
  }

  /** Kế hoạch đã duyệt có các kiện cho trước. */
  function plan(parcels: Record<string, unknown>[]): Record<string, unknown> {
    return { _id: new Types.ObjectId(), status: 'approved', is_active: true, parcels };
  }

  beforeEach(() => {
    carrierModel = {
      find: jest
        .fn()
        .mockReturnValue({ sort: jest.fn().mockResolvedValue([carrier]) }),
      findOne: jest.fn().mockResolvedValue(carrier),
      create: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    settingsModel = {
      findOne: jest.fn().mockResolvedValue(null),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    planModel = {
      findOne: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    orderGroupsService = {
      findOrderGroupById: jest
        .fn()
        .mockResolvedValue({ _id: new Types.ObjectId(groupId) }),
    };
    service = new ShippingService(
      carrierModel as never,
      settingsModel as never,
      planModel as never,
      orderGroupsService as never,
    );
  });

  it('báo giá tính THEO TỪNG KIỆN: kiện cồng kềnh nhẹ tính theo thể tích, mỗi (hãng, dịch vụ) một dòng', async () => {
    planModel.findOne.mockResolvedValue(
      plan([parcel(1, outerSmall, 400), parcel(2, outerBig, 900)]),
    );

    const result = await service.quoteForGroup(groupId);

    expect(result.parcelCount).toBe(2);
    expect(result.quotes.map((q) => q.serviceCode)).toEqual(['ECO', 'EXP']);
    const eco = result.quotes[0];
    // kiện 0: max(400, 600)=600 → 20.000 ; kiện 1: max(900, 4800)=4800 → 30.000 + ceil(2800/500)*5.000 = 58.000
    expect(eco?.parcels.map((p) => p.chargeableG)).toEqual([600, 4800]);
    expect(eco?.totalCostVnd).toBe(20000 + 30000 + 6 * 5000);
    expect(eco?.isSample).toBe(true);
  });

  it('cân THẬT lúc pack được ưu tiên hơn cân ước tính', async () => {
    planModel.findOne.mockResolvedValue(plan([parcel(1, outerSmall, 400, 1.8)]));

    const result = await service.quoteForGroup(groupId);

    expect(result.quotes[0]?.parcels[0]).toMatchObject({
      actualG: 1800,
      chargeableG: 1800,
    });
  });

  it('đề xuất theo chiến lược: mặc định cheapest; fastest chọn dịch vụ nhanh', async () => {
    planModel.findOne.mockResolvedValue(plan([parcel(1, outerSmall, 400)]));
    expect((await service.quoteForGroup(groupId)).recommended).toEqual({
      carrierCode: 'C1',
      serviceCode: 'ECO',
    });

    settingsModel.findOne.mockResolvedValue({
      strategy: 'fastest',
      default_carrier_code: null,
      default_service_code: null,
    });
    expect((await service.quoteForGroup(groupId)).recommended).toEqual({
      carrierCode: 'C1',
      serviceCode: 'EXP',
    });
  });

  it('nhóm chưa có kế hoạch đã duyệt → SHIP_NO_PARCELS', async () => {
    planModel.findOne.mockResolvedValue(null);
    await expect(service.quoteForGroup(groupId)).rejects.toMatchObject({
      errorCode: SHIP_ERROR_CODES.NO_PARCELS,
    });
  });

  it('chỉ lấy kế hoạch ĐANG HOẠT ĐỘNG đã duyệt, đang đóng hoặc đã đóng (truy vấn đúng bộ lọc)', async () => {
    planModel.findOne.mockResolvedValue(plan([parcel(1, outerSmall, 400)]));
    await service.quoteForGroup(groupId);
    const [filter] = planModel.findOne.mock.calls[0] as [Record<string, unknown>];
    expect(filter).toMatchObject({ is_active: true });
    expect(filter.status).toEqual({ $in: ['approved', 'packing', 'packed'] });
  });

  it('quoteChosenService: dịch vụ không tồn tại → SHIP_SERVICE_NOT_FOUND', async () => {
    await expect(
      service.quoteChosenService(groupId, 'C1', 'KHONG-CO'),
    ).rejects.toMatchObject({
      errorCode: SHIP_ERROR_CODES.SERVICE_NOT_FOUND,
    });
    carrierModel.findOne.mockResolvedValue(null);
    await expect(
      service.quoteChosenService(groupId, 'X', 'ECO'),
    ).rejects.toMatchObject({
      errorCode: SHIP_ERROR_CODES.SERVICE_NOT_FOUND,
    });
  });

  it('persistCosts: ghi cước lên ĐÚNG từng kiện của kế hoạch (theo đơn + thứ tự kiện trong đơn)', async () => {
    const orderB = new Types.ObjectId();
    const current = plan([
      parcel(1, outerSmall, 400),
      parcel(2, outerSmall, 400),
      parcel(3, outerSmall, 400, null, orderB),
    ]);
    planModel.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(current) });
    await service.persistCosts(
      groupId,
      {
        carrierCode: 'C1',
        carrierName: 'x',
        serviceCode: 'ECO',
        serviceName: 'x',
        etaMinDays: 1,
        etaMaxDays: 2,
        parcels: [
          {
            orderId: orderA.toString(),
            cartonIndex: 0,
            actualG: 1,
            volumetricG: 1,
            chargeableG: 1,
            costVnd: 20000,
          },
          {
            orderId: orderA.toString(),
            cartonIndex: 1,
            actualG: 1,
            volumetricG: 1,
            chargeableG: 1,
            costVnd: 30000,
          },
          {
            orderId: orderB.toString(),
            cartonIndex: 0,
            actualG: 1,
            volumetricG: 1,
            chargeableG: 1,
            costVnd: 20000,
          },
        ],
        totalChargeableG: 3,
        totalCostVnd: 70000,
        isSample: true,
      },
      {} as never,
    );
    expect(planModel.updateOne).toHaveBeenCalledTimes(1);
    const [, update] = planModel.updateOne.mock.calls[0] as [unknown, { $set: Record<string, number> }];
    expect(update.$set).toEqual({
      'parcels.0.shipping_cost_vnd': 20000,
      'parcels.1.shipping_cost_vnd': 30000,
      'parcels.2.shipping_cost_vnd': 20000,
    });
  });

  describe('bảng cước hợp lệ', () => {
    const svc = (
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      code: 'S1',
      name: 'S1',
      eta_min_days: 1,
      eta_max_days: 2,
      bands: [
        { up_to_g: 500, price_vnd: 1 },
        { up_to_g: 1000, price_vnd: 2 },
      ],
      ...overrides,
    });
    const create = (services: Record<string, unknown>[]): Promise<unknown> =>
      service.createCarrier({ code: 'NEW', name: 'New', services } as never);

    it('bậc không tăng dần → SHIP_INVALID_RATE_TABLE', async () => {
      await expect(
        create([
          svc({
            bands: [
              { up_to_g: 1000, price_vnd: 1 },
              { up_to_g: 500, price_vnd: 2 },
            ],
          }),
        ]),
      ).rejects.toMatchObject({
        errorCode: SHIP_ERROR_CODES.INVALID_RATE_TABLE,
      });
    });

    it('2 bậc trùng nhau → SHIP_INVALID_RATE_TABLE', async () => {
      await expect(
        create([
          svc({
            bands: [
              { up_to_g: 500, price_vnd: 1 },
              { up_to_g: 500, price_vnd: 2 },
            ],
          }),
        ]),
      ).rejects.toMatchObject({
        errorCode: SHIP_ERROR_CODES.INVALID_RATE_TABLE,
      });
    });

    it('ETA tối thiểu lớn hơn tối đa → SHIP_INVALID_RATE_TABLE', async () => {
      await expect(
        create([svc({ eta_min_days: 5, eta_max_days: 2 })]),
      ).rejects.toMatchObject({
        errorCode: SHIP_ERROR_CODES.INVALID_RATE_TABLE,
      });
    });

    it('mã dịch vụ trùng trong cùng hãng → SHIP_INVALID_RATE_TABLE', async () => {
      await expect(create([svc(), svc()])).rejects.toMatchObject({
        errorCode: SHIP_ERROR_CODES.INVALID_RATE_TABLE,
      });
    });

    it('mã hãng trùng (E11000) → SHIP_CARRIER_CODE_IN_USE', async () => {
      carrierModel.create.mockRejectedValue({ code: 11000 });
      await expect(create([svc()])).rejects.toMatchObject({
        errorCode: SHIP_ERROR_CODES.CARRIER_CODE_IN_USE,
      });
    });
  });

  describe('tùy chọn của Store Owner', () => {
    it('mặc định cheapest, chưa có dịch vụ mặc định', async () => {
      await expect(service.getSettings()).resolves.toEqual({
        strategy: 'cheapest',
        defaultCarrierCode: null,
        defaultServiceCode: null,
      });
    });

    it('fixed mà thiếu carrier/service → SHIP_SETTINGS_SERVICE_INVALID', async () => {
      await expect(
        service.updateSettings(
          { strategy: 'fixed', default_carrier_code: 'C1' } as never,
          new Types.ObjectId().toString(),
        ),
      ).rejects.toMatchObject({
        errorCode: SHIP_ERROR_CODES.SETTINGS_SERVICE_INVALID,
      });
    });

    it('dịch vụ mặc định không tồn tại → SHIP_SERVICE_NOT_FOUND, không lưu', async () => {
      await expect(
        service.updateSettings(
          {
            strategy: 'fixed',
            default_carrier_code: 'C1',
            default_service_code: 'GONE',
          } as never,
          new Types.ObjectId().toString(),
        ),
      ).rejects.toMatchObject({
        errorCode: SHIP_ERROR_CODES.SERVICE_NOT_FOUND,
      });
      expect(settingsModel.updateOne).not.toHaveBeenCalled();
    });

    it('cheapest không cần dịch vụ mặc định → lưu bằng upsert', async () => {
      await service.updateSettings(
        { strategy: 'cheapest' } as never,
        new Types.ObjectId().toString(),
      );
      expect(settingsModel.updateOne).toHaveBeenCalledTimes(1);
      const [, , options] = settingsModel.updateOne.mock.calls[0] as [
        unknown,
        unknown,
        { upsert: boolean },
      ];
      expect(options.upsert).toBe(true);
    });
  });
});
