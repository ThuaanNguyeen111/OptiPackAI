import {
  DEMO_MOBILE_PREFIXES,
  buildDemoRecipient,
  formatDemoStreet,
  needsDemoRecipient,
  randomVietnamMobile,
  seededRandom,
  type DemoRecipientSettings,
} from './demo-recipient.util';

//!=============================================
// 28/10/2026 — địa chỉ mô phỏng cho đơn bị che (demo). Quyết định theo dữ liệu, không theo sàn:
// đơn Lazada bị che → cần; đơn AURELLE đủ địa chỉ → không. Số nhà tăng dần, SĐT 03x/09x 10 số.
//!=============================================
describe('demo-recipient.util', () => {
  const settings: DemoRecipientSettings = {
    enabled: true,
    streetTemplate: '47/{n} Nguyễn Văn Đậu',
    startNumber: 10,
    wardName: 'Phường Gia Định',
    provinceName: 'Hồ Chí Minh',
    firstPhone: '0377168254',
  };

  describe('needsDemoRecipient', () => {
    it('đơn Lazada bị che (SĐT, số nhà, tỉnh) → cần', () => {
      expect(
        needsDemoRecipient({ phone: '8**5', address_line1: 'S**e', city: 'Phường Gia Định', province_name: null, ward_name: null }),
      ).toBe(true);
    });

    it('đơn AURELLE đủ địa chỉ → không cần', () => {
      expect(
        needsDemoRecipient({
          phone: '0901234567',
          address_line1: '12 Lê Lợi, Phường Bến Thành',
          city: 'Hồ Chí Minh',
          province_name: 'Hồ Chí Minh',
          ward_name: 'Phường Bến Thành',
        }),
      ).toBe(false);
    });

    it('chỉ SĐT không hợp lệ (thiếu số) → cần', () => {
      expect(
        needsDemoRecipient({ phone: '090123', address_line1: '12 Lê Lợi', city: 'X', province_name: 'Hồ Chí Minh', ward_name: 'Phường Bến Thành' }),
      ).toBe(true);
    });

    it('phường nằm ở city (Lazada) và các phần khác đủ → không cần', () => {
      expect(
        needsDemoRecipient({ phone: '0901234567', address_line1: '12 Lê Lợi', city: 'Phường Gia Định', province_name: 'Hồ Chí Minh', ward_name: null }),
      ).toBe(false);
    });
  });

  it('formatDemoStreet: thay {n}; mẫu không có {n} thì nối số vào đầu', () => {
    expect(formatDemoStreet('47/{n} Nguyễn Văn Đậu', 11)).toBe('47/11 Nguyễn Văn Đậu');
    expect(formatDemoStreet('Nguyễn Văn Đậu', 5)).toBe('5 Nguyễn Văn Đậu');
  });

  it('randomVietnamMobile: 10 số, đầu số 03x/09x thuộc danh sách', () => {
    for (let i = 0; i < 200; i += 1) {
      const phone = randomVietnamMobile();
      expect(phone).toMatch(/^0[39]\d{8}$/);
      expect(DEMO_MOBILE_PREFIXES).toContain(phone.slice(0, 3));
    }
    // random trả sát 1 vẫn không vượt danh sách
    expect(randomVietnamMobile(() => 0.999999)).toMatch(/^098\d{7}$/);
  });

  describe('buildDemoRecipient', () => {
    it('đơn đầu tiên (seq = startNumber) dùng SĐT cấu hình, số nhà 47/10', () => {
      expect(buildDemoRecipient(10, settings)).toEqual({
        seq: 10,
        street: '47/10 Nguyễn Văn Đậu',
        ward_name: 'Phường Gia Định',
        province_name: 'Hồ Chí Minh',
        phone: '0377168254',
      });
    });

    it('đơn sau dùng SĐT ngẫu nhiên, số nhà tăng', () => {
      const value = buildDemoRecipient(11, settings, () => 0);
      expect(value?.street).toBe('47/11 Nguyễn Văn Đậu');
      expect(value?.phone).toBe('0320000000');
    });

    it('thiếu phường hoặc tỉnh trong cấu hình → null (không đoán)', () => {
      expect(buildDemoRecipient(10, { ...settings, wardName: null })).toBeNull();
      expect(buildDemoRecipient(10, { ...settings, provinceName: '  ' })).toBeNull();
    });
  });

  it('seededRandom: cùng hạt giống → cùng dãy số (SĐT cố định theo mã đơn), khác hạt giống → khác', () => {
    const a = randomVietnamMobile(seededRandom('6a1f00000000000000000001'));
    const b = randomVietnamMobile(seededRandom('6a1f00000000000000000001'));
    const c = randomVietnamMobile(seededRandom('6a1f00000000000000000002'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^0[39]\d{8}$/);
  });
});
