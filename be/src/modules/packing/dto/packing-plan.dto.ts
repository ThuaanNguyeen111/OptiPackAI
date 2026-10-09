import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Lý do làm KHÁC gợi ý (chỉnh tay, từ chối). Mỗi mã ứng với một việc Admin
 * sửa được ở dữ liệu đầu vào — xem báo cáo feedback (packing-feedback.service).
 */
export const ADJUSTMENT_REASONS = [
  'PRODUCT_MORE_FRAGILE_THAN_EXPECTED',
  'RECOMMENDED_BOX_NOT_IN_STOCK',
  'ITEM_DIMENSION_WRONG',
  'ITEM_WEIGHT_WRONG',
  'BOX_TOO_TIGHT',
  'BOX_TOO_LOOSE',
  'BOX_SPEC_WRONG',
  'TOO_MANY_PARCELS',
  'ITEM_DAMAGED',
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

export const OLD_BOX_OUTCOMES = ['unused', 'damaged'] as const;
export type OldBoxOutcome = (typeof OLD_BOX_OUTCOMES)[number];

/** Đổi thùng khi ĐANG đóng (kế hoạch đã duyệt/đang đóng, kiện chưa niêm phong). */
export class ChangeBoxInSessionDto extends ChangeBoxDto {
  @ApiProperty({
    enum: OLD_BOX_OUTCOMES,
    description: 'Thùng cũ: unused = chưa dùng, trả lại kệ (không trừ); damaged = đã hỏng/rách → trừ tồn + ghi hao hụt.',
  })
  @IsIn(OLD_BOX_OUTCOMES, { message: 'old_box_outcome chỉ nhận unused hoặc damaged' })
  old_box_outcome!: OldBoxOutcome;
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

/** Lý do từ chối = bộ lý do chỉnh tay + 2 lý do chỉ có ở từ chối. */
export const REJECT_REASONS = [...ADJUSTMENT_REASONS, 'SPECIAL_PACKING_NEEDED', 'PLAN_UNREALISTIC'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export class RejectPlanDto extends VersionedDto {
  @ApiProperty({ enum: REJECT_REASONS, description: 'Mã lý do (thay cho chữ tự do trước 08/10/2026).' })
  @IsIn(REJECT_REASONS, { message: 'reason không hợp lệ' })
  reason!: RejectReason;

  @ApiProperty({ required: false, minLength: 3, maxLength: 500, description: 'Bắt buộc khi reason = OTHER.' })
  @IsOptional()
  @IsString({ message: 'note phải là chuỗi' })
  @MaxLength(500, { message: 'note tối đa 500 ký tự' })
  note?: string;

  @ApiProperty({
    required: false,
    description: 'Người chịu trách nhiệm xử lý. Bỏ trống = báo Admin + Store Owner, ai nhận thì giao lại sau.',
  })
  @IsOptional()
  @IsMongoId({ message: 'owner_id phải là ObjectId hợp lệ' })
  owner_id?: string;
}

export class ManualParcelDto {
  @ApiProperty({ description: 'Đơn của kiện (phải thuộc kế hoạch).' })
  @IsMongoId({ message: 'order_id phải là ObjectId hợp lệ' })
  order_id!: string;

  @ApiProperty({ example: 'SAMPLE-M', description: 'Thùng nhân viên THỰC TẾ dùng (trong danh mục, còn tồn).' })
  @IsString({ message: 'box_code phải là chuỗi' })
  @MinLength(1, { message: 'box_code không được trống' })
  box_code!: string;

  @ApiProperty({ type: [String], example: ['TEE#1', 'TEE#2'], description: 'Các món (item_key) nằm trong kiện.' })
  @IsArray({ message: 'item_keys phải là mảng' })
  @ArrayMinSize(1, { message: 'Mỗi kiện cần ít nhất 1 món' })
  @IsString({ each: true, message: 'Mỗi item_key phải là chuỗi' })
  item_keys!: string[];
}

export class ManualPackDto extends VersionedDto {
  @ApiProperty({ type: [ManualParcelDto], description: 'Toàn bộ kiện thật của nhóm — phủ đủ mọi món, mỗi món đúng 1 kiện.' })
  @IsArray({ message: 'parcels phải là mảng' })
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 kiện' })
  @ValidateNested({ each: true })
  @Type(() => ManualParcelDto)
  parcels!: ManualParcelDto[];

  @ApiProperty({ minLength: 3, maxLength: 500, description: 'Vì sao đóng thủ công (ghi nhận).' })
  @IsString({ message: 'note phải là chuỗi' })
  @MinLength(3, { message: 'note tối thiểu 3 ký tự' })
  @MaxLength(500, { message: 'note tối đa 500 ký tự' })
  note!: string;
}

export class BackToPickingItemDto {
  @ApiProperty({ example: 'TSHIRT-RED-M', description: 'SKU sàn của món bị loại khỏi giỏ đóng gói.' })
  @IsString({ message: 'sku phải là chuỗi' })
  @MinLength(1, { message: 'sku không được rỗng' })
  sku!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt({ message: 'quantity phải là số nguyên' })
  @Min(1, { message: 'quantity phải ≥ 1' })
  quantity!: number;

  @ApiProperty({
    required: false,
    default: false,
    description:
      'true = món còn tốt (lấy nhầm) → cộng lại tồn đúng ô đã lấy; false (mặc định) = món hỏng → loại bỏ, không về kệ.',
  })
  @IsOptional()
  @IsBoolean({ message: 'restock phải là true/false' })
  restock?: boolean;
}

export class BackToPickingDto extends VersionedDto {
  @ApiProperty({ type: [BackToPickingItemDto], description: 'Các món phải lấy lại (ít nhất 1).' })
  @IsArray({ message: 'items phải là mảng' })
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 món phải lấy lại' })
  @ValidateNested({ each: true })
  @Type(() => BackToPickingItemDto)
  items!: BackToPickingItemDto[];

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString({ message: 'note phải là chuỗi' })
  @MaxLength(500, { message: 'note tối đa 500 ký tự' })
  note?: string;
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
