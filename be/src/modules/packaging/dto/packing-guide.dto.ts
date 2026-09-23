import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** MỚI (21/09/2026) — tạo/lấy hướng dẫn đóng gói từng bước. */
export class PackingGuideDto {
  @ApiPropertyOptional({
    description: 'true = viết lại hướng dẫn dù đã có (gọi lại AI). Mặc định false: trả bản đã lưu.',
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'regenerate phải là true hoặc false.' })
  regenerate?: boolean;
}
