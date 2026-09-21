import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsMongoId, IsNumber, Max, Min, ValidateNested } from 'class-validator';

export class PackedPackageDto {
  @ApiProperty({ description: 'Đơn nguồn của kiện' })
  @IsMongoId({ message: 'order_id không đúng định dạng' })
  order_id!: string;

  @ApiProperty({ example: 0.45, description: 'Cân nặng THẬT của kiện sau khi đóng xong (kg)' })
  @IsNumber({}, { message: 'actual_weight_kg phải là số' })
  @Min(0.001, { message: 'actual_weight_kg phải lớn hơn 0' })
  @Max(100, { message: 'actual_weight_kg không vượt quá 100 kg' })
  actual_weight_kg!: number;
}

/**
 * MỚI (21/09/2026, BE-4a) — "Đã đóng xong": nhập cân thật cho TỪNG kiện
 * (mỗi đơn một kiện), so với cân ước tính (hàng + bì + vật tư).
 */
export class PackGroupDto {
  @ApiProperty({ type: [PackedPackageDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 kiện' })
  @ValidateNested({ each: true })
  @Type(() => PackedPackageDto)
  packages!: PackedPackageDto[];

  @ApiProperty({ example: 5, description: 'Version hiện tại của Order Group (Rule #18)' })
  @IsInt()
  @Min(0)
  expected_version!: number;
}
