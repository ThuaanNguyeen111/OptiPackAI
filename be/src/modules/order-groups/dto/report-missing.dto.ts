import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsMongoId, IsOptional, IsString, Min } from 'class-validator';

/**
 * UC-07 Alt Flow (Report 1, đề bài gốc): "Sản phẩm hết hàng lúc lấy
 * -> Warehouse Staff chọn 'Report Missing Item' -> hệ thống đánh dấu
 * đơn 'Partial – Needs Review' -> thông báo Store Owner".
 */
export class ReportMissingDto {
  @ApiProperty({ example: 'ABC-123' })
  @IsString()
  sku!: string;

  @ApiProperty({ description: 'Số lượng CÒN THIẾU (yêu cầu - thực có)', example: 2 })
  @IsInt()
  @Min(1)
  missing_quantity!: number;

  @ApiProperty({ description: 'ObjectId của Warehouse đang lấy hàng' })
  @IsMongoId()
  warehouse_id!: string;

  @ApiProperty({ required: false, description: 'Ghi chú thêm (không bắt buộc)' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ description: 'Version hiện tại của Order Group (Rule #18)', example: 1 })
  @IsInt()
  @Min(0)
  expected_version!: number;
}
