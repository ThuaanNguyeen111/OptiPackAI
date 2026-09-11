import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

const PRIORITIES = ['normal', 'express'] as const;

export class SetPriorityDto {
  @ApiProperty({ enum: PRIORITIES })
  @IsIn(PRIORITIES)
  order_priority!: (typeof PRIORITIES)[number];

  @ApiPropertyOptional({
    description: 'Số giờ hành chính cho tới hạn đóng gói — CHỈ áp dụng khi order_priority=express (mặc định 4h)',
    example: 4,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  deadline_hours?: number;
}
