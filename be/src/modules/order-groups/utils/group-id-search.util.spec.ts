import { Types } from 'mongoose';
import { groupIdSuffixFilters, reverseHexId } from './group-id-search.util';

describe('group-id-search.util', () => {
  it('reverseHexId viết ngược và chữ thường', () => {
    expect(reverseHexId('6AF210305755B14AD13F632A')).toBe('a236f31da41b557503012fa6');
    expect(reverseHexId('abc123')).toBe('321cba');
  });

  it('đuôi mã khớp đúng nhóm qua regex neo đầu trên id_reversed', () => {
    const id = new Types.ObjectId().toHexString();
    const filters = groupIdSuffixFilters(id.slice(-7).toUpperCase());
    const first = filters[0] as { id_reversed: { $regex: string } };
    expect(first.id_reversed.$regex.startsWith('^')).toBe(true);
    expect(new RegExp(first.id_reversed.$regex).test(reverseHexId(id))).toBe(true);
    expect(new RegExp(first.id_reversed.$regex).test(reverseHexId(new Types.ObjectId().toHexString()))).toBe(false);
  });

  it('có nhánh dự phòng cho nhóm chưa backfill (id_reversed null)', () => {
    const filters = groupIdSuffixFilters('f632a');
    expect(filters[1]).toMatchObject({ id_reversed: null });
  });
});
