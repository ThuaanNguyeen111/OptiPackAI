import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PackagingMaterial, PackagingMaterialSchema } from './schemas/packaging-material.schema';
import { PackagingMovement, PackagingMovementSchema } from './schemas/packaging-movement.schema';
import { PackagingMaterialsService } from './packaging-materials.service';
import { PackagingMaterialsController } from './packaging-materials.controller';
import { PackagingStockAlertService } from './packaging-stock-alert.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReceiptOcrModule } from '../receipt-ocr/receipt-ocr.module';

// G4 (27/09/2026). KHÔNG import module nào khác (chỉ đọc schema gợi ý đóng gói)
// -> order-groups và shipments import được mà không sinh phụ thuộc vòng.
// 08/11/2026: thêm NotificationsModule (chỉ phụ thuộc Mail + schema User, không vòng) cho cảnh báo tồn.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PackagingMaterial.name, schema: PackagingMaterialSchema },
      { name: PackagingMovement.name, schema: PackagingMovementSchema },
    ]),
    NotificationsModule,
    ReceiptOcrModule, // 11/11/2026 — ảnh phiếu NCC + OCR khi mua vật liệu
  ],
  controllers: [PackagingMaterialsController],
  providers: [PackagingMaterialsService, PackagingStockAlertService],
  exports: [PackagingMaterialsService, PackagingStockAlertService],
})
export class PackagingMaterialsModule {}
