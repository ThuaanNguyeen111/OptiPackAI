import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
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

  @ApiPropertyOptional({
    description:
      '(16/11/2026) Tìm đơn: mã đơn sàn / số đơn (khớp từ đầu) hoặc tên người nhận (chứa chuỗi), không phân biệt hoa thường. Dùng chung được với before/limit.',
  })
  @IsOptional()
  @IsString({ message: 'q phải là chuỗi' })
  @MaxLength(64, { message: 'q tối đa 64 ký tự' })
  q?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
