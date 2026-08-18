import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT ?? 587),

  secure: process.env.MAIL_SECURE === 'true',
  user: process.env.MAIL_USER,
  password: process.env.MAIL_PASSWORD,
  fromName: process.env.MAIL_FROM_NAME ?? 'OptiPackAI',

  fromAddress: process.env.MAIL_FROM_ADDRESS,
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
}));
