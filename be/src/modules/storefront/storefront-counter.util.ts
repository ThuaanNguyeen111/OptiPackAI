import { PUBLIC_ORDER_ID_START } from './aurelle-open-api.mapper';

/** Tối thiểu cái cần của 1 collection để $inc bộ đếm (mongoose hoặc driver gốc). */
export interface CounterCollection {
  findOneAndUpdate(
    filter: { _id: string },
    update: { $inc: { seq: number } },
    options: { upsert: true; returnDocument: 'after' },
  ): Promise<unknown>;
}

/**
 * Cấp mã số đơn công khai kế tiếp (atomic $inc, không trùng kể cả khi 2
 * đơn đặt cùng lúc). Dùng chung cho checkout và mock Open API (cấp bù đơn cũ).
 */
export async function nextPublicOrderId(counters: CounterCollection): Promise<number> {
  const result = await counters.findOneAndUpdate(
    { _id: 'public_order_id' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  // Driver gốc v6+ trả thẳng document; bản cũ bọc trong { value }.
  const unwrapped: unknown =
    result && typeof result === 'object' && 'value' in result ? result.value : result;
  const doc = unwrapped as { seq?: unknown } | null;
  const seq = typeof doc?.seq === 'number' ? doc.seq : NaN;
  if (!Number.isFinite(seq)) throw new Error('Không cấp được public_order_id từ storefront_counters.');
  return PUBLIC_ORDER_ID_START + seq;
}
