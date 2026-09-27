import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { InspectionResult, ReturnReason, ReturnStatus, ReturnType } from '../enums/return.enums';

@Schema({ _id: false })
export class ReturnItem {
  @Prop({ required: true }) seller_sku!: string;
  @Prop({ required: true, min: 1 }) quantity!: number;
  @Prop({ type: String, enum: ReturnReason, required: true }) reason_code!: ReturnReason;
}
const ReturnItemSchema = SchemaFactory.createForClass(ReturnItem);

@Schema({ _id: false })
export class InspectionLine {
  @Prop({ required: true }) seller_sku!: string;
  @Prop({ required: true, min: 1 }) quantity!: number;
  @Prop({ type: String, enum: InspectionResult, required: true }) result!: InspectionResult;
  @Prop({ type: Types.ObjectId, default: null }) warehouse_id!: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, default: null }) bin_location_id!: Types.ObjectId | null;
  @Prop({ type: String, default: null }) note!: string | null;
}
const InspectionLineSchema = SchemaFactory.createForClass(InspectionLine);

@Schema({ _id: false })
export class PackagingInspectionRecord {
  @Prop({ required: true }) material_code!: string;
  @Prop({ required: true }) quantity!: number;
  @Prop({ type: String, enum: ['A', 'B', 'C'], required: true }) grade!: 'A' | 'B' | 'C';
  @Prop({ type: Number, default: 0 }) reuse_cycle_seen!: number;
  @Prop({ type: Boolean, default: false }) old_label_removed!: boolean;
  @Prop({ type: Boolean, required: true }) recovered_to_reuse!: boolean;
  @Prop({ required: true }) outcome!: string;
}
const PackagingInspectionRecordSchema = SchemaFactory.createForClass(PackagingInspectionRecord);

/**
 * G3 (27/09/2026) — phiếu trả/hoàn hàng (RMA). Bản gọn: tạo bằng nút bấm
 * (giả lập khách) hoặc tự động khi kiện giao thất bại về kho. Không gọi API
 * reverse-order của Lazada. Hoàn tiền là việc của sàn — hệ thống chỉ quản lý HÀNG.
 */
@Schema({ collection: 'return_requests', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class ReturnRequest {
  @Prop({ required: true, unique: true }) rma_code!: string;
  @Prop({ type: Types.ObjectId, required: true, ref: 'OrderGroup', index: true }) order_group_id!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, default: null, ref: 'Shipment' }) shipment_id!: Types.ObjectId | null;
  @Prop({ type: String, enum: ReturnType, required: true }) type!: ReturnType;
  @Prop({ type: String, enum: ['simulated', 'failed_delivery'], required: true }) source!: 'simulated' | 'failed_delivery';
  @Prop({ type: String, enum: ReturnStatus, required: true, index: true }) status!: ReturnStatus;
  @Prop({ type: String, enum: MarketplacePlatform, required: true }) platform!: MarketplacePlatform;
  @Prop({ required: true }) shop_id!: string;
  @Prop({ type: [ReturnItemSchema], default: [] }) items!: ReturnItem[];
  @Prop({ type: [InspectionLineSchema], default: [] }) inspection!: InspectionLine[];
  @Prop({ type: [PackagingInspectionRecordSchema], default: [] }) packaging_inspection!: PackagingInspectionRecord[]; // G4
  @Prop({ type: String, default: null }) customer_note!: string | null;
  @Prop({ type: String, default: null }) decision_note!: string | null;
  @Prop({ required: true }) created_by!: string;
  @Prop({ type: String, default: null }) decided_by!: string | null;
  @Prop({ type: String, default: null }) received_by!: string | null;
  @Prop({ type: String, default: null }) inspected_by!: string | null;
  @Prop({ type: Date, default: null }) closed_at!: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type ReturnRequestDocument = HydratedDocument<ReturnRequest>;
export const ReturnRequestSchema = SchemaFactory.createForClass(ReturnRequest);
