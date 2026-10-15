/**
 * ===================================================================
 * concurrency.util.ts — MỚI (14/10/2026)
 * ===================================================================
 * Chạy `fn` cho từng phần tử với TỐI ĐA `limit` lời gọi cùng lúc, trả kết quả
 * ĐÚNG THỨ TỰ đầu vào. Dùng cho các lời gọi API hãng (GHN) theo từng kiện:
 * trước đây gọi tuần tự (N kiện × tới 10 s) dễ vượt timeout 12 s của FE;
 * gọi song song toàn bộ lại dễ chạm giới hạn tần suất của hãng → giới hạn.
 * Lỗi đầu tiên được ném ra (giống `Promise.all`); các lời gọi đang chạy vẫn
 * chạy nốt nhưng kết quả bị bỏ.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workers = Math.max(1, Math.min(Math.floor(limit), items.length));
  let next = 0;
  const run = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: workers }, run));
  return results;
}
