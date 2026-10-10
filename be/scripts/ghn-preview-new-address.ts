/**
 * ===================================================================
 * 10/10/2026 (chuẩn bị C3 — GHN) — KIỂM TRA ĐỊA CHỈ 2 CẤP MỚI (chỉ đọc)
 * ===================================================================
 * Lazada che số nhà/đường (address1/3/4/5 = "***"), chỉ còn PHƯỜNG MỚI (city)
 * và tỉnh. Script này hỏi thẳng GHN (API preview — KHÔNG tạo vận đơn) xem:
 *   A. Địa chỉ mới đầy đủ (có số nhà)          + is_new_to_address=true
 *   B. Địa chỉ mới KHÔNG có số nhà (giống Lazada) + is_new_to_address=true
 *   C. Địa chỉ kiểu cũ (quận + mã phường) để so phí
 * Kết quả quyết định thiết kế C3: có cần bảng đổi phường mới → mã GHN cũ
 * hay chỉ cần tên phường mới + tỉnh.
 * Đọc GHN_TOKEN / GHN_SHOP_ID / GHN_BASE_URL từ .env — không in token ra màn hình.
 *
 *   npx ts-node -T -r dotenv/config scripts/ghn-preview-new-address.ts
 * ===================================================================
 */
interface GhnResponse {
  code: number;
  message: string;
  code_message_value?: string;
  data?: {
    total_fee?: number;
    expected_delivery_time?: string;
    sort_code?: string;
  } | null;
}

const BASE = process.env.GHN_BASE_URL ?? 'https://dev-online-gateway.ghn.vn';
const TOKEN = process.env.GHN_TOKEN ?? '';
const SHOP_ID = process.env.GHN_SHOP_ID ?? '';

const common = {
  payment_type_id: 2,
  required_note: 'CHOXEMHANGKHONGTHU',
  service_type_id: 2,
  to_name: 'Khach Test',
  to_phone: '0377168254',
  weight: 300,
  length: 30,
  width: 25,
  height: 4,
  content: 'Ao thun',
  cod_amount: 0,
  insurance_value: 0,
  items: [{ name: 'Ao thun', quantity: 1, weight: 300 }],
};

const cases: { ten: string; body: Record<string, unknown> }[] = [
  {
    ten: 'A. Mới, có số nhà',
    body: {
      ...common,
      is_new_to_address: true,
      to_address:
        '47/88 Nguyễn Văn Đậu, Phường Bình Lợi Trung, Thành phố Hồ Chí Minh',
      to_ward_name: 'Phường Bình Lợi Trung',
      to_province_name: 'Hồ Chí Minh',
    },
  },
  {
    ten: 'B. Mới, KHÔNG số nhà (như Lazada)',
    body: {
      ...common,
      is_new_to_address: true,
      to_address: 'Phường Bình Lợi Trung, Thành phố Hồ Chí Minh',
      to_ward_name: 'Phường Bình Lợi Trung',
      to_province_name: 'Hồ Chí Minh',
    },
  },
  // Lượt 2 (10/10): A bị "To address conflict" → tìm xem GHN hiểu số nhà
  // 47/88 Nguyễn Văn Đậu thuộc phường mới nào, và có nên ghi tên phường vào to_address.
  ...['Phường Bình Lợi Trung', 'Phường Gia Định', 'Phường Bình Thạnh'].map(
    (ward) => ({
      ten: `A2. Chỉ số nhà + đường, ward=${ward}`,
      body: {
        ...common,
        is_new_to_address: true,
        to_address: '47/88 Nguyễn Văn Đậu',
        to_ward_name: ward,
        to_province_name: 'Hồ Chí Minh',
      },
    }),
  ),
  {
    ten: 'C. Kiểu cũ (Q. Bình Thạnh)',
    body: {
      ...common,
      to_address:
        '47/88 Nguyễn Văn Đậu, Phường 6, Quận Bình Thạnh, Hồ Chí Minh',
      to_district_id: 1462,
      to_ward_code: '21620',
    },
  },
];

async function main(): Promise<void> {
  if (!TOKEN || !SHOP_ID) {
    console.error('❌ Thiếu GHN_TOKEN hoặc GHN_SHOP_ID trong be/.env.');
    process.exit(1);
  }
  const rows: Record<string, unknown>[] = [];
  for (const c of cases) {
    try {
      const res = await fetch(
        `${BASE}/shiip/public-api/v2/shipping-order/preview`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Token: TOKEN,
            ShopId: SHOP_ID,
          },
          body: JSON.stringify(c.body),
        },
      );
      const json = (await res.json()) as GhnResponse;
      rows.push({
        truong_hop: c.ten,
        http: res.status,
        ket_qua: json.code === 200 ? '✅ GHN nhận' : '❌ GHN từ chối',
        phi: json.data?.total_fee ?? '',
        sort_code: json.data?.sort_code ?? '',
        du_kien_giao: json.data?.expected_delivery_time ?? '',
        thong_bao:
          json.code === 200
            ? ''
            : `${json.message} ${json.code_message_value ?? ''}`.trim(),
      });
    } catch (err: unknown) {
      rows.push({
        truong_hop: c.ten,
        ket_qua: '❌ Lỗi mạng',
        thong_bao: err instanceof Error ? err.message : String(err),
      });
    }
  }
  console.table(rows);
}

main().catch((err: unknown) => {
  console.error('❌ Script thất bại:', err);
  process.exit(1);
});
