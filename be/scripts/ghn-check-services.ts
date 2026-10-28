/**
 * ===================================================================
 * 29/10/2026 — KIỂM TRA GÓI DỊCH VỤ GHN CHO ĐƠN HỎA TỐC (chỉ đọc, KHÔNG tạo vận đơn)
 * ===================================================================
 * Câu hỏi cần trả lời trước khi làm "đơn hỏa tốc → chọn dịch vụ GHN nhanh hơn":
 *   1. Tài khoản GHN đang dùng (GHN_BASE_URL, thường là môi trường thử) có những gói nào
 *      tới nội tỉnh / liên tỉnh? (Get Service — available-services)
 *   2. Mỗi gói giao mất bao lâu (leadtime) và phí bao nhiêu (fee) cho 1 kiện 300 g?
 *   3. GHN còn nhận `service_type_id` 1 (Express) / 3 (Saving) cũ không, hay chỉ 2 (hàng nhẹ) / 5 (hàng nặng)?
 * Đọc GHN_TOKEN / GHN_SHOP_ID / GHN_BASE_URL từ .env — không in token ra màn hình.
 *
 *   npx ts-node -T -r dotenv/config scripts/ghn-check-services.ts
 * ===================================================================
 */
interface GhnEnvelope<T> {
  code: number;
  message: string;
  code_message_value?: string;
  data?: T | null;
}
interface GhnShop { _id: number; district_id: number; ward_code: string; name: string }
interface GhnProvince { ProvinceID: number; ProvinceName: string; NameExtension?: string[] | null }
interface GhnDistrict { DistrictID: number; DistrictName: string }
interface GhnWard { WardCode: string; WardName: string }
interface GhnService { service_id: number; service_type_id: number; short_name: string }

const BASE = `${process.env.GHN_BASE_URL ?? 'https://dev-online-gateway.ghn.vn'}/shiip/public-api`;
const TOKEN = process.env.GHN_TOKEN ?? '';
const SHOP_ID = process.env.GHN_SHOP_ID ?? '';
const PARCEL = { weight: 300, length: 30, width: 25, height: 4 };

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<GhnEnvelope<T>> {
  // GET: tham số đi trên query (như adapter GHN của hệ thống); POST: JSON body.
  const query = method === 'GET' && body ? `?${new URLSearchParams(Object.entries(body as Record<string, unknown>).map(([k, v]) => [k, String(v)])).toString()}` : '';
  const res = await fetch(`${BASE}${path}${query}`, {
    method,
    headers: { 'Content-Type': 'application/json; charset=utf-8', Token: TOKEN, ShopId: SHOP_ID },
    ...(method === 'POST' && body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return (await res.json()) as GhnEnvelope<T>;
}

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();

async function firstDistrictAndWard(provinceName: string): Promise<{ label: string; districtId: number; wardCode: string } | null> {
  const provinces = (await call<GhnProvince[]>('GET', '/master-data/province')).data ?? [];
  const province = provinces.find((p) => [p.ProvinceName, ...(p.NameExtension ?? [])].some((n) => norm(n).includes(norm(provinceName))));
  if (!province) return null;
  const districts = (await call<GhnDistrict[]>('POST', '/master-data/district', { province_id: province.ProvinceID })).data ?? [];
  for (const d of districts) {
    const wards = (await call<GhnWard[]>('POST', '/master-data/ward', { district_id: d.DistrictID })).data ?? [];
    const ward = wards[0];
    if (ward) return { label: `${province.ProvinceName} · ${d.DistrictName}`, districtId: d.DistrictID, wardCode: ward.WardCode };
  }
  return null;
}

function formatTime(unix: number | undefined): string {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

async function main(): Promise<void> {
  if (!TOKEN || !SHOP_ID) throw new Error('Thiếu GHN_TOKEN hoặc GHN_SHOP_ID trong .env');
  console.log(`GHN: ${BASE} · shop ${SHOP_ID}`);

  const shops = (await call<{ shops: GhnShop[] }>('GET', '/v2/shop/all', { offset: 0, limit: 200 })).data?.shops ?? [];
  const shop = shops.find((s) => String(s._id) === SHOP_ID);
  if (!shop) throw new Error(`Không thấy shop ${SHOP_ID} trong tài khoản GHN`);
  console.log(`Kho lấy hàng: district ${String(shop.district_id)}, ward ${shop.ward_code} (${shop.name})\n`);

  const destinations: { label: string; districtId: number; wardCode: string }[] = [
    { label: 'Cùng quận với shop (nội quận)', districtId: shop.district_id, wardCode: shop.ward_code },
  ];
  for (const p of ['Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng']) {
    const d = await firstDistrictAndWard(p);
    if (d) destinations.push(d);
  }

  const rows: Record<string, string | number>[] = [];
  for (const dest of destinations) {
    const services = await call<GhnService[]>('POST', '/v2/shipping-order/available-services', {
      shop_id: Number(SHOP_ID), from_district: shop.district_id, to_district: dest.districtId,
    });
    if (services.code !== 200 || !services.data?.length) {
      rows.push({ diem_den: dest.label, goi: `— ${services.message}` });
      continue;
    }
    for (const s of services.data) {
      const fee = await call<{ total: number }>('POST', '/v2/shipping-order/fee', {
        service_id: s.service_id, to_district_id: dest.districtId, to_ward_code: dest.wardCode, ...PARCEL, insurance_value: 0,
      });
      const lead = await call<{ leadtime: number }>('POST', '/v2/shipping-order/leadtime', {
        from_district_id: shop.district_id, from_ward_code: shop.ward_code, to_district_id: dest.districtId, to_ward_code: dest.wardCode, service_id: s.service_id,
      });
      rows.push({
        diem_den: dest.label,
        service_id: s.service_id,
        service_type_id: s.service_type_id,
        ten_goi: s.short_name,
        phi_300g: fee.data?.total ?? `❌ ${fee.message}`,
        du_kien_giao: lead.data?.leadtime ? formatTime(lead.data.leadtime) : `❌ ${lead.message}`,
      });
    }
  }
  console.table(rows);

  // service_type_id cũ: 1 = Express, 3 = Saving (tài liệu cũ); hiện GHN dùng 2 = hàng nhẹ, 5 = hàng nặng.
  const dest = destinations[1] ?? destinations[0];
  if (dest) {
    console.log(`\nThử phí theo service_type_id tới ${dest.label}:`);
    for (const typeId of [1, 2, 3, 5]) {
      const fee = await call<{ total: number }>('POST', '/v2/shipping-order/fee', {
        service_type_id: typeId, to_district_id: dest.districtId, to_ward_code: dest.wardCode, ...PARCEL, insurance_value: 0,
      });
      console.log(`  service_type_id ${String(typeId)}: ${fee.code === 200 ? `✅ ${String(fee.data?.total)}đ` : `❌ ${fee.message} ${fee.code_message_value ?? ''}`}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error('❌ Kiểm tra thất bại:', err instanceof Error ? err.message : err);
  process.exit(1);
});
