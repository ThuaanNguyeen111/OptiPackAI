import { DASHBOARD_CACHE_TTL_MS, DashboardService, type DashboardSummary } from './dashboard.service';

//!=============================================
// 10/11/2026 — Lưu tạm GET /dashboard/summary 5 giây (BE_MOBILE_CHECKLIST mục 8).
//!=============================================
describe('DashboardService.cachedSummary', () => {
  let service: DashboardService;
  let summary: jest.SpyInstance;
  let nowMs: number;

  beforeEach(() => {
    const unused = {} as never;
    service = new DashboardService(unused, unused, unused, unused, unused, unused, unused, unused, unused);
    let call = 0;
    summary = jest.spyOn(service, 'summary').mockImplementation(() => {
      call += 1;
      return Promise.resolve({ call } as unknown as DashboardSummary);
    });
    nowMs = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gọi lại trong 5 giây với cùng tham số → dùng kết quả cũ, không tính lại', async () => {
    const a = await service.cachedSummary('2026-10-01', '2026-10-31', 'lazada');
    nowMs += DASHBOARD_CACHE_TTL_MS - 1;
    const b = await service.cachedSummary('2026-10-01', '2026-10-31', 'lazada');
    expect(b).toBe(a);
    expect(summary).toHaveBeenCalledTimes(1);
  });

  it('hết 5 giây → tính lại', async () => {
    await service.cachedSummary();
    nowMs += DASHBOARD_CACHE_TTL_MS;
    await service.cachedSummary();
    expect(summary).toHaveBeenCalledTimes(2);
  });

  it('tham số khác nhau → lưu riêng', async () => {
    await service.cachedSummary(undefined, undefined, 'lazada');
    await service.cachedSummary(undefined, undefined, 'aurelle');
    await service.cachedSummary();
    expect(summary).toHaveBeenCalledTimes(3);
  });

  it('nhiều request đến cùng lúc → chỉ tính 1 lần', async () => {
    await Promise.all([service.cachedSummary(), service.cachedSummary(), service.cachedSummary()]);
    expect(summary).toHaveBeenCalledTimes(1);
  });

  it('lần tính bị lỗi thì không lưu, lần sau tính lại', async () => {
    summary.mockImplementationOnce(() => Promise.reject(new Error('mongo down')));
    await expect(service.cachedSummary()).rejects.toThrow('mongo down');
    await service.cachedSummary();
    expect(summary).toHaveBeenCalledTimes(2);
  });
});
