import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsHexColor,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CREDIT_TYPES,
  MODEL_KINDS,
  MODEL_SOURCES,
  PRIMITIVE_SHAPES,
  type CreditType,
  type ModelKind,
  type ModelSource,
  type PrimitiveShape,
} from '../schemas/product-model.schema';

export class ModelCreditDto {
  @ApiProperty({ enum: CREDIT_TYPES, description: 'self_made = tự dựng; supplier = nhà cung cấp gửi; external = tải từ nguồn ngoài' })
  @IsIn(CREDIT_TYPES, { message: 'credit.type phải là self_made, supplier hoặc external' })
  type!: CreditType;

  @ApiPropertyOptional({ nullable: true, example: 'https://sketchfab.com/…' })
  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'credit.url phải là đường dẫn http(s)' })
  url?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'CC-BY-4.0' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  license?: string | null;
}

export class PrimitiveParamsDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() corner_radius_pct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() cap_height_pct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() shoulder_pct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() neck_height_pct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() neck_diameter_pct?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() crimp_pct?: number;
}

export class CreatePrimitiveModelDto {
  @ApiProperty({ example: 'Chai tròn cổ ngắn' })
  @IsString()
  @MinLength(2, { message: 'Tên mô hình tối thiểu 2 ký tự' })
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: PRIMITIVE_SHAPES })
  @IsIn(PRIMITIVE_SHAPES, { message: 'shape phải là box, cylinder, bottle hoặc tube' })
  shape!: PrimitiveShape;

  @ApiProperty({ type: PrimitiveParamsDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => PrimitiveParamsDto)
  params?: PrimitiveParamsDto;

  @ApiProperty({ example: '#e2e8f0' })
  @IsHexColor({ message: 'body_color phải là mã màu hex' })
  body_color!: string;

  @ApiPropertyOptional({ nullable: true, example: '#111827' })
  @IsOptional()
  @IsHexColor({ message: 'cap_color phải là mã màu hex' })
  cap_color?: string | null;
}

/** Multipart: `file` + các trường chữ dưới đây (credit gửi dạng chuỗi JSON). */
export class UploadModelDto {
  @ApiProperty({ example: 'Chai serum thuỷ tinh' })
  @IsString()
  @MinLength(2, { message: 'Tên mô hình tối thiểu 2 ký tự' })
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: MODEL_KINDS, description: 'garment = quần áo (file phải có clip gập + túi zip); rigid = hàng cứng' })
  @IsIn(MODEL_KINDS, { message: 'kind phải là garment hoặc rigid' })
  kind!: ModelKind;

  @ApiProperty({ type: ModelCreditDto, description: 'Chuỗi JSON khi gửi multipart' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  })
  @ValidateNested()
  @Type(() => ModelCreditDto)
  credit!: ModelCreditDto;
}

export class UpdateModelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ type: ModelCreditDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ModelCreditDto)
  credit?: ModelCreditDto;

  /** Chỉ với mô hình dựng từ hình cơ bản: đổi thông số → phiên bản mới. */
  @ApiPropertyOptional({ type: PrimitiveParamsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PrimitiveParamsDto)
  params?: PrimitiveParamsDto;

  @ApiPropertyOptional() @IsOptional() @IsHexColor() body_color?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsHexColor() cap_color?: string | null;
}

export class ListModelsQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ enum: MODEL_SOURCES })
  @IsOptional()
  @IsIn(MODEL_SOURCES)
  source?: ModelSource;

  @ApiPropertyOptional({ enum: ['active', 'retired', 'all'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'retired', 'all'])
  status?: 'active' | 'retired' | 'all';

  @ApiPropertyOptional({ description: 'true = chỉ mô hình chưa SKU nào dùng' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  unused?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
