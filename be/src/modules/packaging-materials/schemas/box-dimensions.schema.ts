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
