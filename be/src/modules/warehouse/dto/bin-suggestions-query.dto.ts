import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** (09/10/2026) category_code bắt buộc — trước đây thiếu vẫn chạy. */
export class BinSuggestionsQueryDto {
  @ApiProperty({ example: 'ATHUN', description: 'Mã danh mục cấp 2.' })
  @IsString({ message: 'category_code phải là chuỗi' })
  @IsNotEmpty({ message: 'category_code là bắt buộc' })
  category_code!: string;

  @ApiPropertyOptional({ example: 'M' })
  @IsOptional()
  @IsString({ message: 'size phải là chuỗi' })
  size?: string;

  @ApiPropertyOptional({ example: 'DEN' })
  @IsOptional()
  @IsString({ message: 'color_code phải là chuỗi' })
  color_code?: string;
}
