import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token nhận được trong email quên mật khẩu' })
  @IsString()
  @IsNotEmpty({ message: 'Token không được để trống' })
  token!: string;

  @ApiProperty({ example: 'MatKhauMoi123@' })
  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải từ 8 ký tự trở lên' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Mật khẩu mới phải chứa chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  new_password!: string;
}
