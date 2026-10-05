import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  ValidateNested,
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
  ValidateIf,
} from 'class-validator';
import { VersionedDto } from './packing-plan.dto';

/** Lý do khi xem lại kiện lệch cân / gỡ lần quét. */
export const PARCEL_REVIEW_REASONS = [
  'SCALE_ERROR', // cân lỗi / đặt lệch
  'MATERIALS_HEAVIER', // vật tư chèn nặng hơn ước tính
  'PRODUCT_WEIGHT_WRONG', // cân nặng sản phẩm trong hồ sơ sai
  'WRONG_ITEM_INSIDE', // nghi có món sai/thừa trong kiện
  'OTHER',
] as const;
export type ParcelReviewReason = (typeof PARCEL_REVIEW_REASONS)[number];

export class StartPackingDto extends VersionedDto {}

export class FinishPackingDto extends VersionedDto {}

export class ScanItemDto {
  @ApiProperty({ example: 'TEE-M-WHITE', description: 'Mã quét được: SKU sàn hoặc SKU nội bộ (không phân biệt hoa/thường).' })
  @IsString({ message: 'code phải là chuỗi' })
  @MinLength(1, { message: 'code không được trống' })
  @MaxLength(100, { message: 'code tối đa 100 ký tự' })
  code!: string;

  @ApiProperty({ required: false, example: 1, description: 'Số món quét một lần (mặc định 1).' })
  @IsOptional()
  @IsInt({ message: 'quantity phải là số nguyên' })
  @Min(1, { message: 'quantity phải ≥ 1' })
  @Max(500, { message: 'quantity tối đa 500' })
  quantity?: number;

  @ApiProperty({ enum: ['barcode', 'manual'] })
  @IsIn(['barcode', 'manual'], { message: 'scan_method chỉ nhận barcode hoặc manual' })
  scan_method!: 'barcode' | 'manual';

  @ApiProperty({ required: false, description: 'Mã sinh trên thiết bị lúc quét — gửi lại sau khi mất mạng không bị đếm 2 lần.' })
  @IsOptional()
  @IsString({ message: 'client_event_id phải là chuỗi' })
  @MaxLength(100, { message: 'client_event_id tối đa 100 ký tự' })
  client_event_id?: string;
}

export class UnscanItemDto extends VersionedDto {
  @ApiProperty({ example: 'TEE-M-WHITE#2', description: 'Món cần gỡ lần quét (item_key).' })
  @IsString({ message: 'item_key phải là chuỗi' })
  @MinLength(1, { message: 'item_key không được trống' })
  item_key!: string;

  @ApiProperty({ example: 'Quét nhầm món', minLength: 3 })
  @IsString({ message: 'reason phải là chuỗi' })
  @MinLength(3, { message: 'reason tối thiểu 3 ký tự' })
  @MaxLength(300, { message: 'reason tối đa 300 ký tự' })
  reason!: string;
}

export class SealParcelDto extends VersionedDto {
  @ApiProperty({ example: 0.45, description: 'Cân THẬT của kiện sau khi đóng (kg).' })
  @IsNumber({}, { message: 'weight_kg phải là số' })
  @Min(0.001, { message: 'weight_kg phải lớn hơn 0' })
  @Max(100, { message: 'weight_kg không vượt quá 100 kg' })
  weight_kg!: number;
}

export class ReviewParcelDto extends VersionedDto {
  @ApiProperty({
    enum: ['accept', 'reweigh', 'reopen'],
    description:
      'accept = chấp nhận dù lệch (người KHÁC người niêm phong); reweigh = cân lại; reopen = mở kiện ra đóng lại (không trừ thùng lần 2).',
  })
  @IsIn(['accept', 'reweigh', 'reopen'], { message: 'action chỉ nhận accept, reweigh hoặc reopen' })
  action!: 'accept' | 'reweigh' | 'reopen';

  @ApiProperty({ required: false, description: 'Bắt buộc khi action = reweigh.' })
  @ValidateIf((o: ReviewParcelDto) => o.action === 'reweigh' || o.weight_kg !== undefined)
  @IsNumber({}, { message: 'weight_kg phải là số' })
  @Min(0.001, { message: 'weight_kg phải lớn hơn 0' })
  @Max(100, { message: 'weight_kg không vượt quá 100 kg' })
  weight_kg?: number;

  @ApiProperty({ enum: PARCEL_REVIEW_REASONS })
  @IsIn(PARCEL_REVIEW_REASONS, { message: 'reason không hợp lệ' })
  reason!: ParcelReviewReason;

  @ApiProperty({ required: false, description: 'Bắt buộc khi reason = OTHER.' })
  @IsOptional()
  @IsString({ message: 'note phải là chuỗi' })
  @MaxLength(500, { message: 'note tối đa 500 ký tự' })
  note?: string;

  @ApiProperty({ required: false, description: 'reopen: true = xóa các lần quét, phải quét lại từ đầu.' })
  @IsOptional()
  @IsBoolean({ message: 'rescan phải là true/false' })
  rescan?: boolean;
}

