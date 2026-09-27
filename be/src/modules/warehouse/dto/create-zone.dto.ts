import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateZoneDto {
  @ApiProperty({ example: 'KA', description: '🔄 K2: bắt buộc dạng K + 1 chữ hoa (KA..KZ). Khu cũ đã tạo giữ nguyên.' })
  @Matches(/^K[A-Z]$/, { message: 'zone_code phải dạng KA..KZ (chuẩn kho mới từ 26/09/2026)' })
  zone_code!: string;

  @ApiProperty({ example: 'Phụ kiện điện tử' })
  @IsString()
  @MinLength(1)
  zone_name!: string;

  @ApiPropertyOptional({ example: 'Khu chứa cáp sạc, tai nghe, phụ kiện nhỏ' })
  @IsOptional()
  @IsString()
  description?: string;
}
