// AOFP-312 — biến môi trường cho e2e, nạp TRƯỚC khi import AppModule (jest setupFiles).
// ConfigModule không ghi đè biến đã có, nên be/.env (có thể trỏ Atlas thật) không lọt vào.
// Mongo phải là replica set (transaction): `docker compose --profile local-db up -d mongodb`.
const uri = process.env.E2E_MONGODB_URI ?? 'mongodb://localhost:27017/optipackai_e2e?replicaSet=rs0&directConnection=true';
// Test xoá sạch DB này giữa các case — chặn chạy nhầm vào DB thật.
if (!/\/[^/?]*e2e[^/?]*(\?|$)/.test(uri)) throw new Error(`E2E_MONGODB_URI phải trỏ DB có chữ "e2e" trong tên: ${uri}`);
process.env.MONGODB_URI = uri;

const defaults: Record<string, string> = {
  JWT_ACCESS_SECRET: 'e2e-access-secret',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret',
  TOKEN_ENCRYPTION_KEY: '0'.repeat(64),
  AURELLE_APP_KEY: 'e2e',
  AURELLE_APP_SECRET: 'e2e',
  AURELLE_REDIRECT_URI: 'http://localhost/e2e',
  LAZADA_APP_KEY: 'e2e',
  LAZADA_APP_SECRET: 'e2e',
  LAZADA_REDIRECT_URI: 'http://localhost/e2e',
  TIKTOK_APP_KEY: 'e2e',
  TIKTOK_APP_SECRET: 'e2e',
  GOOGLE_CLIENT_ID: 'e2e',
  MAIL_HOST: 'localhost',
  MAIL_USER: 'e2e@example.invalid',
  MAIL_PASSWORD: 'e2e',
  // Không gọi dịch vụ ngoài: CP-SAT tắt (BRKGA vẫn chạy), AI không có key → câu mẫu.
  PACKER_ENABLED: 'false',
  // Hãng GHN (kind=live trong DB) nhưng adapter mô phỏng — không gọi mạng.
  CARRIER_MODE: 'mock',
  AI_API_KEY: '',
};
for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value;
