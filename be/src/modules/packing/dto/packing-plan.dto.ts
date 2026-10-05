import { ApiProperty } from '@nestjs/swagger';
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
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Lý do chỉnh tay kế hoạch (giữ đúng bộ lý do đã dùng từ UC-04). */
export const ADJUSTMENT_REASONS = [
  'PRODUCT_MORE_FRAGILE_THAN_EXPECTED',
  'RECOMMENDED_BOX_NOT_IN_STOCK',
  'OTHER',
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export class VersionedDto {
  @ApiProperty({ example: 3, description: 'Giá trị `version` của kế hoạch lúc người dùng xem (khóa lạc quan).' })
  @IsInt({ message: 'expected_version phải là số nguyên' })
  @Min(1, { message: 'expected_version phải ≥ 1' })
  expected_version!: number;
}

export class RecomputePlanDto {
  @ApiProperty({
    required: false,
    description: 'Bắt buộc khi nhóm đang có kế hoạch — `version` của kế hoạch hiện tại.',
  })
  @IsOptional()
  @IsInt({ message: 'expected_version phải là số nguyên' })
  @Min(1, { message: 'expected_version phải ≥ 1' })
  expected_version?: number;

  @ApiProperty({ required: false, type: [String], example: ['SAMPLE-L'], description: 'Không dùng các thùng này.' })
  @IsOptional()
  @IsArray({ message: 'exclude_box_codes phải là mảng' })
  @IsString({ each: true, message: 'Mỗi mã thùng phải là chuỗi' })
  exclude_box_codes?: string[];

  @ApiProperty({ required: false, enum: ['fewest_parcels', 'cheapest'] })
  @IsOptional()
  @IsIn(['fewest_parcels', 'cheapest'], { message: 'prefer chỉ nhận fewest_parcels hoặc cheapest' })
  prefer?: 'fewest_parcels' | 'cheapest';
}

export class ApprovePlanDto extends VersionedDto {
  @ApiProperty({
    required: false,
    description: 'Bắt buộc khi có đơn vượt số kiện tối đa (packing_settings.max_parcels_per_order).',
  })
  @IsOptional()
  @IsString({ message: 'override_reason phải là chuỗi' })
  @MinLength(3, { message: 'override_reason tối thiểu 3 ký tự' })
  @MaxLength(500, { message: 'override_reason tối đa 500 ký tự' })
  override_reason?: string;
}

export class ChangeBoxDto extends VersionedDto {
  @ApiProperty({ example: 'SAMPLE-L', description: 'Mã thùng trong danh mục (đang dùng).' })
  @IsString({ message: 'box_code phải là chuỗi' })
  @MinLength(1, { message: 'box_code không được trống' })
  box_code!: string;

  @ApiProperty({ enum: ADJUSTMENT_REASONS })
  @IsIn(ADJUSTMENT_REASONS, { message: 'reason không hợp lệ' })
  reason!: AdjustmentReason;

  @ApiProperty({ required: false, description: 'Bắt buộc khi reason = OTHER.' })
  @IsOptional()
  @IsString({ message: 'note phải là chuỗi' })
  @MaxLength(500, { message: 'note tối đa 500 ký tự' })
  note?: string;
}

export class MoveItemDto extends VersionedDto {
  @ApiProperty({ example: 'TEE#2', description: 'Món cần chuyển (item_key).' })
  @IsString({ message: 'item_key phải là chuỗi' })
  @MinLength(1, { message: 'item_key không được trống' })
  item_key!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Kiện đích (cùng đơn). Bỏ trống/null = tách ra kiện MỚI (hệ thống chọn thùng).',
  })
  @IsOptional()
  @IsInt({ message: 'to_parcel_no phải là số nguyên' })
  @Min(1, { message: 'to_parcel_no phải ≥ 1' })
  to_parcel_no?: number | null;

  @ApiProperty({ enum: ADJUSTMENT_REASONS })
  @IsIn(ADJUSTMENT_REASONS, { message: 'reason không hợp lệ' })
  reason!: AdjustmentReason;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString({ message: 'note phải là chuỗi' })
  @MaxLength(500, { message: 'note tối đa 500 ký tự' })
  note?: string;
}

export class RejectPlanDto extends VersionedDto {
  @ApiProperty({ example: 'Hàng cần đóng thùng gỗ, xử lý ngoài hệ thống', minLength: 3, maxLength: 500 })
  @IsString({ message: 'reason phải là chuỗi' })
  @MinLength(3, { message: 'reason tối thiểu 3 ký tự' })
  @MaxLength(500, { message: 'reason tối đa 500 ký tự' })
  reason!: string;
}

export class GuideDto {
  @ApiProperty({ required: false, description: 'true = viết lại hướng dẫn dù đã có.' })
  @IsOptional()
  @IsBoolean({ message: 'regenerate phải là true/false' })
  regenerate?: boolean;
}

export class ParcelWeightDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'parcel_no phải là số nguyên' })
  @Min(1, { message: 'parcel_no phải ≥ 1' })
  parcel_no!: number;

  @ApiProperty({ example: 0.45, description: 'Cân THẬT của kiện sau khi đóng (kg).' })
  @IsNumber({}, { message: 'weight_kg phải là số' })
  @Min(0.001, { message: 'weight_kg phải lớn hơn 0' })
  @Max(100, { message: 'weight_kg không vượt quá 100 kg' })
  weight_kg!: number;
}

export class PackPlanDto extends VersionedDto {
  @ApiProperty({ type: [ParcelWeightDto], description: 'Cân cho ĐỦ mọi kiện, mỗi kiện đúng 1 lần.' })
  @IsArray({ message: 'parcels phải là mảng' })
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 kiện' })
  @ValidateNested({ each: true })
  @Type(() => ParcelWeightDto)
  parcels!: ParcelWeightDto[];
}
