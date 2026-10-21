import { Types } from 'mongoose';
import {
  applyPartnerReturnUpdate,
  isPartnerReturnStatus,
  toOpenApiReturn,
  type ReturnUpdateCollections,
  type StorefrontReturnLike,
} from './aurelle-return-api';
import type { MinimalCollection } from './aurelle-status-update';

type Doc = Record<string, unknown>;

function fakeCollection(initial: Doc[] = []): MinimalCollection & { docs: Doc[] } {
  const docs = [...initial];
  const matches = (doc: Doc, filter: Doc): boolean =>
    Object.entries(filter).every(([key, value]) => String(doc[key]) === String(value));
  return {
    docs,
    findOne: (filter) => Promise.resolve(docs.find((d) => matches(d, filter)) ?? null),
    updateOne: (filter, update, options) => {
      const existing = docs.find((d) => matches(d, filter));
      const set = (update.$set ?? {}) as Doc;
      const onInsert = (update.$setOnInsert ?? {}) as Doc;
      if (existing) {
        Object.assign(existing, set);
        return Promise.resolve({ matchedCount: 1, modifiedCount: 1, upsertedCount: 0 });
      }
      if (options?.upsert) {
        docs.push({ ...filter, ...onInsert, ...set });
        return Promise.resolve({ matchedCount: 0, modifiedCount: 0, upsertedCount: 1 });
      }
      return Promise.resolve({ matchedCount: 0, modifiedCount: 0, upsertedCount: 0 });
    },
  };
}

function setup(status = 'requested', extra: Doc = {}) {
  const id = new Types.ObjectId();
  const orderId = new Types.ObjectId();
  const returns = fakeCollection([{ _id: id, order_id: orderId, public_order_id: 720000001, status, ...extra }]);
  const events = fakeCollection();
  const cols: ReturnUpdateCollections = { returns, events };
  return { cols, returns, events, id: id.toString() };
}

const time = new Date('2026-10-20T04:00:00Z');

describe('toOpenApiReturn', () => {
  it('đổi sang định dạng Open API: order_id số, items có seller_sku, ngày ISO', () => {
    const doc: StorefrontReturnLike = {
      _id: new Types.ObjectId('65f000000000000000000001'),
      public_order_id: 720000001,
      type: 'return_refund',
      status: 'requested',
      customer_note: null,
      items: [{ sku: 'ATD-M-01', quantity: 2, reason_code: 'size_not_fit' }],
      created_at: new Date('2026-10-20T01:00:00Z'),
    };
    expect(toOpenApiReturn(doc)).toEqual({
      return_id: '65f000000000000000000001',
      order_id: 720000001,
      type: 'return_refund',
      status: 'requested',
      customer_note: '',
      rma_code: null,
      items: [{ seller_sku: 'ATD-M-01', quantity: 2, reason_code: 'size_not_fit' }],
      created_at: '2026-10-20T01:00:00.000Z',
      updated_at: '2026-10-20T01:00:00.000Z',
    });
  });
});

describe('applyPartnerReturnUpdate', () => {
  it('không có yêu cầu → null', async () => {
    const { cols } = setup();
    expect(
      await applyPartnerReturnUpdate(cols, { returnId: 'khong-co', status: 'approved', eventTime: time, idempotencyKey: 'a' }),
    ).toBeNull();
  });

  it('duyệt: đổi trạng thái, lưu mã RMA + ghi hành trình có nhãn tiếng Việt', async () => {
    const { cols, returns, events, id } = setup();
    const result = await applyPartnerReturnUpdate(cols, {
      returnId: id,
      status: 'approved',
      eventTime: time,
      rmaCode: 'RMA-261020-ABC123',
      idempotencyKey: 'k1',
    });
    expect(result).toMatchObject({ status: 'approved', applied: true });
    expect(returns.docs[0]).toMatchObject({ status: 'approved', rma_code: 'RMA-261020-ABC123' });
    expect(events.docs[0]).toMatchObject({
      status: 'return_approved',
      label: 'Yêu cầu trả hàng đã được duyệt — vui lòng gửi hàng về',
      source: 'partner',
    });
  });

  it('từ chối kèm lý do: lưu decision_note và hiện lý do trong hành trình', async () => {
    const { cols, returns, events, id } = setup();
    await applyPartnerReturnUpdate(cols, {
      returnId: id,
      status: 'rejected',
      eventTime: time,
      decisionNote: 'Quá hạn trả hàng',
      idempotencyKey: 'k2',
    });
    expect(returns.docs[0]).toMatchObject({ status: 'rejected', decision_note: 'Quá hạn trả hàng' });
    expect(events.docs[0]).toMatchObject({ reason: 'Quá hạn trả hàng' });
  });

  it('gửi lại cùng khóa: không ghi thêm, applied=false', async () => {
    const { cols, events, id } = setup();
    const input = { returnId: id, status: 'approved' as const, eventTime: time, idempotencyKey: 'dup' };
    await applyPartnerReturnUpdate(cols, input);
    const again = await applyPartnerReturnUpdate(cols, input);
    expect(again?.applied).toBe(false);
    expect(events.docs).toHaveLength(1);
  });

  it('sai thứ tự (received khi mới requested): lưu lịch sử, KHÔNG đổi trạng thái', async () => {
    const { cols, returns, id } = setup('requested');
    const result = await applyPartnerReturnUpdate(cols, { returnId: id, status: 'received', eventTime: time, idempotencyKey: 'x' });
    expect(result?.applied).toBe(false);
    expect(returns.docs[0]?.status).toBe('requested');
  });

  it('trạng thái kết thúc không đổi nữa', async () => {
    const { cols, returns, id } = setup('rejected');
    const result = await applyPartnerReturnUpdate(cols, { returnId: id, status: 'closed', eventTime: time, idempotencyKey: 'y' });
    expect(result?.applied).toBe(false);
    expect(returns.docs[0]?.status).toBe('rejected');
  });

  it('chuỗi hợp lệ approved → received → closed', async () => {
    const { cols, returns, id } = setup('approved');
    await applyPartnerReturnUpdate(cols, { returnId: id, status: 'received', eventTime: time, idempotencyKey: 'r1' });
    await applyPartnerReturnUpdate(cols, {
      returnId: id,
      status: 'closed',
      eventTime: new Date(time.getTime() + 1000),
      idempotencyKey: 'r2',
    });
    expect(returns.docs[0]?.status).toBe('closed');
  });
});

describe('isPartnerReturnStatus', () => {
  it('không nhận requested (khách tự đặt) hay giá trị lạ', () => {
    expect(isPartnerReturnStatus('approved')).toBe(true);
    expect(isPartnerReturnStatus('requested')).toBe(false);
    expect(isPartnerReturnStatus(1)).toBe(false);
  });
});
