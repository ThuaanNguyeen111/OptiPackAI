import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProofPhotosController } from './proof-photos.controller';
import { ProofPhotosService } from './proof-photos.service';
import { ReceiptPhoto, ReceiptPhotoSchema } from './schemas/receipt-photo.schema';

/** 10/11/2026 — Ảnh bằng chứng lưu trên Cloudinary (BE_MOBILE_CHECKLIST mục 4). */
@Module({
  imports: [MongooseModule.forFeature([{ name: ReceiptPhoto.name, schema: ReceiptPhotoSchema }])],
  controllers: [ProofPhotosController],
  providers: [ProofPhotosService],
  exports: [ProofPhotosService],
})
export class ProofPhotosModule {}
