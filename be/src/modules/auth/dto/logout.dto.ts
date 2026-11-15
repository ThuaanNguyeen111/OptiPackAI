import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { RefreshTokenDto } from './refresh-token.dto';

/** 10/11/2026 — đăng xuất kèm (tuỳ chọn) token push của máy để BE gỡ máy khỏi danh sách nhận push. */
export class LogoutDto extends RefreshTokenDto {
  @ApiPropertyOptional({ description: 'FCM token của máy đang đăng xuất (app mobile). Có thì BE gỡ máy này khỏi danh sách nhận push.' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  push_token?: string;
}
