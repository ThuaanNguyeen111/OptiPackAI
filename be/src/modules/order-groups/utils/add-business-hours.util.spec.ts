import { addBusinessHours } from './add-business-hours.util';

describe('addBusinessHours (8h-17h, tính cả Thứ 7, không tính Chủ Nhật)', () => {
  it('cộng bình thường trong cùng ngày làm việc, còn dư giờ', () => {
    const start = new Date('2026-09-14T09:00:00'); // Thứ 2
    const result = addBusinessHours(start, 4);
    expect(result.getHours()).toBe(13);
    expect(result.getDate()).toBe(14);
  });

  it('tràn giờ trong ngày -> cộng dồn sang sáng hôm sau (8h)', () => {
    const start = new Date('2026-09-14T16:00:00'); // Thứ 2, 16h
    const result = addBusinessHours(start, 4);
    expect(result.getDate()).toBe(15); // Thứ 3
    expect(result.getHours()).toBe(11);
  });

  it('tạo đơn NGOÀI giờ hành chính (tối muộn) -> tính từ 8h sáng hôm sau', () => {
    const start = new Date('2026-09-14T22:00:00'); // Thứ 2, 22h
    const result = addBusinessHours(start, 2);
    expect(result.getDate()).toBe(15); // Thứ 3
    expect(result.getHours()).toBe(10);
  });

  it('tạo đơn TRƯỚC giờ hành chính (sáng sớm) -> tính từ 8h cùng ngày', () => {
    const start = new Date('2026-09-14T06:00:00'); // Thứ 2, 6h sáng
    const result = addBusinessHours(start, 1);
    expect(result.getDate()).toBe(14);
    expect(result.getHours()).toBe(9);
  });

  it('Thứ 7 vẫn tính (không nhảy qua)', () => {
    const start = new Date('2026-09-19T09:00:00'); // Thứ 7
    const result = addBusinessHours(start, 2);
    expect(result.getDay()).toBe(6);
    expect(result.getHours()).toBe(11);
  });

  it('tràn từ Thứ 7 sang -> nhảy qua Chủ Nhật, tới thẳng Thứ 2', () => {
    const start = new Date('2026-09-19T16:00:00'); // Thứ 7, 16h
    const result = addBusinessHours(start, 4);
    expect(result.getDay()).toBe(1); // Thứ 2
    expect(result.getHours()).toBe(11);
  });

  it('tạo đơn ĐÚNG vào Chủ Nhật -> tính từ 8h sáng Thứ 2', () => {
    const start = new Date('2026-09-20T10:00:00'); // Chủ Nhật
    const result = addBusinessHours(start, 1);
    expect(result.getDay()).toBe(1);
    expect(result.getHours()).toBe(9);
  });

  it('cộng nhiều ngày liên tiếp (VD 20h = hơn 2 ngày làm việc)', () => {
    const start = new Date('2026-09-14T08:00:00'); // Thứ 2, 8h
    const result = addBusinessHours(start, 20);
    expect(result.getDate()).toBe(16); // Thứ 4
    expect(result.getHours()).toBe(10);
  });
});
