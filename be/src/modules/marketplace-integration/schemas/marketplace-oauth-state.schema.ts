import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { MarketplacePlatform } from '../enums/platform.enum';

export type MarketplaceOauthStateDocument = MarketplaceOauthState & Document;


@Schema({
  collection: 'marketplace_oauth_states',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class MarketplaceOauthState {
  @Prop({ type: String, required: true, unique: true })
  state!: string;

  @Prop({ type: String, required: true })
  admin_user_id!: string;

  @Prop({ type: String, enum: MarketplacePlatform, required: true })
  platform!: MarketplacePlatform;
}

export const MarketplaceOauthStateSchema = SchemaFactory.createForClass(
  MarketplaceOauthState,
);

// TTL 600 giây (10 phút) — MongoDB tự động xóa document sau khi hết hạn,
// đúng tinh thần "state chỉ sống 10 phút, không phải dữ liệu cần bền vững".
MarketplaceOauthStateSchema.index(
  { created_at: 1 },
  { expireAfterSeconds: 600 },
);
