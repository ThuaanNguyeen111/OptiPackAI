import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** 10/11/2026 — App mobile gửi id_token lấy từ google_sign_in (serverClientId = client Web của BE). */
export class GoogleMobileLoginDto {
  @ApiProperty({ description: 'Google ID token (JWT) app nhận sau khi người dùng chọn tài khoản Google' })
  @IsString({ message: 'id_token phải là chuỗi' })
  @IsNotEmpty({ message: 'id_token không được để trống' })
  @MaxLength(4096)
  id_token!: string;
}
