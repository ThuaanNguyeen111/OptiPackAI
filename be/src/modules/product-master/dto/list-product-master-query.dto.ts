import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListProductMasterQueryDto {
  @ApiPropertyOptional({ enum: ['needs_measurement', 'ready'] })
  @IsOptional()
  @IsIn(['needs_measurement', 'ready'], { message: 'status phải là needs_measurement hoặc ready' })
  status?: 'needs_measurement' | 'ready';

  @ApiPropertyOptional({ example: '201171264532' })
  @IsOptional()
  @IsString({ message: 'shop_id phải là chuỗi' })
  shop_id?: string;
}
