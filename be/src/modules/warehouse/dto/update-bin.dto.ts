import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';

/**
 * K2 — sửa 1 ô: sức chứa + thuộc tính đăng ký (danh mục/size/màu).
 * bin_code và vị trí vật lý KHÔNG sửa được (đã in nhãn).
 * Gửi `capacity: null` để bỏ giới hạn sức chứa.
 */
export class UpdateBinDto {
  @ApiPropertyOptional({ example: 40, nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(100000)
  capacity?: number | null;

  @ApiPropertyOptional({ example: 'ATHUN' })
  @IsOptional() @Matches(/^[A-Z0-9]{2,12}$/)
  designated_category_code?: string;

  @ApiPropertyOptional({ example: 'M' })
  @IsOptional() @IsString()
  designated_size?: string;

  @ApiPropertyOptional({ example: 'DEN', nullable: true })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(/^[A-Z0-9]{2,10}$/)
  designated_color_code?: string | null;
}
