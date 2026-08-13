import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyMfaSetupDto {
  @ApiProperty({ example: '123456' })
  @IsNotEmpty({ message: 'Mã xác thực không được để trống' })
  @IsString()
  token!: string;
}
