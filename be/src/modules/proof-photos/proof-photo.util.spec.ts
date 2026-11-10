import { isOwnProofPhotoUrl, proofPhotoFormat, readCloudinaryConfig, signCloudinaryParams } from './proof-photo.util';

describe('proof-photo.util', () => {
  it('nhận diện định dạng theo byte đầu file', () => {
    expect(proofPhotoFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(proofPhotoFormat(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('png');
    expect(proofPhotoFormat(Buffer.from('RIFF0000WEBPVP8 ', 'ascii'))).toBe('webp');
    expect(proofPhotoFormat(Buffer.from('\0\0\0\x18ftypheic\0\0\0\0', 'binary'))).toBe('heic');
    expect(proofPhotoFormat(Buffer.from('%PDF-1.7 ....', 'ascii'))).toBeNull();
    expect(proofPhotoFormat(Buffer.from('\0\0\0\x18ftypmp42', 'binary'))).toBeNull(); // video MP4
  });

  it('chữ ký Cloudinary đúng ví dụ trong tài liệu Cloudinary', () => {
    const sig = signCloudinaryParams(
      { eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: '1315060510' },
      'abcd',
    );
    expect(sig).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('chỉ nhận URL ảnh bằng chứng trên đúng cloud và đúng thư mục', () => {
    const ok = 'https://res.cloudinary.com/bfaxotyp/image/upload/v1731200000/optipack/proof/abc_123.jpg';
    expect(isOwnProofPhotoUrl(ok, 'bfaxotyp')).toBe(true);
    expect(isOwnProofPhotoUrl('https://res.cloudinary.com/bfaxotyp/image/upload/optipack/proof/x.jpg', 'bfaxotyp')).toBe(true);
    expect(isOwnProofPhotoUrl(ok, 'cloud-khac')).toBe(false);
    expect(isOwnProofPhotoUrl('http://res.cloudinary.com/bfaxotyp/image/upload/v1/optipack/proof/a.jpg', 'bfaxotyp')).toBe(false);
    expect(isOwnProofPhotoUrl('https://res.cloudinary.com/bfaxotyp/image/upload/v1/khac/a.jpg', 'bfaxotyp')).toBe(false);
    expect(isOwnProofPhotoUrl('https://evil.com/bfaxotyp/image/upload/v1/optipack/proof/a.jpg', 'bfaxotyp')).toBe(false);
    expect(isOwnProofPhotoUrl('https://res.cloudinary.com/bfaxotyp/image/upload/v1/optipack/proof/../a.jpg', 'bfaxotyp')).toBe(false);
  });

  it('thiếu biến môi trường → chưa cấu hình', () => {
    expect(readCloudinaryConfig({ CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k' })).toBeNull();
    expect(readCloudinaryConfig({ CLOUDINARY_CLOUD_NAME: ' c ', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' })).toEqual({
      cloudName: 'c', apiKey: 'k', apiSecret: 's',
    });
  });
});
