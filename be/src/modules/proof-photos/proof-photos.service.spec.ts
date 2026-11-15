import axios from 'axios';
import { ProofPhotosService } from './proof-photos.service';
import { PROOF_PHOTO_ERROR_CODES as E } from './proof-photos.errors';
import { MAX_PROOF_PHOTO_BYTES } from './proof-photo.util';

jest.mock('axios');
const mockedAxios = jest.mocked(axios);

describe('ProofPhotosService.upload', () => {
  const env = { ...process.env };
  const jpeg = (): { buffer: Buffer; size: number } => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    return { buffer, size: buffer.length };
  };
  let service: ProofPhotosService;

  beforeEach(() => {
    process.env = { ...env, CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'key-1', CLOUDINARY_API_SECRET: 'secret-1' };
    service = new ProofPhotosService();
    mockedAxios.post.mockReset();
    mockedAxios.isAxiosError.mockReturnValue(false);
  });

  afterAll(() => {
    process.env = env;
  });

  it('chưa cấu hình Cloudinary → 503 PROOF_PHOTO_NOT_CONFIGURED', async () => {
    delete process.env.CLOUDINARY_API_SECRET;
    await expect(service.upload([jpeg()])).rejects.toMatchObject({ errorCode: E.NOT_CONFIGURED });
  });

  it('kiểm số ảnh, dung lượng, định dạng trước khi gửi', async () => {
    await expect(service.upload([])).rejects.toMatchObject({ errorCode: E.NO_FILE });
    await expect(service.upload([jpeg(), jpeg(), jpeg(), jpeg()])).rejects.toMatchObject({ errorCode: E.TOO_MANY });
    await expect(service.upload([{ buffer: jpeg().buffer, size: MAX_PROOF_PHOTO_BYTES + 1 }])).rejects.toMatchObject({ errorCode: E.TOO_LARGE });
    const pdf = Buffer.from('%PDF-1.7', 'ascii');
    await expect(service.upload([{ buffer: pdf, size: pdf.length }])).rejects.toMatchObject({ errorCode: E.INVALID_TYPE });
    expect(mockedAxios.post.mock.calls).toHaveLength(0);
  });

  it('gửi có chữ ký vào đúng thư mục, không gửi API secret, trả URL', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/optipack/proof/a.jpg', public_id: 'optipack/proof/a', width: 800, height: 600, bytes: 1234 },
    });
    const photos = await service.upload([jpeg()]);
    expect(photos).toEqual([{ url: 'https://res.cloudinary.com/demo/image/upload/v1/optipack/proof/a.jpg', publicId: 'optipack/proof/a', width: 800, height: 600, bytes: 1234 }]);
    const [url, body] = mockedAxios.post.mock.calls[0] as [string, string];
    expect(url).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    const form = new URLSearchParams(body);
    expect(form.get('folder')).toBe('optipack/proof');
    expect(form.get('api_key')).toBe('key-1');
    expect(form.get('signature')).toMatch(/^[0-9a-f]{40}$/);
    expect(form.get('file')?.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(body).not.toContain('secret-1');
  });

  it('Cloudinary lỗi → 502 PROOF_PHOTO_UPLOAD_FAILED', async () => {
    mockedAxios.post.mockRejectedValue(new Error('network'));
    await expect(service.upload([jpeg()])).rejects.toMatchObject({ errorCode: E.UPLOAD_FAILED });
  });
});
