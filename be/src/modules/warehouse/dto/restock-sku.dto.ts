import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class RestockSkuDto {
  @ApiProperty({ description: 'Số lượng NHẬP THÊM (cộng dồn, không phải set lại toàn bộ)', example: 50 })
  @IsInt()
  @Min(1)
  quantity!: number;
}
