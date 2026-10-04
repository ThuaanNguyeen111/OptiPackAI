import { Types } from 'mongoose';
import { ShippingService } from './shipping.service';
import { SHIP_ERROR_CODES } from './shipping.errors';
import { PackagingApprovalStatus } from '../packaging/enums/packaging-approval-status.enum';

//!=============================================
// 30/09/2026 — báo giá vận chuyển theo TỪNG KIỆN (đa kiện), cân thật ưu tiên hơn
// cân ước tính, chiến lược đề xuất, validate bảng cước, ghi cước lên phương án.
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
  let recommendationModel: { find: jest.Mock; updateOne: jest.Mock };
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

  function carton(
    index: number,
    outer: typeof outerSmall,
    estimatedG: number,
    actualKg: number | null = null,
  ): Record<string, unknown> {
    return {
      index,
      box_code: 'M',
      box_name: 'M',
      box_inner_mm: outer,
      box_outer_mm: outer,
      placements: [],
      fill_ratio: 0.3,
      items_weight_g: estimatedG,
      estimated_package_weight_g: estimatedG,
      volumetric_weight_g: 0,
      materials: [],
      materials_weight_g: 0,
      materials_cost_vnd: 0,
      actual_measured_weight_kg: actualKg,
      is_abnormal: false,
      packing_guide: null,
    };
  }

  function rec(
    cartons: Record<string, unknown>[],
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      _id: new Types.ObjectId(),
      order_id: orderA,
      solution_status: 'ok',
      approval_status: PackagingApprovalStatus.APPROVED,
      cartons,
      carton_count: cartons.length,
      ...overrides,
    };
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
    recommendationModel = {
      find: jest.fn(),
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
      recommendationModel as never,
      orderGroupsService as never,
    );
  });

  it('báo giá tính THEO TỪNG KIỆN: kiện cồng kềnh nhẹ tính theo thể tích, mỗi (hãng, dịch vụ) một dòng', async () => {
    recommendationModel.find.mockResolvedValue([
      rec([carton(0, outerSmall, 400), carton(1, outerBig, 900)]),
    ]);

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
    recommendationModel.find.mockResolvedValue([
      rec([carton(0, outerSmall, 400, 1.8)]),
    ]);

    const result = await service.quoteForGroup(groupId);

    expect(result.quotes[0]?.parcels[0]).toMatchObject({
      actualG: 1800,
      chargeableG: 1800,
    });
  });

  it('bản ghi CŨ (chưa có mảng cartons) vẫn báo giá đúng 1 kiện từ field cấp phương án', async () => {
    recommendationModel.find.mockResolvedValue([
      rec([], {
        box_code: 'M',
        box_name: 'M',
        box_inner_mm: outerSmall,
        box_outer_mm: outerSmall,
        placements: [],
        materials: [],
        estimated_package_weight_g: 400,
        items_weight_g: 300,
        fill_ratio: 0.2,
        volumetric_weight_g: 500,
        materials_weight_g: 0,
        materials_cost_vnd: 0,
        actual_measured_weight_kg: null,
        is_abnormal: false,
        packing_guide: null,
      }),
    ]);

    const result = await service.quoteForGroup(groupId);
    expect(result.parcelCount).toBe(1);
  });

  it('đề xuất theo chiến lược: mặc định cheapest; fastest chọn dịch vụ nhanh', async () => {
    recommendationModel.find.mockResolvedValue([
      rec([carton(0, outerSmall, 400)]),
    ]);
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

  it('nhóm chưa có kiện đã duyệt → SHIP_NO_PARCELS', async () => {
    recommendationModel.find.mockResolvedValue([]);
    await expect(service.quoteForGroup(groupId)).rejects.toMatchObject({
      errorCode: SHIP_ERROR_CODES.NO_PARCELS,
    });
  });

  it('chỉ lấy phương án ĐÃ DUYỆT còn hiệu lực có thùng hợp lệ (truy vấn đúng bộ lọc)', async () => {
    recommendationModel.find.mockResolvedValue([
      rec([carton(0, outerSmall, 400)]),
    ]);
    await service.quoteForGroup(groupId);
    const [filter] = recommendationModel.find.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(filter).toMatchObject({ is_active: true, solution_status: 'ok' });
    expect(filter.approval_status).toEqual({
      $in: [PackagingApprovalStatus.APPROVED, PackagingApprovalStatus.ADJUSTED],
    });
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

  it('persistCosts: cộng cước các kiện của MỖI đơn rồi ghi lên phương án của đơn đó', async () => {
    const orderB = new Types.ObjectId();
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
    expect(recommendationModel.updateOne).toHaveBeenCalledTimes(2);
    const costs = recommendationModel.updateOne.mock.calls.map(
      (call) =>
        (
          call as [unknown, { $set: { estimated_shipping_cost_vnd: number } }]
        )[1].$set.estimated_shipping_cost_vnd,
    );
    expect(costs).toEqual([50000, 20000]);
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
