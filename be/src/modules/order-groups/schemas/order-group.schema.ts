import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';
import {
  GROUP_FULFILLMENT_STATUS_VALUES,
  GroupFulfillmentStatus,
} from '../enums/group-fulfillment-status.enum';

/**
 * ===================================================================
 * order_groups — collection MỚI HOÀN TOÀN, KHÔNG đụng order.schema.ts
 * ===================================================================
 * LÝ DO tách collection riêng thay vì thêm field vào Order (đã ghi rõ
 * trong CLAUDE.md, mục Roadmap): fulfillment_status là thuộc tính của
 * CẢ GÓI HÀNG, không phải từng đơn lẻ — nhét vào Order sẽ tạo tình
 * huống vô lý (2 đơn cùng 1 kiện nhưng "trạng thái đóng gói" khác
 * nhau). MỌI đơn đều thuộc 1 group, kể cả đơn lẻ (group-of-1), để
 * Package 3/4 chỉ cần 1 luồng xử lý duy nhất.
 *
 * Áp dụng Database Design Standards (CLAUDE.md):
 *  - Rule #9  : HydratedDocument<T>, không trộn pattern `T & Document`.
 *  - Rule #11 : property snake_case trực tiếp, không map riêng.
 *  - Rule #18 : Optimistic Concurrency (versionKey) — nhiều nhân viên
 *               có thể sửa cùng 1 group gần như đồng thời.
 *  - Rule #21 : denormalize shop_name_snapshot, tránh $lookup ở hot
 *               path (danh sách group hiển thị cho Warehouse/Packaging
 *               Staff sẽ được gọi rất thường xuyên).
 *  - Rule #22 : Canonical Schema — CHỈ chứa field chuẩn hóa chung,
 *               KHÔNG BAO GIỜ thêm field đặc thù riêng 1 sàn vào đây
 *               (đặc thù sàn dừng lại ở tầng Adapter/Mapper).
 * ===================================================================
 */
@Schema({
  collection: 'order_groups',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: '__v', // Rule #18 — bật tường minh, không dựa mặc định ngầm
})
export class OrderGroup {
  @Prop({ type: String, enum: MarketplacePlatform, required: true })
  platform!: MarketplacePlatform;

  @Prop({ type: String, required: true, index: true })
  shop_id!: string;

  @Prop({ required: true, default: 0 })
  order_count!: number;

  @Prop({
    type: String,
    enum: GROUP_FULFILLMENT_STATUS_VALUES,
    default: GroupFulfillmentStatus.AWAITING_PACKAGING,
  })
  fulfillment_status!: GroupFulfillmentStatus;

  @Prop({ type: Types.ObjectId, default: null })
  active_packaging_recommendation!: Types.ObjectId | null;

  @Prop({ required: true })
  shop_name_snapshot!: string;

  // Không @Prop() — Mongoose tự sinh, chỉ khai kiểu (đúng convention đã
  // dùng ở user.schema.ts, xem CLAUDE.md phần Type Safety rule #7).
  // __v MỚI thêm (2026-09-09) — cần TypeScript biết field này tồn tại
  // để order-groups.controller.ts đọc được, phục vụ Rule #18.
  created_at?: Date;
  updated_at?: Date;
  __v?: number;
}

export type OrderGroupDocument = HydratedDocument<OrderGroup>;
export const OrderGroupSchema = SchemaFactory.createForClass(OrderGroup);

// Rule #3 (ESR — Equality trước, Sort/Range sau): phục vụ
// GET /order-groups?platform=xxx&status=yyy, sort theo created_at.
OrderGroupSchema.index({ platform: 1, fulfillment_status: 1, created_at: -1 });

// Rule #4: fulfillment_status (cardinality thấp, 9 giá trị cố định)
// KHÔNG được đứng index riêng lẻ — luôn đứng sau platform trong compound
// index ở trên, không tạo thêm index đơn cho riêng field này.
