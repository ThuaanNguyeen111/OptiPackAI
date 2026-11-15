import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray } from 'class-validator';
import { IsReceiptPhotoUrls } from '../../proof-photos/is-proof-photo-urls.decorator';

export class ScanReceiptDto {
  @ApiProperty({ type: [String], description: '1–3 URL ảnh phiếu lấy từ POST /proof-photos?purpose=receipt (nhiều ảnh = nhiều trang của 1 phiếu)' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Gửi ít nhất 1 ảnh phiếu' })
  @IsReceiptPhotoUrls()
  photo_urls!: string[];
}
