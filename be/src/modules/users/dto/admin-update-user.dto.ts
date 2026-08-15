import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserRole } from '../../../common/enums/user-role.enum';

//!=============================================
// FIX #6: Admin sửa thông tin 1 user ĐÃ TỒN TẠI (khác CreateUserDto — không có
// email, vì đổi email ảnh hưởng tới đăng nhập/OAuth, cần luồng riêng cẩn thận
// hơn nếu thực sự cần, KHÔNG gộp chung vào đây để tránh sai sót).
//!=============================================
export class AdminUpdateUserDto {
  @ApiProperty({ required: false, example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole, { message: 'Vai trò không hợp lệ' })
  role?: UserRole;

  @ApiProperty({ required: false, example: '0912345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiProperty({ required: false, example: 'NV-045' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  employee_code?: string;

  @ApiProperty({ required: false, example: 'Kho A' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;
}
