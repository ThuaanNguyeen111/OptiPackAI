import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'WH-HCM-01' })
  @IsString()
  @MinLength(1)
  warehouse_code!: string;

  @ApiProperty({ example: 'Kho TP.HCM - Quận 7' })
  @IsString()
  @MinLength(1)
  warehouse_name!: string;

  @ApiProperty({ example: '123 Đường ABC, Quận 7, TP.HCM' })
  @IsString()
  @MinLength(1)
  address!: string;
}
