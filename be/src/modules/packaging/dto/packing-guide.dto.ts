import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/** MỚI (21/09/2026) — tạo/lấy hướng dẫn đóng gói từng bước. */
export class PackingGuideDto {
  @ApiPropertyOptional({
    description:
      'true = viết lại hướng dẫn dù đã có (gọi lại AI). Mặc định false: trả bản đã lưu.',
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'regenerate phải là true hoặc false.' })
  regenerate?: boolean;

  @ApiPropertyOptional({
    description:
      'Thứ tự kiện trong đơn (từ 0) cần hướng dẫn. Bỏ trống = kiện 0.',
    example: 0,
  })
  @IsOptional()
  @IsInt({ message: 'carton_index phải là số nguyên.' })
  @Min(0, { message: 'carton_index không âm.' })
  carton_index?: number;
}
