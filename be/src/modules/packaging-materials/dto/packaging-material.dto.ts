import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreatePackagingMaterialDto {
  @ApiProperty({ example: 'BOX-M' }) @Matches(/^[A-Z0-9-]{2,20}$/, { message: 'code 2-20 ký tự CHỮ HOA/số/gạch ngang' }) code!: string;
  @ApiProperty({ example: 'Thùng carton Medium 35x25x20' }) @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @ApiProperty({ enum: ['box', 'cushioning'] }) @IsIn(['box', 'cushioning']) kind!: 'box' | 'cushioning';
  @ApiPropertyOptional({ example: 35 }) @IsOptional() @IsNumber() @Min(1) @Max(500) length_cm?: number;
  @ApiPropertyOptional({ example: 25 }) @IsOptional() @IsNumber() @Min(1) @Max(500) width_cm?: number;
  @ApiPropertyOptional({ example: 20 }) @IsOptional() @IsNumber() @Min(1) @Max(500) height_cm?: number;
  @ApiPropertyOptional({ example: 'Bubble Wrap', description: 'Vật liệu đệm: khớp material_type của gợi ý đóng gói' })
  @IsOptional() @IsString() @MaxLength(60) match_material_type?: string;
  @ApiProperty({ example: 6500 }) @IsInt() @Min(0) @Max(10_000_000) unit_cost_vnd!: number;
  @ApiPropertyOptional({ example: true }) @IsOptional() @IsBoolean() reusable?: boolean;
  @ApiPropertyOptional({ example: 3 }) @IsOptional() @IsInt() @Min(1) @Max(20) max_reuse_cycles?: number;
}

/** Không sửa được code/kind/kích thước (đã gắn với gợi ý đóng gói và lịch sử). */
export class UpdatePackagingMaterialDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000_000) unit_cost_vnd?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() reusable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(20) max_reuse_cycles?: number;
}

export class PurchasePackagingDto {
  @ApiProperty({ example: 100 }) @IsInt() @Min(1) @Max(1_000_000) quantity!: number;
  @ApiPropertyOptional({ example: 'Nhập từ NCC Bao Bì Sài Gòn' }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/** Dùng trong form kiểm hàng hoàn (G3) — kiểm luôn thùng/xốp đi kèm. */
export class PackagingInspectionLineDto {
  @ApiProperty({ example: 'BOX-M' }) @IsString() @MaxLength(20) material_code!: string;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) @Max(1000) quantity!: number;
  @ApiProperty({ enum: ['A', 'B', 'C'], description: 'A: giao lại được · B: chỉ dùng nội bộ · C: tái chế/bỏ' }) @IsIn(['A', 'B', 'C']) grade!: 'A' | 'B' | 'C';
  @ApiPropertyOptional({ example: 1, description: 'Số lần đã tái sử dụng ghi trên nắp thùng (R1, R2...). Không ghi = 0' })
  @IsOptional() @IsInt() @Min(0) @Max(50) reuse_cycle_seen?: number;
  @ApiPropertyOptional({ example: true, description: 'BẮT BUỘC true để nhận hạng A — nhãn cũ chứa tên/SĐT/địa chỉ khách trước' })
  @IsOptional() @IsBoolean() old_label_removed?: boolean;
}
