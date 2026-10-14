import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { DeliveryFailureReason } from '../enums/delivery-failure-reason.enum';

/** C4 (14/10/2026) — chi tiết phí hãng báo cho 1 kiện (VND). */
@Schema({ _id: false })
export class CarrierParcelFee {
  @Prop({ type: Number, default: 0 }) total!: number;
  @Prop({ type: Number, default: 0 }) service_fee!: number;
  @Prop({ type: Number, default: 0 }) insurance_fee!: number;
  @Prop({ type: Number, default: 0 }) cod_fee!: number;
  @Prop({ type: Number, default: 0 }) remote_area_fee!: number;
  @Prop({ type: Number, default: 0 }) other_fee!: number;
}
export const CarrierParcelFeeSchema = SchemaFactory.createForClass(CarrierParcelFee);

/**
 * C4 (14/10/2026) — 1 kiện = 1 vận đơn ở hãng (GHN chỉ nhận 1 bộ cân/kích thước mỗi đơn).
 * `client_order_code` = mã gửi hãng để chống tạo trùng (gửi lại cùng mã → hãng trả đơn cũ).
 */
@Schema({ _id: false })
export class CarrierParcel {
  @Prop({ type: Number, required: true }) parcel_no!: number; // số kiện trong kế hoạch đóng gói
  @Prop({ type: SchemaTypes.ObjectId, required: true }) order_id!: Types.ObjectId;
  @Prop({ type: String, default: null }) platform_order_id!: string | null;
  @Prop({ type: String, required: true }) client_order_code!: string;
  @Prop({ type: String, default: null }) carrier_order_code!: string | null; // null = chưa tạo được ở hãng
  @Prop({ type: String, default: null }) sort_code!: string | null;
  @Prop({ type: Number, default: null }) weight_g!: number | null;
  @Prop({ type: Number, default: null }) length_cm!: number | null;
  @Prop({ type: Number, default: null }) width_cm!: number | null;
  @Prop({ type: Number, default: null }) height_cm!: number | null;
  @Prop({ type: CarrierParcelFeeSchema, default: null }) fee!: CarrierParcelFee | null;
  @Prop({ type: Date, default: null }) expected_delivery_at!: Date | null;
  @Prop({ type: String, default: null }) carrier_status!: string | null; // trạng thái gốc của hãng
  @Prop({ type: Date, default: null }) carrier_status_at!: Date | null;
  @Prop({ type: String, default: null }) booking_error!: string | null;
}
export const CarrierParcelSchema = SchemaFactory.createForClass(CarrierParcel);

/** C4 — địa chỉ ĐÃ GỬI hãng (sau khi Coordinator sửa / bổ sung cho đơn bị che). */
@Schema({ _id: false })
export class CarrierToLocation {
  @Prop({ type: String, default: null }) street!: string | null; // '' = cố ý bỏ số nhà
  @Prop({ type: String, default: null }) ward_name!: string | null;
  @Prop({ type: String, default: null }) province_name!: string | null;
  @Prop({ type: String, default: null }) phone!: string | null;
}
export const CarrierToLocationSchema = SchemaFactory.createForClass(CarrierToLocation);

/**
 * G1 (27/09/2026) — vận đơn (bản gọn: chỉ bấm nút đổi trạng thái).
 * Mở rộng sau (GPS, ảnh bằng chứng, chuyến giao nhiều điểm) chỉ THÊM field,
 * không phải đổi cấu trúc — xem CLAUDE.md "PHẦN II".
 */
@Schema({ collection: 'shipments', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Shipment {
  @Prop({ required: true, unique: true })
  shipment_code!: string; // VD SHP-260927-8F3A1C

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'OrderGroup' })
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

  // ---------------------------------------------------------------------------
  // C4/C5 (14/10/2026) — giao qua HÃNG THẬT (GHN). Vận đơn cũ (G1 / hãng mẫu)
  // không có các field này → đọc như `carrier_kind = null` = không do hãng quản lý.
  // ---------------------------------------------------------------------------

  /** 'live' = gọi API hãng (GHN/mock); null/'table' = tự giao hoặc hãng mẫu (bảng cước). */
  @Prop({ type: String, default: null, enum: ['table', 'live', null] })
  carrier_kind?: 'table' | 'live' | null;

  /** Adapter đã dùng khi tạo vận đơn ('ghn' | 'mock'). */
  @Prop({ type: String, default: null })
  carrier_adapter?: string | null;

  /** Lần đặt vận đơn ở hãng (tăng khi tạo lại sau khi huỷ) — nằm trong client_order_code. */
  @Prop({ type: Number, default: 1 })
  booking_round?: number;

  @Prop({ type: [CarrierParcelSchema], default: [] })
  carrier_parcels?: CarrierParcel[];

  @Prop({ type: CarrierToLocationSchema, default: null })
  to_location?: CarrierToLocation | null;

  /** Trạng thái gốc mới nhất hãng báo (cấp vận đơn). */
  @Prop({ type: String, default: null })
  carrier_status?: string | null;

  /** Lỗi lần tạo vận đơn ở hãng gần nhất (null = mọi kiện đã có mã hãng). */
  @Prop({ type: String, default: null })
  carrier_booking_error?: string | null;

  /** Sự cố hãng báo (lost / damage / exception / scrap) — cần người xử lý. */
  @Prop({ type: String, default: null })
  carrier_incident?: string | null;

  @Prop({ type: Date, default: null })
  picked_up_at?: Date | null;

  /** Hãng báo đã hoàn về shop (`returned`) — kho vẫn phải quét nhận để tạo phiếu hoàn. */
  @Prop({ type: Date, default: null })
  carrier_returned_at?: Date | null;

  @Prop({ type: Date, default: null })
  cancelled_at?: Date | null;

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
// C5 — webhook GHN tìm vận đơn theo mã hãng của từng kiện.
ShipmentSchema.index(
  { 'carrier_parcels.carrier_order_code': 1 },
  { partialFilterExpression: { 'carrier_parcels.carrier_order_code': { $type: 'string' } } },
);
