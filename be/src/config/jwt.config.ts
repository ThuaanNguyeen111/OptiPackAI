import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,

  expiresIn: Number(process.env.JWT_EXPIRES_IN ?? 86400), // mặc định 1 ngày (giây)
  refreshExpiresIn: Number(process.env.JWT_REFRESH_EXPIRES_IN ?? 2592000), // mặc định 30 ngày (giây)
}));
