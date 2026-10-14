import { registerAs } from '@nestjs/config';

/**
 * ===================================================================
 * CONFIG NAMESPACE "carrier" — đơn vị vận chuyển (08/10/2026, C2 — GHN)
 * ===================================================================
 * Cùng pattern registerAs() với marketplace.config.ts. Adapter chỉ đọc qua
 * ConfigService ('carrier.ghn.token'...), không đọc process.env rải rác.
 *
 * CARRIER_MODE:
 *   - ghn_staging    : gọi GHN môi trường test (dev-online-gateway.ghn.vn) — mặc định khi demo
 *   - ghn_production : gọi GHN thật
 *   - mock           : không gọi mạng, phí tính theo công thức nội bộ — dự phòng khi mất mạng/token lỗi
 * ===================================================================
 */
export default registerAs('carrier', () => ({
  mode: process.env.CARRIER_MODE,
  // Bật các nút mô phỏng trạng thái giao (demo). Chỉ đúng chuỗi "true" mới bật.
  manualStatusEnabled: process.env.CARRIER_MANUAL_STATUS_ENABLED === 'true',
  // C4 (14/10/2026) — CHỈ MÔI TRƯỜNG DEMO: đơn Lazada bị che tỉnh / SĐT.
  // Thiếu tỉnh → dùng tỉnh này; SĐT bị che/sai → dùng SĐT này khi gửi hãng.
  defaultProvince: process.env.CARRIER_DEFAULT_PROVINCE,
  demoRecipientPhone: process.env.CARRIER_DEMO_RECIPIENT_PHONE,
  ghn: {
    baseUrl: process.env.GHN_BASE_URL,
    token: process.env.GHN_TOKEN,
    shopId: process.env.GHN_SHOP_ID,
    defaultServiceTypeId: process.env.GHN_DEFAULT_SERVICE_TYPE_ID,
    defaultRequiredNote: process.env.GHN_DEFAULT_REQUIRED_NOTE,
    defaultPaymentTypeId: process.env.GHN_DEFAULT_PAYMENT_TYPE_ID,
    webhookSecret: process.env.GHN_WEBHOOK_SECRET,
    timeoutMs: process.env.GHN_TIMEOUT_MS,
  },
}));
