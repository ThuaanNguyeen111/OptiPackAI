import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';

/** (09/10/2026) Trước đây đọc chuỗi trần — thiếu tham số vẫn chạy và trả số 0 sai. */
export class StockAvailabilityQueryDto {
  @ApiProperty({ enum: MarketplacePlatform })
  @IsEnum(MarketplacePlatform, { message: 'platform không hợp lệ' })
  platform!: MarketplacePlatform;

  @ApiProperty({ example: '201171264532' })
  @IsString({ message: 'shop_id phải là chuỗi' })
  @IsNotEmpty({ message: 'shop_id là bắt buộc' })
  shop_id!: string;

  @ApiProperty({ example: 'TSHIRT-RED-M' })
  @IsString({ message: 'seller_sku phải là chuỗi' })
  @IsNotEmpty({ message: 'seller_sku là bắt buộc' })
  seller_sku!: string;
}
