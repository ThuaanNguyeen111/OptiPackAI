import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class BoxSizeDto {
  @ApiProperty() @IsNumber() @Min(1) length_cm!: number;
  @ApiProperty() @IsNumber() @Min(1) width_cm!: number;
  @ApiProperty() @IsNumber() @Min(1) height_cm!: number;
}

/**
 * UC-04 Alt Flow (Report 1): "Packaging Staff không đồng ý -> chọn
 * 'Adjust', tự nhập lại box_size/material_type -> hệ thống lưu giá trị
 * điều chỉnh và log lý do (dropdown: 'Sản phẩm dễ vỡ hơn dự kiến',
 * 'Thùng đề xuất không có sẵn trong kho', 'Khác')".
 */
const ADJUSTMENT_REASONS = [
  'PRODUCT_MORE_FRAGILE_THAN_EXPECTED',
  'RECOMMENDED_BOX_NOT_IN_STOCK',
  'OTHER',
] as const;

export class AdjustPackagingDto {
  @ApiProperty({ type: BoxSizeDto })
  @ValidateNested()
  @Type(() => BoxSizeDto)
  box_size!: BoxSizeDto;

  @ApiProperty({ example: 'Bubble Wrap' })
  @IsString()
  material_type!: string;

  @ApiProperty({ enum: ADJUSTMENT_REASONS })
  @IsIn(ADJUSTMENT_REASONS)
  adjustment_reason!: (typeof ADJUSTMENT_REASONS)[number];

  @ApiProperty({ required: false, description: 'Bắt buộc khi adjustment_reason = OTHER' })
  @IsOptional()
  @IsString()
  adjustment_note?: string;

  @ApiProperty({ description: 'Cân nặng THẬT đo được sau khi đóng gói (kg)', example: 0.45 })
  @IsNumber()
  @Min(0)
  actual_measured_weight_kg!: number;

  @ApiProperty({ description: 'Version hiện tại của Order Group (Rule #18)', example: 0 })
  @IsNumber()
  @Min(0)
  expected_group_version!: number;
}
