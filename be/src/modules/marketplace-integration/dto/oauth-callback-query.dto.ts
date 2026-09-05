import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * ===================================================================
 * DTO — QUERY PARAMS KHI SÀN REDIRECT VỀ callback
 * ===================================================================
 * `shop_id` optional vì: TikTok/Lazada tự trả shop info ngay trong
 * response đổi token (không cần từ query), Tiki xác định qua chính
 * access token — không sàn nào BẮT BUỘC cần field này từ query, nhưng
 * giữ optional để tương thích nếu sau này thêm sàn cần.
 * ===================================================================
 */
export class OAuthCallbackQueryDto {
  @ApiProperty({ description: 'Authorization code do sàn trả về sau khi seller approve' })
  @IsString()
  @IsNotEmpty({ message: 'Thiếu authorization code trong callback.' })
  code!: string;

  @ApiProperty({ description: 'State đã tạo lúc bắt đầu luồng connect — dùng để chống CSRF' })
  @IsString()
  @IsNotEmpty({ message: 'Thiếu state trong callback — nghi ngờ CSRF, từ chối xử lý.' })
  state!: string;

  @ApiProperty({ required: false, description: 'Shop ID trên sàn (nếu sàn trả kèm trong callback)' })
  @IsOptional()
  @IsString()
  shop_id?: string;
}
