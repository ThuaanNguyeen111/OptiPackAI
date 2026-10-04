import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  OrderGroup,
  OrderGroupDocument,
} from '../src/modules/order-groups/schemas/order-group.schema';
import { OrderGroupsService } from '../src/modules/order-groups/order-groups.service';

/**
 * ===================================================================
 * BACKFILL 1 LẦN — 01/10/2026: lưu số đơn còn hiệu lực / đã hủy lên order_groups
 * ===================================================================
 * Ghi `active_order_count`, `canceled_order_count`, `order_counts_refreshed_at`
 * cho MỌI nhóm đơn hiện có, tính từ collection `orders` (cùng quy tắc với API).
 * Nhóm tạo sau khi deploy code mới tự được cập nhật mỗi lần đồng bộ — script
 * này chỉ để dữ liệu CŨ có đủ field.
 *
 * An toàn chạy lại nhiều lần: mỗi lần tính lại từ đầu và ghi đè cùng giá trị.
 * Không xóa, không đổi field nào khác, không tăng `__v`.
 *   npx ts-node -r dotenv/config scripts/backfill-order-group-counts.ts
 * ===================================================================
 */
const BATCH_SIZE = 200;

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const groupModel = app.get<Model<OrderGroupDocument>>(
    getModelToken(OrderGroup.name),
  );
  const service = app.get(OrderGroupsService);

  let lastId: Types.ObjectId | null = null;
  let total = 0;
  let withCanceled = 0;
  let fullyCanceled = 0;

  for (;;) {
    const filter: Record<string, unknown> = lastId
      ? { _id: { $gt: lastId } }
      : {};
    const batch = await groupModel
      .find(filter)
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .select('_id')
      .lean();
    if (batch.length === 0) break;

    const ids = batch.map((g) => g._id);
    const counts = await service.getOrderCountsForGroups(ids);
    const now = new Date();
    await groupModel.bulkWrite(
      ids.map((id) => {
        const c = counts.get(id.toString()) ?? {
          activeOrderCount: 0,
          canceledOrderCount: 0,
        };
        if (c.canceledOrderCount > 0) withCanceled += 1;
        if (c.activeOrderCount === 0) fullyCanceled += 1;
        return {
          updateOne: {
            filter: { _id: id },
            update: {
              $set: {
                active_order_count: c.activeOrderCount,
                canceled_order_count: c.canceledOrderCount,
                order_counts_refreshed_at: now,
              },
            },
          },
        };
      }),
    );

    total += batch.length;
    lastId = ids[ids.length - 1] ?? null;
    console.log(`Đã cập nhật ${String(total)} nhóm đơn...`);
  }

  console.log(
    `✅ Xong: ${String(total)} nhóm đơn; ${String(withCanceled)} nhóm có đơn hủy; ${String(fullyCanceled)} nhóm không còn đơn cần xử lý.`,
  );
  await app.close();
}

void run();
