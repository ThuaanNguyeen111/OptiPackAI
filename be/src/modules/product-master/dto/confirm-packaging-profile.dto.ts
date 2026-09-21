import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Kho/Admin nhập số đo THẬT sau khi gấp/bọc (giày đo nguyên hộp).
 * Giữ đơn vị cm/kg như `dimension` đang lưu; engine tự đổi sang mm/g.
 */
export class ConfirmPackagingProfileDto {
  @ApiProperty({ example: 28, description: 'Chiều dài sau gấp/bọc (cm)' })
  @IsNumber({}, { message: 'length_cm phải là số' })
  @Min(0.1, { message: 'length_cm phải lớn hơn 0' })
  @Max(500, { message: 'length_cm không vượt quá 500 cm' })
  length_cm!: number;

  @ApiProperty({ example: 20, description: 'Chiều rộng sau gấp/bọc (cm)' })
  @IsNumber({}, { message: 'width_cm phải là số' })
  @Min(0.1, { message: 'width_cm phải lớn hơn 0' })
  @Max(500, { message: 'width_cm không vượt quá 500 cm' })
  width_cm!: number;

  @ApiProperty({ example: 4, description: 'Chiều cao sau gấp/bọc (cm)' })
  @IsNumber({}, { message: 'height_cm phải là số' })
  @Min(0.1, { message: 'height_cm phải lớn hơn 0' })
  @Max(500, { message: 'height_cm không vượt quá 500 cm' })
  height_cm!: number;

  @ApiProperty({ example: 0.25, description: 'Khối lượng gồm lớp bọc (kg)' })
  @IsNumber({}, { message: 'weight_kg phải là số' })
  @Min(0.001, { message: 'weight_kg phải lớn hơn 0' })
  @Max(100, { message: 'weight_kg không vượt quá 100 kg' })
  weight_kg!: number;

  @ApiProperty({ example: false, description: 'Cần vật tư chống sốc' })
  @IsBoolean({ message: 'is_fragile phải là true/false' })
  is_fragile!: boolean;

  @ApiProperty({
    enum: ['any', 'upright_only'],
    example: 'any',
    description: 'any = xoay tự do 6 hướng; upright_only = chỉ xoay quanh trục đứng',
  })
  @IsIn(['any', 'upright_only'], { message: 'orientation_rule phải là any hoặc upright_only' })
  orientation_rule!: 'any' | 'upright_only';

  @ApiProperty({
    required: false,
    nullable: true,
    example: 1.5,
    description: 'Tải tối đa được đặt lên trên (kg). Bỏ trống/null = không cho đặt gì lên.',
  })
  @IsOptional()
  @IsNumber({}, { message: 'max_stack_load_kg phải là số' })
  @Min(0, { message: 'max_stack_load_kg không được âm' })
  max_stack_load_kg?: number | null;
}
