import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** K2 — sửa tên + thang size. `code`, `parent_code` KHÔNG sửa được (gửi lên -> 400). */
export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Áo thun cổ tròn' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], description: 'Chỉ cấp 2. Bỏ size đang được kệ nào dùng -> 409.' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Matches(/^[A-Z0-9.]{1,6}$/, { each: true })
  size_scale?: string[];
}
