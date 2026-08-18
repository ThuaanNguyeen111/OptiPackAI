import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ required: false, example: '0912345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ required: false, example: '123 Nguyễn Văn Cừ, Q5, TP.HCM' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiProperty({ required: false, description: 'URL ảnh đại diện (đã upload sẵn qua dịch vụ khác)' })
  @IsOptional()
  @IsString()
  avatar?: string;
}
