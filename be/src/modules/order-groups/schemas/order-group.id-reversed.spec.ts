import mongoose from 'mongoose';
import { OrderGroupSchema } from './order-group.schema';
import { reverseHexId } from '../utils/group-id-search.util';

describe('OrderGroupSchema — id_reversed', () => {
  const Model = mongoose.model('OrderGroupIdReversedSpec', OrderGroupSchema);

  it('nhóm mới tự có id_reversed = mã nhóm viết ngược (hook validate)', async () => {
    const doc = new Model({});
    await doc.validate().catch(() => undefined); // thiếu field bắt buộc cũng không sao, hook chạy trước
    expect(doc.id_reversed).toBe(reverseHexId(doc._id.toHexString()));
  });

  it('có index cho id_reversed', () => {
    expect(OrderGroupSchema.indexes().some(([keys]) => 'id_reversed' in keys)).toBe(true);
  });
});
