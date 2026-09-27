import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'ATHUN', description: '2-12 ký tự CHỮ HOA/SỐ, không dấu. KHÓA sau khi tạo.' })
  @Matches(/^[A-Z0-9]{2,12}$/, { message: 'code chỉ gồm 2-12 ký tự chữ hoa A-Z hoặc số 0-9' })
  code!: string;

  @ApiProperty({ example: 'Áo thun' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'AO', description: 'Bỏ trống = danh mục cấp 1. Có = cấp 2 (cha phải là cấp 1 đang hoạt động).' })
  @IsOptional()
  @Matches(/^[A-Z0-9]{2,12}$/)
  parent_code?: string;

  @ApiPropertyOptional({ example: ['S', 'M', 'L', 'XL'], description: 'BẮT BUỘC với cấp 2, KHÔNG được có với cấp 1.' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Matches(/^[A-Z0-9.]{1,6}$/, { each: true, message: 'mỗi size 1-6 ký tự chữ hoa/số/dấu chấm (VD S, XL, 38, 36.5)' })
  size_scale?: string[];
}
