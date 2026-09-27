import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { TransitionOrderGroupDto } from './transition-order-group.dto';
import { MaterialUsedDto } from '../../packaging-materials/dto/packaging-material.dto';

/** Body của POST /order-groups/:id/fulfillment/pack. `materials_used` là tùy chọn. */
export class PackOrderGroupDto extends TransitionOrderGroupDto {
  @ApiPropertyOptional({
    type: [MaterialUsedDto],
    description: 'Vật liệu nhân viên THỰC TẾ đã dùng. Không gửi = trừ theo gợi ý đóng gói.',
  })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => MaterialUsedDto)
  materials_used?: MaterialUsedDto[];
}
