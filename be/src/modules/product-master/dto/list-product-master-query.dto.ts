import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class ListProductMasterQueryDto {
  @ApiPropertyOptional({ enum: ['needs_measurement', 'ready'] })
  @IsOptional()
  @IsIn(['needs_measurement', 'ready'], { message: 'status phải là needs_measurement hoặc ready' })
  status?: 'needs_measurement' | 'ready';

  @ApiPropertyOptional({ example: '201171264532' })
  @IsOptional()
  @IsString({ message: 'shop_id phải là chuỗi' })
  shop_id?: string;

  @ApiPropertyOptional({ description: 'Tìm theo seller_sku (không phân biệt hoa thường)' })
  @IsOptional()
  @IsString({ message: 'search phải là chuỗi' })
  search?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], description: '22/10/2026 — true = gồm cả SKU sàn đã ngừng bán / ngừng dùng (mặc định ẩn).' })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'include_retired chỉ nhận true/false' })
  include_retired?: 'true' | 'false';
}

/** 22/10/2026 — `PATCH /product-master/:id/retire`. */
export class RetireProductMasterDto {
  @ApiProperty({ description: 'true = ngừng dùng SKU sàn này, false = dùng lại.' })
  @IsBoolean({ message: 'retired phải là true/false' })
  retired!: boolean;
}
