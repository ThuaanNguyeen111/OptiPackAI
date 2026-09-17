import { Types } from 'mongoose';
import { oidString } from './oid-string.util';

describe('oidString', () => {
  it('giữ nguyên string id', () => {
    expect(oidString('6aac40000000000000000001')).toBe('6aac40000000000000000001');
  });

  it('đọc Types.ObjectId (create / hydrated)', () => {
    const id = new Types.ObjectId();
    expect(oidString(id)).toBe(id.toHexString());
  });

  it('đọc object chỉ có toHexString — giống BSON ObjectId của .lean()', () => {
    const hex = '6aac40000000000000000002';
    expect(
      oidString({
        toHexString: () => hex,
      }),
    ).toBe(hex);
  });

  it('không dùng Object.prototype.toString — tránh id = [object Object]', () => {
    expect(oidString({})).toBe('');
    expect(oidString(null)).toBe('');
  });
});
