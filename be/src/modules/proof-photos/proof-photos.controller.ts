import { Controller, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { MAX_PROOF_PHOTO_BYTES, MAX_PROOF_PHOTOS } from './proof-photo.util';
import { ProofPhotosService, type ProofPhotoFile, type UploadedProofPhoto } from './proof-photos.service';

/** 10/11/2026 — Ảnh bằng chứng (BE_MOBILE_CHECKLIST mục 4). */
@ApiTags('Proof Photos')
@ApiBearerAuth('JWT-auth')
@Controller('proof-photos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProofPhotosController {
  constructor(private readonly proofPhotos: ProofPhotosService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF, UserRole.SHIPPING_COORDINATOR)
  @UseInterceptors(FilesInterceptor('files', MAX_PROOF_PHOTOS, { limits: { fileSize: MAX_PROOF_PHOTO_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @ApiOperation({
    summary:
      'Gửi 1–3 ảnh bằng chứng (JPG/PNG/WebP/HEIC, mỗi ảnh ≤ 10 MB, multipart field "files"). Trả URL để gửi kèm `photo_urls` ở: POST /shipments/:id/deliver (đơn shop tự giao: bắt buộc ≥ 1 ảnh), /fail, POST /returns/:id/inspect, POST /order-groups/:groupId/packing-plan/report-issue. Ảnh được thu nhỏ ≤ 1600 px và lưu JPG. Chưa cấu hình Cloudinary → 503 PROOF_PHOTO_NOT_CONFIGURED.',
  })
  async upload(@UploadedFiles() files?: ProofPhotoFile[]): Promise<{ photos: UploadedProofPhoto[] }> {
    return { photos: await this.proofPhotos.upload(files ?? []) };
  }
}
