import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';

//!=============================================
// FIX #17: MFA (TOTP) bắt buộc cho role Admin — dùng chung app kiểu
// Google Authenticator/Authy. Cần cài: npm install otplib
//!=============================================
@Injectable()
export class MfaService {
  generateSecret(email: string): { secret: string; otpauthUrl: string } {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(email, 'OptiPackAI', secret);
    return { secret, otpauthUrl };
  }

  verifyToken(token: string, secret: string): boolean {
    return authenticator.verify({ token, secret });
  }
}
