import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

/**
 * "Measure package weight" (Phieu_FA26SE036.docx, Packaging Staff) —
 * cân THẬT sau khi đóng gói xong, khác estimated_weight lý thuyết của
 * AI/fallback. Bắt buộc nhập lúc Approve — không có bước Approve nào
 * bỏ qua việc cân thật.
 */
export class ApprovePackagingDto {
  @ApiProperty({ description: 'Cân nặng THẬT đo được sau khi đóng gói (kg)', example: 0.45 })
  @IsNumber()
  @Min(0)
  actual_measured_weight_kg!: number;

  @ApiProperty({ description: 'Version hiện tại của Order Group (Rule #18, Optimistic Concurrency)', example: 0 })
  @IsNumber()
  @Min(0)
  expected_group_version!: number;
}
