import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class BoxDimensionsMmDto {
  @ApiProperty({ example: 300 })
  @IsInt({ message: 'length_mm phải là số nguyên (mm)' })
  @Min(1, { message: 'length_mm phải lớn hơn 0' })
  @Max(5000, { message: 'length_mm không vượt quá 5000 mm' })
  length_mm!: number;

  @ApiProperty({ example: 200 })
  @IsInt({ message: 'width_mm phải là số nguyên (mm)' })
  @Min(1, { message: 'width_mm phải lớn hơn 0' })
  @Max(5000, { message: 'width_mm không vượt quá 5000 mm' })
  width_mm!: number;

  @ApiProperty({ example: 100 })
  @IsInt({ message: 'height_mm phải là số nguyên (mm)' })
  @Min(1, { message: 'height_mm phải lớn hơn 0' })
  @Max(5000, { message: 'height_mm không vượt quá 5000 mm' })
  height_mm!: number;
}

export class CreatePackagingBoxDto {
  @ApiProperty({ example: 'CARTON-M' })
  @IsString({ message: 'code phải là chuỗi' })
  @MinLength(1, { message: 'code không được để trống' })
  code!: string;

  @ApiProperty({ example: 'Thùng carton M 3 lớp' })
  @IsString({ message: 'name phải là chuỗi' })
  @MinLength(1, { message: 'name không được để trống' })
  name!: string;

  @ApiProperty({ type: BoxDimensionsMmDto, description: 'Lòng thùng dùng được để xếp (mm)' })
  @ValidateNested()
  @Type(() => BoxDimensionsMmDto)
  inner!: BoxDimensionsMmDto;

  @ApiProperty({ type: BoxDimensionsMmDto, description: 'Kích thước ngoài (mm), phải ≥ lòng thùng' })
  @ValidateNested()
  @Type(() => BoxDimensionsMmDto)
  outer!: BoxDimensionsMmDto;

  @ApiProperty({ example: 150, description: 'Cân bì thùng rỗng (g)' })
  @IsInt({ message: 'tare_g phải là số nguyên (g)' })
  @Min(0, { message: 'tare_g không được âm' })
  tare_g!: number;

  @ApiProperty({ example: 10000, description: 'Tải hàng tối đa (g)' })
  @IsInt({ message: 'max_load_g phải là số nguyên (g)' })
  @Min(1, { message: 'max_load_g phải lớn hơn 0' })
  max_load_g!: number;

  @ApiPropertyOptional({ example: 4500, nullable: true, description: 'Giá thùng (VND)' })
  @IsOptional()
  @IsInt({ message: 'price_vnd phải là số nguyên' })
  @Min(0, { message: 'price_vnd không được âm' })
  price_vnd?: number | null;
}

export class UpdatePackagingBoxDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'name phải là chuỗi' })
  @MinLength(1, { message: 'name không được để trống' })
  name?: string;

  @ApiPropertyOptional({ type: BoxDimensionsMmDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BoxDimensionsMmDto)
  inner?: BoxDimensionsMmDto;

  @ApiPropertyOptional({ type: BoxDimensionsMmDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BoxDimensionsMmDto)
  outer?: BoxDimensionsMmDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt({ message: 'tare_g phải là số nguyên (g)' })
  @Min(0, { message: 'tare_g không được âm' })
  tare_g?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt({ message: 'max_load_g phải là số nguyên (g)' })
  @Min(1, { message: 'max_load_g phải lớn hơn 0' })
  max_load_g?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt({ message: 'price_vnd phải là số nguyên' })
  @Min(0, { message: 'price_vnd không được âm' })
  price_vnd?: number | null;

  @ApiPropertyOptional({ description: 'false = ngừng dùng thùng này (xóa mềm)' })
  @IsOptional()
  @IsBoolean({ message: 'is_active phải là true/false' })
  is_active?: boolean;
}
