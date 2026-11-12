import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { FEATURE_VALUES, type Feature } from '../../../common/enums/feature.enum';
import { UserRole, USER_ROLE_VALUES } from '../../../common/enums/user-role.enum';

/** 12/11/2026 — Trang được bật cho 1 role (trừ ADMIN). Thiếu bản ghi = dùng DEFAULT_ROLE_FEATURES. */
@Schema({ collection: 'role_permissions', timestamps: true })
export class RolePermission {
  @Prop({ type: Number, enum: USER_ROLE_VALUES, required: true }) role!: UserRole;
  @Prop({ type: [String], enum: FEATURE_VALUES, default: [] }) features!: Feature[];
  @Prop({ type: SchemaTypes.ObjectId, default: null }) updated_by!: Types.ObjectId | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type RolePermissionDocument = HydratedDocument<RolePermission>;
export const RolePermissionSchema = SchemaFactory.createForClass(RolePermission);
RolePermissionSchema.index({ role: 1 }, { unique: true });
