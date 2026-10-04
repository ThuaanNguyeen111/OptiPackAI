import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { DocumentsService } from './documents.service';

function sendPdf(res: Response, buffer: Buffer, filename: string): void {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${filename}"`,
    'Content-Length': String(buffer.length),
  });
  res.end(buffer);
}

/** Chứng từ in (PDF). Chỉ đọc. */
@ApiTags('Documents')
@ApiBearerAuth('JWT-auth')
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('packing-slip/:groupId')
  @Roles(
    UserRole.WAREHOUSE_STAFF,
    UserRole.PACKAGING_STAFF,
    UserRole.STORE_OWNER,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary:
      'Phiếu đóng gói (PDF) — mỗi đơn một trang: hàng, ô tích, các kiện/thùng.',
  })
  async packingSlip(
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ): Promise<void> {
    sendPdf(
      res,
      await this.documentsService.buildPackingSlip(groupId),
      `packing-slip-${groupId}.pdf`,
    );
  }

  @Get('shipping-label/:groupId')
  @Roles(
    UserRole.SHIPPING_COORDINATOR,
    UserRole.WAREHOUSE_STAFF,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary:
      'Nhãn vận chuyển (PDF) — mỗi kiện một nhãn, kèm barcode Code128 + QR. Cần đã có vận đơn.',
  })
  async shippingLabel(
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ): Promise<void> {
    sendPdf(
      res,
      await this.documentsService.buildShippingLabels(groupId),
      `shipping-label-${groupId}.pdf`,
    );
  }

  @Get('manifest/:tripCode')
  @Roles(UserRole.SHIPPING_COORDINATOR, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Bảng kê chuyến giao hàng (PDF) — mọi vận đơn cùng mã chuyến, có chỗ ký giao nhận.',
  })
  async manifest(
    @Param('tripCode') tripCode: string,
    @Res() res: Response,
  ): Promise<void> {
    sendPdf(
      res,
      await this.documentsService.buildManifest(tripCode),
      `manifest-${tripCode}.pdf`,
    );
  }
}
