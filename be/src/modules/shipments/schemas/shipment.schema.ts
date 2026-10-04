import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { DeliveryFailureReason } from '../enums/delivery-failure-reason.enum';

/**
 * G1 (27/09/2026) — vận đơn (bản gọn: chỉ bấm nút đổi trạng thái).
 * Mở rộng sau (GPS, ảnh bằng chứng, chuyến giao nhiều điểm) chỉ THÊM field,
 * không phải đổi cấu trúc — xem CLAUDE.md "PHẦN II".
 */
@Schema({ collection: 'shipments', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Shipment {
  @Prop({ required: true, unique: true })
  shipment_code!: string; // VD SHP-260927-8F3A1C

  @Prop({ type: Types.ObjectId, required: true, ref: 'OrderGroup' })
  order_group_id!: Types.ObjectId;

  @Prop({ type: String, required: true, default: 'forward' })
  direction!: 'forward'; // G3 sẽ thêm 'reverse' (đi lấy hàng trả)

  @Prop({ type: String, enum: ShipmentStatus, required: true, index: true })
  status!: ShipmentStatus;

  @Prop({ type: Number, required: true, default: 1 })
  attempt_count!: number; // lần giao hiện tại (1-based)

  @Prop({ type: Number, required: true, default: 2 })
  max_attempts!: number;

  @Prop({ type: String, enum: DeliveryFailureReason, default: null })
  last_failure_reason!: DeliveryFailureReason | null;

  @Prop({ type: Date, default: null })
  delivered_at!: Date | null;

  @Prop({ type: Date, default: null })
  returned_at!: Date | null;

  // Không cho "Giao lại" trước thời điểm này (khoảng cách tối thiểu / giờ khách hẹn).
  @Prop({ type: Date, default: null })
  next_attempt_not_before?: Date | null; // tùy chọn ở tầng TYPE: vận đơn cũ không có field

  // Hạn giao (tính theo giờ làm việc từ lúc bắt đầu giao) + cờ trễ hạn do tác vụ định kỳ gắn.
  @Prop({ type: Date, default: null })
  due_at?: Date | null; // vận đơn cũ không có -> không bị quét quá hạn

  @Prop({ type: Boolean, default: false, index: true })
  is_overdue?: boolean;

  @Prop({ type: String, required: true })
  created_by!: string;

  // ---- Gộp từ thi_dev (04/10/2026): hãng, cước, ETA, giao chung chuyến ----
  // Mã chuyến chung cho các vận đơn tạo cùng lúc (POST /shipments/batch).
  @Prop({ type: String, default: null })
  trip_code!: string | null;

  // Mã vận đơn in trên nhãn — bằng shipment_code (giữ field riêng cho tài liệu in).
  @Prop({ type: String, default: null })
  tracking_code!: string | null;

  @Prop({ type: String, default: null })
  note!: string | null;

  @Prop({ type: String, default: null })
  carrier_code!: string | null;

  @Prop({ type: String, default: null })
  carrier_name!: string | null;

  @Prop({ type: String, default: null })
  service_code!: string | null;

  @Prop({ type: String, default: null })
  service_name!: string | null;

  @Prop({ type: Number, default: null })
  parcel_count!: number | null;

  @Prop({ type: Number, default: null })
  chargeable_weight_g!: number | null;

  @Prop({ type: Number, default: null })
  estimated_cost_vnd!: number | null;

  // true = cước tính từ bảng cước MẪU (is_sample) — không phải cước thật.
  @Prop({ type: Boolean, default: null })
  is_sample_rate!: boolean | null;

  @Prop({ type: Date, default: null })
  eta_from!: Date | null;

  @Prop({ type: Date, default: null })
  eta_to!: Date | null;

  @Prop({ type: Date, default: null })
  pickup_at!: Date | null;

  created_at?: Date;
  updated_at?: Date;
}

export type ShipmentDocument = HydratedDocument<Shipment>;
export const ShipmentSchema = SchemaFactory.createForClass(Shipment);
// 1 nhóm đơn chỉ có 1 vận đơn chiều đi — chặn tạo trùng ở tầng DB (2 người bấm cùng lúc).
ShipmentSchema.index({ order_group_id: 1, direction: 1 }, { unique: true });
ShipmentSchema.index({ status: 1, updated_at: -1 });
// Bảng kê chuyến (documents/manifest/:tripCode) + lọc theo hãng.
ShipmentSchema.index({ trip_code: 1 }, { partialFilterExpression: { trip_code: { $type: 'string' } } });
ShipmentSchema.index({ carrier_code: 1, created_at: -1 });
