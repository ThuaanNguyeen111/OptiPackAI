import mongoose, { type ClientSession, type Model } from 'mongoose';
import { StockReservationService } from './stock-reservation.service';
import { StockReservationSchema, type StockReservationDocument } from './schemas/stock-reservation.schema';

//!=============================================
// 26/11/2026 — "Lấy lại (trả hàng đã lấy về kệ)" lỗi 500: Mongoose 9 chặn update dạng
// pipeline (mảng) nếu không có `updatePipeline: true`. Test cũ mock `unconsume` nên không bắt
// được — test này dùng Model thật (không kết nối DB, chỉ chặn exec).
//!=============================================
describe('StockReservationService.unconsume — update pipeline (26/11/2026)', () => {
  const conn = mongoose.createConnection();
  const model = conn.model('StockReservationUnconsumeSpec', StockReservationSchema) as unknown as Model<StockReservationDocument>;
  let exec: jest.SpyInstance;

  beforeEach(() => {
    exec = jest.spyOn(mongoose.Query.prototype, 'exec').mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
  });
  afterEach(() => { exec.mockRestore(); });

  it('gọi được với Model thật, không ném "Cannot pass an array to query updates"', async () => {
    const service = new StockReservationService(model, model as never, model as never, model as never, model as never, conn, {} as never);
    await expect(
      service.unconsume(new mongoose.Types.ObjectId().toString(), 'S:aurelle|shop|SKU-1', 2, undefined as unknown as ClientSession),
    ).resolves.toBeUndefined();
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('số lượng ≤ 0 → không gọi DB', async () => {
    const service = new StockReservationService(model, model as never, model as never, model as never, model as never, conn, {} as never);
    await service.unconsume(new mongoose.Types.ObjectId().toString(), 'k', 0, undefined as unknown as ClientSession);
    expect(exec).not.toHaveBeenCalled();
  });
});
