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

  // 08/11/2026 — chống ghi trùng khi app gửi lại.
  @ApiPropertyOptional({
    example: '0b6f7c1e-3a5d-4c1e-9a52-7d1f0c2b9e11',
    description: 'Mã thao tác do app sinh (UUID). Gửi lại cùng mã → trả kết quả cũ, không ghi lần 2.',
  })
  @IsOptional() @IsString({ message: 'client_event_id phải là chuỗi' }) @MaxLength(100, { message: 'client_event_id tối đa 100 ký tự' })
  client_event_id?: string;
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

  // 08/11/2026 — chống ghi trùng khi app gửi lại.
  @ApiPropertyOptional({
    example: '0b6f7c1e-3a5d-4c1e-9a52-7d1f0c2b9e11',
    description: 'Mã thao tác do app sinh (UUID). Gửi lại cùng mã → trả kết quả cũ, không ghi lần 2.',
  })
  @IsOptional() @IsString({ message: 'client_event_id phải là chuỗi' }) @MaxLength(100, { message: 'client_event_id tối đa 100 ký tự' })
  client_event_id?: string;
}

/**
 * 10/10/2026 — sửa gán nhầm: dời 1 dòng "SKU trên ô" sang ô khác.
 * Ô hết hàng → chỉ đổi ô. Ô còn hàng → chuyển TOÀN BỘ số đang có (ghi sổ cái
 * như "chuyển ô") rồi bỏ dòng cũ.
 */
export class MoveAssignmentDto {
  @ApiProperty({ example: '66f0...', description: 'Ô đúng (cùng kho)' })
  @IsMongoId()
  to_bin_location_id!: string;

  @ApiPropertyOptional({ example: false, description: 'Bỏ qua chặn vượt sức chứa ô đích' })
  @IsOptional() @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional({ example: 'Gán nhầm ô lúc thiết lập kho' })
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
