import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 22/10/2026 — Bật/tắt nghỉ phép cho 1 nhân viên (`PATCH /users/:id/leave`).
 * Đang nghỉ: không được tự giao / giao tay việc lấy hàng, đóng gói.
 */
export class SetLeaveDto {
  @ApiProperty({ description: 'true = bắt đầu nghỉ phép, false = đi làm lại.' })
  @IsBoolean({ message: 'on_leave phải là true/false' })
  on_leave!: boolean;

  @ApiPropertyOptional({
    description: 'Nghỉ đến hết thời điểm này (ISO 8601) rồi tự tính là đi làm lại. Bỏ trống = nghỉ đến khi tắt tay. Bỏ qua khi on_leave=false.',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'until phải là thời điểm ISO 8601' })
  until?: string;

  @ApiPropertyOptional({ description: 'Ghi chú (VD "Nghỉ phép năm"), tối đa 200 ký tự.' })
  @IsOptional()
  @IsString({ message: 'note phải là chuỗi' })
  @MaxLength(200, { message: 'note tối đa 200 ký tự' })
  note?: string;
}
