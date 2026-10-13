/**
 * ===================================================================
 * Tính cước vận chuyển — hàm THUẦN (30/09/2026)
 * ===================================================================
 * Cước = tổng cước từng KIỆN. Mỗi kiện tính theo khối lượng tính cước =
 * max(cân thực, cân quy đổi thể tích) — chuẩn ngành: hãng thu theo số lớn hơn.
 * Bảng cước theo bậc khối lượng; vượt bậc cuối thì cộng theo mỗi 500 g.
 * Số trong bảng cước là DỮ LIỆU CẤU HÌNH (đánh dấu `is_sample` khi là số mẫu),
 * không phải cước thật của hãng nào.
 * ===================================================================
 */

export interface RateBand {
  /** Bậc áp dụng cho khối lượng tính cước ≤ giá trị này (g). */
  up_to_g: number;
  price_vnd: number;
}

export interface RateService {
  code: string;
  name: string;
  eta_min_days: number;
  eta_max_days: number;
  /** Tăng dần theo up_to_g. */
  bands: RateBand[];
  /** Vượt bậc cuối: cộng mỗi 500 g (làm tròn lên). */
  extra_price_vnd_per_500g: number;
}

export interface OuterDimensionsMm {
  length_mm: number;
  width_mm: number;
  height_mm: number;
}

/** Cân quy đổi thể tích (g): thể tích ngoài (cm³) / hệ số chia (cm³/kg). */
export function volumetricWeightG(
  outer: OuterDimensionsMm,
  divisor: number,
): number {
  const cm3 = (outer.length_mm * outer.width_mm * outer.height_mm) / 1000;
  return Math.ceil((cm3 / divisor) * 1000);
}

/** Khối lượng tính cước của 1 kiện (g) = max(cân thực, cân quy đổi). */
export function chargeableWeightG(
  actualG: number,
  outer: OuterDimensionsMm,
  divisor: number,
): number {
  return Math.max(Math.ceil(actualG), volumetricWeightG(outer, divisor));
}

/** Giá cước của 1 kiện theo bảng bậc của dịch vụ. */
export function priceForWeight(service: RateService, weightG: number): number {
  const bands = [...service.bands].sort((a, b) => a.up_to_g - b.up_to_g);
  const last = bands[bands.length - 1];
  if (!last) return 0;
  const hit = bands.find((b) => weightG <= b.up_to_g);
  if (hit) return hit.price_vnd;
  const over = weightG - last.up_to_g;
  return (
    last.price_vnd + Math.ceil(over / 500) * service.extra_price_vnd_per_500g
  );
}

export interface ParcelInput {
  orderId: string | null;
  cartonIndex: number;
  actualG: number;
  outer: OuterDimensionsMm;
}

export interface ParcelQuote {
  orderId: string | null;
  cartonIndex: number;
  actualG: number;
  volumetricG: number;
  chargeableG: number;
  costVnd: number;
}

export interface ServiceQuote {
  carrierCode: string;
  carrierName: string;
  serviceCode: string;
  serviceName: string;
  etaMinDays: number;
  etaMaxDays: number;
  parcels: ParcelQuote[];
  totalChargeableG: number;
  totalCostVnd: number;
  isSample: boolean;
}

export function quoteService(
  carrier: {
    code: string;
    name: string;
    volumetric_divisor: number;
    is_sample: boolean;
  },
  service: RateService,
  parcels: ParcelInput[],
): ServiceQuote {
  const quoted = parcels.map((parcel): ParcelQuote => {
    const volumetricG = volumetricWeightG(
      parcel.outer,
      carrier.volumetric_divisor,
    );
    const chargeableG = Math.max(Math.ceil(parcel.actualG), volumetricG);
    return {
      orderId: parcel.orderId,
      cartonIndex: parcel.cartonIndex,
      actualG: parcel.actualG,
      volumetricG,
      chargeableG,
      costVnd: priceForWeight(service, chargeableG),
    };
  });
  return {
    carrierCode: carrier.code,
    carrierName: carrier.name,
    serviceCode: service.code,
    serviceName: service.name,
    etaMinDays: service.eta_min_days,
    etaMaxDays: service.eta_max_days,
    parcels: quoted,
    totalChargeableG: quoted.reduce((sum, p) => sum + p.chargeableG, 0),
    totalCostVnd: quoted.reduce((sum, p) => sum + p.costVnd, 0),
    isSample: carrier.is_sample,
  };
}

export type ShippingStrategy = 'cheapest' | 'fastest' | 'fixed';

/**
 * Chọn dịch vụ đề xuất theo chiến lược của Store Owner. `fixed` = dịch vụ mặc
 * định đã cấu hình (nếu còn hợp lệ), không có thì rơi về rẻ nhất. Hòa thì rẻ
 * hơn / nhanh hơn / mã nhỏ hơn (xác định).
 */
export function pickRecommended(
  quotes: ServiceQuote[],
  strategy: ShippingStrategy,
  fixed: { carrierCode: string | null; serviceCode: string | null },
): ServiceQuote | null {
  if (quotes.length === 0) return null;
  const byCost = (a: ServiceQuote, b: ServiceQuote): number =>
    a.totalCostVnd - b.totalCostVnd ||
    a.etaMaxDays - b.etaMaxDays ||
    a.serviceCode.localeCompare(b.serviceCode);
  const byEta = (a: ServiceQuote, b: ServiceQuote): number =>
    a.etaMaxDays - b.etaMaxDays ||
    a.etaMinDays - b.etaMinDays ||
    a.totalCostVnd - b.totalCostVnd ||
    a.serviceCode.localeCompare(b.serviceCode);
  if (strategy === 'fixed') {
    const hit = quotes.find(
      (q) =>
        q.carrierCode === fixed.carrierCode &&
        q.serviceCode === fixed.serviceCode,
    );
    if (hit) return hit;
  }
  return [...quotes].sort(strategy === 'fastest' ? byEta : byCost)[0] ?? null;
}
