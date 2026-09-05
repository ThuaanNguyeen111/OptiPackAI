import { registerAs } from '@nestjs/config';

/**
 * ===================================================================
 * CONFIG NAMESPACE "marketplace" — ĐÚNG PATTERN registerAs() đã dùng
 * trong database.config.ts / redis.config.ts của project thật.
 * ===================================================================
 * SỬA LẠI so với bản đầu tiên: bản đó đọc thẳng process.env.X rải rác
 * trong từng adapter — VI PHẠM quy tắc đã ghi trong CLAUDE.md ("config
 * qua ConfigService namespaced key"). Bản này gom hết vào 1 chỗ, adapter
 * chỉ gọi this.configService.get('marketplace.tiktok.appKey') — khớp
 * đúng cách AppModule đã `load: [databaseConfig, jwtConfig, ...]`.
 *
 * NHỚ đăng ký thêm vào app.module.ts:
 *   load: [databaseConfig, jwtConfig, googleConfig, redisConfig, mailConfig, marketplaceConfig]
 * ===================================================================
 */
export default registerAs('marketplace', () => ({
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY,

  tiktok: {
    appKey: process.env.TIKTOK_APP_KEY,
    appSecret: process.env.TIKTOK_APP_SECRET,
    sandbox: process.env.TIKTOK_SANDBOX === 'true',
    // 3 dòng dưới CHỈ cần điền khi dùng mock server (tools/tiktok-mock-server) —
    // để trống thì adapter tự dùng domain thật.
    authorizeBaseUrl: process.env.TIKTOK_AUTHORIZE_BASE_URL,
    tokenBaseUrl: process.env.TIKTOK_TOKEN_BASE_URL,
    apiBaseUrl: process.env.TIKTOK_API_BASE_URL,
  },

  lazada: {
    appKey: process.env.LAZADA_APP_KEY,
    appSecret: process.env.LAZADA_APP_SECRET,
    redirectUri: process.env.LAZADA_REDIRECT_URI,
    sandbox: process.env.LAZADA_SANDBOX === 'true',
    apiBaseUrl: process.env.LAZADA_API_BASE_URL, // để trống dùng mặc định api.lazada.vn thật
  },

  tiki: {
    clientId: process.env.TIKI_CLIENT_ID,
    clientSecret: process.env.TIKI_CLIENT_SECRET,
    redirectUri: process.env.TIKI_REDIRECT_URI,
    sandbox: process.env.TIKI_SANDBOX === 'true',
    authorizeBaseUrl: process.env.TIKI_AUTHORIZE_BASE_URL,
    tokenUrl: process.env.TIKI_TOKEN_URL,
    apiBaseUrl: process.env.TIKI_API_BASE_URL,
  },
}));
