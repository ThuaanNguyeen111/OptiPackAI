import { Types } from 'mongoose';
import { buildFeedback } from './packing-feedback.service';

const FROM = new Date('2026-10-01T00:00:00Z');
const TO = new Date('2026-11-01T00:00:00Z');
const AT = new Date('2026-10-10T08:00:00Z');
const range = { from: FROM, to: TO };

type Plan = Parameters<typeof buildFeedback>[0][number];

function plan(partial: Partial<Plan> = {}): Plan {
  return {
    adjustments: [],
    parcels: [],
    status: 'packed',
    rejected_at: null,
    rejection_reason_code: null,
    rejection_due_at: null,
    rejection_resolution: null,
    created_at: AT,
    ...partial,
  };
}

function adjustment(reason: string, skus: string[] = [], boxCodes: string[] = []): Plan['adjustments'][number] {
  return {
    kind: 'change_box',
    detail: 'x',
    reason,
    note: null,
    by: new Types.ObjectId(),
    at: AT,
    skus,
    box_codes: boxCodes,
  };
}

describe('buildFeedback — vòng phản hồi cho Admin', () => {
  it('đếm tỷ lệ theo đúng gợi ý: kế hoạch không chỉnh tay và không bị từ chối', () => {
    const report = buildFeedback(
      [plan(), plan(), plan({ adjustments: [adjustment('OTHER')] }), plan({ rejected_at: AT, rejection_reason_code: 'OTHER' })],
      range,
      3,
    );
    expect(report.plans).toBe(4);
    expect(report.followedRate).toBe(0.5);
    expect(report.adjustedPlans).toBe(1);
    expect(report.rejectedPlans).toBe(1);
  });

  it('cùng SKU bị báo sai kích thước đủ N lần thì sinh đề xuất đo lại hồ sơ SKU', () => {
    const plans = [1, 2, 3].map(() => plan({ adjustments: [adjustment('ITEM_DIMENSION_WRONG', ['TEE-RED-M'])] }));
    const report = buildFeedback(plans, range, 3);
    expect(report.bySku).toEqual([{ sku: 'TEE-RED-M', reason: 'ITEM_DIMENSION_WRONG', count: 3 }]);
    expect(report.suggestions).toHaveLength(1);
    expect(report.suggestions[0]).toMatchObject({
      target: { type: 'sku', code: 'TEE-RED-M' },
      reason: 'ITEM_DIMENSION_WRONG',
      count: 3,
      action: { method: 'PUT', route: '/product-master/:id/packaging-profile' },
    });
  });

  it('chưa đủ N lần thì chưa đề xuất (nhưng vẫn thống kê)', () => {
    const report = buildFeedback(
      [plan({ adjustments: [adjustment('ITEM_DIMENSION_WRONG', ['TEE-RED-M'])] })],
      range,
      3,
    );
    expect(report.suggestions).toHaveLength(0);
    expect(report.byReason).toEqual([{ reason: 'ITEM_DIMENSION_WRONG', count: 1 }]);
  });

  it('thùng được gợi ý nhưng hết hàng lặp lại → đề xuất nhập thùng, đích là thùng GỢI Ý (thùng đầu)', () => {
    const plans = [1, 2, 3].map(() =>
      plan({ adjustments: [adjustment('RECOMMENDED_BOX_NOT_IN_STOCK', [], ['SAMPLE-M', 'SAMPLE-L'])] }),
    );
    const report = buildFeedback(plans, range, 3);
    expect(report.byBox).toEqual([{ boxCode: 'SAMPLE-M', reason: 'RECOMMENDED_BOX_NOT_IN_STOCK', count: 3 }]);
    expect(report.suggestions[0]).toMatchObject({ target: { type: 'box', code: 'SAMPLE-M' } });
  });

  it('từ chối được thống kê theo lý do + cách đã xử lý + còn mở/quá hạn', () => {
    const now = new Date('2026-10-12T00:00:00Z');
    const report = buildFeedback(
      [
        plan({ status: 'superseded', rejected_at: AT, rejection_reason_code: 'TOO_MANY_PARCELS', rejection_resolution: 'recompute' }),
        plan({ status: 'superseded', rejected_at: AT, rejection_reason_code: 'SPECIAL_PACKING_NEEDED', rejection_resolution: 'manual' }),
        plan({
          status: 'rejected',
          rejected_at: AT,
          rejection_reason_code: 'PLAN_UNREALISTIC',
          rejection_due_at: new Date('2026-10-11T00:00:00Z'),
        }),
        plan({
          status: 'rejected',
          rejected_at: AT,
          rejection_reason_code: 'PLAN_UNREALISTIC',
          rejection_due_at: new Date('2026-10-20T00:00:00Z'),
        }),
      ],
      range,
      3,
      now,
    );
    expect(report.rejections).toMatchObject({
      total: 4,
      open: 2,
      overdue: 1,
      resolvedBy: { recompute: 1, manual: 1 },
    });
    expect(report.rejections.byReason[0]).toEqual({ reason: 'PLAN_UNREALISTIC', count: 2 });
  });

  it('lý do chung (cài đặt) cộng cả chỉnh tay lẫn từ chối rồi mới so với ngưỡng', () => {
    const report = buildFeedback(
      [
        plan({ adjustments: [adjustment('TOO_MANY_PARCELS')] }),
        plan({ adjustments: [adjustment('TOO_MANY_PARCELS')] }),
        plan({ status: 'rejected', rejected_at: AT, rejection_reason_code: 'TOO_MANY_PARCELS' }),
      ],
      range,
      3,
    );
    expect(report.suggestions).toEqual([
      expect.objectContaining({ target: { type: 'settings', code: null }, reason: 'TOO_MANY_PARCELS', count: 3 }),
    ]);
  });

  it('lệch cân phải xem lại vì cân sản phẩm sai → gom theo SKU trong kiện; chấp nhận (accept) không tính', () => {
    const parcel = (action: 'accept' | 'reweigh'): Plan['parcels'][number] =>
      ({
        reviews: [{ action, reason: 'PRODUCT_WEIGHT_WRONG', note: null, by: new Types.ObjectId(), at: AT }],
        placements: [{ sku: 'JEAN-BLUE-30' }],
      }) as unknown as Plan['parcels'][number];
    const report = buildFeedback(
      [plan({ parcels: [parcel('reweigh'), parcel('reweigh'), parcel('reweigh'), parcel('accept')] })],
      range,
      3,
    );
    expect(report.bySku).toEqual([{ sku: 'JEAN-BLUE-30', reason: 'PRODUCT_WEIGHT_WRONG', count: 3 }]);
    expect(report.suggestions[0]).toMatchObject({ target: { type: 'sku', code: 'JEAN-BLUE-30' } });
  });

  it('hao hụt: chỉ tính đổi thùng lúc đóng khi thùng cũ hỏng, gom theo thùng cũ', () => {
    const waste = (cost: number): Plan['adjustments'][number] =>
      Object.assign(adjustment('OTHER', [], ['SAMPLE-M', 'SAMPLE-L']), {
        kind: 'change_box_in_session' as const,
        old_box_outcome: 'damaged' as const,
        waste_cost_vnd: cost,
      });
    const unused = Object.assign(adjustment('OTHER', [], ['SAMPLE-M', 'SAMPLE-L']), {
      kind: 'change_box_in_session' as const,
      old_box_outcome: 'unused' as const,
    });
    const report = buildFeedback([plan({ adjustments: [waste(3000), waste(3000), unused] })], range, 3);
    expect(report.waste).toEqual({ events: 2, costVnd: 6000, byBox: [{ boxCode: 'SAMPLE-M', count: 2, costVnd: 6000 }] });
  });

  it('bỏ qua sự kiện ngoài khoảng ngày', () => {
    const old = new Date('2026-08-01T00:00:00Z');
    const report = buildFeedback(
      [plan({ created_at: old, adjustments: [Object.assign(adjustment('ITEM_DIMENSION_WRONG', ['A']), { at: old })] })],
      range,
      1,
    );
    expect(report.plans).toBe(0);
    expect(report.byReason).toEqual([]);
    expect(report.suggestions).toEqual([]);
  });
});
