import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { MarketplacePlatform } from '../enums/platform.enum';

export type MarketplaceShopDocument = MarketplaceShop & Document;

/**
 * ===================================================================
 * COLLECTION `marketplace_shops` — "CHÌA KHÓA" GỌI API TỪNG SÀN
 * ===================================================================

 *
 * LÝ DO tồn tại RIÊNG, không nhét vào `orders`: đây là dữ liệu "vận
 * hành kết nối" (token, hạn token, lần quét cuối), vòng đời và tần
 * suất thay đổi khác hẳn dữ liệu nghiệp vụ đơn hàng.
 * ===================================================================
 */
@Schema({
  collection: 'marketplace_shops',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, 
})
export class MarketplaceShop {
  @Prop({ type: String, enum: MarketplacePlatform, required: true })
  platform!: MarketplacePlatform;

  // ID của shop TRÊN SÀN (không phải _id Mongo)
  @Prop({ type: String, required: true })
  shop_id!: string;

  @Prop({ type: String, default: null })
  shop_name!: string | null;

  // Riêng TikTok Shop cần shop_cipher cho mọi API call trừ OAuth —
  // Lazada/Tiki luôn null. Không tách schema riêng vì chỉ khác đúng
  // 1 field, tách sẽ over-engineer.
  @Prop({ type: String, default: null })
  shop_cipher!: string | null;

  //
  @Prop({ type: String, enum: ['sandbox', 'production'], required: true, default: 'sandbox' })
  environment!: 'sandbox' | 'production';

  // LUÔN Ở DẠNG ĐÃ MÃ HÓA (xem token-encryption.util.ts).
  // select: false — mặc định find() KHÔNG trả field này, phải gọi
  // .select('+access_token_encrypted') mới lấy được.
  @Prop({ type: String, required: true, select: false })
  access_token_encrypted!: string;

  @Prop({ type: String, required: true, select: false })
  refresh_token_encrypted!: string;

  @Prop({ type: Date, required: true })
  access_token_expires_at!: Date;

  @Prop({ type: Date, required: true })
  refresh_token_expires_at!: Date;

  // Cron polling reconciliation (Lazada/Tiki) đọc field này để biết
  // "lần trước quét tới đâu rồi".
  @Prop({ type: Date, default: null })
  last_polled_at!: Date | null;

  // Admin nào bấm "Kết nối shop" — audit trail, cùng nguyên tắc
  // created_by đã áp dụng ở module Auth.
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  connected_by!: Types.ObjectId;

  // false khi: Admin chủ động ngắt kết nối, HOẶC refresh token cũng
  // hết hạn mà không refresh được nữa. Không xóa document khi ngắt
  // kết nối — giữ lại lịch sử phục vụ audiT
  @Prop({ type: Boolean, default: true })
  is_active!: boolean;
}

export const MarketplaceShopSchema = SchemaFactory.createForClass(MarketplaceShop);

/**
 * (a) Unique compound index: 1 shop trên 1 sàn + 1 môi trường chỉ
 *     được kết nối ĐÚNG 1 lần.
 */
MarketplaceShopSchema.index(
  { platform: 1, shop_id: 1, environment: 1 },
  { unique: true },
);

/**
 * (b) PARTIAL INDEX: cron refresh-token chỉ cần quét shop đang
 *     is_active=true — index nhỏ hơn khi dữ liệu lớn dần.
 */
MarketplaceShopSchema.index(
  { access_token_expires_at: 1 },
  { partialFilterExpression: { is_active: true } },
);

// KHÔNG dùng TTL index ở collection này — token hết hạn thì REFRESH
// chứ không XÓA document.
