import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  Order,
  OrderDocument,
} from '../src/modules/orders/schemas/order.schema';
import { UNFULFILLED_ORDER_STATUSES } from '../src/modules/orders/enums/order-status.enum';
import {
  OrderGroup,
  OrderGroupDocument,
} from '../src/modules/order-groups/schemas/order-group.schema';
import { GroupFulfillmentStatus } from '../src/modules/order-groups/enums/group-fulfillment-status.enum';
import {
  computeConsolidationKey,
  computeRecipientKey,
} from '../src/modules/orders/utils/consolidation-key.util';

/**
 * ===================================================================
 * 13/10/2026 — TÍNH LẠI consolidation_key / recipient_key sau khi chuẩn hoá
 * thêm "Đ/đ" → "d" (consolidation-key.util.ts)
 * ===================================================================
 * Công thức băm đổi → đơn ĐANG CHỜ xử lý giữ key cũ sẽ không khớp với đơn mới
 * (cùng khách, địa chỉ có chữ "Đ" như "Đường", "Đậu"). Chỉ tính lại phần còn
 * dùng để so khớp:
 *   - orders.consolidation_key của đơn CHƯA fulfill (UNFULFILLED_ORDER_STATUSES)
 *   - order_groups.recipient_key của nhóm CHƯA xong (chưa delivered/returned/canceled),
 *     tính từ đơn đầu tiên của nhóm — đúng cách getOrCreateGroupForOrder() tính lúc tạo.
 * Đơn/nhóm đã xong giữ nguyên (không còn được so khớp). Không đổi nhóm của đơn nào.
 *
 *   npx ts-node -r dotenv/config scripts/recompute-consolidation-keys.ts            # chạy thử
 *   npx ts-node -r dotenv/config scripts/recompute-consolidation-keys.ts --apply    # ghi thật
 * ===================================================================
 */
async function main(): Promise<void> {
  const unknown = process.argv.slice(2).filter((a) => a !== '--apply');
  if (unknown.length > 0) {
    console.error(
      `❌ Cờ không hợp lệ: ${unknown.join(' ')}. Chỉ nhận --apply. Không ghi gì vào DB.`,
    );
    process.exit(1);
  }
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const orderModel = app.get<Model<OrderDocument>>(getModelToken(Order.name));
    const groupModel = app.get<Model<OrderGroupDocument>>(
      getModelToken(OrderGroup.name),
    );

    // ---- 1. consolidation_key của đơn đang chờ ----
    const orders = await orderModel
      .find({ status: { $in: UNFULFILLED_ORDER_STATUSES } })
      .select('_id platform recipient consolidation_key')
      .lean();
    const orderOps = orders.flatMap((o) => {
      if (!o.recipient.phone || !o.recipient.address_line1 || !o.recipient.city)
        return [];
      const key = computeConsolidationKey(
        o.platform,
        o.recipient.phone,
        o.recipient.address_line1,
        o.recipient.city,
      );
      return key === o.consolidation_key
        ? []
        : [
            {
              updateOne: {
                filter: { _id: o._id },
                update: { $set: { consolidation_key: key } },
              },
            },
          ];
    });

    // ---- 2. recipient_key của nhóm chưa xong ----
    const groups = await groupModel
      .find({
        fulfillment_status: {
          $nin: [
            GroupFulfillmentStatus.DELIVERED,
            GroupFulfillmentStatus.RETURNED,
            GroupFulfillmentStatus.CANCELED,
          ],
        },
      })
      .select('_id recipient_key')
      .lean();
    const groupOps: {
      updateOne: {
        filter: { _id: unknown };
        update: { $set: { recipient_key: string } };
      };
    }[] = [];
    for (const g of groups) {
      const first = await orderModel
        .findOne({ consolidated_group_id: g._id })
        .sort({ created_at: 1 })
        .select('recipient')
        .lean();
      if (!first) continue;
      const key = computeRecipientKey(
        first.recipient.full_name,
        first.recipient.phone,
        first.recipient.address_line1,
        first.recipient.city,
      );
      if (key !== g.recipient_key) {
        groupOps.push({
          updateOne: {
            filter: { _id: g._id },
            update: { $set: { recipient_key: key } },
          },
        });
      }
    }

    console.log(
      `${apply ? '✍️ GHI THẬT' : '🔎 CHẠY THỬ (không ghi DB)'} — ${String(orders.length)} đơn đang chờ: ${String(orderOps.length)} cần tính lại consolidation_key; ` +
        `${String(groups.length)} nhóm chưa xong: ${String(groupOps.length)} cần tính lại recipient_key.`,
    );
    if (!apply) {
      console.log('→ Chạy lại với --apply để ghi.');
      return;
    }
    if (orderOps.length > 0)
      await orderModel.bulkWrite(orderOps as never, { ordered: false });
    if (groupOps.length > 0)
      await groupModel.bulkWrite(groupOps as never, { ordered: false });
    console.log('✅ Xong.');
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error('❌ Script thất bại:', err);
  process.exit(1);
});
