import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';

/**
 * 1 dòng phiếu nhập: chỉ định dòng tồn bằng `assignment_id`, HOẶC bằng
 * ô + sàn + shop + SKU sàn (SKU phải đã được gán vào ô đó trước).
 */
export class StockReceiptLineDto {
  @ApiPropertyOptional({ description: 'Id dòng "SKU trên ô" (sku_bin_assignments)' })
  @IsOptional()
  @IsMongoId({ message: 'assignment_id phải là ObjectId hợp lệ' })
  assignment_id?: string;

  @ApiPropertyOptional({ description: 'Ô nhận hàng (khi không gửi assignment_id)' })
  @IsOptional()
  @IsMongoId({ message: 'bin_location_id phải là ObjectId hợp lệ' })
  bin_location_id?: string;

  @ApiPropertyOptional({ enum: MarketplacePlatform })
  @IsOptional()
  @IsEnum(MarketplacePlatform, { message: 'platform không hợp lệ' })
  platform?: MarketplacePlatform;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shop_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seller_sku?: string;

  @ApiProperty({ example: 40 })
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng tối thiểu là 1' })
  quantity!: number;
}

export class CreateStockReceiptDto {
  @ApiPropertyOptional({
    description: 'Ngày nhập kho của lô (ISO). Bỏ trống = bây giờ. Không được ở tương lai. Lấy hàng trừ lô có ngày này CŨ NHẤT trước (FIFO).',
    example: '2026-10-15T08:00:00+07:00',
  })
  @IsOptional()
  @IsDateString({}, { message: 'received_at phải là ngày giờ ISO hợp lệ' })
  received_at?: string;

  @ApiPropertyOptional({ description: 'Mã lô (chữ HOA, số, gạch ngang). Bỏ trống = mã phiếu nhập.', example: 'LO-2026-10-A' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9-]{3,40}$/, { message: 'Mã lô chỉ gồm chữ, số, gạch ngang (3–40 ký tự)' })
  lot_code?: string;

  @ApiPropertyOptional({ example: 'Xưởng may Bình Tân' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: 'Bỏ qua kiểm tra sức chứa ô', example: false })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiProperty({ type: [StockReceiptLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phiếu nhập phải có ít nhất 1 dòng' })
  @ArrayMaxSize(200, { message: 'Tối đa 200 dòng mỗi phiếu' })
  @ValidateNested({ each: true })
  @Type(() => StockReceiptLineDto)
  lines!: StockReceiptLineDto[];
}

export class ListStockLotsQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo SKU nội bộ' })
  @IsOptional()
  @IsString()
  master_sku?: string;

  @ApiPropertyOptional({ description: 'Lọc theo SKU sàn (không phân biệt hoa/thường)' })
  @IsOptional()
  @IsString()
  seller_sku?: string;

  @ApiPropertyOptional({ description: 'Mã lô' })
  @IsOptional()
  @IsString()
  lot_code?: string;

  @ApiPropertyOptional({ description: 'true = gồm cả lô đã xuất hết', enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  include_empty?: 'true' | 'false';
}
