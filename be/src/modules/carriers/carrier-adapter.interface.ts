import {
  CalculateFeeInput,
  CancelShipmentResult,
  CarrierCode,
  CarrierFeeBreakdown,
  CarrierLabel,
  CarrierOrderDetail,
  CarrierService,
  CreateShipmentInput,
  CreateShipmentResult,
} from './carrier.types';

/** Token DI cho adapter đang dùng — chọn theo CARRIER_MODE trong carriers.module.ts. */
export const CARRIER_ADAPTER = Symbol('CARRIER_ADAPTER');

/**
 * Hợp đồng mà MỌI hãng vận chuyển phải cài đặt. Lỗi từ hãng ném ra dạng
 * AppException với mã CARRIER_* (xem carriers.errors.ts) — service phía trên
 * không phải tự đọc mã lỗi riêng của từng hãng.
 */
export interface CarrierAdapter {
  readonly code: CarrierCode;
  calculateFee(input: CalculateFeeInput): Promise<CarrierFeeBreakdown>;
  getAvailableServices(toDistrictId: number): Promise<CarrierService[]>;
  previewShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  cancelShipment(
    carrierOrderCode: string,
    reasonCode?: string,
  ): Promise<CancelShipmentResult>;
  getShipmentDetail(carrierOrderCode: string): Promise<CarrierOrderDetail>;
  getShipmentDetailByClientCode(
    clientOrderCode: string,
  ): Promise<CarrierOrderDetail | null>;
  createLabel(carrierOrderCodes: string[]): Promise<CarrierLabel>;
}
