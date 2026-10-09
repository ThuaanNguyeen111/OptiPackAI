import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** (09/10/2026) Trước đây đọc `@Body('refresh_token')` trần — thiếu/sai kiểu không bị chặn. */
export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token nhận lúc đăng nhập / lần làm mới trước.' })
  @IsString({ message: 'refresh_token phải là chuỗi' })
  @IsNotEmpty({ message: 'refresh_token không được để trống' })
  refresh_token!: string;
}
