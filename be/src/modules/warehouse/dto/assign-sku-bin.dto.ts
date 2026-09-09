import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsString } from 'class-validator';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';

export class AssignSkuBinDto {
  @ApiProperty({ enum: MarketplacePlatform })
  @IsEnum(MarketplacePlatform)
  platform!: MarketplacePlatform;

  @ApiProperty()
  @IsString()
  shop_id!: string;

  @ApiProperty()
  @IsString()
  seller_sku!: string;

  @ApiProperty({ description: 'ObjectId của bin_location đã tạo trước đó' })
  @IsMongoId()
  bin_location_id!: string;
}
