import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsProofPhotoUrls } from './is-proof-photo-urls.decorator';

class Dto {
  @IsProofPhotoUrls()
  photo_urls?: unknown;
}

describe('IsProofPhotoUrls', () => {
  const env = { ...process.env };
  const url = (n: number): string => `https://res.cloudinary.com/demo/image/upload/v1/optipack/proof/p${String(n)}.jpg`;
  const errors = async (value: unknown): Promise<number> => (await validate(plainToInstance(Dto, { photo_urls: value }))).length;

  beforeEach(() => {
    process.env = { ...env, CLOUDINARY_CLOUD_NAME: 'demo' };
  });
  afterAll(() => {
    process.env = env;
  });

  it('không gửi / mảng rỗng / tối đa 3 URL đúng cloud → hợp lệ', async () => {
    expect(await errors(undefined)).toBe(0);
    expect(await errors([])).toBe(0);
    expect(await errors([url(1), url(2), url(3)])).toBe(0);
  });

  it('quá 3 ảnh, URL ngoài, không phải mảng → lỗi', async () => {
    expect(await errors([url(1), url(2), url(3), url(4)])).toBe(1);
    expect(await errors(['https://evil.com/a.jpg'])).toBe(1);
    expect(await errors(url(1))).toBe(1);
  });

  it('chưa cấu hình cloud name mà có URL → lỗi', async () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    expect(await errors([url(1)])).toBe(1);
  });
});
