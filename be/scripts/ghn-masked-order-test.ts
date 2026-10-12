import mongoose from 'mongoose';

/**
 * ===================================================================
 * 11/10/2026 — GHN CÓ TẠO ĐƯỢC VẬN ĐƠN + IN NHÃN VỚI ĐƠN LAZADA BỊ CHE KHÔNG?
 * ===================================================================
 * Lấy ĐƠN LAZADA THẬT mới nhất trong DB (tên/SĐT/số nhà bị Lazada che, chỉ còn
 * phường + tỉnh) rồi hỏi GHN môi trường TEST:
 *   1. Preview với đúng tên + SĐT bị che            → GHN có nhận SĐT che không?
 *   2. Preview với SĐT thay thế (SĐT shop, chỉ demo) → phương án dự phòng
 *   3. (chỉ khi thêm --create) Tạo vận đơn TEST bằng phương án nhận được
 *      + lấy link in nhãn A5 để mở xem nhãn trông thế nào.
 * Chỉ ĐỌC DB, không ghi DB. Đọc GHN_TOKEN/GHN_SHOP_ID/GHN_BASE_URL từ .env.
 *
 *   npx ts-node -T -r dotenv/config scripts/ghn-masked-order-test.ts
 *   npx ts-node -T -r dotenv/config scripts/ghn-masked-order-test.ts --create
 * ===================================================================
 */
interface GhnResponse {
  code: number;
  message: string;
  code_message_value?: string;
  data?: { order_code?: string; total_fee?: number; token?: string } | null;
}
interface RecipientDoc {
  full_name?: string;
  city?: string;
  postal_code?: string;
  phone?: string;
  address_line1?: string;
  ward_name?: string | null;
  province_name?: string | null;
}

const BASE = process.env.GHN_BASE_URL ?? 'https://dev-online-gateway.ghn.vn';
const TOKEN = process.env.GHN_TOKEN ?? '';
const SHOP_ID = process.env.GHN_SHOP_ID ?? '';
const DEMO_PHONE = '0377168254'; // SĐT thay thế chỉ để demo

async function ghn(
  path: string,
  body: Record<string, unknown>,
): Promise<GhnResponse> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Token: TOKEN,
      ShopId: SHOP_ID,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as GhnResponse;
  } catch {
    // GHN gateway đôi khi trả text thuần (VD "404 page not found") → không phải JSON.
    return {
      code: res.status,
      message: `HTTP ${String(res.status)} ${path}: ${text.slice(0, 120)}`,
    };
  }
}

const describe = (r: GhnResponse): string =>
  r.code === 200
    ? `✅ nhận — phí ${String(r.data?.total_fee ?? '')}đ`
    : `❌ ${r.message} ${r.code_message_value ?? ''}`.trim();

async function main(): Promise<void> {
  const unknown = process.argv
    .slice(2)
    .filter((a) => a !== '--create' && !a.startsWith('--province='));
  if (unknown.length > 0) {
    console.error(
      `❌ Cờ không hợp lệ: ${unknown.join(' ')}. Chỉ nhận --create và --province=<tên tỉnh>.`,
    );
    process.exit(1);
  }
  if (!TOKEN || !SHOP_ID) {
    console.error('❌ Thiếu GHN_TOKEN hoặc GHN_SHOP_ID trong be/.env.');
    process.exit(1);
  }
  await mongoose.connect(
    process.env.MONGODB_URI ?? 'mongodb://localhost:27017/optipackai',
  );
  const db = mongoose.connection.db;
  if (!db) throw new Error('Không lấy được kết nối database.');
  const order = await db
    .collection<{
      platform: string;
      platform_order_id?: string;
      recipient?: RecipientDoc;
    }>('orders')
    .find({ platform: 'lazada', 'recipient.ward_name': { $type: 'string' } })
    .sort({ _id: -1 })
    .limit(1)
    .next();
  await mongoose.disconnect();
  if (!order?.recipient) {
    console.error(
      '❌ Không có đơn Lazada nào đã có ward_name (chạy script backfill-order-recipient-areas trước).',
    );
    process.exit(1);
  }
  const r = order.recipient;
  const ward = r.ward_name ?? '';
  // Lazada che cả tỉnh (address3) → đơn có thể không có province_name. Cho nhập tay để thử.
  const provinceArg = process.argv
    .find((a) => a.startsWith('--province='))
    ?.slice('--province='.length);
  const province = (provinceArg ?? r.province_name ?? '')
    .replace(/^(thành phố|tp\.?|tỉnh)\s+/i, '')
    .trim();
  console.log('Đơn Lazada dùng để thử:', {
    ma_don: order.platform_order_id,
    ten: r.full_name,
    sdt: r.phone,
    so_nha: r.address_line1,
    city_goc: r.city,
    ma_buu_chinh: r.postal_code ?? null,
    phuong: ward,
    tinh: province || '(TRỐNG — Lazada che tỉnh)',
  });
  if (!province) {
    console.log(
      '⚠️ Đơn không có tỉnh. Chạy lại kèm --province="Hồ Chí Minh" (hoặc tỉnh đúng) để thử GHN.',
    );
    return;
  }

  const base = {
    payment_type_id: 1,
    required_note: 'CHOXEMHANGKHONGTHU',
    service_type_id: 2,
    to_name: r.full_name ?? 'Khach Lazada',
    to_address: `${ward}, ${province}`,
    to_ward_name: ward,
    to_province_name: province,
    is_new_to_address: true,
    weight: 300,
    length: 30,
    width: 25,
    height: 4,
    content: 'Ao thun',
    cod_amount: 0,
    insurance_value: 0,
    items: [{ name: 'Ao thun', quantity: 1, weight: 300 }],
  };
  const masked = await ghn('/shiip/public-api/v2/shipping-order/preview', {
    ...base,
    to_phone: r.phone ?? '',
  });
  const demo = await ghn('/shiip/public-api/v2/shipping-order/preview', {
    ...base,
    to_phone: DEMO_PHONE,
  });
  console.table([
    {
      truong_hop: '1. Tên + SĐT bị che (nguyên từ Lazada)',
      ket_qua: describe(masked),
    },
    {
      truong_hop: `2. SĐT thay thế ${DEMO_PHONE} (demo)`,
      ket_qua: describe(demo),
    },
  ]);

  if (!process.argv.includes('--create')) {
    console.log('→ Thêm --create để tạo 1 vận đơn TEST và lấy link in nhãn.');
    return;
  }
  const phone = masked.code === 200 ? (r.phone ?? '') : DEMO_PHONE;
  const created = await ghn('/shiip/public-api/v2/shipping-order/create', {
    ...base,
    to_phone: phone,
    client_order_code: `TEST-MASK-${String(Date.now())}`,
  });
  if (created.code !== 200 || !created.data?.order_code) {
    console.error(`❌ Tạo vận đơn test thất bại: ${describe(created)}`);
    return;
  }
  const token = await ghn('/shiip/public-api/v2/a5/gen-token', {
    order_codes: [created.data.order_code],
  });
  const host = BASE.replace(/\/shiip\/public-api\/?$/, '');
  console.log(
    `✅ Mã vận đơn TEST: ${created.data.order_code} (SĐT dùng: ${phone})`,
  );
  console.log(
    `🖨  Link in nhãn (hết hạn sau ~30 phút): ${host}/a5/public-api/printA5?token=${token.data?.token ?? ''}`,
  );
}

main().catch((err: unknown) => {
  console.error('❌ Script thất bại:', err);
  process.exit(1);
});
