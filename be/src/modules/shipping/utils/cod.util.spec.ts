import { codAmountOf, codOrderIdsPerParcel } from './cod.util';

//!=============================================
// AOFP-319 — tiền thu hộ (COD): đơn COD thu đủ tiền đơn, đơn trả trước = 0;
// mỗi đơn chỉ thu ở kiện có số nhỏ nhất chứa đơn đó.
//!=============================================
describe('cod.util', () => {
  it('đơn COD → thu đủ total_amount; đơn trả trước → 0 (AC2)', () => {
    expect(codAmountOf({ platform: 'lazada', payment_method: 'COD', total_amount: 350000 })).toBe(350000);
    expect(codAmountOf({ platform: 'lazada', payment_method: ' cod ', total_amount: 1000.4 })).toBe(1000);
    expect(codAmountOf({ platform: 'lazada', payment_method: 'MIXEDCARD', total_amount: 350000 })).toBe(0);
    expect(codAmountOf({ platform: 'lazada', payment_method: null, total_amount: 350000 })).toBe(0);
    expect(codAmountOf({ platform: 'aurelle', payment_method: 'PREPAID', total_amount: 350000 })).toBe(0);
  });

  it('đơn AURELLE cũ chưa lưu payment_method → vẫn là COD (AURELLE chỉ có COD)', () => {
    expect(codAmountOf({ platform: 'aurelle', total_amount: 200000 })).toBe(200000);
    expect(codAmountOf({ platform: 'aurelle', payment_method: null, total_amount: 200000 })).toBe(200000);
  });

  it('2 đơn A, B thành 2 kiện → mỗi đơn thu ở kiện đầu của đơn đó (AC1)', () => {
    expect(codOrderIdsPerParcel([
      { parcelNo: 1, orderIds: ['A'] },
      { parcelNo: 2, orderIds: ['B'] },
    ])).toEqual([['A'], ['B']]);
  });

  it('kiện gộp + đơn nhiều kiện + thứ tự đảo → không đơn nào thu 2 lần', () => {
    expect(codOrderIdsPerParcel([
      { parcelNo: 3, orderIds: ['A'] },
      { parcelNo: 2, orderIds: ['B', 'A'] },
      { parcelNo: 1, orderIds: ['A'] },
    ])).toEqual([[], ['B'], ['A']]);
  });
});
