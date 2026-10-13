import {
  BadRequestException, Controller, Get, NotFoundException, Param, Post, Res,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Model, Types } from 'mongoose';
import { StorefrontImage, StorefrontImageDocument } from './schemas/storefront.schema';
import { StorefrontAdminGuard, StorefrontAdminOriginGuard } from './storefront-admin.guard';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
interface UploadedImage { buffer: Buffer; mimetype: string; size: number }

export function imageContentType(data: Buffer): string | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

@ApiTags('Storefront Images')
@Controller('storefront')
export class StorefrontImagesController {
  constructor(@InjectModel(StorefrontImage.name) private readonly images: Model<StorefrontImageDocument>) {}

  @Post('admin/images') @UseGuards(StorefrontAdminOriginGuard, StorefrontAdminGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  async upload(@UploadedFile() file?: UploadedImage): Promise<{ url: string }> {
    if (!file || file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Chọn ảnh JPEG, PNG hoặc WebP, tối đa 5 MB');
    }
    const contentType = imageContentType(file.buffer);
    if (!contentType || contentType !== file.mimetype) {
      throw new BadRequestException('Nội dung ảnh phải đúng định dạng JPEG, PNG hoặc WebP');
    }
    const image = await this.images.create({ data: file.buffer, content_type: contentType });
    return { url: `/storefront/images/${image.id}` };
  }

  @Get('images/:id')
  async image(@Param('id') id: string, @Res() response: Response): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Không tìm thấy ảnh');
    const image = await this.images.findById(id);
    if (!image) throw new NotFoundException('Không tìm thấy ảnh');
    response.set({
      'Content-Type': image.content_type, 'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin', 'Cache-Control': 'public, max-age=31536000, immutable',
    }).send(image.data);
  }
}
