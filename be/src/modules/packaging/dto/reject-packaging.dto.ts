import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min, MinLength, MaxLength } from 'class-validator';

/**
 * UC-04 Alt Flow: Reject -> Order Group quay lại PICKED (đảo luồng
 * 20/09/2026 — hàng ĐÃ lấy xong, không cần lấy lại, chỉ tính lại gợi ý).
 * SỬA (21/09/2026, báo cáo thật từ FE) — rejection_reason giờ BẮT BUỘC
 * (trước đây không có field này) — Admin cần biết TẠI SAO gợi ý bị từ
 * chối để cải thiện, không chỉ biết "đã bị từ chối".
 */
export class RejectPackagingDto {
  @ApiProperty({
    description: 'Version hiện tại của Order Group (Rule #18)',
    example: 0,
  })
  @IsNumber()
  @Min(0)
  expected_group_version!: number;

  @ApiProperty({
    description: 'Lý do từ chối gợi ý đóng gói — BẮT BUỘC, 3-500 ký tự.',
    example: 'Kích thước thùng gợi ý quá nhỏ so với hàng thật đã lấy.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  rejection_reason!: string;
}
