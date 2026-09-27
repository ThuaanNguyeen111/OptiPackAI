import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** G4 — sổ cái vật liệu đóng gói (append-only). Nguồn cho số liệu tiết kiệm. */
@Schema({ collection: 'packaging_movements', timestamps: false })
export class PackagingMovement {
  @Prop({ required: true, index: true }) material_code!: string;
  @Prop({ type: String, enum: ['new', 'reused'], required: true }) condition!: 'new' | 'reused';
  @Prop({ type: String, enum: ['purchase', 'consume', 'recover'], required: true }) type!: 'purchase' | 'consume' | 'recover';
  @Prop({ type: Number, required: true }) delta!: number;
  @Prop({ type: Number, default: 0 }) saving_vnd!: number; // > 0 khi DÙNG hàng tái sử dụng thay hàng mới
  @Prop({ type: String, default: null }) ref_type!: string | null; // order_group | return_request
  @Prop({ type: String, default: null }) ref_id!: string | null;
  @Prop({ type: String, default: null }) note!: string | null;
  @Prop({ required: true }) actor_id!: string;
  @Prop({ type: Date, required: true }) created_at!: Date;
}
export type PackagingMovementDocument = HydratedDocument<PackagingMovement>;
export const PackagingMovementSchema = SchemaFactory.createForClass(PackagingMovement);
PackagingMovementSchema.index({ ref_type: 1, ref_id: 1, type: 1 });
