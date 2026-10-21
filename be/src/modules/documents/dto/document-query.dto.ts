import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/** (21/10/2026) GET /documents/bin-labels/:warehouseId — chọn ô cần in tem. */
export class BinLabelsQueryDto {
  @ApiProperty({ required: false, description: 'Chỉ in các ô của khu này.' })
  @IsOptional()
  @IsMongoId({ message: 'zone_id không hợp lệ' })
  zone_id?: string;

  @ApiProperty({ required: false, example: '6a8...,6a9...', description: 'Danh sách id ô, cách nhau dấu phẩy (in lại vài tem).' })
  @IsOptional()
  @IsString({ message: 'bin_ids phải là chuỗi' })
  @Matches(/^[0-9a-fA-F]{24}(,[0-9a-fA-F]{24})*$/, { message: 'bin_ids là các id 24 ký tự hex, cách nhau dấu phẩy' })
  bin_ids?: string;

  @ApiProperty({ required: false, example: 1, description: 'Số bản mỗi tem (1-10).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'copies phải là số nguyên' })
  @Min(1, { message: 'copies phải ≥ 1' })
  @Max(10, { message: 'copies tối đa 10' })
  copies?: number;
}

/** (21/10/2026) GET /documents/sku-labels — SKU cần in tem. */
export class SkuLabelsQueryDto {
  @ApiProperty({ example: 'AOT-001-DEN-M,QUAN-002-XANH-L', description: 'Mã SKU nội bộ (hoặc SKU sàn), cách nhau dấu phẩy, tối đa 100 mã.' })
  @IsString({ message: 'codes phải là chuỗi' })
  @MaxLength(3000, { message: 'codes quá dài' })
  codes!: string;

  @ApiProperty({ required: false, example: 1, description: 'Số bản mỗi tem (1-50).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'copies phải là số nguyên' })
  @Min(1, { message: 'copies phải ≥ 1' })
  @Max(50, { message: 'copies tối đa 50' })
  copies?: number;
}
