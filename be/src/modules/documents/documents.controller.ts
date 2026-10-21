import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { DocumentsService } from './documents.service';
import { BinLabelsQueryDto, SkuLabelsQueryDto } from './dto/document-query.dto';

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

  // ------------------------------------------------------------------ (21/10/2026) kho

  @Get('bin-labels/:warehouseId')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Tem ô kệ 70×40 mm (PDF): mã ô cỡ lớn + Code128 = bin_code để quét khi lấy/cất hàng. Lọc zone_id hoặc bin_ids; không lọc = cả kho. Tối đa 500 tem/lần.',
  })
  async binLabels(
    @Param('warehouseId') warehouseId: string,
    @Query() q: BinLabelsQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    sendPdf(
      res,
      await this.documentsService.buildBinLabels(warehouseId, {
        zoneId: q.zone_id,
        binIds: q.bin_ids ? q.bin_ids.split(',') : undefined,
        copies: q.copies ?? 1,
      }),
      `bin-labels-${warehouseId}.pdf`,
    );
  }

  @Get('sku-labels')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Tem SKU 50×30 mm (PDF): tên + Code128 của mã SKU (quét được ở lấy hàng và đóng gói). codes = danh sách mã cách dấu phẩy. Tối đa 500 tem/lần.',
  })
  async skuLabels(@Query() q: SkuLabelsQueryDto, @Res() res: Response): Promise<void> {
    sendPdf(res, await this.documentsService.buildSkuLabels(q.codes.split(','), q.copies ?? 1), 'sku-labels.pdf');
  }

  @Get('picking-list/:warehouseId/:groupId')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Danh sách lấy hàng in giấy (PDF A4): thứ tự ô kệ theo lộ trình, lô cần xuất trước (FIFO), số cần lấy, ô tích. Cùng dữ liệu GET /warehouse/:warehouseId/picking-list/:groupId.',
  })
  async pickingList(
    @Param('warehouseId') warehouseId: string,
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ): Promise<void> {
    sendPdf(res, await this.documentsService.buildPickingList(warehouseId, groupId), `picking-list-${groupId}.pdf`);
  }

  @Get('stock-receipt/:warehouseId/:receiptId')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Phiếu nhập kho in giấy (PDF A4): mã lô, ngày nhập, nhà cung cấp, từng dòng SKU × ô × số lượng, chỗ ký người giao / thủ kho / người lập.',
  })
  async stockReceipt(
    @Param('warehouseId') warehouseId: string,
    @Param('receiptId') receiptId: string,
    @Res() res: Response,
  ): Promise<void> {
    sendPdf(res, await this.documentsService.buildStockReceipt(warehouseId, receiptId), `stock-receipt-${receiptId}.pdf`);
  }
}
