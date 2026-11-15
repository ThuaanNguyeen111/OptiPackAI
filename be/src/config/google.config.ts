import { registerAs } from '@nestjs/config';

export default registerAs('google', () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
  // 10/11/2026 — client id khác được nhận làm `aud` của id_token app mobile (phân cách dấu phẩy). Mặc định chỉ GOOGLE_CLIENT_ID.
  extraAudiences: process.env.GOOGLE_EXTRA_AUDIENCES,
}));
