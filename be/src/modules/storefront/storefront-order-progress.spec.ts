import { buildOrderProgress, orderDisplayStatus } from './storefront-order-progress';

const t = (minutes: number): Date => new Date(Date.UTC(2026, 9, 23, 2, minutes));
const base = { status: 'pending', fulfillmentStatus: 'awaiting_packaging', placedAt: t(0) };

describe('buildOrderProgress (23/10/2026 — thanh tiến trình đơn AURELLE)', () => {
  it('mới đặt: luôn đủ 7 bước, bước "Đặt hàng" là hiện tại và có giờ đặt', () => {
    const p = buildOrderProgress({ ...base, events: [] });
    expect(p.steps.map((s) => s.key)).toEqual(['placed', 'processing', 'packed', 'shipped', 'in_transit', 'out_for_delivery', 'delivered']);
    expect(p.steps[0]).toMatchObject({ state: 'current', at: t(0) });
    expect(p.steps.slice(1).every((s) => s.state === 'upcoming' && s.at === null)).toBe(true);
    expect(p.displayStatus).toEqual({ label: 'Chờ xử lý', tone: 'info', isFinal: false });
    expect(p.branch).toBeNull();
  });

  it('đang vận chuyển (tracking_stage): các bước trước xong kèm giờ, bước hiện tại đúng chặng', () => {
    const p = buildOrderProgress({
      ...base,
      fulfillmentStatus: 'shipped',
      trackingStage: 'in_transit',
      events: [
        { status: 'in_transit', occurredAt: t(40) },
        { status: 'processing', occurredAt: t(10) },
        { status: 'packed', occurredAt: t(20) },
        { status: 'shipped', occurredAt: t(30) },
      ],
    });
    expect(p.steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'current', 'upcoming', 'upcoming']);
    expect(p.steps[2]?.at).toEqual(t(20));
    expect(p.displayStatus.label).toBe('Đang vận chuyển');
  });

  it('đơn cũ không có tracking_stage: suy từ fulfillment_status + mốc hành trình', () => {
    const p = buildOrderProgress({ ...base, fulfillmentStatus: 'shipped', events: [{ status: 'packed', occurredAt: t(20) }, { status: 'shipped', occurredAt: t(30) }] });
    expect(p.steps.find((s) => s.state === 'current')?.key).toBe('shipped');
  });

  it('đã giao: mọi bước xong, trạng thái cuối', () => {
    const p = buildOrderProgress({ ...base, status: 'completed', fulfillmentStatus: 'delivered', trackingStage: 'delivered', events: [{ status: 'delivered', occurredAt: t(90) }] });
    expect(p.steps.every((s) => s.state === 'done')).toBe(true);
    expect(p.displayStatus).toEqual({ label: 'Đã nhận hàng', tone: 'success', isFinal: true });
  });

  it('giao thất bại: chặng "Đang giao tới bạn" báo lỗi, nhánh có lý do lần gần nhất', () => {
    const p = buildOrderProgress({
      ...base,
      fulfillmentStatus: 'failed_delivery',
      trackingStage: 'failed_delivery',
      events: [
        { status: 'failed_delivery', reason: 'Khách hẹn lại', occurredAt: t(50) },
        { status: 'failed_delivery', reason: 'Không liên lạc được', occurredAt: t(70) },
      ],
    });
    expect(p.steps[5]?.state).toBe('problem');
    expect(p.branch).toMatchObject({ key: 'failed_delivery', reason: 'Không liên lạc được', at: t(70) });
    expect(p.displayStatus).toMatchObject({ tone: 'warning', isFinal: false });
  });

  it('người bán hủy khi đang chuẩn bị: bước đã qua giữ "done", phần sau "skipped", nhánh nêu lý do', () => {
    const p = buildOrderProgress({
      ...base,
      status: 'cancelled',
      cancelSource: 'seller',
      cancelReason: 'Hết hàng',
      trackingStage: 'processing',
      events: [{ status: 'processing', occurredAt: t(10) }, { status: 'canceled_by_seller', occurredAt: t(15) }],
    });
    expect(p.steps.map((s) => s.state)).toEqual(['done', 'done', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped']);
    expect(p.branch).toMatchObject({ key: 'canceled', label: 'Người bán đã hủy đơn', reason: 'Hết hàng', at: t(15) });
    expect(p.displayStatus).toMatchObject({ tone: 'danger', isFinal: true });
  });

  it('hoàn hàng xong: nhánh "Người bán đã nhận lại hàng", là trạng thái cuối', () => {
    const p = buildOrderProgress({ ...base, fulfillmentStatus: 'returned', trackingStage: 'returned', events: [{ status: 'returned', occurredAt: t(200) }] });
    expect(p.branch?.key).toBe('returned');
    expect(p.steps[4]?.state).toBe('problem');
    expect(p.displayStatus.isFinal).toBe(true);
  });

  it('orderDisplayStatus dùng cho danh sách đơn — cùng nhãn với trang chi tiết', () => {
    expect(orderDisplayStatus({ ...base, fulfillmentStatus: 'shipped', trackingStage: 'out_for_delivery' }).label).toBe('Đang giao tới bạn');
    expect(orderDisplayStatus({ ...base, status: 'cancelled', cancelSource: 'customer' }).label).toBe('Đơn đã hủy');
  });
});
