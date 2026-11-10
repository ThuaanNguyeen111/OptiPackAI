import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { DEVICE_PLATFORMS, type DevicePlatform } from '../schemas/device-token.schema';

/** 10/11/2026 — App gửi token Firebase ngay sau khi đăng nhập (và khi Firebase đổi token). */
export class RegisterDeviceDto {
  @ApiProperty({ description: 'FCM registration token lấy từ firebase_messaging trên máy' })
  @IsString()
  @Length(20, 4096, { message: 'token không hợp lệ' })
  token!: string;

  @ApiProperty({ enum: DEVICE_PLATFORMS, example: 'android' })
  @IsIn(DEVICE_PLATFORMS, { message: 'platform chỉ nhận android hoặc ios' })
  platform!: DevicePlatform;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  app_version?: string;
}
