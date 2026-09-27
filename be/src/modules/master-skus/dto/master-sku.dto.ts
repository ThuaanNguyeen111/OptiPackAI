import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';

export class CreateColorDto {
  @ApiProperty({ example: 'DEN' }) @Matches(/^[A-Z]{2,10}$/, { message: 'code 2-10 CHỮ HOA không dấu' }) code!: string;
  @ApiProperty({ example: 'Đen' }) @IsString() @MinLength(1) @MaxLength(40) name!: string;
  @ApiPropertyOptional({ example: '#000000' }) @IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/) hex?: string;
}
export class UpdateColorDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(40) name?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/) hex?: string;
}

class SkuAttrs {
  @ApiPropertyOptional({ example: 'Áo thun basic đen size M' }) @IsOptional() @IsString() @MinLength(2) @MaxLength(150) name?: string;
  @ApiPropertyOptional({ enum: ['nam', 'nu', 'unisex'] }) @IsOptional() @IsIn(['nam', 'nu', 'unisex']) gender?: 'nam' | 'nu' | 'unisex';
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.1) @Max(500) length_cm?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.1) @Max(500) width_cm?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.1) @Max(500) height_cm?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.001) @Max(200) weight_kg?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_fragile?: boolean;
}

export class CreateMasterSkuDto extends SkuAttrs {
  @ApiProperty({ example: 'ATHUN', description: 'Danh mục CẤP 2' }) @Matches(/^[A-Z0-9]{2,12}$/) category_code!: string;
  @ApiProperty({ example: 5, description: 'Số mẫu 1..999 -> ghép thành 005' }) @IsInt() @Min(1) @Max(999) model_no!: number;
  @ApiProperty({ example: 'DEN' }) @Matches(/^[A-Z]{2,10}$/) color_code!: string;
  @ApiProperty({ example: 'M', description: 'Phải thuộc thang size của danh mục' }) @Matches(/^[A-Z0-9.]{1,6}$/) size!: string;
  @ApiProperty({ example: 'Áo thun basic đen size M' }) @IsString() @MinLength(2) @MaxLength(150) declare name: string;
}

/** Chỉ sửa được thuộc tính mô tả. Mã + danh mục/mẫu/màu/size KHÓA — sai thì dùng "Thay thế SKU". */
export class UpdateMasterSkuDto extends SkuAttrs {}

/** Thay thế: tạo SKU mới (đổi 1 hoặc nhiều thành phần), chuyển liên kết sàn, khóa SKU cũ. */
export class ReplaceMasterSkuDto {
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z0-9]{2,12}$/) category_code?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(999) model_no?: number;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{2,10}$/) color_code?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z0-9.]{1,6}$/) size?: string;
  @ApiProperty({ example: 'Đặt nhầm màu' }) @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

export class CreateMappingDto {
  @ApiProperty({ enum: MarketplacePlatform }) @IsEnum(MarketplacePlatform) platform!: MarketplacePlatform;
  @ApiProperty({ example: '201171264532' }) @IsString() @MaxLength(60) shop_id!: string;
  @ApiProperty({ example: 'ATD-M-01', description: 'Chọn từ danh sách SKU sàn đã đồng bộ (GET /master-skus/unmapped-seller-skus)' })
  @IsString() @MinLength(1) @MaxLength(100) seller_sku!: string;
}
