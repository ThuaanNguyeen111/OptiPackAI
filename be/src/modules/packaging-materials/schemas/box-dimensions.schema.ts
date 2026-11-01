import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Kích thước thùng theo mm (lòng thùng `inner` / mặt ngoài `outer`) — engine
 * đóng gói 3D làm việc bằng mm/g. Dùng chung cho kho vật tư, kế hoạch đóng gói
 * và bản ghi phương án cũ (packaging_recommendations).
 */
@Schema({ _id: false })
export class BoxDimensionsMm {
  @Prop({ type: Number, required: true, min: 1 }) length_mm!: number;
  @Prop({ type: Number, required: true, min: 1 }) width_mm!: number;
  @Prop({ type: Number, required: true, min: 1 }) height_mm!: number;
}
export const BoxDimensionsMmSchema = SchemaFactory.createForClass(BoxDimensionsMm);

/**
 * AOFP-224 (31/10/2026) — túi niêm phong trải phẳng (mm, KHÔNG gồm nắp dán).
 * Túi không có lòng cố định: chồng hàng vừa túi theo luật nửa chu vi
 * (docs/PACKAGING_STANDARD.md §4.3), nên chỉ cần rộng × dài.
 */
@Schema({ _id: false })
export class MailerFlatMm {
  @Prop({ type: Number, required: true, min: 1 }) width_mm!: number;
  @Prop({ type: Number, required: true, min: 1 }) length_mm!: number;
}
export const MailerFlatMmSchema = SchemaFactory.createForClass(MailerFlatMm);
