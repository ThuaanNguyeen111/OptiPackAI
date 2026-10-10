/**
 * ===================================================================
 * KIỂU DỮ LIỆU CHUNG CỦA ĐƠN VỊ VẬN CHUYỂN (08/10/2026, C2)
 * ===================================================================
 * Tầng chống "rò rỉ" đặc thù hãng (cùng tinh thần Rule DB #22 / adapter sàn):
 * mọi service của OptiPack chỉ thấy các kiểu dưới đây; hình dạng request/
 * response riêng của GHN nằm gọn trong adapters/ghn.adapter.ts. Thêm hãng mới
 * (GHTK, Viettel Post) = thêm 1 adapter cài đặt CarrierAdapter, không sửa luồng.
 * Tên field snake_case để lưu thẳng vào Mongo (Rule DB #11) khi cần.
 * ===================================================================
 */

export enum CarrierCode {
  GHN = 'ghn',
  MOCK = 'mock',
}

/** Kiện hàng sau đóng gói — đơn vị theo chuẩn GHN: gram, cm. */
export interface CarrierParcel {
  weight_g: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
}

/**
 * Địa chỉ người nhận. Tính phí cần MÃ kiểu cũ (district_id + ward_code — tài liệu
 * GHN Calculate Fee không có field địa chỉ 2 cấp). Tạo vận đơn gửi cả mã lẫn tên
 * (đã kiểm chứng 08/10/2026: GHN nhận cả hai, gửi cả hai an toàn nhất).
 */
export interface CarrierRecipient {
  name: string;
  phone: string;
  address: string; // địa chỉ đầy đủ in trên nhãn
  district_id: number;
  ward_code: string; // chuỗi — giữ nguyên số 0 ở đầu
  province_name: string;
  district_name: string;
  ward_name: string;
}

export interface CarrierItem {
  name: string;
  code?: string; // master SKU
  quantity: number;
  price?: number;
}

export interface CarrierFeeBreakdown {
  total: number;
  service_fee: number;
  insurance_fee: number;
  cod_fee: number;
  remote_area_fee: number; // gộp phí vùng xa lấy + giao
  other_fee: number; // phần còn lại = total − 4 khoản trên
}

export interface CalculateFeeInput {
  to_district_id: number;
  to_ward_code: string;
  parcel: CarrierParcel;
  service_type_id?: number;
  insurance_value?: number;
  cod_value?: number;
}

export interface CreateShipmentInput {
  client_order_code: string; // mã vận đơn nội bộ (SHP-...) — GHN chống tạo trùng theo mã này
  recipient: CarrierRecipient;
  parcel: CarrierParcel;
  items: CarrierItem[];
  content: string;
  cod_amount: number;
  insurance_value?: number;
  note?: string;
  required_note?: string;
  service_type_id?: number;
  payment_type_id?: number;
}

export interface CreateShipmentResult {
  carrier_order_code: string; // rỗng khi chỉ xem trước (preview)
  sort_code: string | null;
  fee: CarrierFeeBreakdown;
  expected_delivery_at: Date | null;
}

export interface CarrierOrderDetail {
  carrier_order_code: string;
  client_order_code: string | null;
  carrier_status: string; // trạng thái gốc của hãng (VD ready_to_pick)
  converted_weight_g: number | null;
  updated_at: Date | null;
}

export interface CancelShipmentResult {
  carrier_order_code: string;
  cancelled: boolean; // false = trạng thái hiện tại không cho huỷ (đã lấy hàng)
  message: string | null;
}

export interface CarrierLabel {
  url: string;
  expires_at: Date;
}

export interface CarrierService {
  service_id: number;
  service_type_id: number;
  short_name: string;
}
