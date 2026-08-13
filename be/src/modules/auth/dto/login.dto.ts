import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'staff@optipackai.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu phải từ 6 ký tự trở lên' })
  password!: string;

  //!=============================================
  // FIX #17: Mã TOTP 6 số — bắt buộc nếu tài khoản Admin đã bật MFA,
  // bỏ trống với các role khác hoặc lần login đầu chưa bật MFA.
  //!=============================================
  @ApiProperty({ required: false, example: '123456' })
  @IsOptional()
  @IsString()
  mfa_token?: string;
}
