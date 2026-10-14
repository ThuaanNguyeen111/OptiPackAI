import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RateBandDto {
  @ApiProperty({
    example: 500,
    description: 'Áp dụng cho khối lượng tính cước ≤ giá trị này (g)',
  })
  @IsInt()
  @Min(1)
  up_to_g!: number;

  @ApiProperty({ example: 22000 })
  @IsNumber()
  @Min(0)
  price_vnd!: number;
}

export class CarrierServiceDto {
  @ApiProperty({ example: 'STANDARD' })
  @Matches(/^[A-Z0-9_-]{2,30}$/, {
    message: 'code chỉ gồm A-Z, 0-9, _ và -, dài 2-30 ký tự',
  })
  code!: string;

  @ApiProperty({ example: 'Giao tiêu chuẩn' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  @Max(60)
  eta_min_days!: number;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(0)
  @Max(60)
  eta_max_days!: number;

  @ApiProperty({ type: [RateBandDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 bậc cước' })
  @ValidateNested({ each: true })
  @Type(() => RateBandDto)
  bands!: RateBandDto[];

  @ApiProperty({
    required: false,
    example: 5000,
    description: 'Vượt bậc cuối: cộng mỗi 500 g (làm tròn lên)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  extra_price_vnd_per_500g?: number;
}

export class CreateCarrierDto {
  @ApiProperty({ example: 'SAMPLE-EXPRESS' })
  @Matches(/^[A-Z0-9_-]{2,30}$/, {
    message: 'code chỉ gồm A-Z, 0-9, _ và -, dài 2-30 ký tự',
  })
  code!: string;

  @ApiProperty({ example: 'Hãng mẫu Nhanh' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({
    required: false,
    example: 5000,
    description: 'Hệ số quy đổi thể tích (cm³/kg)',
  })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(20000)
  volumetric_divisor?: number;

  @ApiProperty({ type: [CarrierServiceDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 dịch vụ' })
  @ValidateNested({ each: true })
  @Type(() => CarrierServiceDto)
  services!: CarrierServiceDto[];

  @ApiProperty({
    required: false,
    description: 'true = số cước mẫu tự đặt, chưa phải cước thật',
  })
  @IsOptional()
  @IsBoolean()
  is_sample?: boolean;
}

/** Sửa hãng: không đổi mã (mã đã được vận đơn tham chiếu). */
export class UpdateCarrierDto extends PartialType(CreateCarrierDto) {
  @ApiProperty({ required: false, description: 'false = ngừng dùng hãng này' })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateShippingSettingsDto {
  @ApiProperty({ enum: ['cheapest', 'fastest', 'fixed'] })
  @IsIn(['cheapest', 'fastest', 'fixed'], {
    message: 'strategy phải là cheapest, fastest hoặc fixed',
  })
  strategy!: 'cheapest' | 'fastest' | 'fixed';

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  default_carrier_code?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  default_service_code?: string | null;
}

/**
 * C4 (14/10/2026) — địa chỉ gửi hãng do Coordinator sửa/bổ sung (đơn Lazada bị che tên,
 * SĐT, số nhà, tỉnh). Dùng ở báo giá (query) và khi tạo vận đơn (body `to_location`).
 * Bỏ trống field nào = lấy từ đơn (thiếu nữa thì lấy giá trị demo trong .env).
 */
export class ToLocationDto {
  @ApiProperty({ required: false, example: '', description: 'Số nhà + đường. Gửi chuỗi rỗng "" = cố ý bỏ số nhà (GHN vẫn nhận nếu có phường + tỉnh)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string;

  @ApiProperty({ required: false, example: 'Phường Long Bình' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ward_name?: string;

  @ApiProperty({ required: false, example: 'Hồ Chí Minh' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province_name?: string;

  @ApiProperty({ required: false, example: '0377168254', description: 'SĐT người nhận thay cho SĐT bị che (môi trường demo)' })
  @IsOptional()
  @Matches(/^0\d{9,10}$/, { message: 'phone phải là SĐT Việt Nam 10–11 số, bắt đầu bằng 0' })
  phone?: string;
}

/** C4 — query của GET /shipping/quote/:groupId (địa chỉ gửi hãng, chỉ ảnh hưởng hãng API). */
export class QuoteQueryDto extends ToLocationDto {}

/** C6 (14/10/2026) — query của GET /shipping/packaging-options/:groupId. */
export class PackagingOptionsQueryDto extends ToLocationDto {
  @ApiProperty({ example: 'GHN', description: 'Mã hãng (GET /shipping/carriers)' })
  @Matches(/^[A-Z0-9_-]{2,30}$/, { message: 'carrier_code không hợp lệ' })
  carrier_code!: string;

  @ApiProperty({ example: 'LIGHT', description: 'Mã dịch vụ của hãng' })
  @Matches(/^[A-Z0-9_-]{2,30}$/, { message: 'service_code không hợp lệ' })
  service_code!: string;
}