export class ReportIssueDto extends VersionedDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'parcel_no phải là số nguyên' })
  @Min(1, { message: 'parcel_no phải ≥ 1' })
  parcel_no!: number;

  @ApiProperty({ example: 'TEE-M-WHITE#1', description: 'Món gặp sự cố (item_key trong kiện).' })
  @IsString({ message: 'item_key phải là chuỗi' })
  @MinLength(1, { message: 'item_key không được trống' })
  item_key!: string;

  @ApiProperty({ enum: ['damaged', 'missing', 'wrong_item'] })
  @IsIn(['damaged', 'missing', 'wrong_item'], { message: 'issue chỉ nhận damaged, missing hoặc wrong_item' })
  issue!: 'damaged' | 'missing' | 'wrong_item';

  @ApiProperty({
    enum: ['replace', 'back_to_picking'],
    description:
      'replace = lấy ngay 1 món thay từ kệ (cần warehouse_id); back_to_picking = trả nhóm về bước lấy hàng (chỉ khi chưa niêm phong kiện nào).',
  })
  @IsIn(['replace', 'back_to_picking'], { message: 'resolution chỉ nhận replace hoặc back_to_picking' })
  resolution!: 'replace' | 'back_to_picking';

  @ApiProperty({ required: false, description: 'Kho lấy món thay (bắt buộc khi resolution = replace).' })
  @IsOptional()
  @IsMongoId({ message: 'warehouse_id không hợp lệ' })
  warehouse_id?: string;

  @ApiProperty({ required: false, description: 'Ô lấy món thay (không gửi = ô bất kỳ còn hàng).' })
  @IsOptional()
  @IsMongoId({ message: 'bin_location_id không hợp lệ' })
  bin_location_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString({ message: 'note phải là chuỗi' })
  @MaxLength(500, { message: 'note tối đa 500 ký tự' })
  note?: string;
}

export class RecoveredMaterialDto {
  @ApiProperty({ example: 'FOAM-CORNER', description: 'Mã vật tư chèn có trong kiện (parcels[].materials[].code).' })
  @IsString({ message: 'code phải là chuỗi' })
  @MinLength(1, { message: 'code không được trống' })
  code!: string;

  @ApiProperty({ example: 4, description: 'Số lượng còn dùng lại được (≤ số lượng trong kiện).' })
  @IsInt({ message: 'quantity phải là số nguyên' })
  @Min(1, { message: 'quantity phải ≥ 1' })
  quantity!: number;
}

export class UnpackParcelDto extends VersionedDto {
  @ApiProperty({
    enum: ['reusable', 'damaged'],
    description: 'Tình trạng thùng sau khi tháo: reusable → vào kho tái sử dụng; damaged → bỏ.',
  })
  @IsIn(['reusable', 'damaged'], { message: 'box_condition chỉ nhận reusable hoặc damaged' })
  box_condition!: 'reusable' | 'damaged';

  @ApiProperty({
    required: false,
    type: [RecoveredMaterialDto],
    description:
      '(05/10/2026) Vật tư chèn còn dùng lại được (góc xốp, túi khí...). Không gửi = bỏ hết như trước. Vật tư phải bật "reusable" trong danh mục.',
  })
  @IsOptional()
  @IsArray({ message: 'recovered_materials phải là mảng' })
  @ArrayMaxSize(20, { message: 'recovered_materials tối đa 20 dòng' })
  @ValidateNested({ each: true })
  @Type(() => RecoveredMaterialDto)
  recovered_materials?: RecoveredMaterialDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString({ message: 'note phải là chuỗi' })
  @MaxLength(500, { message: 'note tối đa 500 ký tự' })
  note?: string;
}

export class AssignPackerDto {
  @ApiProperty({ enum: ['auto', 'manual'] })
  @IsIn(['auto', 'manual'], { message: 'mode chỉ nhận auto hoặc manual' })
  mode!: 'auto' | 'manual';

  @ApiProperty({ required: false, description: 'Bắt buộc khi mode = manual — phải là Packaging Staff đang hoạt động.' })
  @ValidateIf((o: AssignPackerDto) => o.mode === 'manual')
  @IsMongoId({ message: 'staff_id không hợp lệ' })
  staff_id?: string;
}

export class UpdatePackingSettingsDto {
  @ApiProperty({ required: false, description: 'Version đang xem (khóa lạc quan). Không gửi = ghi đè.' })
  @IsOptional()
  @IsInt({ message: 'expected_version phải là số nguyên' })
  expected_version?: number;

  @ApiProperty({ required: false, example: 0.2, description: 'Tỷ lệ lệch cân cho phép (0.01–1).' })
  @IsOptional()
  @IsNumber({}, { message: 'abnormal_weight_threshold phải là số' })
  @Min(0.01, { message: 'abnormal_weight_threshold tối thiểu 0.01' })
  @Max(1, { message: 'abnormal_weight_threshold tối đa 1' })
  abnormal_weight_threshold?: number;

  @ApiProperty({ required: false, example: 5, description: 'Đệm quanh hàng dễ vỡ (mm, 0–50).' })
  @IsOptional()
  @IsInt({ message: 'fragile_cushion_mm phải là số nguyên' })
  @Min(0, { message: 'fragile_cushion_mm tối thiểu 0' })
  @Max(50, { message: 'fragile_cushion_mm tối đa 50' })
  fragile_cushion_mm?: number;

  @ApiProperty({ required: false, enum: ['fewest_parcels', 'cheapest'] })
  @IsOptional()
  @IsIn(['fewest_parcels', 'cheapest'], { message: 'default_prefer chỉ nhận fewest_parcels hoặc cheapest' })
  default_prefer?: 'fewest_parcels' | 'cheapest';

  @ApiProperty({ required: false, nullable: true, description: 'Số kiện tối đa mỗi đơn; null = bỏ giới hạn.' })
  @IsOptional()
  @ValidateIf((o: UpdatePackingSettingsDto) => o.max_parcels_per_order !== null)
  @IsInt({ message: 'max_parcels_per_order phải là số nguyên' })
  @Min(1, { message: 'max_parcels_per_order phải ≥ 1' })
  max_parcels_per_order?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean({ message: 'allow_reused_box_for_fragile phải là true/false' })
  allow_reused_box_for_fragile?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean({ message: 'require_scan phải là true/false' })
  require_scan?: boolean;
}
