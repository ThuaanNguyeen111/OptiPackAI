import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsISO8601, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { GroupFulfillmentStatus } from '../enums/group-fulfillment-status.enum';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';

export class ListOrderGroupsQueryDto {
  @ApiPropertyOptional({
    enum: GroupFulfillmentStatus,
    description:
      'Lọc theo trạng thái xử lý nội bộ — VD Warehouse Staff lọc "picking" để xem hàng đợi cần lấy, Packaging Staff lọc "pending_approval".',
  })
  @IsOptional()
  @IsEnum(GroupFulfillmentStatus)
  fulfillment_status?: GroupFulfillmentStatus;

  @ApiPropertyOptional({ enum: MarketplacePlatform, description: 'Lọc theo sàn' })
  @IsOptional()
  @IsEnum(MarketplacePlatform)
  platform?: MarketplacePlatform;

  @ApiPropertyOptional({
    enum: ['normal', 'express'],
    description: 'Lọc theo loại đơn — VD Store Owner xem riêng danh sách đơn Hỏa Tốc cần ưu tiên.',
  })
  @IsOptional()
  @IsIn(['normal', 'express'])
  order_priority?: 'normal' | 'express';

  @ApiPropertyOptional({ description: '(09/10/2026) Nhóm giao cho 1 nhân viên lấy hàng — "việc của tôi".' })
  @IsOptional()
  @IsMongoId({ message: 'assigned_staff_id phải là ObjectId hợp lệ' })
  assigned_staff_id?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], description: '(09/10/2026) true = chỉ nhóm đang thiếu hàng (K5).' })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'stock_shortage chỉ nhận true/false' })
  stock_shortage?: 'true' | 'false';

  @ApiPropertyOptional({ enum: ['true', 'false'], description: '(09/10/2026) true = chỉ đơn hỏa tốc đã quá hạn.' })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'is_overdue chỉ nhận true/false' })
  is_overdue?: 'true' | 'false';

  @ApiPropertyOptional({
    description: '(09/10/2026) Con trỏ trang kế: createdAt (ISO) của dòng CUỐI trang trước. Danh sách luôn mới nhất trước.',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'before phải là thời điểm ISO' })
  before?: string;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit phải ≥ 1' })
  @Max(200, { message: 'limit tối đa 200' })
  limit?: number;
}
