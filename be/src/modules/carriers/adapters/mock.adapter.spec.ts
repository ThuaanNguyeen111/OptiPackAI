import { CARRIER_ERROR_CODES } from '../carriers.errors';
import { MockCarrierAdapter } from './mock.adapter';
import { chargeableWeightG, validateParcel, volumetricWeightG } from '../utils/parcel.util';
import { selectCarrierAdapter } from '../carriers.module';
import { GhnAdapter } from './ghn.adapter';

describe('MockCarrierAdapter + parcel.util + chọn adapter (08/10/2026, C2)', () => {
  const adapter = new MockCarrierAdapter();
  const bag = { weight_g: 300, length_cm: 30, width_cm: 25, height_cm: 4 };
  const carton = { weight_g: 300, length_cm: 40, width_cm: 30, height_cm: 20 };

  it('trọng lượng quy đổi / tính cước', () => {
    expect(volumetricWeightG(bag)).toBe(600);
    expect(volumetricWeightG(carton)).toBe(4800);
    expect(chargeableWeightG(bag)).toBe(600);
    expect(chargeableWeightG({ ...bag, weight_g: 900 })).toBe(900);
  });

  it('validateParcel bắt cân nặng/cạnh không hợp lệ', () => {
    expect(validateParcel(bag)).toEqual([]);
    expect(validateParcel({ ...bag, weight_g: 60_000 })).toHaveLength(1);
    expect(validateParcel({ ...bag, height_cm: 0, width_cm: 2.5 })).toHaveLength(2);
  });

  it('phí mô phỏng: túi ≤1kg = 20.900đ (khớp GHN thật), thùng to đắt hơn theo bậc 500 g', async () => {
    const bagFee = await adapter.calculateFee({ to_district_id: 1462, to_ward_code: '21620', parcel: bag });
    const cartonFee = await adapter.calculateFee({ to_district_id: 1462, to_ward_code: '21620', parcel: carton });
    expect(bagFee.total).toBe(20_900);
    expect(cartonFee.total).toBeGreaterThan(bagFee.total);
  });

  it('tạo lại cùng client_order_code → cùng mã vận đơn; huỷ xong trạng thái là cancel', async () => {
    const input = {
      client_order_code: 'SHP-1',
      recipient: {
        name: 'A', phone: '0900000000', address: 'x', district_id: 1462, ward_code: '21620',
        province_name: 'Hồ Chí Minh', district_name: 'Quận Bình Thạnh', ward_name: 'Phường 28',
      },
      parcel: bag,
      items: [],
      content: 'Áo',
      cod_amount: 0,
    };
    const first = await adapter.createShipment(input);
    const second = await adapter.createShipment(input);
    expect(first.carrier_order_code).toBe('MOCK-SHP-1');
    expect(second.carrier_order_code).toBe(first.carrier_order_code);
    expect((await adapter.previewShipment(input)).carrier_order_code).toBe('');
    await adapter.cancelShipment(first.carrier_order_code);
    expect((await adapter.getShipmentDetail(first.carrier_order_code)).carrier_status).toBe('cancel');
  });

  it('kiện sai kích thước → CARRIER_PARCEL_LIMIT_EXCEEDED', async () => {
    await expect(
      adapter.calculateFee({ to_district_id: 1, to_ward_code: '1', parcel: { ...bag, length_cm: 201 } }),
    ).rejects.toMatchObject({ errorCode: CARRIER_ERROR_CODES.PARCEL_LIMIT_EXCEEDED });
  });

  it.each([
    [{ 'carrier.mode': 'mock', 'carrier.ghn.token': 'T' }, 'mock'],
    [{ 'carrier.mode': 'ghn_staging' }, 'ghn'],
    [{ 'carrier.mode': undefined, 'carrier.ghn.token': 'T' }, 'ghn'],
    [{ 'carrier.mode': undefined, 'carrier.ghn.token': undefined }, 'mock'],
  ])('selectCarrierAdapter(%p) → %s', (values, expected) => {
    const config = { get: (key: string): string | undefined => (values as Record<string, string | undefined>)[key] };
    const ghn = { code: 'ghn' } as unknown as GhnAdapter;
    const chosen = selectCarrierAdapter(config as never, ghn, adapter);
    expect(chosen.code).toBe(expected);
  });
});
