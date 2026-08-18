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
  //  Mã TOTP 6 số — bắt buộc nếu tài khoản Admin đã bật MFA,
  // bỏ trống với các role khác hoặc lần login đầu chưa bật MFA.
  //!=============================================
  @ApiProperty({ required: false, example: '123456' })
  @IsOptional()
  @IsString()
  mfa_token?: string;

  //!=============================================
  // Nếu FE đã lưu device_token từ lần verify MFA thành công trước đó
  // (xem trusted-device.schema.ts) và gửi kèm ở lần login sau -> server bỏ qua
  // yêu cầu mfa_token, miễn device_token còn hạn 30 ngày và khớp đúng user.
  //!=============================================
  @ApiProperty({ required: false, description: 'Token thiết bị tin cậy — bỏ qua nếu có mfa_token' })
  @IsOptional()
  @IsString()
  device_token?: string;

  //!=============================================
  // Thay vì mfa_token (mã TOTP 6 số từ app Authenticator), user có
  // thể dùng 1 trong 10 mã dự phòng 8 số đã lưu 
  //!=============================================
  @ApiProperty({ required: false, example: '48213096', description: 'Mã dự phòng MFA (dùng khi mất điện thoại)' })
  @IsOptional()
  @IsString()
  backup_code?: string;
}
