import { planBoxSources, type BoxStock } from './box-source.util';

type ParcelArg = Parameters<typeof planBoxSources>[0][number];

//!=============================================
// Nguồn thùng từng kiện (21/10/2026): mô phỏng đúng luật trừ tồn lúc niêm phong —
// tái sử dụng trước, dễ vỡ chỉ thùng mới (trừ khi cài đặt cho), trừ dần theo thứ tự kiện.
//!=============================================
describe('planBoxSources', () => {
  const parcel = (no: number, code: string, extra: Partial<ParcelArg> = {}): ParcelArg => ({
    parcel_no: no,
    box: { code },
    status: 'pending' as const,
    has_fragile: false,
    box_consumed: false,
    box_source_used: null,
    ...extra,
  });
  const stock = (rows: Record<string, BoxStock>): Map<string, BoxStock> => new Map(Object.entries(rows));

  it('tái sử dụng trước, hết ngăn tái sử dụng thì kiện sau lấy hàng mới (NO_REUSED_STOCK)', () => {
    const out = planBoxSources(
      [parcel(2, 'BOX-M'), parcel(1, 'BOX-M')],
      stock({ 'BOX-M': { qtyNew: 5, qtyReused: 1, reusable: true } }),
      false,
    );
    expect(out.map((p) => [p.parcelNo, p.planned, p.forcedNewReason])).toEqual([
      [1, 'reused', null],
      [2, 'new', 'NO_REUSED_STOCK'],
    ]);
  });

  it('kiện dễ vỡ chỉ thùng mới khi cài đặt không cho; cho thì dùng tái sử dụng', () => {
    const s = stock({ 'BOX-S': { qtyNew: 3, qtyReused: 3, reusable: true } });
    expect(planBoxSources([parcel(1, 'BOX-S', { has_fragile: true })], s, false)[0]).toMatchObject({
      planned: 'new',
      forcedNewReason: 'FRAGILE',
      reusedAllowed: false,
    });
    expect(planBoxSources([parcel(1, 'BOX-S', { has_fragile: true })], s, true)[0]).toMatchObject({ planned: 'reused' });
  });

  it('thùng không tái sử dụng được -> NOT_REUSABLE; hết cả hai ngăn -> outOfStock', () => {
    const out = planBoxSources(
      [parcel(1, 'BAG'), parcel(2, 'BAG'), parcel(3, 'BOX-X')],
      stock({ BAG: { qtyNew: 1, qtyReused: 9, reusable: false } }),
      false,
    );
    expect(out.map((p) => [p.planned, p.forcedNewReason, p.outOfStock])).toEqual([
      ['new', 'NOT_REUSABLE', false],
      [null, 'NOT_REUSABLE', true],
      [null, null, true],
    ]);
  });

  it('kiện đã trừ thùng không chiếm tồn giả lập, trả nguồn đã dùng; kiện hủy là inactive', () => {
    const out = planBoxSources(
      [
        parcel(1, 'BOX-M', { box_consumed: true, status: 'sealed', box_source_used: 'reused' }),
        parcel(2, 'BOX-M', { status: 'voided' }),
        parcel(3, 'BOX-M'),
      ],
      stock({ 'BOX-M': { qtyNew: 0, qtyReused: 1, reusable: true } }),
      false,
    );
    expect(out.map((p) => [p.state, p.planned, p.used])).toEqual([
      ['consumed', null, 'reused'],
      ['inactive', null, null],
      ['to_consume', 'reused', null],
    ]);
  });
});
