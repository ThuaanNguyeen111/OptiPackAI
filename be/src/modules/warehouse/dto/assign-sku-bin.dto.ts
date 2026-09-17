import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsMongoId, IsOptional, IsString, Min } from 'class-validator';
import { MarketplacePlatform, parseMarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';

export class AssignSkuBinDto {
  // Không bắt Admin chọn sàn trên UI — shop demo chỉ Lazada.
  // Field thiếu / rỗng / undefined → parse thành lazada (Transform + service).
  @ApiPropertyOptional({ enum: MarketplacePlatform })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): MarketplacePlatform =>
    parseMarketplacePlatform(value),
  )
  @IsEnum(MarketplacePlatform, {
    message: 'platform phải là tiktok, lazada hoặc tiki',
  })
  platform?: MarketplacePlatform;

  @ApiProperty()
  @IsString()
  shop_id!: string;

  @ApiProperty()
  @IsString()
  seller_sku!: string;

  @ApiProperty({ description: 'ObjectId của bin_location đã tạo trước đó' })
  @IsMongoId()
  bin_location_id!: string;

  // BỔ SUNG (2026-09-10) — Điểm yếu #10 mục 1. Optional: gán vị trí
  // lần đầu có thể CHƯA có hàng thật (chờ nhập kho) — mặc định 0,
  // KHÔNG bắt buộc phải nhập ngay. Bổ sung hàng sau này dùng riêng
  // POST .../restock (nghiệp vụ khác: gán vị trí 1 lần, nhập hàng định kỳ).
  @ApiPropertyOptional({ description: 'Số lượng hàng có sẵn ngay lúc gán (mặc định 0, có thể nhập kho sau qua /restock)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  initial_quantity?: number;
}
