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

  @Prop({ type: String, required: true })
  created_by!: string;

  created_at?: Date;
  updated_at?: Date;
}

export type ShipmentDocument = HydratedDocument<Shipment>;
export const ShipmentSchema = SchemaFactory.createForClass(Shipment);
// 1 nhóm đơn chỉ có 1 vận đơn chiều đi — chặn tạo trùng ở tầng DB (2 người bấm cùng lúc).
ShipmentSchema.index({ order_group_id: 1, direction: 1 }, { unique: true });
ShipmentSchema.index({ status: 1, updated_at: -1 });
