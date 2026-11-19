import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyMfaSetupDto {
  @ApiProperty({ example: '123456' })
  @IsNotEmpty({ message: 'Mã xác thực không được để trống' })
  @IsString()
  token!: string;
}

/** AOFP-333 — MFA đang bật thì cài lại phải gửi 1 trong 2 trường. */
export class SetupMfaDto {
  @ApiProperty({ required: false, example: '123456', description: 'Mã TOTP hiện tại (khi MFA đang bật)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  current_token?: string;

  @ApiProperty({ required: false, description: 'Mật khẩu hiện tại (thay cho mã, khi MFA đang bật)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;
}

/** AOFP-333 — FE đổi mã 1 lần (60 giây) trên URL redirect lấy kết quả đăng nhập Google. */
export class GoogleLoginCodeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'login_code không được để trống' })
  @MaxLength(200)
  login_code!: string;
}

/** AOFP-333 — bước nhập mã sau đăng nhập Google khi tài khoản bật MFA. */
export class GoogleMfaLoginDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'mfa_challenge không được để trống' })
  @MaxLength(200)
  mfa_challenge!: string;

  @ApiProperty({ required: false, example: '123456' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  mfa_token?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  backup_code?: string;
}
