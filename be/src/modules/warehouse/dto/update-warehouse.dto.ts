import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * K1 (26/09/2026) — CHỈ cho sửa tên + địa chỉ. `warehouse_code` KHÔNG có
 * trong DTO -> ValidationPipe (forbidNonWhitelisted) trả 400 nếu FE gửi lên: mã
 * kho khóa sau khi tạo (đã in trên nhãn/tài liệu vận hành).
 */
export class UpdateWarehouseDto {
  @ApiPropertyOptional({ example: 'Kho TP.HCM - Quận 7 (mở rộng)' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  warehouse_name?: string;

  @ApiPropertyOptional({ example: '456 Đường XYZ, Quận 7, TP.HCM' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  address?: string;
}
