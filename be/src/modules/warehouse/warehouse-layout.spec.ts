import { buildBinCodeV2, computePickSequence } from './warehouse-layout';

describe('warehouse-layout (K2)', () => {
  const pos = (aisle: string, side: 'T' | 'P', bay: number, tier = 1, cell = 1): { zoneCode: string; aisle: string; side: 'T' | 'P'; bay: number; tier: number; cell: number } => ({ zoneCode: 'KA', aisle, side, bay, tier, cell });

  it('mã ô đúng định dạng 5 phần, số kệ/tầng đệm 2 chữ số', () => {
    expect(buildBinCodeV2(pos('D1', 'P', 2, 3, 1))).toBe('KA-D1-P02-T03-1');
  });

  it('lộ trình hình rắn: dãy lẻ đi xuôi, dãy chẵn đi ngược, hết dãy 1 mới sang dãy 2', () => {
    const d1bay1 = computePickSequence(pos('D1', 'T', 1));
    const d1bay5 = computePickSequence(pos('D1', 'T', 5));
    const d2bay5 = computePickSequence(pos('D2', 'T', 5));
    const d2bay1 = computePickSequence(pos('D2', 'T', 1));
    expect(d1bay1).toBeLessThan(d1bay5); // D1 xuôi
    expect(d1bay5).toBeLessThan(d2bay5); // hết D1 mới sang D2
    expect(d2bay5).toBeLessThan(d2bay1); // D2 ngược: đi từ cuối về đầu
  });

  it('đứng ở 1 vị trí lấy cả 2 bên: T rồi P, trước khi sang kệ kế tiếp', () => {
    const t = computePickSequence(pos('D1', 'T', 2));
    const p = computePickSequence(pos('D1', 'P', 2));
    const next = computePickSequence(pos('D1', 'T', 3));
    expect(t).toBeLessThan(p);
    expect(p).toBeLessThan(next);
  });

  it('khu KB luôn sau khu KA', () => {
    expect(computePickSequence({ ...pos('D99', 'P', 99, 9, 9), zoneCode: 'KA' })).toBeLessThan(
      computePickSequence({ ...pos('D1', 'T', 1), zoneCode: 'KB' }),
    );
  });
});
