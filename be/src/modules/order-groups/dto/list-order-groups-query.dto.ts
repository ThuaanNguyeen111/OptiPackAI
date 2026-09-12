import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { GroupFulfillmentStatus } from '../enums/group-fulfillment-status.enum';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';

export class ListOrderGroupsQueryDto {
  @ApiPropertyOptional({
    enum: GroupFulfillmentStatus,
    description:
      'Lọc theo trạng thái xử lý nội bộ — VD Warehouse Staff lọc "approved_for_packing" để xem hàng đợi cần lấy.',
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
}
