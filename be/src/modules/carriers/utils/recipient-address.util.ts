import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app-exception';
import { isMaskedValue } from '../../orders/utils/vn-administrative-area.util';
import { CarrierRecipient } from '../carrier.types';
import { CARRIER_ERROR_CODES } from '../carriers.errors';

/**
 * ===================================================================
 * C3 (10/10/2026) — DỰNG ĐỊA CHỈ GỬI ĐƠN VỊ VẬN CHUYỂN TỪ ĐỊA CHỈ ĐƠN HÀNG
 * ===================================================================
 * Kiểm chứng thật GHN staging (10/10/2026, scripts/ghn-preview-new-address.ts):
 *   - Phường MỚI + tỉnh, không số nhà, is_new_to_address=true → GHN NHẬN.
 *   - Có số nhà/đường mà GHN xếp vào phường khác → "To address conflict".
 * ⇒ Không cần bảng đổi phường mới sang mã cũ. Hàm THUẦN (không I/O):
 *   phường/tỉnh lấy từ đơn (C1) hoặc Coordinator nhập đè; số nhà lấy từ
 *   address_line1 nếu sàn KHÔNG che (Lazada che bằng `*`), hoặc Coordinator nhập.
 * ===================================================================
 */

/** Địa chỉ đơn hàng — đúng các field của orders.recipient đang dùng. */
export interface OrderRecipientLike {
  full_name: string;
  phone: string;
  address_line1?: string | null;
  province_name?: string | null;
  district_name?: string | null;
  ward_name?: string | null;
}

/** Coordinator sửa tay. `street: ''` = cố ý gửi KHÔNG kèm số nhà. */
export interface RecipientOverrides {
  street?: string;
  ward_name?: string;
  province_name?: string;
}

/**
 * GHN nhận tên tỉnh dạng trần ("Hồ Chí Minh" — đã kiểm chứng). Sàn có thể trả
 * "Thành phố Hồ Chí Minh" / "TP. Hồ Chí Minh" / "Tỉnh Đồng Nai" → bỏ tiền tố.
 */
export function toCarrierProvinceName(raw: string): string {
  return raw
    .trim()
    .replace(/^(thành phố|thanh pho|tp\.?|tỉnh|tinh)\s+/i, '')
    .trim();
}

const clean = (value: string | null | undefined): string | null => {
  const text = value?.trim();
  return text && !isMaskedValue(text) ? text : null;
};

export function buildCarrierRecipient(
  recipient: OrderRecipientLike,
  overrides: RecipientOverrides = {},
): CarrierRecipient {
  const ward = clean(overrides.ward_name) ?? clean(recipient.ward_name);
  const provinceRaw =
    clean(overrides.province_name) ?? clean(recipient.province_name);
  if (!ward || !provinceRaw) {
    throw new AppException(
      CARRIER_ERROR_CODES.ADDRESS_INCOMPLETE,
      'Địa chỉ đơn hàng thiếu phường/xã hoặc tỉnh/thành — nhập tay phường và tỉnh trước khi gửi đơn vị vận chuyển.',
      HttpStatus.UNPROCESSABLE_ENTITY,
      { missingWard: !ward, missingProvince: !provinceRaw },
    );
  }
  const province = toCarrierProvinceName(provinceRaw);
  // street: '' (Coordinator cố ý bỏ số nhà) → không lấy lại address_line1.
  const street =
    overrides.street !== undefined
      ? clean(overrides.street)
      : clean(recipient.address_line1);
  // address_line1 của sàn có thể đã chứa sẵn phường/tỉnh → chỉ nối phần còn thiếu.
  const parts = [street, ward, province].filter((p): p is string => p !== null);
  const address = parts
    .filter(
      (part, i) =>
        i === 0 || !street?.toLowerCase().includes(part.toLowerCase()),
    )
    .join(', ');
  return {
    name: recipient.full_name,
    phone: recipient.phone,
    address,
    ward_name: ward,
    province_name: province,
    district_name: clean(recipient.district_name),
  };
}
