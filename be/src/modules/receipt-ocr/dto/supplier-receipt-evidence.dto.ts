import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { IsReceiptPhotoUrls } from '../../proof-photos/is-proof-photo-urls.decorator';

/**
 * 11/11/2026 — phần "phiếu NCC" dùng chung cho mọi lần nhập vật tư từ nhà cung cấp:
 * POST /packaging-materials/:code/purchase, /packaging/boxes|materials|bags/:id/stock-in.
 * `document_photo_urls` bắt buộc (service trả PKG_PURCHASE_PHOTO_REQUIRED).
 */
export class SupplierReceiptEvidenceDto {
  @ApiPropertyOptional({ type: [String], description: 'BẮT BUỘC 1–3 URL ảnh phiếu NCC từ POST /proof-photos?purpose=receipt' })
  @IsOptional()
  @IsReceiptPhotoUrls()
  document_photo_urls?: string[];

  @ApiPropertyOptional({ example: 'Bao Bì Sài Gòn' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplier?: string;

  @ApiPropertyOptional({ description: '`scanId` của POST /receipt-ocr' })
  @IsOptional()
  @IsMongoId({ message: 'ocr_scan_id phải là ObjectId hợp lệ' })
  ocr_scan_id?: string;

  @ApiPropertyOptional({ description: 'Dòng số mấy trên phiếu (`lines[].index`)', example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  ocr_line_index?: number;

  @ApiPropertyOptional({ description: 'BẮT BUỘC khi quantity khác số trên phiếu' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  mismatch_reason?: string;
}
