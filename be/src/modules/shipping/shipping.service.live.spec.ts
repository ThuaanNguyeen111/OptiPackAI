import { Types } from 'mongoose';
import { ShippingService } from './shipping.service';
import { SHIP_ERROR_CODES } from './shipping.errors';
import { AppException } from '../../common/exceptions/app-exception';

//!=============================================
// C4/C6 (14/10/2026) — hãng API (GHN) nằm CHUNG danh mục với hãng bảng cước của module
// shipping: báo giá vẫn 1 dòng/(hãng, dịch vụ); hãng API lỗi địa chỉ không làm hỏng cả bảng
// và không được đề xuất; so phương án đóng gói tính TỔNG thùng + vật tư + phí ship.
//!=============================================
describe('ShippingService — hãng API + so phương án đóng gói', () => {
  const groupId = new Types.ObjectId().toString();
  const orderA = new Types.ObjectId();
  const outer = { length_mm: 300, width_mm: 250, height_mm: 40 };

  const tableCarrier = {
    code: 'SAMPLE', name: 'Hãng mẫu', volumetric_divisor: 5000, is_sample: true, kind: 'table',
    services: [{ code: 'STD', name: 'Tiêu chuẩn', eta_min_days: 3, eta_max_days: 5, bands: [{ up_to_g: 1000, price_vnd: 25000 }, { up_to_g: 5000, price_vnd: 40000 }], extra_price_vnd_per_500g: 5000 }],
  };
  const ghn = {
    code: 'GHN', name: 'GHN', volumetric_divisor: 5000, is_sample: false, kind: 'live',
    services: [{ code: 'LIGHT', name: 'Hàng nhẹ', eta_min_days: 1, eta_max_days: 3, bands: [], extra_price_vnd_per_500g: 0, carrier_service_type_id: 2 }],
  };
  const plan = {
    _id: new Types.ObjectId(), status: 'approved', is_active: true,
    parcels: [{ parcel_no: 1, order_id: orderA, platform_order_id: 'P1', box: { code: 'BAG', name: 'Túi', inner_mm: outer, outer_mm: outer, tare_g: 20, max_load_g: 5000, price_vnd: 1500 }, placements: [], estimated_weight_g: 300, actual_weight_kg: null, shipping_cost_vnd: null }],
  };

  let carrierModel: { find: jest.Mock; findOne: jest.Mock };
  let liveCarrier: { quoteParcels: jest.Mock };
  let packingPlanService: { boxOptionsForGroup: jest.Mock };
  let service: ShippingService;

  beforeEach(() => {
    carrierModel = {
      find: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([tableCarrier, ghn]) }),
      findOne: jest.fn((q: { code: string }) => Promise.resolve(q.code === 'GHN' ? ghn : tableCarrier)),
    };
    liveCarrier = {
      quoteParcels: jest.fn().mockImplementation((ref: { carrierCode: string; serviceCode: string }, parcels: { actualG: number }[]) =>
        Promise.resolve({
          carrierCode: ref.carrierCode, carrierName: 'GHN', serviceCode: ref.serviceCode, serviceName: 'Hàng nhẹ', etaMinDays: 1, etaMaxDays: 1,
          parcels: [], totalChargeableG: 0, totalCostVnd: parcels.reduce((s, p) => s + (p.actualG > 1000 ? 34100 : 20900), 0),
          isSample: false, isLive: true, unavailableReason: null, assumptions: [],
        })),
    };
    packingPlanService = { boxOptionsForGroup: jest.fn() };
    service = new ShippingService(
      carrierModel as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      { findOne: jest.fn().mockResolvedValue(plan) } as never,
      { findOrderGroupById: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(groupId) }) } as never,
      liveCarrier as never,
      packingPlanService as never,
    );
  });

  it('báo giá có cả hãng bảng cước và GHN; kiện mang parcelNo để tạo vận đơn theo kiện', async () => {
    const q = await service.quoteForGroup(groupId);
    expect(q.quotes.map((x) => x.carrierCode)).toEqual(['SAMPLE', 'GHN']);
    expect(q.quotes[1]?.isLive).toBe(true);
    const parcelsSent = (liveCarrier.quoteParcels.mock.calls[0] as [unknown, { parcelNo: number }[]])[1];
    expect(parcelsSent[0]?.parcelNo).toBe(1);
    expect(q.recommended).toEqual({ carrierCode: 'GHN', serviceCode: 'LIGHT' }); // rẻ hơn (20.900 < 25.000)
  });

  it('GHN báo lỗi địa chỉ → dòng GHN có unavailableReason, KHÔNG được đề xuất, hãng khác vẫn báo giá', async () => {
    liveCarrier.quoteParcels.mockRejectedValue(new AppException('CARRIER_ADDRESS_INCOMPLETE', 'Thiếu tỉnh', 422));
    const q = await service.quoteForGroup(groupId);
    expect(q.quotes[1]?.unavailableReason).toContain('CARRIER_ADDRESS_INCOMPLETE');
    expect(q.recommended).toEqual({ carrierCode: 'SAMPLE', serviceCode: 'STD' });
  });

  it('tạo vận đơn với GHN: báo giá CHẶT — lỗi địa chỉ ném ra luôn', async () => {
    liveCarrier.quoteParcels.mockRejectedValue(new AppException('CARRIER_ADDRESS_CONFLICT', 'Sai phường', 422));
    await expect(service.quoteChosenService(groupId, 'GHN', 'LIGHT')).rejects.toMatchObject({ errorCode: 'CARRIER_ADDRESS_CONFLICT' });
  });

  it('không sửa danh sách dịch vụ của hãng API qua PATCH', async () => {
    const id = new Types.ObjectId().toString();
    (carrierModel as unknown as { findById: jest.Mock }).findById = jest.fn().mockResolvedValue({ ...ghn, _id: id });
    await expect(service.updateCarrier(id, { services: [] })).rejects.toMatchObject({ errorCode: SHIP_ERROR_CODES.LIVE_CARRIER_SERVICES_LOCKED });
  });

  describe('C6 — so phương án đóng gói', () => {
    const boxOptions = [{
      parcelNo: 1, orderId: orderA.toString(), platformOrderId: 'P1', sealed: false,
      current: { boxCode: 'BOX-M', boxName: 'Thùng M', outerMm: { length_mm: 400, width_mm: 300, height_mm: 200 }, estimatedWeightG: 1200, boxPriceVnd: 4500, materialsCostVnd: 800 },
      options: [
        { boxCode: 'BAG', boxName: 'Túi', outerMm: outer, estimatedWeightG: 320, boxPriceVnd: 1500, materialsCostVnd: 0, available: 10 },
        { boxCode: 'BOX-S', boxName: 'Thùng S', outerMm: { length_mm: 250, width_mm: 200, height_mm: 100 }, estimatedWeightG: 500, boxPriceVnd: 3000, materialsCostVnd: 300, available: 0 },
      ],
    }];

    it('GHN: tổng = thùng + vật tư + phí ship; túi rẻ nhất, tiết kiệm = hiện tại − tốt nhất; thùng hết hàng không đề xuất', async () => {
      packingPlanService.boxOptionsForGroup.mockResolvedValue(boxOptions);
      const r = await service.packagingOptions(groupId, 'GHN', 'LIGHT');
      const p = r.parcels[0];
      expect(p?.current.totalVnd).toBe(4500 + 800 + 34100);
      expect(p?.best?.boxCode).toBe('BAG');
      expect(p?.best?.totalVnd).toBe(1500 + 0 + 20900);
      expect(p?.savingVnd).toBe(4500 + 800 + 34100 - (1500 + 20900));
      expect(p?.options.map((o) => o.boxCode)).toEqual(['BAG', 'BOX-M']); // BOX-S hết hàng bị loại
      expect(r.totalSavingVnd).toBe(p?.savingVnd);
    });

    it('hãng bảng cước: phí ship tra bảng (không gọi GHN)', async () => {
      packingPlanService.boxOptionsForGroup.mockResolvedValue(boxOptions);
      const r = await service.packagingOptions(groupId, 'SAMPLE', 'STD');
      expect(liveCarrier.quoteParcels).not.toHaveBeenCalled();
      expect(r.isLive).toBe(false);
      expect(r.parcels[0]?.best?.boxCode).toBe('BAG');
    });

    it('nhóm chưa có kiện → SHIP_NO_PARCELS', async () => {
      packingPlanService.boxOptionsForGroup.mockResolvedValue([]);
      await expect(service.packagingOptions(groupId, 'GHN', 'LIGHT')).rejects.toMatchObject({ errorCode: SHIP_ERROR_CODES.NO_PARCELS });
    });
  });
});
