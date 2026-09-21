import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

/**
 * UC-04 Alt Flow (Report 1): Packaging Staff không đồng ý phương án →
 * đổi sang thùng khác + ghi lý do.
 *
 * 🔄 ĐÃ ĐỔI (21/09/2026, mỗi đơn một kiện): chọn 1 ĐƠN (`order_id`) và
 * 1 thùng TRONG DANH MỤC (`box_code`) — engine xếp lại vào thùng đó và
 * validator phải chấp nhận, không nhận kích thước nhập tay tùy ý. Adjust
 * chỉ sửa phương án của đơn đó; group vẫn chờ `approve` để chốt.
 */
export const ADJUSTMENT_REASONS = [
  'PRODUCT_MORE_FRAGILE_THAN_EXPECTED',
  'RECOMMENDED_BOX_NOT_IN_STOCK',
  'OTHER',
] as const;

export class AdjustPackagingDto {
  @ApiProperty({ description: 'Đơn nguồn cần đổi thùng' })
  @IsMongoId({ message: 'order_id không đúng định dạng' })
  order_id!: string;

  @ApiProperty({ example: 'CARTON-M', description: 'Mã thùng trong danh mục /packaging/boxes' })
  @IsString({ message: 'box_code phải là chuỗi' })
  @MinLength(1, { message: 'box_code không được để trống' })
  box_code!: string;

  @ApiProperty({ enum: ADJUSTMENT_REASONS })
  @IsIn(ADJUSTMENT_REASONS, { message: 'adjustment_reason không hợp lệ' })
  adjustment_reason!: (typeof ADJUSTMENT_REASONS)[number];

  @ApiProperty({ required: false, description: 'Bắt buộc khi adjustment_reason = OTHER' })
  @IsOptional()
  @IsString({ message: 'adjustment_note phải là chuỗi' })
  adjustment_note?: string;

  @ApiProperty({ description: 'Version hiện tại của Order Group (Rule #18)', example: 0 })
  @IsNumber()
  @Min(0)
  expected_group_version!: number;
}
