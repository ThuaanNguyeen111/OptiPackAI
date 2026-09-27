import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested,
} from 'class-validator';
import { LAYOUT_LIMITS, SIDE_VALUES } from '../warehouse-layout';

export class RackTierDto {
  @ApiProperty({ example: 1, description: 'Số tầng, 1 = sát sàn' })
  @IsInt() @Min(1) @Max(LAYOUT_LIMITS.MAX_TIER)
  tier!: number;

  @ApiProperty({ example: 'L', description: 'Size của tầng — phải thuộc thang size của danh mục' })
  @IsString()
  size!: string;
}

/**
 * K2 — tạo 1 KỆ (1 bên của dãy, 1 số kệ) cùng toàn bộ ô bên trong, trong 1 lần gọi.
 * Số ô sinh ra = số tầng × cells_per_tier (tối đa 9 × 9 = 81) — thay cho
 * endpoint generate cũ không giới hạn khoảng (lỡ tay có thể sinh hàng nghìn kệ).
 */
export class CreateRackDto {
  @ApiProperty({ example: 'D1' })
  @Matches(/^D([1-9][0-9]?)$/, { message: 'aisle phải dạng D1..D99' })
  aisle!: string;

  @ApiProperty({ example: 'P', enum: SIDE_VALUES })
  @IsIn(SIDE_VALUES)
  side!: 'T' | 'P';

  @ApiProperty({ example: 2, description: 'Số thứ tự kệ ở bên đó của dãy' })
  @IsInt() @Min(1) @Max(LAYOUT_LIMITS.MAX_BAY)
  bay!: number;

  @ApiProperty({ example: 'ATHUN', description: 'Danh mục CẤP 2 của kệ' })
  @Matches(/^[A-Z0-9]{2,12}$/)
  category_code!: string;

  @ApiProperty({ type: [RackTierDto], description: 'Mỗi tầng 1 size. Khuyến nghị: size bán chạy ở tầng 2-3 (tầm tay).' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(LAYOUT_LIMITS.MAX_TIER)
  @ValidateNested({ each: true }) @Type(() => RackTierDto)
  tiers!: RackTierDto[];

  @ApiProperty({ example: 3, description: 'Số ô (thùng) mỗi tầng' })
  @IsInt() @Min(1) @Max(LAYOUT_LIMITS.MAX_CELL)
  cells_per_tier!: number;

  @ApiPropertyOptional({ example: ['DEN', 'TRANG', 'VANG'], description: 'Màu theo thứ tự ô 1..n, áp cho mọi tầng. Độ dài = cells_per_tier.' })
  @IsOptional() @IsArray() @ArrayMaxSize(LAYOUT_LIMITS.MAX_CELL)
  @Matches(/^[A-Z0-9]{2,10}$/, { each: true })
  cell_colors?: string[];

  @ApiPropertyOptional({ example: 30, description: 'Sức chứa mỗi ô (đơn vị sản phẩm). Bỏ trống = không giới hạn.' })
  @IsOptional() @IsInt() @Min(1) @Max(100000)
  capacity_per_cell?: number;
}
