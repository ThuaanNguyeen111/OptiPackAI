import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { ShipmentEventType } from '../enums/shipment-event-type.enum';

/**
 * G1 — lịch sử vận đơn = TRACKING dạng dòng thời gian. APPEND-ONLY: code
 * không có đường nào sửa/xóa event — khi tranh chấp, lịch sử không ai chỉnh được.
 * Mở rộng sau: thêm location{lat,lng}, proof{photo_urls} vào đây.
 */
@Schema({ collection: 'shipment_events', timestamps: false })
export class ShipmentEvent {
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Shipment' })
  shipment_id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'OrderGroup', index: true })
  order_group_id!: Types.ObjectId;

  @Prop({ type: String, enum: ShipmentEventType, required: true })
  event_type!: ShipmentEventType;

  @Prop({ type: String, enum: ShipmentStatus, default: null })
  status_from!: ShipmentStatus | null;

  @Prop({ type: String, enum: ShipmentStatus, required: true })
  status_to!: ShipmentStatus;

  @Prop({ type: Number, required: true })
  attempt_no!: number;

  @Prop({ type: String, required: true })
  actor_id!: string; // 'system' cho sự kiện hệ thống tự làm

  @Prop({ type: Number, default: null })
  actor_role!: number | null;

  @Prop({ type: String, default: null })
  reason_code!: string | null;

  @Prop({ type: String, default: null })
  note!: string | null;

  @Prop({ type: Date, required: true })
  occurred_at!: Date;

  /**
   * C5 (14/10/2026) — nguồn của sự kiện hãng: 'carrier_webhook' (GHN gọi), 'carrier_sync'
   * (gọi Order Info), 'carrier_simulated' (nút mô phỏng demo), 'manual' (người bấm).
   * Sự kiện G1 cũ không có field này.
   */
  @Prop({ type: String, default: null })
  source?: string | null;

  /** Trạng thái gốc hãng gửi (VD `picked`, `delivery_fail`). */
  @Prop({ type: String, default: null })
  carrier_status?: string | null;
}

export type ShipmentEventDocument = HydratedDocument<ShipmentEvent>;
export const ShipmentEventSchema = SchemaFactory.createForClass(ShipmentEvent);
ShipmentEventSchema.index({ shipment_id: 1, occurred_at: 1 });
