import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Min } from 'class-validator';

/**
 * Hướng Y (đã chốt với user 2026-09-10): PARTIAL_NEEDS_REVIEW KHÔNG
 * tự động đi tiếp — Packaging Staff/Admin phải quyết định:
 *  - approve: true  -> tiếp tục với phần hàng có sẵn (chuyển PICKED)
 *  - approve: false -> hủy, quay lại AWAITING_PACKAGING (làm lại từ đầu)
 */
export class DecidePartialDto {
  @ApiProperty({ description: 'true = đồng ý tiếp tục với phần có sẵn, false = hủy làm lại' })
  @IsBoolean()
  approve!: boolean;

  @ApiProperty({ description: 'Version hiện tại của Order Group (Rule #18)', example: 2 })
  @IsInt()
  @Min(0)
  expected_version!: number;
}
