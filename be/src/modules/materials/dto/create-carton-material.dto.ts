import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';
import { CARTON_BOARD_TYPES } from '../schemas/carton-material.schema';
import type { CartonBoardType } from '../schemas/carton-material.schema';

export class CreateCartonMaterialDto {
  @ApiProperty({ example: 'CT-M-20-15-10' })
  @IsString()
  @MinLength(2)
  @Matches(/^[A-Za-z0-9-]+$/)
  material_code!: string;

  @ApiProperty({ example: 'Thùng carton M - 20x15x10 cm' })
  @IsString()
  @MinLength(2)
  material_name!: string;

  @ApiProperty({ example: 200, description: 'Kích thước phủ bì, đơn vị mm' })
  @IsInt()
  @Min(1)
  length_mm!: number;

  @ApiProperty({ example: 150 })
  @IsInt()
  @Min(1)
  width_mm!: number;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  height_mm!: number;

  @ApiProperty({ enum: CARTON_BOARD_TYPES, example: '3PLY' })
  @IsIn(CARTON_BOARD_TYPES)
  board_type!: CartonBoardType;

  @ApiProperty({ example: 100, required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  quantity_on_hand?: number;

  @ApiProperty({ example: 20, required: false, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  reorder_level?: number;

  @ApiProperty({ example: 8500, required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unit_cost_vnd?: number;

  @ApiProperty({ example: 'Kệ A-01' })
  @IsString()
  @MinLength(1)
  storage_location!: string;
}
