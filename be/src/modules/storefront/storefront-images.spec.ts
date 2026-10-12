import { BadRequestException } from '@nestjs/common';
import type { Model } from 'mongoose';
import { StorefrontImageDocument } from './schemas/storefront.schema';
import { imageContentType, MAX_IMAGE_BYTES, StorefrontImagesController } from './storefront-images.controller';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

describe('storefront image upload', () => {
  const create = jest.fn().mockResolvedValue({ id: 'image-id' });
  const controller = new StorefrontImagesController({ create } as unknown as Model<StorefrontImageDocument>);
  beforeEach(() => create.mockClear());

  it('recognizes raster image signatures and rejects HTML or SVG', () => {
    expect(imageContentType(png)).toBe('image/png');
    expect(imageContentType(Buffer.from([255, 216, 255, 224]))).toBe('image/jpeg');
    expect(imageContentType(Buffer.from('RIFF0000WEBP'))).toBe('image/webp');
    expect(imageContentType(Buffer.from('<svg onload="alert(1)"/>'))).toBeNull();
    expect(imageContentType(Buffer.alloc(0))).toBeNull();
  });

  it('stores bytes and returns a public image URL', async () => {
    await expect(controller.upload({ buffer: png, mimetype: 'image/png', size: png.length })).resolves.toEqual({ url: '/storefront/images/image-id' });
    expect(create).toHaveBeenCalledWith({ data: png, content_type: 'image/png' });
  });

  it('rejects missing, oversized and mislabeled files without saving', async () => {
    await expect(controller.upload()).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.upload({ buffer: png, mimetype: 'image/png', size: MAX_IMAGE_BYTES + 1 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.upload({ buffer: png, mimetype: 'image/jpeg', size: png.length })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.upload({ buffer: Buffer.from('<html>'), mimetype: 'image/png', size: 6 })).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
});
