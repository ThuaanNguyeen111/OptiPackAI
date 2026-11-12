import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { ScanReceiptDto } from './dto/scan-receipt.dto';
import { ReceiptOcrService, type ReceiptOcrScanView } from './receipt-ocr.service';

/** 11/11/2026 — đọc phiếu NCC bằng AI để đối chiếu số lượng khi nhập kho / mua vật liệu. */
@ApiTags('Receipt OCR')
@ApiBearerAuth('JWT-auth')
@Controller('receipt-ocr')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReceiptOcrController {
  constructor(private readonly receiptOcr: ReceiptOcrService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({
    summary:
      '🆕 Đọc ảnh phiếu NCC (OCR) → các dòng { index, text, code, quantity, unit } + scanId. KHÔNG cộng tồn. Gửi `ocr_scan_id` + `ocr_line_index` từng dòng khi lưu phiếu nhập / mua vật liệu để BE đối chiếu. Lỗi: 503 WH_RECEIPT_OCR_UNAVAILABLE, 502 WH_RECEIPT_OCR_FAILED → nhập tay.',
  })
  async scan(@Body() dto: ScanReceiptDto, @CurrentUser() user: AuthenticatedUser): Promise<ReceiptOcrScanView> {
    return this.receiptOcr.scan(dto.photo_urls, user.userId);
  }
}
