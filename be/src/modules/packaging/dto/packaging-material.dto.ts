import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MATERIAL_TYPES, type MaterialType } from '../engine/types';
import {
  MATERIAL_RULE_BASES,
  MATERIAL_RULE_SCOPES,
} from '../schemas/packaging-material-rules.schema';

export class CreatePackagingMaterialDto {
  @ApiProperty({ example: 'FOAM-CORNER' })
  @IsString({ message: 'code phải là chuỗi' })
  @MinLength(1, { message: 'code không được để trống' })
  code!: string;

  @ApiProperty({ example: 'Góc xốp bảo vệ hộp giày' })
  @IsString({ message: 'name phải là chuỗi' })
  @MinLength(1, { message: 'name không được để trống' })
  name!: string;

  @ApiProperty({ enum: MATERIAL_TYPES, example: 'foam_corner' })
  @IsIn([...MATERIAL_TYPES], { message: 'type không hợp lệ' })
  type!: MaterialType;

  @ApiProperty({ example: 'cái', description: 'Đơn vị đếm' })
  @IsString({ message: 'unit phải là chuỗi' })
  @MinLength(1, { message: 'unit không được để trống' })
  unit!: string;

  @ApiProperty({ example: 8, description: 'Khối lượng 1 đơn vị (g)' })
  @IsInt({ message: 'weight_g_per_unit phải là số nguyên (g)' })
  @Min(0, { message: 'weight_g_per_unit không được âm' })
  weight_g_per_unit!: number;

  @ApiProperty({ example: 500, description: 'Giá 1 đơn vị (VND)' })
  @IsInt({ message: 'price_vnd_per_unit phải là số nguyên' })
  @Min(0, { message: 'price_vnd_per_unit không được âm' })
  price_vnd_per_unit!: number;

  @ApiPropertyOptional({
    example: 20,
    description: 'Còn ≤ mức này thì báo sắp hết (mặc định 20)',
  })
  @IsOptional()
  @IsInt({ message: 'reorder_level phải là số nguyên' })
  @Min(0, { message: 'reorder_level không được âm' })
  reorder_level?: number;

  @ApiPropertyOptional({ example: 'Kệ B-02', nullable: true })
  @IsOptional()
  @IsString({ message: 'storage_location phải là chuỗi' })
  storage_location?: string | null;
}

export class UpdatePackagingMaterialDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'name phải là chuỗi' })
  @MinLength(1, { message: 'name không được để trống' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'unit phải là chuỗi' })
  @MinLength(1, { message: 'unit không được để trống' })
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt({ message: 'weight_g_per_unit phải là số nguyên (g)' })
  @Min(0, { message: 'weight_g_per_unit không được âm' })
  weight_g_per_unit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt({ message: 'price_vnd_per_unit phải là số nguyên' })
  @Min(0, { message: 'price_vnd_per_unit không được âm' })
  price_vnd_per_unit?: number;

  @ApiPropertyOptional({
    description: 'false = ngừng dùng vật tư này (xóa mềm)',
  })
  @IsOptional()
  @IsBoolean({ message: 'is_active phải là true/false' })
  is_active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt({ message: 'reorder_level phải là số nguyên' })
  @Min(0, { message: 'reorder_level không được âm' })
  reorder_level?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString({ message: 'storage_location phải là chuỗi' })
  storage_location?: string | null;
}

/** Nhập thêm vật tư — tồn CHỈ đổi qua route này hoặc lúc pack. */
export class StockInPackagingMaterialDto {
  @ApiProperty({ example: 200, description: 'Số đơn vị nhập thêm' })
  @IsInt({ message: 'quantity phải là số nguyên' })
  @Min(1, { message: 'quantity phải lớn hơn 0' })
  @Max(1000000, { message: 'quantity quá lớn' })
  quantity!: number;

  @ApiPropertyOptional({ example: 'PO-2026-0928' })
  @IsOptional()
  @IsString({ message: 'note phải là chuỗi' })
  note?: string;
}

export class MaterialVoidBandDto {
  @ApiProperty({
    example: 0.5,
    description: 'Độ trống tối thiểu (0..1) để dải này áp dụng',
  })
  @IsNumber({}, { message: 'min_void_ratio phải là số' })
  @Min(0, { message: 'min_void_ratio không được âm' })
  @Max(1, { message: 'min_void_ratio tối đa 1' })
  min_void_ratio!: number;

  @ApiProperty({ example: 2 })
  @IsInt({ message: 'quantity phải là số nguyên' })
  @Min(0, { message: 'quantity không được âm' })
  quantity!: number;
}

export class MaterialRuleDto {
  @ApiProperty({ enum: MATERIAL_TYPES })
  @IsIn([...MATERIAL_TYPES], { message: 'material_type không hợp lệ' })
  material_type!: MaterialType;

  @ApiProperty({ enum: MATERIAL_RULE_SCOPES, description: 'Nhóm món luật xét' })
  @IsIn([...MATERIAL_RULE_SCOPES], { message: 'applies_to không hợp lệ' })
  applies_to!: (typeof MATERIAL_RULE_SCOPES)[number];

  @ApiPropertyOptional({
    example: 1,
    description: 'Luật chỉ áp dụng khi số món thuộc nhóm ≥ giá trị này',
  })
  @IsOptional()
  @IsInt({ message: 'min_units phải là số nguyên' })
  @Min(1, { message: 'min_units tối thiểu 1' })
  min_units?: number;

  @ApiProperty({ enum: MATERIAL_RULE_BASES })
  @IsIn([...MATERIAL_RULE_BASES], { message: 'basis không hợp lệ' })
  basis!: (typeof MATERIAL_RULE_BASES)[number];

  @ApiPropertyOptional({
    example: 4,
    description:
      'Hệ số (per_unit/per_extra_unit) hoặc số lượng cố định (per_carton)',
  })
  @IsOptional()
  @IsInt({ message: 'quantity phải là số nguyên' })
  @Min(0, { message: 'quantity không được âm' })
  quantity?: number;

  @ApiPropertyOptional({
    type: [MaterialVoidBandDto],
    description: 'Chỉ dùng cho basis = void_band',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: 'Tối đa 10 dải' })
  @ValidateNested({ each: true })
  @Type(() => MaterialVoidBandDto)
  void_bands?: MaterialVoidBandDto[];
}

/** Lưu bộ luật mới (tạo version mới, bản cũ tắt). */
export class UpdateMaterialRulesDto {
  @ApiProperty({ type: [MaterialRuleDto] })
  @IsArray()
  @ArrayMaxSize(50, { message: 'Tối đa 50 luật' })
  @ValidateNested({ each: true })
  @Type(() => MaterialRuleDto)
  rules!: MaterialRuleDto[];
}
