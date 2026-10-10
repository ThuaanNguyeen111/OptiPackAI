import { Types } from 'mongoose';
import { migrateObjectIdFields } from './objectid-migration';

//!=============================================
// 07/10/2026 — script chuyển id dạng chuỗi -> ObjectId (scripts/migrate-objectid-fields.ts).
// DB giả lập: mỗi collection là 1 mảng document; find() trả các document có giá trị chuỗi
// ở field cần chuyển (đúng điều kiện $type: 'string' mà script gửi).
//!=============================================
type Doc = Record<string, unknown> & { _id: Types.ObjectId };
interface BulkOp { updateOne: { filter: Record<string, unknown>; update: { $set: Record<string, unknown> } } }

function fakeDb(data: Record<string, Doc[]>): { db: never; writes: Record<string, BulkOp[]> } {
  const writes: Record<string, BulkOp[]> = {};
  const hasString = (doc: Doc, filter: Record<string, unknown>): boolean => {
    const clauses = (filter.$or as Record<string, unknown>[] | undefined) ?? [filter];
    return clauses.some((clause) => {
      const key = Object.keys(clause)[0] ?? '';
      if (!key.includes('.')) return typeof doc[key] === 'string';
      const [array, field] = key.split('.') as [string, string];
      const lines = (doc[array] as Record<string, unknown>[] | undefined) ?? [];
      return lines.some((l) => typeof l[field] === 'string');
    });
  };
  const db = {
    listCollections: () => ({ toArray: () => Promise.resolve(Object.keys(data).map((name) => ({ name }))) }),
    collection: (name: string) => ({
      find: (filter: Record<string, unknown>) => (data[name] ?? []).filter((d) => hasString(d, filter)),
      bulkWrite: (ops: BulkOp[]) => {
        writes[name] = [...(writes[name] ?? []), ...ops];
        return Promise.resolve({});
      },
    }),
  };
  return { db: db as never, writes };
}

describe('migrateObjectIdFields — chuyển id dạng chuỗi sang ObjectId', () => {
  const groupHex = new Types.ObjectId().toString();
  const userHex = new Types.ObjectId().toString();

  const data = (): Record<string, Doc[]> => ({
    pick_events: [
      { _id: new Types.ObjectId(), order_group_id: groupHex },
      { _id: new Types.ObjectId(), order_group_id: new Types.ObjectId() }, // đã đúng kiểu -> không đụng
    ],
    notifications: [
      { _id: new Types.ObjectId(), recipient_user_id: userHex, related_entity_id: '201171264532' },
      { _id: new Types.ObjectId(), recipient_user_id: null, related_entity_id: '' },
    ],
    return_requests: [
      { _id: new Types.ObjectId(), order_group_id: new Types.ObjectId(), inspection: [{ warehouse_id: groupHex, bin_location_id: null }, { warehouse_id: null, bin_location_id: userHex }] },
    ],
  });

  it('chạy thử: đếm đúng nhưng KHÔNG ghi gì', async () => {
    const { db, writes } = fakeDb(data());
    const reports = await migrateObjectIdFields(db, { apply: false, nullInvalid: false });

    expect(writes).toEqual({});
    const pick = reports.find((r) => r.path === 'pick_events.order_group_id');
    expect(pick).toMatchObject({ converted: 1, emptied: 0, invalid: 0 });
    const related = reports.find((r) => r.path === 'notifications.related_entity_id');
    expect(related).toMatchObject({ converted: 0, emptied: 1, invalid: 1, invalidSamples: ['201171264532'] });
  });

  it('--apply: chuỗi hex -> ObjectId cùng giá trị, chuỗi rỗng -> null, giá trị không phải id giữ nguyên', async () => {
    const { db, writes } = fakeDb(data());
    await migrateObjectIdFields(db, { apply: true, nullInvalid: false });

    const pickSet = writes.pick_events?.[0]?.updateOne.update.$set.order_group_id;
    expect(pickSet).toBeInstanceOf(Types.ObjectId);
    expect(String(pickSet)).toBe(groupHex);
    expect(writes.pick_events).toHaveLength(1);

    const notiSets = (writes.notifications ?? []).map((op) => op.updateOne.update.$set);
    expect(notiSets).toContainEqual({ recipient_user_id: new Types.ObjectId(userHex) });
    expect(notiSets).toContainEqual({ related_entity_id: null }); // chuỗi rỗng
    expect(notiSets).not.toContainEqual({ related_entity_id: '201171264532' });
    expect(notiSets.filter((s) => 'related_entity_id' in s)).toHaveLength(1);
  });

  it('--apply --null-invalid: giá trị không phải id cũng ghi null', async () => {
    const { db, writes } = fakeDb(data());
    await migrateObjectIdFields(db, { apply: true, nullInvalid: true });

    const relatedSets = (writes.notifications ?? []).map((op) => op.updateOne.update.$set).filter((s) => 'related_entity_id' in s);
    expect(relatedSets).toHaveLength(2);
    expect(relatedSets.every((s) => s.related_entity_id === null)).toBe(true);
  });

  it('field trong mảng sub-document (return_requests.inspection[]) đổi đúng vị trí', async () => {
    const { db, writes } = fakeDb(data());
    await migrateObjectIdFields(db, { apply: true, nullInvalid: false });

    const set = writes.return_requests?.[0]?.updateOne.update.$set ?? {};
    expect(String(set['inspection.0.warehouse_id'])).toBe(groupHex);
    expect(String(set['inspection.1.bin_location_id'])).toBe(userHex);
    expect(Object.keys(set)).toHaveLength(2);
  });

  it('collection chưa tồn tại trong DB -> bỏ qua, không lỗi', async () => {
    const { db, writes } = fakeDb({});
    await expect(migrateObjectIdFields(db, { apply: true, nullInvalid: false })).resolves.toEqual([]);
    expect(writes).toEqual({});
  });
});
