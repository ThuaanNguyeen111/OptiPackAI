import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { ShipmentEventType } from '../enums/shipment-event-type.enum';

/**
 * G1 — lịch sử vận đơn = TRACKING dạng dòng thời gian. APPEND-ONLY: code
 * không có đường nào sửa/xóa event — khi tranh chấp, lịch sử không ai chỉnh được.
 * Mở rộng sau: thêm location{lat,lng}, proof{photo_urls} vào đây.
 */
@Schema({ collection: 'shipment_events', timestamps: false })
export class ShipmentEvent {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Shipment' })
  shipment_id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'OrderGroup', index: true })
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
}

export type ShipmentEventDocument = HydratedDocument<ShipmentEvent>;
export const ShipmentEventSchema = SchemaFactory.createForClass(ShipmentEvent);
ShipmentEventSchema.index({ shipment_id: 1, occurred_at: 1 });
