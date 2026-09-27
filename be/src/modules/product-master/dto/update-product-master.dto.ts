import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * K1 (26/09/2026) — Admin sửa tay dữ liệu đóng gói khi Lazada trả sai/thiếu.
 * Gửi field nào sửa field đó. Sau khi sửa, cron đồng bộ KHÔNG ghi đè nữa
 * (manual_override = true). platform/shop_id/seller_sku KHÔNG sửa được.
 */
export class UpdateProductMasterDto {
  @ApiPropertyOptional({ example: 25 }) @IsOptional() @IsNumber() @Min(0.1) @Max(500)
  package_length_cm?: number;

  @ApiPropertyOptional({ example: 20 }) @IsOptional() @IsNumber() @Min(0.1) @Max(500)
  package_width_cm?: number;

  @ApiPropertyOptional({ example: 3 }) @IsOptional() @IsNumber() @Min(0.1) @Max(500)
  package_height_cm?: number;

  @ApiPropertyOptional({ example: 0.35 }) @IsOptional() @IsNumber() @Min(0.001) @Max(200)
  package_weight_kg?: number;

  @ApiPropertyOptional({ example: true }) @IsOptional() @IsBoolean()
  is_fragile?: boolean;
}
