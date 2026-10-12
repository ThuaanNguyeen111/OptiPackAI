import { CARRIER_ERROR_CODES } from '../carriers.errors';
import {
  buildCarrierRecipient,
  toCarrierProvinceName,
} from './recipient-address.util';

//!=============================================
// C3 (10/10/2026) — dựng địa chỉ gửi GHN kiểu 2 cấp mới từ địa chỉ đơn hàng.
//!=============================================
describe('recipient-address.util', () => {
  const lazadaMasked = {
    full_name: 'Nguyen Van A',
    phone: '0377168254',
    address_line1: '4***8 N***u',
    province_name: 'Hồ Chí Minh',
    district_name: null,
    ward_name: 'Phường Bình Lợi Trung',
  };

  it('đơn Lazada bị che số nhà → chỉ gửi phường + tỉnh (trường hợp GHN đã nhận khi test thật)', () => {
    const r = buildCarrierRecipient(lazadaMasked);
    expect(r).toEqual({
      name: 'Nguyen Van A',
      phone: '0377168254',
      address: 'Phường Bình Lợi Trung, Hồ Chí Minh',
      ward_name: 'Phường Bình Lợi Trung',
      province_name: 'Hồ Chí Minh',
      district_name: null,
    });
    expect(r.district_id).toBeUndefined(); // → adapter gửi kiểu mới
  });

  it('Coordinator nhập số nhà + sửa phường → dùng giá trị nhập đè', () => {
    const r = buildCarrierRecipient(lazadaMasked, {
      street: '47/88 Nguyễn Văn Đậu',
      ward_name: 'Phường Gia Định',
    });
    expect(r.address).toBe(
      '47/88 Nguyễn Văn Đậu, Phường Gia Định, Hồ Chí Minh',
    );
    expect(r.ward_name).toBe('Phường Gia Định');
  });

  it('street rỗng = cố ý bỏ số nhà dù đơn có address_line1 không bị che', () => {
    const r = buildCarrierRecipient(
      { ...lazadaMasked, address_line1: '47/88 Nguyễn Văn Đậu' },
      { street: '' },
    );
    expect(r.address).toBe('Phường Bình Lợi Trung, Hồ Chí Minh');
  });

  it('address_line1 đã chứa sẵn phường/tỉnh → không nối trùng', () => {
    const r = buildCarrierRecipient({
      ...lazadaMasked,
      address_line1: '47/88 Nguyễn Văn Đậu, Phường Bình Lợi Trung, Hồ Chí Minh',
    });
    expect(r.address).toBe(
      '47/88 Nguyễn Văn Đậu, Phường Bình Lợi Trung, Hồ Chí Minh',
    );
  });

  it('thiếu phường → CARRIER_ADDRESS_INCOMPLETE', () => {
    let caught: unknown;
    try {
      buildCarrierRecipient({ ...lazadaMasked, ward_name: null });
    } catch (err: unknown) {
      caught = err;
    }
    expect(caught).toMatchObject({ errorCode: CARRIER_ERROR_CODES.ADDRESS_INCOMPLETE });
  });

  it('chuẩn hoá tên tỉnh về dạng trần GHN nhận', () => {
    expect(toCarrierProvinceName('Thành phố Hồ Chí Minh')).toBe('Hồ Chí Minh');
    expect(toCarrierProvinceName('TP. Hồ Chí Minh')).toBe('Hồ Chí Minh');
    expect(toCarrierProvinceName('Tỉnh Đồng Nai')).toBe('Đồng Nai');
    expect(toCarrierProvinceName('Hồ Chí Minh')).toBe('Hồ Chí Minh');
  });
});
