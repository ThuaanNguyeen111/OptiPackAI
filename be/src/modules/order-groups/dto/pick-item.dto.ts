import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsMongoId, IsOptional, IsString, Min } from 'class-validator';

const SCAN_METHODS = ['barcode', 'manual'] as const;

/**
 * scan_method: audit (BR-07) — biết lần nào quét thật, lần nào nhập
 * tay dự phòng. client_event_id: optional, CHỈ Mobile App gửi khi
 * offline-sync retry (mất mạng lúc quét) — xem CLAUDE.md mục "Nghiên
 * cứu dự phòng quét mã".
 */
export class PickItemDto {
  @ApiProperty({ example: 'ABC-123' })
  @IsString()
  sku!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  scanned_quantity!: number;

  @ApiProperty({ enum: SCAN_METHODS })
  @IsIn(SCAN_METHODS)
  scan_method!: (typeof SCAN_METHODS)[number];

  @ApiProperty({ description: 'ObjectId của Warehouse đang lấy hàng' })
  @IsMongoId()
  warehouse_id!: string;

  @ApiPropertyOptional({ description: 'Chỉ Mobile App gửi — dùng chống trừ tồn kho trùng khi offline-sync retry' })
  @IsOptional()
  @IsString()
  client_event_id?: string;

  // K3 (27/09/2026) — 1 SKU có thể nằm nhiều ô: gửi ô THẬT nhân viên lấy (lấy từ
  // Picking List: bin_location_id / other_bins) để trừ đúng ô. Không gửi = hệ
  // thống trừ ở ô bất kỳ đủ hàng (hành vi cũ) — sổ cái vẫn ghi đúng ô đã trừ.
  @ApiPropertyOptional({ description: 'K3 — ObjectId ô thực tế lấy hàng' })
  @IsOptional()
  @IsMongoId()
  bin_location_id?: string;
}
