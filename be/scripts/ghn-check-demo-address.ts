/**
 * ===================================================================
 * 28/10/2026 — KIỂM TRA ĐỊA CHỈ MÔ PHỎNG VỚI GHN (chỉ đọc, KHÔNG tạo vận đơn)
 * ===================================================================
 * Hỏi GHN Preview cho vài số nhà mô phỏng đầu tiên (theo CARRIER_DEMO_STREET_TEMPLATE,
 * CARRIER_DEMO_START_NUMBER) với từng phường ứng viên, để chốt CARRIER_DEMO_WARD.
 * "✅" = GHN nhận số nhà + phường; "❌ To address conflict" = số nhà không thuộc phường đó
 * (BE vẫn tự gửi lại chỉ phường + tỉnh, nhưng nhãn sẽ không có số nhà).
 * Đọc GHN_TOKEN / GHN_SHOP_ID / GHN_BASE_URL từ .env — không in token ra màn hình.
 *
 *   npx ts-node -T -r dotenv/config scripts/ghn-check-demo-address.ts
 *   npx ts-node -T -r dotenv/config scripts/ghn-check-demo-address.ts "Phường Gia Định" "Phường Bình Lợi Trung"
 * ===================================================================
 */
interface GhnResponse {
  code: number;
  message: string;
  code_message_value?: string;
  data?: { total_fee?: number } | null;
}

const BASE = process.env.GHN_BASE_URL ?? 'https://dev-online-gateway.ghn.vn';
const TOKEN = process.env.GHN_TOKEN ?? '';
const SHOP_ID = process.env.GHN_SHOP_ID ?? '';
const TEMPLATE = process.env.CARRIER_DEMO_STREET_TEMPLATE?.trim() || '47/{n} Nguyễn Văn Đậu';
const START = Number.parseInt(process.env.CARRIER_DEMO_START_NUMBER ?? '10', 10) || 10;
const PROVINCE = process.env.CARRIER_DEMO_PROVINCE?.trim() || 'Hồ Chí Minh';
const COUNT = 3;

const argWards = process.argv.slice(2).filter((w) => w.trim());
const wards = argWards.length > 0 ? argWards : ['Phường Gia Định', 'Phường Bình Lợi Trung'];

async function preview(street: string, ward: string): Promise<GhnResponse> {
  const res = await fetch(`${BASE}/shiip/public-api/v2/shipping-order/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Token: TOKEN, ShopId: SHOP_ID },
    body: JSON.stringify({
      payment_type_id: 2,
      required_note: 'CHOXEMHANGKHONGTHU',
      service_type_id: 2,
      to_name: 'Khach Test',
      to_phone: '0377168254',
      is_new_to_address: true,
      to_address: street,
      to_ward_name: ward,
      to_province_name: PROVINCE,
      weight: 300,
      length: 30,
      width: 25,
      height: 4,
      content: 'Ao thun',
      cod_amount: 0,
      insurance_value: 0,
      items: [{ name: 'Ao thun', quantity: 1, weight: 300 }],
    }),
  });
  return (await res.json()) as GhnResponse;
}

async function main(): Promise<void> {
  if (!TOKEN || !SHOP_ID) {
    console.error('❌ Thiếu GHN_TOKEN hoặc GHN_SHOP_ID trong be/.env.');
    process.exit(1);
  }
  const rows: Record<string, unknown>[] = [];
  for (const ward of wards) {
    for (let n = START; n < START + COUNT; n += 1) {
      const street = TEMPLATE.includes('{n}') ? TEMPLATE.split('{n}').join(String(n)) : `${String(n)} ${TEMPLATE}`;
      try {
        const json = await preview(street, ward);
        rows.push({
          so_nha: street,
          phuong: ward,
          ket_qua: json.code === 200 ? '✅ GHN nhận' : '❌ GHN từ chối',
          phi: json.data?.total_fee ?? '',
          thong_bao: json.code === 200 ? '' : `${json.message} ${json.code_message_value ?? ''}`.trim(),
        });
      } catch (err: unknown) {
        rows.push({ so_nha: street, phuong: ward, ket_qua: '❌ Lỗi mạng', thong_bao: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  console.table(rows);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
