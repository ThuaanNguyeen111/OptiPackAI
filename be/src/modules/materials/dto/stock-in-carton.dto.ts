import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class StockInCartonDto {
  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 'PO-2026-0914', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reference_note?: string;
}
