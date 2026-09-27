import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * K2 (26/09/2026) — Danh mục sản phẩm 2 cấp (VD Áo -> Áo thun).
 * - Cấp 1 chỉ để NHÓM (gắn với 1 dãy kệ), KHÔNG có thang size.
 * - Cấp 2 là loại sản phẩm thật, BẮT BUỘC có thang size riêng (áo thun S/M/L,
 *   quần jean 28/29/30, guốc 35-40) — vì mỗi tầng kệ = 1 size, thang size
 *   khác nhau giữa các loại.
 * - Giới tính (nam/nữ/unisex) KHÔNG phải cấp danh mục — là thuộc tính của
 *   mẫu sản phẩm (bước K4), tránh cây bị nhân ba.
 * - `code` khóa sau khi tạo (sẽ nằm trong mã SKU nội bộ in trên nhãn).
 */
@Schema({ collection: 'categories', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Category {
  @Prop({ required: true, unique: true })
  code!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: String, default: null, index: true })
  parent_code!: string | null;

  @Prop({ type: Number, required: true, enum: [1, 2] })
  level!: 1 | 2;

  @Prop({ type: [String], default: [] })
  size_scale!: string[];

  @Prop({ default: true })
  is_active!: boolean;
}

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);
