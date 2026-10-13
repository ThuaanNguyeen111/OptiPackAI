import axios from 'axios';
import { createHmac } from 'crypto';

/**
 * ===================================================================
 * SMOKE TEST WEBHOOK AURELLE (Giai đoạn 3 — AURELLE_MARKETPLACE_DESIGN.md Mục 8)
 * ===================================================================
 * Client thuần (không NestJS/Mongo) — POST thật vào 1 server OptiPack
 * ĐANG CHẠY (`npm run start:dev`) để xác nhận pipeline
 * `MarketplaceWebhooksController` → `MarketplaceWebhooksService` hoạt
 * động đúng END-TO-END, không chỉ tin đọc code/unit test mock.
 *
 * Ký request đúng CÙNG 1 công thức với `AurelleAdapter.verifyWebhookSignature()`
 * (`UPPER(HEX(HMAC_SHA256(app_secret, app_key + raw_body)))`) — cố ý
 * KHÔNG import lại code server, tự tính tay ở đây để bài test độc lập,
 * không "tự kiểm tra chính mình" bằng cùng 1 hàm.
 *
 * `AURELLE_APP_KEY`/`AURELLE_APP_SECRET` TRUYỀN VÀO ĐÂY PHẢI KHỚP ĐÚNG
 * giá trị server đang chạy được cấu hình (`.env`/biến môi trường lúc
 * `npm run start:dev`) — sai secret sẽ khiến MỌI case (kể cả case đáng
 * lẽ hợp lệ) đều bị 401, không phải lỗi code.
 *
 * Chạy:
 *   cd be
 *   AURELLE_APP_KEY=<đúng giá trị server đang dùng> \
 *   AURELLE_APP_SECRET=<đúng giá trị server đang dùng> \
 *   npx ts-node scripts/aurelle-webhook-smoke-test.ts
 *
 * Tùy chọn: BASE_URL (mặc định http://localhost:3000).
 *
 * Mỗi case in PASS/FAIL theo đúng HTTP status/response mong đợi. Có
 * FAIL → exit code 1.
 * ===================================================================
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const APP_KEY = process.env.AURELLE_APP_KEY ?? '';
const APP_SECRET = process.env.AURELLE_APP_SECRET ?? '';

if (!APP_KEY || !APP_SECRET) {
  console.error(
    '❌ Thiếu AURELLE_APP_KEY/AURELLE_APP_SECRET — phải khớp đúng giá trị server đang chạy, xem hướng dẫn ở đầu file.',
  );
  process.exit(1);
}

interface WebhookPayload {
  message_id: string;
  seller_id: string;
  message_type: string;
  timestamp: number;
  data: { trade_order_id?: string; order_status?: string };
}

function signPayload(rawBody: string): string {
  return createHmac('sha256', APP_SECRET)
    .update(Buffer.concat([Buffer.from(APP_KEY, 'utf8'), Buffer.from(rawBody, 'utf8')]))
    .digest('hex')
    .toUpperCase();
}

let failed = false;

function report(passed: boolean, label: string, detail?: string): void {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!passed) failed = true;
}

async function postWebhook(
  payload: WebhookPayload,
  signatureOverride?: string,
): Promise<{ status: number; data: unknown }> {
  const rawBody = JSON.stringify(payload);
  const signature = signatureOverride ?? signPayload(rawBody);
  try {
    const res = await axios.post(`${BASE_URL}/marketplace/webhooks/aurelle`, payload, {
      headers: { 'Content-Type': 'application/json', Authorization: signature },
      transformRequest: [() => rawBody], // gửi ĐÚNG chuỗi đã ký, không để axios tự serialize lại khác thứ tự key
      validateStatus: () => true,
    });
    return { status: res.status, data: res.data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Không gọi được server tại ${BASE_URL} — server đã chạy chưa? (${message})`);
  }
}

function makePayload(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  return {
    message_id: `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    seller_id: '999999999999',
    message_type: 'order_status_changed',
    timestamp: Date.now(),
    data: { trade_order_id: '000000000000', order_status: 'pending' },
    ...overrides,
  };
}

async function main(): Promise<void> {
  console.log(`Smoke test webhook AURELLE — nhắm vào ${BASE_URL}\n`);

  // Case 1: chữ ký đúng, shop không tồn tại -> vẫn ack 200 (không throw ra ngoài)
  {
    const { status, data } = await postWebhook(makePayload());
    report(
      status === 200 && (data as { received?: boolean }).received === true,
      'Case 1 — chữ ký đúng, shop chưa connect → 200 { received: true }',
      `status=${status}, body=${JSON.stringify(data)}`,
    );
  }

  // Case 2: chữ ký sai -> 401
  {
    const { status, data } = await postWebhook(makePayload(), 'CHU-KY-SAI-CO-TINH');
    report(
      status === 401,
      'Case 2 — chữ ký sai → 401',
      `status=${status}, body=${JSON.stringify(data)}`,
    );
  }

  // Case 3: timestamp lệch quá 5 phút -> 401 (chống replay)
  {
    const { status, data } = await postWebhook(
      makePayload({ timestamp: Date.now() - 10 * 60 * 1000 }),
    );
    report(
      status === 401,
      'Case 3 — timestamp lệch 10 phút (replay) → 401',
      `status=${status}, body=${JSON.stringify(data)}`,
    );
  }

  // Case 4: message_id trùng -> lần 2 vẫn 200, không xử lý lại (Rule #17)
  {
    const payload = makePayload();
    const first = await postWebhook(payload);
    const second = await postWebhook(payload);
    report(
      first.status === 200 && second.status === 200,
      'Case 4 — gửi lại đúng message_id 2 lần → cả 2 lần đều 200 (dedupe, không lỗi)',
      `lần 1=${first.status}, lần 2=${second.status}`,
    );
  }

  // Case 5: authorization_revoked -> vẫn ack 200 (không đồng bộ đơn)
  {
    const { status, data } = await postWebhook(makePayload({ message_type: 'authorization_revoked' }));
    report(
      status === 200 && (data as { received?: boolean }).received === true,
      'Case 5 — authorization_revoked → 200 { received: true } (đã bắn Notification CONNECTION_LOST phía server)',
      `status=${status}, body=${JSON.stringify(data)}`,
    );
  }

  console.log(failed ? '\n❌ CÓ CASE FAIL — xem chi tiết ở trên.' : '\n✅ Tất cả case đều đúng như thiết kế.');
  process.exit(failed ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error('❌ Smoke test dừng do lỗi ngoài dự kiến:', err instanceof Error ? err.message : err);
  process.exit(1);
});
