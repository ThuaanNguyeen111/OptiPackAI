import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreatePackagingBagDto {
  @ApiProperty({ example: 'ZIP-M' })
  @IsString({ message: 'code phải là chuỗi' })
  @MinLength(1, { message: 'code không được để trống' })
  code!: string;

  @ApiProperty({ example: 'Túi zip M 35×45 cm' })
  @IsString({ message: 'name phải là chuỗi' })
  @MinLength(1, { message: 'name không được để trống' })
  name!: string;

  @ApiProperty({ example: 350, description: 'Chiều rộng túi trải phẳng (mm)' })
  @IsInt({ message: 'width_mm phải là số nguyên (mm)' })
  @Min(1, { message: 'width_mm phải lớn hơn 0' })
  @Max(2000, { message: 'width_mm không vượt quá 2000 mm' })
  width_mm!: number;

  @ApiProperty({ example: 450, description: 'Chiều dài túi trải phẳng (mm)' })
  @IsInt({ message: 'length_mm phải là số nguyên (mm)' })
  @Min(1, { message: 'length_mm phải lớn hơn 0' })
  @Max(2000, { message: 'length_mm không vượt quá 2000 mm' })
  length_mm!: number;

  @ApiPropertyOptional({ example: 800, nullable: true, description: 'Giá túi (VND)' })
  @IsOptional()
  @IsInt({ message: 'price_vnd phải là số nguyên' })
  @Min(0, { message: 'price_vnd không được âm' })
  price_vnd?: number | null;
}

export class UpdatePackagingBagDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'name phải là chuỗi' })
  @MinLength(1, { message: 'name không được để trống' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt({ message: 'width_mm phải là số nguyên (mm)' })
  @Min(1, { message: 'width_mm phải lớn hơn 0' })
  @Max(2000, { message: 'width_mm không vượt quá 2000 mm' })
  width_mm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt({ message: 'length_mm phải là số nguyên (mm)' })
  @Min(1, { message: 'length_mm phải lớn hơn 0' })
  @Max(2000, { message: 'length_mm không vượt quá 2000 mm' })
  length_mm?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt({ message: 'price_vnd phải là số nguyên' })
  @Min(0, { message: 'price_vnd không được âm' })
  price_vnd?: number | null;

  @ApiPropertyOptional({ description: 'false = ngừng dùng túi này (xóa mềm)' })
  @IsOptional()
  @IsBoolean({ message: 'is_active phải là true/false' })
  is_active?: boolean;
}
