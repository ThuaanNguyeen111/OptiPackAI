import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import {
  CONFIGURABLE_ROLES,
  type ConfigurableRole,
  DEFAULT_ROLE_FEATURES,
  type Feature,
  FEATURE_VALUES,
  isConfigurableRole,
} from '../../common/enums/feature.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { recordActivity } from '../activity-log/activity-log.util';
import { ActivityLog, type ActivityLogDocument } from '../activity-log/schemas/activity-log.schema';
import { RolePermission, type RolePermissionDocument } from './schemas/role-permission.schema';

export type RoleFeatureMatrix = Record<ConfigurableRole, Feature[]>;

// shortcut: cache riêng từng pod, pod khác thấy thay đổi chậm tối đa 30s; cần tức thì thì chuyển sang Redis pub/sub.
const CACHE_TTL_MS = 30_000;

@Injectable()
export class RolePermissionsService {
  private cache: { matrix: RoleFeatureMatrix; expiresAt: number } | null = null;

  constructor(
    @InjectModel(RolePermission.name) private readonly model: Model<RolePermissionDocument>,
    @InjectModel(ActivityLog.name) private readonly activityModel: Model<ActivityLogDocument>,
  ) {}

  async getMatrix(): Promise<RoleFeatureMatrix> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.matrix;
    const rows = await this.model.find().select({ role: 1, features: 1 }).lean();
    const matrix = Object.fromEntries(
      CONFIGURABLE_ROLES.map((r) => [r, [...DEFAULT_ROLE_FEATURES[r]]]),
    ) as RoleFeatureMatrix;
    for (const row of rows) {
      if (isConfigurableRole(row.role)) matrix[row.role] = row.features;
    }
    this.cache = { matrix, expiresAt: Date.now() + CACHE_TTL_MS };
    return matrix;
  }

  async getFeatures(role: UserRole): Promise<Feature[]> {
    if (!isConfigurableRole(role)) return [...FEATURE_VALUES];
    return (await this.getMatrix())[role];
  }

  async setFeatures(role: UserRole, features: Feature[], actorId: string): Promise<RoleFeatureMatrix> {
    if (!isConfigurableRole(role)) {
      throw new AppException('AUTH_FORBIDDEN', 'Quyền của Admin luôn đầy đủ, không chỉnh được', HttpStatus.FORBIDDEN);
    }
    const unique = FEATURE_VALUES.filter((f) => features.includes(f));
    await this.model.updateOne(
      { role },
      { $set: { features: unique, updated_by: new Types.ObjectId(actorId) } },
      { upsert: true },
    );
    this.cache = null;
    await recordActivity(this.activityModel, {
      category: 'auth',
      action: 'role_permissions.updated',
      summary: `Cập nhật quyền trang cho vai trò ${UserRole[role]}: ${unique.join(', ') || '(không trang nào)'}`,
      actorId,
      entityType: 'role_permission',
      entityCode: UserRole[role],
    });
    return this.getMatrix();
  }
}
