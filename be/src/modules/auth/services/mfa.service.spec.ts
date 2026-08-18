import { authenticator } from 'otplib';
import { MfaService } from './mfa.service';

//!=============================================
// FIX #38: KHÔNG mock otplib/bcrypt ở đây - chạy thuật toán TOTP/hash THẬT,
// vì đây chính là phần "lõi mật mã" cần verify hoạt động đúng thật sự, không
// phải chỉ verify code có "gọi đúng hàm" (khác auth.service.spec.ts, nơi mock
// MfaService vì ở đó chỉ cần test LOGIC ĐIỀU KHIỂN của AuthService, không
// cần chạy lại thuật toán TOTP mỗi lần).
//!=============================================
describe('MfaService', () => {
  let service: MfaService;

  beforeEach(() => {
    service = new MfaService();
  });

  describe('generateSecret', () => {
    it('sinh ra secret + otpauthUrl đúng định dạng, chứa đúng email và tên app', () => {
      const result = service.generateSecret('staff@optipackai.com');

      expect(result.secret).toBeTruthy();
      expect(result.otpauthUrl).toContain('otpauth://totp/');
      expect(result.otpauthUrl).toContain('OptiPackAI');
      expect(result.otpauthUrl).toContain(encodeURIComponent('staff@optipackai.com'));
    });

    it('mỗi lần gọi sinh ra secret KHÁC NHAU (ngẫu nhiên thật)', () => {
      const first = service.generateSecret('a@optipackai.com');
      const second = service.generateSecret('a@optipackai.com');
      expect(first.secret).not.toBe(second.secret);
    });
  });

  describe('verifyToken', () => {
    it('mã TOTP đúng (tự sinh tại đúng thời điểm verify) -> true', () => {
      const { secret } = service.generateSecret('staff@optipackai.com');
      const validToken = authenticator.generate(secret);

      expect(service.verifyToken(validToken, secret)).toBe(true);
    });

    it('mã TOTP sai -> false', () => {
      const { secret } = service.generateSecret('staff@optipackai.com');
      expect(service.verifyToken('000000', secret)).toBe(false);
    });

    it('secret sai (không khớp mã) -> false', () => {
      const { secret } = service.generateSecret('staff@optipackai.com');
      const validToken = authenticator.generate(secret);
      const { secret: otherSecret } = service.generateSecret('b@optipackai.com');

      expect(service.verifyToken(validToken, otherSecret)).toBe(false);
    });
  });

  describe('generateBackupCodes', () => {
    it('sinh đúng 10 mã, mỗi mã 8 chữ số, không mã nào trùng nhau', async () => {
      const { plainCodes } = await service.generateBackupCodes();

      expect(plainCodes).toHaveLength(10);
      plainCodes.forEach((code) => {
        expect(code).toMatch(/^\d{8}$/);
      });
      expect(new Set(plainCodes).size).toBe(10); // không trùng
    });

    it('hashedCodes KHÔNG chứa plaintext - mỗi hash khác hẳn mã gốc', async () => {
      const { plainCodes, hashedCodes } = await service.generateBackupCodes();

      expect(hashedCodes).toHaveLength(10);
      hashedCodes.forEach((hash, i) => {
        expect(hash).not.toBe(plainCodes[i]);
        expect(hash.startsWith('$2b$')).toBe(true); // định dạng bcrypt hash chuẩn
      });
    });
  });

  describe('verifyBackupCode', () => {
    it('mã đúng, khớp đúng vị trí trong danh sách -> trả về index đúng', async () => {
      const { plainCodes, hashedCodes } = await service.generateBackupCodes();

      // noUncheckedIndexedAccess: truy cập mảng bằng index luôn trả về
      // `T | undefined` - guard tường minh thay vì ép kiểu `!`/`as string`.
      const code = plainCodes[3];
      if (!code) throw new Error('Test setup lỗi - generateBackupCodes() không đủ 10 mã');

      const matchedIndex = await service.verifyBackupCode(code, hashedCodes);

      expect(matchedIndex).toBe(3);
    });

    it('mã không khớp mã nào -> trả về -1', async () => {
      const { hashedCodes } = await service.generateBackupCodes();

      const matchedIndex = await service.verifyBackupCode('99999999', hashedCodes);

      expect(matchedIndex).toBe(-1);
    });

    it('danh sách hashedCodes rỗng (đã dùng hết mã) -> luôn trả về -1', async () => {
      const matchedIndex = await service.verifyBackupCode('12345678', []);
      expect(matchedIndex).toBe(-1);
    });
  });
});
