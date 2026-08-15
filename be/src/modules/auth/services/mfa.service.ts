import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { authenticator } from 'otplib';

//!=============================================
// MFA (TOTP) bắt buộc cho role Admin — dùng chung app kiểu
// Google Authenticator/Authy. Cần cài: npm install otplib
//!=============================================
@Injectable()
export class MfaService {
  private readonly BACKUP_CODE_COUNT = 10;

  generateSecret(email: string): { secret: string; otpauthUrl: string } {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(email, 'OptiPackAI', secret);
    return { secret, otpauthUrl };
  }

  verifyToken(token: string, secret: string): boolean {
    return authenticator.verify({ token, secret });
  }

  //!=============================================
  //  Sinh 10 mã dự phòng, mỗi mã 8 chữ số (vd "48213096"), dùng khi
  // mất điện thoại/mất app Authenticator — mỗi mã CHỈ DÙNG ĐƯỢC 1 LẦN.
  //
  // Trả về 2 thứ tách biệt:
  //   - plainCodes: hiển thị 1 LẦN DUY NHẤT cho user (để họ lưu/in ra giấy)
  //   - hashedCodes: LƯU vào DB (mfa_backup_codes) — không bao giờ lưu plaintext,
  //!=============================================
  async generateBackupCodes(): Promise<{
    plainCodes: string[];
    hashedCodes: string[];
  }> {
    const plainCodes: string[] = [];
    for (let i = 0; i < this.BACKUP_CODE_COUNT; i++) {
      // randomInt(10_000_000, 100_000_000) -> luôn ra đúng 8 chữ số
      plainCodes.push(String(randomInt(10_000_000, 100_000_000)));
    }

    const hashedCodes = await Promise.all(
      plainCodes.map((code) => bcrypt.hash(code, 10)),
    );

    return { plainCodes, hashedCodes };
  }

  //!=============================================
  // So khớp 1 mã backup user nhập với DANH SÁCH hash đã lưu. Trả về INDEX
  // của mã đã dùng (để AuthService xóa đúng mã đó khỏi mảng — chống dùng lại
  // mã đã xài), hoặc -1 nếu không khớp mã nào.
  //!=============================================
  async verifyBackupCode(
    inputCode: string,
    hashedCodes: string[],
  ): Promise<number> {
    const results = await Promise.all(
      hashedCodes.map((hashed) => bcrypt.compare(inputCode, hashed)),
    );
    return results.findIndex((isMatch) => isMatch);
  }
}
