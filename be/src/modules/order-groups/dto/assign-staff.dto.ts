import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional } from 'class-validator';

/**
 * `staff_id` OPTIONAL — không truyền = auto-assign (Least-Busy),
 * có truyền = gán tay (ghi đè kết quả auto nếu đã có).
 */
export class AssignStaffDto {
  @ApiPropertyOptional({ description: 'Không truyền = tự động gán theo Least-Busy. Truyền vào = gán tay.' })
  @IsOptional()
  @IsMongoId()
  staff_id?: string;
}
