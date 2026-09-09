import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateZoneDto {
  @ApiProperty({ example: 'A' })
  @IsString()
  @MinLength(1)
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
