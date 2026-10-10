import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
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
/** 02/10/2026 — trạng thái báo "đã đóng gói" lên Lazada của 1 nhóm đơn. */
export type LazadaPackStatus =
  'disabled' | 'skipped' | 'success' | 'partial' | 'failed';

export interface LazadaPackItemResult {
  order_id: string;
  order_item_id: string;
  ok: boolean;
  item_err_code: string | null;
  msg: string | null;
  package_id: string | null;
  tracking_number: string | null;
  shipment_provider: string | null;
}

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

  // (04/10/2026) Bỏ `active_packaging_recommendation` (con trỏ chết, không ai ghi).
  // Kế hoạch đóng gói nay ở collection `packing_plans` (1 bản hoạt động/nhóm).

  @Prop({ required: true })
  shop_name_snapshot!: string;

  // Phân công nhân viên (2026-09-10) — xem staff-assignment.service.ts.
  // Union `X | null` PHẢI khai type: tường minh (Rule #23, bài học từ
  // bug thật packaging_recommendation.schema.ts).
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  assigned_staff_id!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  assigned_at!: Date | null;

  @Prop({ type: String, enum: ['auto', 'manual'], default: null })
  assignment_type!: 'auto' | 'manual' | null;

  // BỔ SUNG (2026-09-10) — Đơn Hỏa Tốc. Đã XÁC MINH bằng doc Lazada
  // thật (2 lần độc lập, GetOrder + GetOrders): Lazada KHÔNG cung cấp
  // field nào phân biệt đơn hỏa tốc — CHỈ CÒN hướng Store Owner/Admin
  // tự tay đánh dấu (xem CLAUDE.md mục "Nghiên cứu Đơn Hỏa Tốc").
  @Prop({ type: String, enum: ['normal', 'express'], default: 'normal' })
  order_priority!: 'normal' | 'express';

  @Prop({ type: Date, default: null })
  packaging_deadline!: Date | null;

  @Prop({ type: Boolean, default: false })
  is_overdue!: boolean;

  /**
   * BỔ SUNG (21/09/2026, BE-4a) — lượt lấy hàng hiện tại. Chỉ pick_events
   * cùng lượt mới được cộng vào "đã lấy"; decide-partial(false) mở lượt
   * mới để lấy lại mà không đếm gấp đôi lượt cũ.
   */
  @Prop({ type: Number, default: 0, min: 0 })
  pick_round!: number;

  /**
   * Mốc lần quét gần nhất — ghi trong CÙNG transaction với pick_event để
   * 2 lần quét đồng thời chạm cùng document group → Mongo báo xung đột
   * ghi, withTransaction chạy lại và kiểm tra lại "không vượt số đặt".
   */
  @Prop({ type: Date, default: null })
  last_picked_at!: Date | null;

  /**
   * BỔ SUNG (29/09/2026, Mục 9.5 AURELLE_MARKETPLACE_DESIGN.md) — tính
   * MỘT LẦN lúc tạo group (getOrCreateGroupForOrder()), KHÔNG đổi lại sau
   * đó. KHÁC HẲN consolidation_key (không kèm platform, xem
   * orders/utils/consolidation-key.util.ts) — dùng để LIÊN KẾT 2 nhóm
   * đơn khác sàn cùng 1 người nhận thật (Picking List gộp, giao chung
   * chuyến), KHÔNG dùng để tự động gộp chung 1 OrderGroup.
   */
  @Prop({ type: String, default: null })
  recipient_key!: string | null;
  // K5 (27/09/2026) — thiếu hàng NGAY lúc tạo nhóm đơn (tồn khả dụng không đủ giữ chỗ).
  @Prop({ type: Boolean, default: false })
  stock_shortage?: boolean;

  @Prop({
    type: [
      {
        sku: String,
        needed: Number,
        reserved: Number,
        shortage: Number,
        _id: false,
      },
    ],
    default: [],
  })
  stock_shortage_items?: {
    sku: string;
    needed: number;
    reserved: number;
    shortage: number;
  }[];

  // Nhóm đơn THAY THẾ sinh ra từ phiếu đổi hàng.
  @Prop({
    type: String,
    enum: ['marketplace', 'replacement'],
    default: 'marketplace',
  })
  origin?: 'marketplace' | 'replacement';

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  source_return_id?: Types.ObjectId | null;

  // 01/10/2026 — BẢN LƯU SẴN số đơn còn hiệu lực / đã hủy (để xem trực tiếp trong DB và
  // làm nền cho bộ lọc phía BE ở bước xử lý hủy đơn). Cập nhật mỗi lần đồng bộ chạm tới
  // nhóm (getOrCreateGroupForOrder) + script backfill cho dữ liệu cũ. API KHÔNG đọc 2
  // field này — vẫn đếm trực tiếp từ `orders` lúc trả response (nguồn sự thật).
  // null = chưa được tính (document cũ trước khi chạy backfill).
  @Prop({ type: Number, default: null })
  active_order_count?: number | null;

  @Prop({ type: Number, default: null })
  canceled_order_count?: number | null;

  @Prop({ type: Date, default: null })
  order_counts_refreshed_at?: Date | null;

  // 02/10/2026 — kết quả báo "đã đóng gói" lên Lazada (Fulfillment API Pack) sau khi
  // nhóm chuyển `packed`. Lưu trên NHÓM ĐƠN, không lưu trong orders.items[]: mỗi lần
  // đồng bộ, orders.service ghi đè toàn bộ `items` theo dữ liệu Lazada -> trường thêm
  // vào items sẽ bị xóa. null = nhóm chưa từng đi qua bước này (dữ liệu cũ).
  @Prop({
    type: String,
    enum: ['disabled', 'skipped', 'success', 'partial', 'failed'],
    default: null,
  })
  lazada_pack_status?: LazadaPackStatus | null;

  @Prop({ type: Date, default: null })
  lazada_pack_attempted_at?: Date | null;

  @Prop({ type: String, default: null })
  lazada_pack_error?: string | null;

  @Prop({
    type: [
      {
        order_id: String,
        order_item_id: String,
        ok: Boolean,
        item_err_code: String,
        msg: String,
        package_id: String,
        tracking_number: String,
        shipment_provider: String,
        _id: false,
      },
    ],
    default: [],
  })
  lazada_pack_items?: LazadaPackItemResult[];

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

