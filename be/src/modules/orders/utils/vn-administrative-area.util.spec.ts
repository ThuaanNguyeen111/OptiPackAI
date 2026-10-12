import {
  classifyAdministrativeUnit,
  isMaskedValue,
  extractAdministrativeAreas,
  normalizeVietnameseText,
} from './vn-administrative-area.util';

describe('vn-administrative-area.util', () => {
  it('normalizeVietnameseText bỏ dấu, đ → d, chữ thường, gộp khoảng trắng', () => {
    expect(normalizeVietnameseText('  Quận   Bình Thạnh ')).toBe('quan binh thanh');
    expect(normalizeVietnameseText('Đà Nẵng')).toBe('da nang');
  });

  it.each([
    ['Phường 28', 'ward'],
    ['Phường Bình Lợi Trung', 'ward'],
    ['Xã Tân Nhựt', 'ward'],
    ['Thị trấn Củ Chi', 'ward'],
    ['Quận Bình Thạnh', 'district'],
    ['Huyện Củ Chi', 'district'],
    ['Thị xã Dĩ An', 'district'],
    ['Thành phố Thủ Đức', 'district'],
    ['Hồ Chí Minh', 'province'],
    ['Thành phố Hồ Chí Minh', 'province'],
    ['TP. Hồ Chí Minh', 'province'],
    ['Tỉnh Bình Dương', 'province'],
    ['Bình Dương', null],
    ['', null],
  ])('classifyAdministrativeUnit(%p) = %p', (input, expected) => {
    expect(classifyAdministrativeUnit(input)).toBe(expected);
  });

  it('địa chỉ 3 cấp đủ tiền tố → tách đúng từng cấp', () => {
    expect(
      extractAdministrativeAreas(['Hồ Chí Minh', 'Quận Bình Thạnh', 'Phường 28']),
    ).toEqual({
      province_name: 'Hồ Chí Minh',
      district_name: 'Quận Bình Thạnh',
      ward_name: 'Phường 28',
    });
  });

  it('địa chỉ 2 cấp sau sáp nhập (phường nằm ở vị trí quận) → không nhét phường vào quận', () => {
    expect(
      extractAdministrativeAreas(['Hồ Chí Minh', 'Phường Bình Lợi Trung', undefined]),
    ).toEqual({
      province_name: 'Hồ Chí Minh',
      district_name: null,
      ward_name: 'Phường Bình Lợi Trung',
    });
  });

  it('tỉnh không có tiền tố → lấp theo vị trí, không ghi đè cấp đã nhận theo tiền tố', () => {
    expect(
      extractAdministrativeAreas(['Bình Dương', 'Thành phố Thủ Dầu Một', 'Phường Phú Cường']),
    ).toEqual({
      province_name: 'Bình Dương',
      district_name: 'Thành phố Thủ Dầu Một',
      ward_name: 'Phường Phú Cường',
    });
  });

  it('chuỗi rỗng/thiếu → null, không throw', () => {
    expect(extractAdministrativeAreas([undefined, null, '  '])).toEqual({
      province_name: null,
      district_name: null,
      ward_name: null,
    });
  });

  it('hai chuỗi cùng cấp → giữ chuỗi đầu, bỏ chuỗi sau', () => {
    expect(
      extractAdministrativeAreas(['Hồ Chí Minh', 'Phường 6', 'Phường 28']).ward_name,
    ).toBe('Phường 6');
  });

  it('isMaskedValue nhận ra chuỗi có dấu *', () => {
    expect(isMaskedValue('T**h')).toBe(true);
    expect(isMaskedValue('Phường 6')).toBe(false);
  });

  it('chuỗi bị sàn che (có *) bị bỏ qua — dữ liệu thật Lazada 08/10/2026', () => {
    expect(
      extractAdministrativeAreas(['T**h', 'P**h', 'T*****h', 'Phường Gia Định']),
    ).toEqual({
      province_name: null,
      district_name: null,
      ward_name: 'Phường Gia Định',
    });
  });

  it('phần tử thứ 4 không có tiền tố → không lấp theo vị trí', () => {
    expect(
      extractAdministrativeAreas(['Hồ Chí Minh', 'Quận 1', 'Phường Bến Nghé', 'Sài Gòn']),
    ).toEqual({
      province_name: 'Hồ Chí Minh',
      district_name: 'Quận 1',
      ward_name: 'Phường Bến Nghé',
    });
  });
});

