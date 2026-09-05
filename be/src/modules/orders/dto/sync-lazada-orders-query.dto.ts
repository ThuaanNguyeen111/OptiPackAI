import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SyncLazadaOrdersQueryDto {
  @ApiProperty({
    description: 'shop_id trên Lazada (chính là seller_id trả về trong response OAuth token)',
    example: '201171264532',
  })
  @IsString()
  @IsNotEmpty({ message: 'Thiếu shop_id.' })
  shop_id!: string;
}
