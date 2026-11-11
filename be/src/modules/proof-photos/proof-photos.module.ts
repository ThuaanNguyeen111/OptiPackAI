import { Module } from '@nestjs/common';
import { ProofPhotosController } from './proof-photos.controller';
import { ProofPhotosService } from './proof-photos.service';

/** 10/11/2026 — Ảnh bằng chứng lưu trên Cloudinary (BE_MOBILE_CHECKLIST mục 4). */
@Module({
  controllers: [ProofPhotosController],
  providers: [ProofPhotosService],
})
export class ProofPhotosModule {}
