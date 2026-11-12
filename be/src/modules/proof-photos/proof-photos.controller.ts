import { Controller, HttpStatus, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AppException } from '../../common/exceptions/app-exception';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { MAX_PROOF_PHOTO_BYTES, MAX_PROOF_PHOTOS, PROOF_PHOTO_FOLDER, RECEIPT_PHOTO_FOLDER } from './proof-photo.util';
import { PROOF_PHOTO_ERROR_CODES } from './proof-photos.errors';
import { ProofPhotosService, type ProofPhotoFile, type UploadedProofPhoto } from './proof-photos.service';
import { Features } from '../role-permissions/feature-scope';

/** 10/11/2026 — Ảnh bằng chứng (BE_MOBILE_CHECKLIST mục 4). */
@ApiTags('Proof Photos')
@ApiBearerAuth('JWT-auth')
@Features('packing', 'picking', 'shipping', 'order_groups', 'returns')
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
  @ApiQuery({ name: 'purpose', required: false, enum: ['proof', 'receipt'], description: '11/11/2026 — `receipt` = ảnh phiếu nhập/phiếu giao hàng NCC (gửi kèm `document_photo_urls` khi nhập kho, mua vật liệu)' })
  async upload(@UploadedFiles() files?: ProofPhotoFile[], @Query('purpose') purpose?: string): Promise<{ photos: UploadedProofPhoto[] }> {
    if (purpose !== undefined && purpose !== 'proof' && purpose !== 'receipt') {
      throw new AppException(PROOF_PHOTO_ERROR_CODES.INVALID_PURPOSE, 'purpose chỉ nhận "proof" hoặc "receipt".', HttpStatus.BAD_REQUEST);
    }
    const folder = purpose === 'receipt' ? RECEIPT_PHOTO_FOLDER : PROOF_PHOTO_FOLDER;
    return { photos: await this.proofPhotos.upload(files ?? [], folder) };
  }
}
