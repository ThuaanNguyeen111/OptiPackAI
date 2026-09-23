import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

/**
 * 🔄 ĐÃ ĐỔI (21/09/2026): approve chỉ CHỐT PHƯƠNG ÁN cho mọi đơn trong
 * group. Cân thật chuyển sang bước `fulfillment/pack` (sau khi đóng xong).
 */
export class ApprovePackagingDto {
  @ApiProperty({
    required: false,
    deprecated: true,
    description: 'KHÔNG còn dùng — cân kiện thật nhập ở POST .../fulfillment/pack. Giữ để client cũ không lỗi.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  actual_measured_weight_kg?: number;

  @ApiProperty({ description: 'Version hiện tại của Order Group (Rule #18, Optimistic Concurrency)', example: 0 })
  @IsNumber()
  @Min(0)
  expected_group_version!: number;
}
