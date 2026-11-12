import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReceiptOcrController } from './receipt-ocr.controller';
import { ReceiptOcrService } from './receipt-ocr.service';
import { ReceiptOcrScan, ReceiptOcrScanSchema } from './schemas/receipt-ocr-scan.schema';

/** 11/11/2026 — OCR phiếu NCC, dùng chung cho phiếu nhập kho (warehouse) và mua vật liệu (packaging-materials). */
@Module({
  imports: [MongooseModule.forFeature([{ name: ReceiptOcrScan.name, schema: ReceiptOcrScanSchema }]), NotificationsModule],
  controllers: [ReceiptOcrController],
  providers: [ReceiptOcrService],
  exports: [ReceiptOcrService],
})
export class ReceiptOcrModule {}
