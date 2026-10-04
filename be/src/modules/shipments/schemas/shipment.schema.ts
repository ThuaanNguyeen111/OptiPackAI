import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * ===================================================================
 * shipments — MỚI (29/09/2026, Mục 9.5 AURELLE_MARKETPLACE_DESIGN.md)
 * ===================================================================
 * Tài liệu KHÔNG có bảng schema chính thức cho "shipment" — chỉ nhắc
 * field `delivery_trip_id`/`trip_code` rải rác (Mục 4.3, 7.8, 9.4, 9.5).
 * Thiết kế TỐI GIẢN đúng phạm vi Mục 9.5 (chỉ để LIÊN KẾT N group cùng
 * 1 mã chuyến khi tạo chung 1 lần `POST /shipments/batch`) — CHƯA có
 * carrier/tracking hãng thật/cost/eta/pickup (đó là phạm vi P3 module
 * `shipping/` RIÊNG, kế hoạch trong CLAUDE.md mục "Hoàn thiện AI
 * Packaging + Shipping", CHƯA bắt đầu). Khi P3 triển khai, THÊM field
 * vào ĐÚNG collection này (additive) — không đổi tên, không tạo
 * collection thứ 2 trùng khái niệm (đã xác nhận với user 29/09/2026).
 *
 * 1 OrderGroup CHỈ tạo được ĐÚNG 1 Shipment (unique order_group_id) —
 * gọi lại /shipments/batch cho group đã có shipment sẽ nhận lỗi rõ ràng
 * (SHP_GROUP_ALREADY_SHIPPED) thay vì tạo bản ghi trùng.
 * ===================================================================
 */
@Schema({
  collection: 'shipments',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class Shipment {
  @Prop({ type: Types.ObjectId, ref: 'OrderGroup', required: true })
  order_group_id!: Types.ObjectId;

  // "TRIP-yymmdd-XXXX" — chung cho mọi shipment tạo CÙNG 1 lần gọi
  // POST /shipments/batch (Mục 9.5, hàng #4).
  @Prop({ type: String, required: true })
  trip_code!: string;

  // Mã nội bộ "OPK-<random>" — KHÔNG phải mã vận đơn hãng thật (chưa có
  // hãng vận chuyển thật, xem comment đầu file).
  @Prop({ type: String, required: true })
  tracking_code!: string;

  @Prop({ type: String, default: null })
  note!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  created_by!: Types.ObjectId;

  // ---- BỔ SUNG (30/09/2026) — vận chuyển thật: hãng, dịch vụ, cước, ETA, lịch lấy hàng.
  // Vận đơn tạo trước 30/09 không có các field này (null / 0).
  @Prop({ type: String, default: null }) carrier_code!: string | null;
  @Prop({ type: String, default: null }) carrier_name!: string | null;
  @Prop({ type: String, default: null }) service_code!: string | null;
  @Prop({ type: String, default: null }) service_name!: string | null;
  /** Số KIỆN của nhóm tại thời điểm tạo vận đơn (đa kiện). */
  @Prop({ type: Number, default: 0, min: 0 }) parcel_count!: number;
  /** Tổng khối lượng tính cước (g) = Σ max(cân thực, cân quy đổi) từng kiện. */
  @Prop({ type: Number, default: 0, min: 0 }) chargeable_weight_g!: number;
  @Prop({ type: Number, default: null }) estimated_cost_vnd!: number | null;
  /** true = cước lấy từ bảng cước MẪU (chưa phải cước thật). */
  @Prop({ type: Boolean, default: false }) is_sample_rate!: boolean;
  @Prop({ type: Date, default: null }) eta_from!: Date | null;
  @Prop({ type: Date, default: null }) eta_to!: Date | null;
  @Prop({ type: Date, default: null }) pickup_at!: Date | null;

  created_at?: Date;
}

export type ShipmentDocument = HydratedDocument<Shipment>;
export const ShipmentSchema = SchemaFactory.createForClass(Shipment);

// 1 group chỉ được có ĐÚNG 1 shipment — enforce ở tầng DB (Rule #5),
// không chỉ ở service.
ShipmentSchema.index({ order_group_id: 1 }, { unique: true });
// Phục vụ tra cứu "mọi vận đơn cùng 1 chuyến" (chưa có endpoint riêng,
// chuẩn bị sẵn cho khi cần — Rule #3, ESR).
ShipmentSchema.index({ trip_code: 1 });
// Phục vụ: GET /shipments?carrier_code= (đối soát theo hãng, mới nhất trước).
ShipmentSchema.index({ carrier_code: 1, created_at: -1 });
