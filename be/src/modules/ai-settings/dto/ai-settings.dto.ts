import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import {
  AI_PROVIDER_VALUES,
  AI_TIMEOUT_MAX_MS,
  AI_TIMEOUT_MIN_MS,
  type AiProviderKey,
} from '../ai-settings.presets';

const URL_OPTS = { require_tld: false, require_protocol: true, protocols: ['http', 'https'] };

/** Lưu cấu hình AI. Trường không gửi giữ nguyên. */
export class UpdateAiSettingsDto {
  @ApiPropertyOptional({ enum: AI_PROVIDER_VALUES })
  @IsOptional()
  @IsIn(AI_PROVIDER_VALUES, { message: 'Nhà cung cấp AI không hợp lệ' })
  provider?: AiProviderKey;

  @ApiPropertyOptional({ description: 'Bỏ trống = URL mặc định của nhà cung cấp. Bắt buộc với "custom".' })
  @IsOptional()
  @IsUrl(URL_OPTS, { message: 'base_url phải là URL http(s)' })
  @MaxLength(300)
  base_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiPropertyOptional({ description: 'null hoặc rỗng = dùng chung model chính.' })
  @IsOptional()
  @ValidateIf((o: UpdateAiSettingsDto) => o.vision_model !== null)
  @IsString()
  @MaxLength(200)
  vision_model?: string | null;

  @ApiPropertyOptional({ description: 'Không gửi = giữ key cũ. null = xoá key (tắt AI).' })
  @IsOptional()
  @ValidateIf((o: UpdateAiSettingsDto) => o.api_key !== null)
  @IsString()
  @MaxLength(500)
  api_key?: string | null;

  @ApiPropertyOptional({ minimum: AI_TIMEOUT_MIN_MS, maximum: AI_TIMEOUT_MAX_MS })
  @IsOptional()
  @IsInt()
  @Min(AI_TIMEOUT_MIN_MS)
  @Max(AI_TIMEOUT_MAX_MS)
  timeout_ms?: number;
}

/** Thử kết nối với giá trị đang nhập (chưa lưu). api_key bỏ trống = dùng key đã lưu. */
export class TestAiSettingsDto {
  @ApiPropertyOptional({ enum: AI_PROVIDER_VALUES })
  @IsOptional()
  @IsIn(AI_PROVIDER_VALUES, { message: 'Nhà cung cấp AI không hợp lệ' })
  provider?: AiProviderKey;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(URL_OPTS, { message: 'base_url phải là URL http(s)' })
  @MaxLength(300)
  base_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  api_key?: string;
}

/** Nhập lại mật khẩu tài khoản đang đăng nhập để xem API key thật. */
export class RevealAiKeyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Hãy nhập mật khẩu' })
  @MaxLength(200)
  password!: string;
}
