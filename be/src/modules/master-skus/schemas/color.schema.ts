import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** K4a (27/09/2026) — danh mục màu chuẩn: hết cảnh "DEN" và "DENN" bị coi là 2 màu. */
@Schema({ collection: 'colors', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Color {
  @Prop({ required: true, unique: true }) code!: string; // VD DEN — KHÓA sau khi tạo (nằm trong mã SKU)
  @Prop({ required: true }) name!: string; // VD Đen
  @Prop({ type: String, default: null }) hex!: string | null; // VD #000000 — để FE hiện ô màu
  @Prop({ type: Boolean, default: true }) is_active!: boolean;
}
export type ColorDocument = HydratedDocument<Color>;
export const ColorSchema = SchemaFactory.createForClass(Color);
