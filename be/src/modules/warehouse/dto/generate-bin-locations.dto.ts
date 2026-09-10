import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

/**
 * Range generator — Admin không phải tạo tay từng kệ 1 (VD 40 kệ =
 * 40 lần bấm). Input 1 dãy (aisle) + khoảng rack/level -> tự sinh đủ
 * tổ hợp, mã hóa bin_code dạng "{zone_code}-{aisle}-{rack:02}-{level:02}".
 */
export class GenerateBinLocationsDto {
  @ApiProperty({ example: '03', description: 'Mã dãy (aisle)' })
  @IsString()
  aisle!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  rack_from!: number;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  rack_to!: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  level_from!: number;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  level_to!: number;
}
