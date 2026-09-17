import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export const CARTON_STOCK_FILTERS = ['all', 'in_stock', 'low_stock', 'out_of_stock'] as const;
export type CartonStockFilter = (typeof CARTON_STOCK_FILTERS)[number];

export class ListCartonMaterialsDto {
  @ApiPropertyOptional({ example: '20x15' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CARTON_STOCK_FILTERS, default: 'all' })
  @IsOptional()
  @IsIn(CARTON_STOCK_FILTERS)
  stock?: CartonStockFilter;
}
