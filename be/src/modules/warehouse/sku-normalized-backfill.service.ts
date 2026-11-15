import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SkuBinAssignment, SkuBinAssignmentDocument } from './schemas/sku-bin-assignment.schema';
import { normalizeSellerSku } from '../master-skus/seller-sku.util';

const BATCH_SIZE = 500;

/**
 * 10/11/2026 (BE-5) — lúc khởi động, ghi `seller_sku_normalized` cho dòng tồn cũ chưa có
 * (dòng mới tự có nhờ hook trong schema). Tra tồn theo SKU sàn giờ so field này, nên phải
 * chạy XONG trước khi app nhận request: `onModuleInit` được Nest chờ trước khi mở cổng.
 * Chạy lại an toàn (chỉ đụng dòng còn thiếu), không đổi `updated_at`, không tăng `__v`.
 */
@Injectable()
export class SkuNormalizedBackfillService implements OnModuleInit {
  private readonly logger = new Logger(SkuNormalizedBackfillService.name);

  constructor(@InjectModel(SkuBinAssignment.name) private readonly assignmentModel: Model<SkuBinAssignmentDocument>) {}

  async onModuleInit(): Promise<void> {
    try {
      const done = await this.backfill();
      if (done > 0) this.logger.log(`Đã bổ sung mã SKU chuẩn hoá cho ${String(done)} dòng tồn cũ.`);
    } catch (error: unknown) {
      this.logger.error(
        `Bổ sung mã SKU chuẩn hoá thất bại — tra tồn SKU chưa nối có thể thiếu dòng cũ cho tới lần khởi động sau: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async backfill(): Promise<number> {
    const missing = { $or: [{ seller_sku_normalized: null }, { seller_sku_normalized: { $exists: false } }] };
    let done = 0;
    for (;;) {
      const rows = await this.assignmentModel.find(missing).select('_id seller_sku').limit(BATCH_SIZE).lean();
      if (rows.length === 0) return done;
      await this.assignmentModel.collection.bulkWrite(
        rows.map((r) => ({
          updateOne: { filter: { _id: r._id }, update: { $set: { seller_sku_normalized: normalizeSellerSku(r.seller_sku) } } },
        })),
      );
      done += rows.length;
      if (rows.length < BATCH_SIZE) return done;
    }
  }
}