// BỔ SUNG (2026-09-10) — phục vụ đếm "workload hiện tại" của từng
// staff (Rule #3 ESR: assigned_staff_id equality trước, fulfillment_status
// range/set sau) — dùng trong autoAssignStaff() để chọn người ít việc nhất.
OrderGroupSchema.index({ assigned_staff_id: 1, fulfillment_status: 1 });

// BỔ SUNG (2026-09-10) — phục vụ cron cảnh báo SLA (quét đơn hỏa tốc
// sắp/đã quá hạn) — Rule #3 ESR, equality (order_priority) trước.
OrderGroupSchema.index({
  order_priority: 1,
  packaging_deadline: 1,
  is_overdue: 1,
});

// Rule #4: fulfillment_status (cardinality thấp, 9 giá trị cố định)
// KHÔNG được đứng index riêng lẻ — luôn đứng sau platform trong compound
// index ở trên, không tạo thêm index đơn cho riêng field này.

// BỔ SUNG (29/09/2026, Mục 9.5) — phục vụ GET /order-groups/:id/linked +
// đếm linkedGroupCount. Partial vì phần lớn group KHÔNG có sibling khác
// sàn (recipient_key vẫn null cho tới khi có group thứ 2 cùng khách) —
// không cần index những document không bao giờ được tra theo field này.
OrderGroupSchema.index(
  { recipient_key: 1 },
  { partialFilterExpression: { recipient_key: { $type: 'string' } } },
);
