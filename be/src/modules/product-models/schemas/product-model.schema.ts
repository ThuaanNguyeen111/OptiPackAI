import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { PRODUCT_CATEGORY_VALUES, ProductCategory } from '../../../common/enums/product-category.enum';

/**
 * AOFP-352 — thư viện mô hình 3D dùng chung (docs/specs/PRODUCT_3D_MODELS.md §5.1).
 * Mô hình chỉ quyết định DÁNG hiển thị; kích thước luôn lấy theo số đo SKU, bộ giải không đọc mô hình.
 */
export const MODEL_SOURCES = ['category', 'upload', 'primitive'] as const;
export type ModelSource = (typeof MODEL_SOURCES)[number];

/** garment = file có clip gập + túi zip (quần áo); rigid = hàng cứng. */
export const MODEL_KINDS = ['garment', 'rigid'] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];

export const PRIMITIVE_SHAPES = ['box', 'cylinder', 'bottle', 'tube'] as const;
export type PrimitiveShape = (typeof PRIMITIVE_SHAPES)[number];

export const CREDIT_TYPES = ['self_made', 'supplier', 'external'] as const;
export type CreditType = (typeof CREDIT_TYPES)[number];

@Schema({ _id: false })
export class ModelFile {
  /** category: đường dẫn tĩnh FE (`/models/tshirt.glb`); upload: URL Cloudinary raw. */
  @Prop({ type: String, required: true }) url!: string;
  @Prop({ type: String, default: null }) public_id!: string | null;
  @Prop({ type: Number, default: null }) bytes!: number | null;
  @Prop({ type: String, default: null }) sha256!: string | null;
}
export const ModelFileSchema = SchemaFactory.createForClass(ModelFile);

@Schema({ _id: false })
export class PrimitiveSpec {
  @Prop({ type: String, enum: PRIMITIVE_SHAPES, required: true }) shape!: PrimitiveShape;
  /** Phần trăm bên trong dáng; dáng nào dùng trường nào + khoảng hợp lệ: primitive-params.ts. */
  @Prop({ type: Number, default: null }) corner_radius_pct!: number | null;
  @Prop({ type: Number, default: null }) cap_height_pct!: number | null;
  @Prop({ type: Number, default: null }) shoulder_pct!: number | null;
  @Prop({ type: Number, default: null }) neck_height_pct!: number | null;
  @Prop({ type: Number, default: null }) neck_diameter_pct!: number | null;
  @Prop({ type: Number, default: null }) crimp_pct!: number | null;
  @Prop({ type: String, required: true }) body_color!: string;
  @Prop({ type: String, default: null }) cap_color!: string | null;
}
export const PrimitiveSpecSchema = SchemaFactory.createForClass(PrimitiveSpec);

@Schema({ _id: false })
export class ModelBBox {
  @Prop({ type: Number, required: true }) x!: number;
  @Prop({ type: Number, required: true }) y!: number;
  @Prop({ type: Number, required: true }) z!: number;
}
export const ModelBBoxSchema = SchemaFactory.createForClass(ModelBBox);

@Schema({ _id: false })
export class ModelCredit {
  @Prop({ type: String, enum: CREDIT_TYPES, required: true }) type!: CreditType;
  @Prop({ type: String, default: null }) url!: string | null;
  @Prop({ type: String, default: null }) license!: string | null;
}
export const ModelCreditSchema = SchemaFactory.createForClass(ModelCredit);

@Schema({ _id: false })
export class ModelFileVersion {
  @Prop({ type: Number, required: true }) version!: number;
  @Prop({ type: ModelFileSchema, default: null }) file!: ModelFile | null;
  @Prop({ type: PrimitiveSpecSchema, default: null }) primitive!: PrimitiveSpec | null;
  /** Đợt 2 — kèm thông số file để khôi phục được bản cũ. null = bản ghi trước khi có khôi phục. */
  @Prop({ type: ModelBBoxSchema, default: null }) bbox_m!: ModelBBox | null;
  @Prop({ type: Boolean, default: null }) has_fold_rig!: boolean | null;
  @Prop({ type: Boolean, default: null }) auto_fold!: boolean | null;
  @Prop({ type: Date, required: true }) replaced_at!: Date;
}
export const ModelFileVersionSchema = SchemaFactory.createForClass(ModelFileVersion);

@Schema({ collection: 'product_models', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class ProductModel {
  @Prop({ type: String, required: true, trim: true }) name!: string;
  @Prop({ type: String, enum: MODEL_SOURCES, required: true }) source!: ModelSource;
  @Prop({ type: String, enum: MODEL_KINDS, required: true }) kind!: ModelKind;
  /** Chỉ với source = category: loại sản phẩm mà mô hình có sẵn này đại diện (khoá migrate). */
  @Prop({ type: String, enum: [...PRODUCT_CATEGORY_VALUES, null], default: null })
  category_key!: ProductCategory | null;
  /** +1 mỗi lần thay file / sửa thông số — kế hoạch đã lưu chụp số này. */
  @Prop({ type: Number, default: 1, min: 1 }) version!: number;
  @Prop({ type: ModelFileSchema, default: null }) file!: ModelFile | null;
  @Prop({ type: PrimitiveSpecSchema, default: null }) primitive!: PrimitiveSpec | null;
  /** Khối bao của file (mét); null với primitive. */
  @Prop({ type: ModelBBoxSchema, default: null }) bbox_m!: ModelBBox | null;
  @Prop({ type: Boolean, default: false }) has_fold_rig!: boolean;
  /** Đợt 2 — file quần áo trải phẳng, không có xương gập: FE tự dựng bước gập (nhãn "Bước gập tự tạo"). */
  // Tuỳ chọn: bản ghi migrate trước đợt 2 không có trường này (lean không điền default).
  @Prop({ type: Boolean, default: false }) auto_fold?: boolean;
  @Prop({ type: ModelCreditSchema, default: null }) credit!: ModelCredit | null;
  @Prop({ type: String, enum: ['active', 'retired'], default: 'active' }) status!: 'active' | 'retired';
  @Prop({ type: [ModelFileVersionSchema], default: [] }) history!: ModelFileVersion[];
  @Prop({ type: SchemaTypes.ObjectId, default: null }) created_by!: Types.ObjectId | null;
  @Prop({ type: SchemaTypes.ObjectId, default: null }) updated_by!: Types.ObjectId | null;
}

export type ProductModelDocument = HydratedDocument<ProductModel>;
export const ProductModelSchema = SchemaFactory.createForClass(ProductModel);
ProductModelSchema.index({ status: 1, source: 1 });
ProductModelSchema.index({ category_key: 1 }, { unique: true, partialFilterExpression: { source: 'category' } });
ProductModelSchema.index({ name: 'text' });
