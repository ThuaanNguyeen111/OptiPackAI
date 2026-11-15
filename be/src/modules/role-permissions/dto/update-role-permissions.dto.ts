import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn } from 'class-validator';
import { FEATURE_VALUES, type Feature } from '../../../common/enums/feature.enum';

export class UpdateRolePermissionsDto {
  @ApiProperty({ enum: FEATURE_VALUES, isArray: true, description: 'Các trang được bật cho role (danh sách đầy đủ, không phải phần thêm).' })
  @IsArray()
  @ArrayUnique()
  @IsIn(FEATURE_VALUES, { each: true, message: 'features chứa trang không tồn tại' })
  features!: Feature[];
}
