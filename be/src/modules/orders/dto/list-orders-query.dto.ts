import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsMongoId, IsOptional, IsString, Max, Min } from 'class-validator';
import { OrderStatus } from '../enums/order-status.enum';

export class ListOrdersQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo shop_id trên sàn' })
  @IsOptional()
  @IsString()
  shop_id?: string;

  @ApiPropertyOptional({ enum: OrderStatus, description: 'Lọc theo trạng thái đơn' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    description:
      'Lọc lấy tất cả đơn thuộc CÙNG 1 gói hàng đã gộp (giá trị consolidatedGroupId trả về từ GET /orders hoặc GET /orders/:id). Chỉ trả đơn có is_consolidated=true.',
  })
  @IsOptional()
  @IsMongoId()
  consolidated_group_id?: string;

  @ApiPropertyOptional({
    description: 'Cursor phân trang — truyền lại nextCursor của trang trước để lấy trang kế tiếp',
  })
  @IsOptional()
  @IsDateString()
  before?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
