/**
 * Map `_id` / ObjectId từ cả HydratedDocument lẫn `.lean()`.
 * `instanceof Types.ObjectId` KHÔNG đủ: lean() có thể trả BSON ObjectId
 * khác prototype → id rỗng → FE lọc hết danh sách kho/kệ.
 */
export function oidString(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value !== 'object' || value === null) {
    return '';
  }
  const candidate: { toHexString?: unknown } = value;
  if (typeof candidate.toHexString !== 'function') {
    return '';
  }
  const hex: unknown = candidate.toHexString.call(value);
  return typeof hex === 'string' ? hex : '';
}
