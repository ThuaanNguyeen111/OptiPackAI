import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app-exception';
import { CarrierAdapter } from '../carrier-adapter.interface';
import {
  CalculateFeeInput,
  CancelShipmentResult,
  CarrierCode,
  CarrierFeeBreakdown,
  CarrierLabel,
  CarrierOrderDetail,
  CarrierParcel,
  CarrierService,
  CreateShipmentInput,
  CreateShipmentResult,
} from '../carrier.types';
import { CARRIER_ERROR_CODES } from '../carriers.errors';
import { chargeableWeightG, validateParcel } from '../utils/parcel.util';

/**
 * ===================================================================
 * ADAPTER MOCK — DỰ PHÒNG KHI KHÔNG GỌI ĐƯỢC GHN (08/10/2026, C2)
 * ===================================================================
 * Dùng khi CARRIER_MODE=mock hoặc chưa cấu hình GHN_TOKEN (VD buổi demo mất
 * mạng). KHÔNG gọi mạng, kết quả xác định (cùng đầu vào → cùng đầu ra).
 * Biểu phí MÔ PHỎNG theo bậc 500 g của trọng lượng tính cước — mốc 20.900đ
 * cho kiện ≤ 1 kg khớp đúng phí GHN thật đo được 08/10/2026 (túi 30×25×4,
 * 300 g, nội thành HCM). Không phải biểu phí chính thức của GHN.
 * Tạo lại cùng client_order_code trả cùng mã (giống hành vi GHN thật).
 * ===================================================================
 */

const BASE_FEE = 20_900; // ≤ 1.000 g tính cước
const STEP_G = 500;
const STEP_FEE = 3_300; // mỗi 500 g vượt mốc 1 kg
const INSURANCE_RATE = 0.005; // 0,5% giá trị khai báo trên 1.000.000đ
const INSURANCE_FREE_UNDER = 1_000_000;
const DELIVERY_DAYS = 2;

@Injectable()
export class MockCarrierAdapter implements CarrierAdapter {
  readonly code = CarrierCode.MOCK;
  private readonly cancelled = new Set<string>();

  calculateFee(input: CalculateFeeInput): Promise<CarrierFeeBreakdown> {
    return this.defer(() => {
      this.assertParcel(input.parcel);
      return this.fee(input.parcel, input.insurance_value ?? 0);
    });
  }

  getAvailableServices(): Promise<CarrierService[]> {
    return Promise.resolve([{ service_id: 0, service_type_id: 2, short_name: 'Hàng nhẹ (mô phỏng)' }]);
  }

  previewShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    return this.defer(() => this.build(input, ''));
  }

  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    return this.defer(() => this.build(input, this.codeFor(input.client_order_code)));
  }

  cancelShipment(carrierOrderCode: string): Promise<CancelShipmentResult> {
    this.cancelled.add(carrierOrderCode);
    return Promise.resolve({ carrier_order_code: carrierOrderCode, cancelled: true, message: null });
  }

  getShipmentDetail(carrierOrderCode: string): Promise<CarrierOrderDetail> {
    return Promise.resolve({
      carrier_order_code: carrierOrderCode,
      client_order_code: null,
      carrier_status: this.cancelled.has(carrierOrderCode) ? 'cancel' : 'ready_to_pick',
      converted_weight_g: null,
      updated_at: null,
    });
  }

  getShipmentDetailByClientCode(): Promise<CarrierOrderDetail | null> {
    return Promise.resolve(null);
  }

  createLabel(carrierOrderCodes: string[]): Promise<CarrierLabel> {
    const html = `<html><body style="font-family:sans-serif"><h2>NHÃN MÔ PHỎNG</h2><p>${carrierOrderCodes.join(', ')}</p></body></html>`;
    return Promise.resolve({
      url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
      expires_at: new Date(Date.now() + 25 * 60 * 1000),
    });
  }

  /** Lỗi đồng bộ (VD kiện sai kích thước) trả về dạng Promise bị reject, giống adapter thật. */
  private defer<T>(fn: () => T): Promise<T> {
    return Promise.resolve().then(fn);
  }

  private build(input: CreateShipmentInput, carrierOrderCode: string): CreateShipmentResult {
    this.assertParcel(input.parcel);
    return {
      carrier_order_code: carrierOrderCode,
      sort_code: null,
      fee: this.fee(input.parcel, input.insurance_value ?? 0),
      expected_delivery_at: new Date(Date.now() + DELIVERY_DAYS * 24 * 60 * 60 * 1000),
    };
  }

  private fee(parcel: CarrierParcel, insuranceValue: number): CarrierFeeBreakdown {
    const chargeable = chargeableWeightG(parcel);
    const extraSteps = Math.max(0, Math.ceil((chargeable - 1000) / STEP_G));
    const service = BASE_FEE + extraSteps * STEP_FEE;
    const insurance =
      insuranceValue > INSURANCE_FREE_UNDER ? Math.round(insuranceValue * INSURANCE_RATE) : 0;
    return {
      total: service + insurance,
      service_fee: service,
      insurance_fee: insurance,
      cod_fee: 0,
      remote_area_fee: 0,
      other_fee: 0,
    };
  }

  private codeFor(clientOrderCode: string): string {
    return `MOCK-${clientOrderCode}`;
  }

  private assertParcel(parcel: CarrierParcel): void {
    const problems = validateParcel(parcel);
    if (problems.length > 0) {
      throw new AppException(
        CARRIER_ERROR_CODES.PARCEL_LIMIT_EXCEEDED,
        `Kích thước/cân nặng kiện không hợp lệ: ${problems.join('; ')}.`,
        HttpStatus.BAD_REQUEST,
        { carrier: this.code, problems },
      );
    }
  }
}
