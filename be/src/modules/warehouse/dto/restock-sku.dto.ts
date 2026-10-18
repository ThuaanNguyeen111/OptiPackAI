import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsOptional, Matches, Min } from 'class-validator';

export class RestockSkuDto {
  @ApiProperty({ description: 'Số lượng NHẬP THÊM (cộng dồn, không phải set lại toàn bộ)', example: 50 })
  @IsInt()
  @Min(1)
  quantity!: number;

  // K2 — vượt sức chứa ô thì bị chặn 409 WH_BIN_OVER_CAPACITY; gửi force=true
  // để xác nhận vẫn nhập (VD hàng về gấp, xếp tạm chồng lên).
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  // 15/10/2026 — lô hàng: ngày nhập kho (FIFO) + mã lô. Bỏ trống = bây giờ / mã phiếu nhập.
  @ApiPropertyOptional({ description: 'Ngày nhập kho của lô (ISO, không ở tương lai)', example: '2026-10-15T08:00:00+07:00' })
  @IsOptional()
  @IsDateString({}, { message: 'received_at phải là ngày giờ ISO hợp lệ' })
  received_at?: string;

  @ApiPropertyOptional({ example: 'LO-2026-10-A' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9-]{3,40}$/, { message: 'Mã lô chỉ gồm chữ, số, gạch ngang (3–40 ký tự)' })
  lot_code?: string;
}
