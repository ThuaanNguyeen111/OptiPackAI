import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { StockAdjustReason } from '../schemas/inventory-movement.schema';

/** K3 — kiểm kê: nhập SỐ ĐẾM THỰC TẾ, hệ thống tự tính chênh lệch. */
export class AdjustStockDto {
  @ApiProperty({ example: 11, description: 'Số lượng đếm được thực tế trên ô' })
  @IsInt() @Min(0) @Max(1000000)
  counted_quantity!: number;

  @ApiProperty({ enum: StockAdjustReason })
  @IsEnum(StockAdjustReason)
  reason_code!: StockAdjustReason;

  @ApiPropertyOptional({ example: '1 cái rách bao bì, đã loại' })
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

/** K3 — chuyển hàng sang ô khác (cùng kho), ghi sổ cái 2 chiều. */
export class TransferStockDto {
  @ApiProperty({ example: '66f0...' })
  @IsMongoId()
  to_bin_location_id!: string;

  @ApiProperty({ example: 5 })
  @IsInt() @Min(1) @Max(1000000)
  quantity!: number;

  @ApiPropertyOptional({ example: false, description: 'Bỏ qua chặn vượt sức chứa ô đích' })
  @IsOptional() @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
