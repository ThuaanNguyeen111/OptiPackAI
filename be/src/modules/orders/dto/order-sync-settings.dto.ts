import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from '../enums/order-status.enum';
import {
  CONSOLIDATION_KEY_FIELDS,
  OPEN_GROUP_STATUS_CHOICES,
  SYNC_PLATFORMS,
} from '../order-sync-policy';
import type { ConsolidationKeyField, OpenGroupStatus } from '../order-sync-policy';

export class PlatformSyncToggleDto {
  @ApiPropertyOptional({ enum: SYNC_PLATFORMS })
  @IsIn(SYNC_PLATFORMS, { message: 'platform chỉ nhận lazada hoặc aurelle' })
  platform!: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  auto_sync_enabled!: boolean;
}

/**
 * Trường không gửi giữ nguyên giá trị đang hiệu lực. Gửi `expected_version`
 * (version đang xem) để không ghi đè thay đổi của người khác.
 */
export class UpdateOrderSyncSettingsDto {
  @ApiPropertyOptional({ description: 'Version đang xem (null = đang dùng mặc định). Lệch → 409.', nullable: true })
  @IsOptional()
  @IsInt()
  expected_version?: number | null;

  // ---- Đồng bộ
  @ApiPropertyOptional({ type: [PlatformSyncToggleDto], description: 'Bật/tắt TỰ ĐỘNG đồng bộ theo sàn (nút đồng bộ tay vẫn dùng được).' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlatformSyncToggleDto)
  platforms?: PlatformSyncToggleDto[];

  @ApiPropertyOptional({ description: 'Chu kỳ tự đồng bộ mỗi shop (phút)', minimum: 5, maximum: 1440, example: 5 })
  @IsOptional()
  @IsInt()
  @Min(5, { message: 'Chu kỳ tối thiểu 5 phút' })
  @Max(1440, { message: 'Chu kỳ tối đa 1440 phút (1 ngày)' })
  interval_minutes?: number;

  @ApiPropertyOptional({ description: 'Lần đồng bộ ĐẦU TIÊN của shop lấy đơn bao nhiêu ngày về trước', minimum: 1, maximum: 90, example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  first_sync_lookback_days?: number;

  @ApiPropertyOptional({ description: 'Khoảng cách tối thiểu giữa 2 thông báo "đồng bộ thất bại" của cùng 1 shop (phút)', minimum: 5, maximum: 1440, example: 20 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  sync_failed_cooldown_minutes?: number;

  // ---- Gom đơn
  @ApiPropertyOptional({ description: 'Tắt = mỗi đơn một nhóm, không gom.' })
  @IsOptional()
  @IsBoolean()
  consolidation_enabled?: boolean;

  @ApiPropertyOptional({
    enum: CONSOLIDATION_KEY_FIELDS,
    isArray: true,
    description: 'Thông tin người nhận phải TRÙNG để gom đơn (luôn cùng sàn + cùng shop). Bắt buộc có phone hoặc address_line1.',
    example: ['phone', 'address_line1', 'city'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(CONSOLIDATION_KEY_FIELDS, { each: true })
  consolidation_key_fields?: ConsolidationKeyField[];

  @ApiPropertyOptional({ description: 'Chỉ gom với đơn đã vào hệ thống trong vòng N giờ. null = không giới hạn.', nullable: true, minimum: 1, maximum: 720 })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(720)
  consolidation_time_window_hours?: number | null;

  @ApiPropertyOptional({ enum: OPEN_GROUP_STATUS_CHOICES, isArray: true, description: 'Nhóm ở trạng thái nào còn nhận đơn gom đến muộn.' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(OPEN_GROUP_STATUS_CHOICES, { each: true })
  open_group_statuses?: OpenGroupStatus[];

  // ---- Trạng thái đơn
  @ApiPropertyOptional({ enum: OrderStatus, isArray: true, description: 'Trạng thái đơn được xét gom (tập con của unpaid, pending, packed, ready_to_ship, topack, toship).' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(OrderStatus, { each: true })
  consolidatable_statuses?: OrderStatus[];

  @ApiPropertyOptional({ enum: OrderStatus, isArray: true, description: 'Trạng thái đơn coi là hủy/sự cố: loại khỏi lấy hàng, đóng gói, chứng từ. Luôn phải có canceled.' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(19)
  @ArrayUnique()
  @IsEnum(OrderStatus, { each: true })
  not_packable_statuses?: OrderStatus[];

  @ApiPropertyOptional({ description: 'Ghi chú lý do thay đổi (lưu vào lịch sử).' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
