import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

/**
 * UC-04 Alt Flow: Reject -> Order Group quay lại UC-03 để AI tính lại
 * (đúng transition AWAITING_PACKAGING đã vá vào allowed-status-
 * transitions.ts trước đó). Không cần lý do bắt buộc như Adjust — chỉ
 * cần version để giữ Rule #18.
 */
export class RejectPackagingDto {
  @ApiProperty({ description: 'Version hiện tại của Order Group (Rule #18)', example: 0 })
  @IsNumber()
  @Min(0)
  expected_group_version!: number;
}
