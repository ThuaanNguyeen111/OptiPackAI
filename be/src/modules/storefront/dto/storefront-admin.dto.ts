import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt,
  IsMongoId, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested,
} from 'class-validator';

export class AdminVariantDto {
  @IsOptional() @IsMongoId() id?: string;
  @IsOptional() @IsString() @MaxLength(100) color?: string | null;
  @IsOptional() @IsString() @MaxLength(100) size?: string | null;
  /** 22/10/2026 — mã màu trong danh mục màu OptiPack (VD DEN). Bắt buộc với biến thể MỚI. */
  @IsOptional() @Matches(/^[A-Z]{2,10}$/, { message: 'colorCode là mã màu OptiPack 2-10 chữ hoa' }) colorCode?: string;
  @IsInt() @Min(0) price!: number;
  @IsInt() @Min(0) quantityOnHand!: number;
  /** 22/10/2026 — kích thước/khối lượng kiện (OptiPack kéo về làm số đo tham khảo). null = xoá. */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) @Max(1000) weightKg?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(500) lengthCm?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(500) widthCm?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(500) heightCm?: number | null;
}

/** 22/10/2026 — danh mục hiển thị của website; nối danh mục cấp 2 OptiPack để SKU không lệch. */
export class SaveAdminCategoryDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsMongoId() parentId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(9999) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @ValidateIf((_o, v) => v !== null)
  @Matches(/^[A-Z0-9]{2,12}$/, { message: 'skuCategoryCode là mã danh mục cấp 2 OptiPack' }) skuCategoryCode?: string | null;
}

export class SaveAdminProductDto {
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(10000) description!: string;
  @IsOptional() @IsMongoId() categoryId?: string | null;
  @IsString() @MaxLength(2048) thumbnailUrl!: string;
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(2048, { each: true })
  galleryImages!: string[];
  @IsIn(['draft', 'active', 'hidden']) status!: 'draft' | 'active' | 'hidden';
  @IsBoolean() isFeatured!: boolean;
  /** 22/10/2026 — danh mục CẤP 2 của OptiPack (VD ATHUN) — phần đầu SKU. Bắt buộc khi có biến thể mới. */
  @IsOptional() @Matches(/^[A-Z0-9]{2,12}$/, { message: 'skuCategoryCode là mã danh mục cấp 2 OptiPack' }) skuCategoryCode?: string;
  /** 22/10/2026 — số mẫu 1..999 (ghép thành 3 số, VD 005). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(999) skuModelNo?: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => AdminVariantDto)
  variants!: AdminVariantDto[];
}
