import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  OrderGroup,
  OrderGroupDocument,
} from '../src/modules/order-groups/schemas/order-group.schema';
import { Order, OrderDocument } from '../src/modules/orders/schemas/order.schema';
import { computeRecipientKey } from '../src/modules/orders/utils/consolidation-key.util';

/**
 * ===================================================================
 * BACKFILL 1 LẦN (29/09/2026, Mục 9.5 AURELLE_MARKETPLACE_DESIGN.md)
 * ===================================================================
 * `recipient_key` là field MỚI thêm vào `order_groups` — chỉ được tính
 * cho group MỚI TẠO từ giờ trở đi (getOrCreateGroupForOrder()). Mọi
 * OrderGroup ĐÃ CÓ trong DB trước khi field này tồn tại đang giữ
 * `recipient_key: null` — GET :id/linked và tính năng "giao chung
 * chuyến" (Mục 9.5) sẽ không thấy các nhóm cũ này liên kết được với
 * nhau cho tới khi chạy backfill.
 *
 * Lấy 1 Order ĐẠI DIỆN của mỗi group (field `recipient` đã lưu sẵn,
 * KHÔNG cần gọi lại sàn) để tính — cùng chiến lược đã dùng ở
 * migrate-consolidation-key.ts.
 *
 *   npx ts-node scripts/backfill-order-group-recipient-key.ts
 * ===================================================================
 */
async function backfillRecipientKey(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const orderGroupModel = app.get<Model<OrderGroupDocument>>(
    getModelToken(OrderGroup.name),
  );
  const orderModel = app.get<Model<OrderDocument>>(getModelToken(Order.name));

  const groups = await orderGroupModel
    .find({ recipient_key: null })
    .select('_id')
    .lean();

  console.log(
    `Tìm thấy ${String(groups.length)} Order Group chưa có recipient_key.`,
  );

  let updated = 0;
  let skipped = 0;

  for (const group of groups) {
    const representativeOrder = await orderModel
      .findOne({ consolidated_group_id: group._id })
      .select('recipient')
      .lean();

    if (
      !representativeOrder?.recipient.full_name ||
      !representativeOrder.recipient.phone ||
      !representativeOrder.recipient.address_line1 ||
      !representativeOrder.recipient.city
    ) {
      console.warn(
        `⚠️  Group ${String(group._id)} không tìm được đơn đại diện đủ dữ liệu — bỏ qua.`,
      );
      skipped += 1;
      continue;
    }

    const recipientKey = computeRecipientKey(
      representativeOrder.recipient.full_name,
      representativeOrder.recipient.phone,
      representativeOrder.recipient.address_line1,
      representativeOrder.recipient.city,
    );

    await orderGroupModel.updateOne(
      { _id: group._id },
      { $set: { recipient_key: recipientKey } },
    );
    updated += 1;
  }

  console.log(
    `✅ Xong — đã cập nhật ${String(updated)} Order Group, bỏ qua ${String(skipped)} (thiếu đơn đại diện đủ dữ liệu).`,
  );
  await app.close();
}

backfillRecipientKey().catch((err: unknown) => {
  console.error('❌ Backfill thất bại:', err);
  process.exit(1);
});
