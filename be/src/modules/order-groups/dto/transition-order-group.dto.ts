import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/**
 * Body dùng CHUNG cho cả 5 endpoint fulfillment (pick/pack/ship/deliver/
 * return) — FE PHẢI gửi kèm `expected_version` (lấy từ field `version`
 * trong response GET /order-groups/:id gần nhất) để tầng Optimistic
 * Concurrency (Rule #18, CLAUDE.md) phát hiện đúng lúc dữ liệu đã đổi.
 */
export class TransitionOrderGroupDto {
  @ApiProperty({
    description:
      'Giá trị "version" đọc được từ lần GET /order-groups/:id gần nhất — dùng để phát hiện xung đột nếu người khác đã sửa group này trước bạn.',
    example: 0,
  })
  @IsInt()
  @Min(0)
  expected_version!: number;
}
