import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsMongoId, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/** 23/10/2026 — bộ lọc trang lịch sử. Mọi field tuỳ chọn. */
export class HistoryQueryDto {
  @ApiPropertyOptional({ description: 'Một hoặc nhiều loại, cách nhau dấu phẩy: orders,picking,packing,shipping,returns,warehouse,packaging_materials,auth', example: 'packing,shipping' })
  @IsOptional() @Matches(/^[a-z_]+(,[a-z_]+)*$/) category?: string;

  @ApiPropertyOptional({ description: 'Từ thời điểm (ISO 8601). Mặc định: 30 ngày trước `to`/`before`.' })
  @IsOptional() @IsISO8601() from?: string;

  @ApiPropertyOptional({ description: 'Đến thời điểm (ISO 8601, không tính). Mặc định: bây giờ.' })
  @IsOptional() @IsISO8601() to?: string;

  @ApiPropertyOptional({ description: 'Con trỏ trang sau: lấy `nextBefore` của trang trước.' })
  @IsOptional() @IsISO8601() before?: string;

  @ApiPropertyOptional({ example: 50, description: '1–100, mặc định 50' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;

  @ApiPropertyOptional({ description: 'Chỉ thao tác của 1 người (id người dùng)' })
  @IsOptional() @IsMongoId() actor_id?: string;

  @ApiPropertyOptional({ description: 'true = chỉ thao tác của chính tôi' })
  @IsOptional() @IsIn(['true', 'false']) mine?: string;

  @ApiPropertyOptional({ description: 'Mã SKU (SKU sàn hoặc SKU nội bộ, không phân biệt hoa thường)' })
  @IsOptional() @IsString() @MaxLength(100) sku?: string;

  @ApiPropertyOptional({ description: 'Id nhóm đơn' })
  @IsOptional() @IsMongoId() order_group_id?: string;

  @ApiPropertyOptional({ description: 'Mã đơn trên sàn (Lazada/AURELLE) → tra ra nhóm đơn' })
  @IsOptional() @IsString() @MaxLength(60) order_code?: string;
}
