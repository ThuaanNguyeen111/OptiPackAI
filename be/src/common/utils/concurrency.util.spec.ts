import { mapWithConcurrency } from './concurrency.util';

describe('mapWithConcurrency', () => {
  const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  it('giữ đúng thứ tự kết quả dù xong không theo thứ tự', async () => {
    const out = await mapWithConcurrency([30, 5, 15, 1], 4, async (ms, i) => {
      await delay(ms);
      return `${String(i)}:${String(ms)}`;
    });
    expect(out).toEqual(['0:30', '1:5', '2:15', '3:1']);
  });

  it('không bao giờ chạy quá `limit` lời gọi cùng lúc', async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await delay(5);
      running -= 1;
    });
    expect(peak).toBe(3);
  });

  it('danh sách rỗng trả mảng rỗng', async () => {
    await expect(mapWithConcurrency([], 4, () => Promise.resolve(1))).resolves.toEqual([]);
  });

  it('ném lỗi đầu tiên', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        await delay(n);
        if (n === 2) throw new Error('hỏng kiện 2');
        return n;
      }),
    ).rejects.toThrow('hỏng kiện 2');
  });
});
