import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * K1 (26/09/2026) — CHỈ cho sửa tên + mô tả. `zone_code` KHÔNG sửa được:
 * nó nằm trong mọi bin_code của khu (VD "A-03-01-01") đã in nhãn dán lên
 * kệ thật — đổi mã trên hệ thống mà nhãn vẫn cũ thì nhân viên đi nhầm chỗ.
 */
export class UpdateZoneDto {
  @ApiPropertyOptional({ example: 'Phụ kiện điện thoại' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  zone_name?: string;

  @ApiPropertyOptional({ example: 'Khu chứa ốp lưng, cáp sạc' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
