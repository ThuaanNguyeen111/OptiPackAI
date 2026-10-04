import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, type OrderDocument } from '../orders/schemas/order.schema';
import { NOT_PACKABLE_ORDER_STATUSES } from '../orders/enums/order-status.enum';

/** Thông tin nhận diện 1 nhóm trên bảng hàng chờ đóng gói. */
export interface GroupQueueInfo {
  orderGroupId: string;
  /** Mã đơn trên sàn của các đơn còn xử lý (không gồm đơn đã hủy/sự cố). */
  orderNumbers: string[];
  recipientName: string | null;
  units: number;
  /** SKU khác nhau, theo số lượng giảm dần. */
  skus: { sku: string; quantity: number }[];
}

/**
 * Hàng chờ đóng gói (05/10/2026): nhân viên nhận nhóm bằng mã đơn/người nhận/hàng,
 * không bằng ObjectId của nhóm. Đọc thẳng `orders` để nhóm đang tính hoặc tính lỗi
 * (chưa có kiện) vẫn có đủ thông tin.
 */
@Injectable()
export class PackingQueueService {
  constructor(@InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>) {}

  async describeGroups(groupIds: string[]): Promise<GroupQueueInfo[]> {
    const ids = groupIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    if (ids.length === 0) return [];
    const orders = await this.orderModel
      .find({ consolidated_group_id: { $in: ids }, status: { $nin: NOT_PACKABLE_ORDER_STATUSES } })
      .select('consolidated_group_id platform_order_id recipient.full_name items.sku items.quantity items.status')
      .sort({ created_at: 1 })
      .lean();

    const byGroup = new Map<string, GroupQueueInfo & { skuMap: Map<string, number> }>();
    for (const order of orders) {
      if (!order.consolidated_group_id) continue;
      const key = order.consolidated_group_id.toString();
      let info = byGroup.get(key);
      if (!info) {
        info = { orderGroupId: key, orderNumbers: [], recipientName: null, units: 0, skus: [], skuMap: new Map() };
        byGroup.set(key, info);
      }
      info.orderNumbers.push(order.platform_order_id);
      info.recipientName ??= order.recipient.full_name || null;
      for (const item of order.items) {
        if ((NOT_PACKABLE_ORDER_STATUSES as string[]).includes(item.status)) continue;
        info.units += item.quantity;
        info.skuMap.set(item.sku, (info.skuMap.get(item.sku) ?? 0) + item.quantity);
      }
    }

    return [...byGroup.values()].map(({ skuMap, ...info }) => ({
      ...info,
      skus: [...skuMap.entries()]
        .map(([sku, quantity]) => ({ sku, quantity }))
        .sort((a, b) => b.quantity - a.quantity || a.sku.localeCompare(b.sku)),
    }));
  }
}
