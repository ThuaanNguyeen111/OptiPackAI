import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { CARRIER_ADAPTER } from '../carriers/carrier-adapter.interface';
import type { CarrierAdapter } from '../carriers/carrier-adapter.interface';
import type {
  CarrierParcel,
  CarrierRecipient,
  CreateShipmentResult,
} from '../carriers/carrier.types';
import { buildCarrierRecipient } from '../carriers/utils/recipient-address.util';
import { isMaskedValue } from '../orders/utils/vn-administrative-area.util';
import { NOT_PACKABLE_ORDER_STATUSES } from '../orders/enums/order-status.enum';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import type { ParcelInput, ParcelQuote, ServiceQuote } from './utils/shipping-cost.util';
import { volumetricWeightG } from './utils/shipping-cost.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Địa chỉ Coordinator sửa / bổ sung khi gửi hãng (đơn Lazada bị che). Rỗng = lấy từ đơn. */
export interface ToLocationInput {
  street?: string | null; // '' = cố ý bỏ số nhà
  ward_name?: string | null;
  province_name?: string | null;
  phone?: string | null;
}

/** Hãng + dịch vụ kiểu 'live' (rút gọn từ shipping_carriers). */
export interface LiveServiceRef {
  carrierCode: string;
  carrierName: string;
  volumetricDivisor: number;
  serviceCode: string;
  serviceName: string;
  serviceTypeId: number | null;
}

export interface ResolvedRecipient {
  recipient: CarrierRecipient;
  /** Giá trị hệ thống tự bổ sung (tỉnh mặc định, SĐT demo) — hiện cho Coordinator thấy. */
  assumptions: string[];
}

export interface ParcelBookingInput {
  clientOrderCode: string;
  parcel: ParcelInput;
  service: LiveServiceRef;
  toLocation?: ToLocationInput | null;
  note?: string | null;
}

export interface ParcelBookingResult {
  carrierParcel: CarrierParcel;
  result: CreateShipmentResult;
  assumptions: string[];
}

const VN_PHONE = /^0\d{9,10}$/;

/**
 * ===================================================================
 * C4 (14/10/2026) — cầu nối module `shipping` (báo giá theo kiện của Thi) với
 * module `carriers` (adapter GHN/mock của Thuận)
 * ===================================================================
 * - Báo giá hãng 'live' = gọi Preview CHO TỪNG KIỆN (kích thước thùng thật, cân
 *   thật/ước tính) → trả đúng khuôn `ServiceQuote` của shipping, để màn hình báo giá,
 *   chọn đề xuất, ghi cước lên kiện (`persistCosts`) dùng lại nguyên vẹn.
 * - Tạo vận đơn = gọi Create Order cho từng kiện (1 kiện = 1 đơn GHN).
 * - Đơn bị che (Lazada): bỏ phần `***`; thiếu tỉnh → `CARRIER_DEFAULT_PROVINCE`;
 *   SĐT bị che/sai → `CARRIER_DEMO_RECIPIENT_PHONE` (chỉ dùng ở môi trường demo).
 *   Mỗi giá trị tự bổ sung đều trả về trong `assumptions`.
 * Không ghi DB — ShipmentsService lo lưu kết quả.
 * ===================================================================
 */
@Injectable()
export class LiveCarrierService {
  private readonly logger = new Logger(LiveCarrierService.name);

  constructor(
    @Inject(CARRIER_ADAPTER) private readonly adapter: CarrierAdapter,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly configService: ConfigService,
  ) {}

  /** 'ghn' | 'mock' — ghi lên vận đơn để biết đơn được tạo ở đâu. */
  get adapterCode(): string {
    return this.adapter.code;
  }

  get adapterInstance(): CarrierAdapter {
    return this.adapter;
  }

  private defaultProvince(): string | null {
    const v = this.configService.get<string>('carrier.defaultProvince')?.trim();
    if (!v) return null;
    return v;
  }

  private demoPhone(): string | null {
    const v = this.configService.get<string>('carrier.demoRecipientPhone')?.trim();
    if (!v) return null;
    return v;
  }

  async loadOrder(orderId: string): Promise<OrderDocument> {
    const order = Types.ObjectId.isValid(orderId) ? await this.orderModel.findById(orderId) : null;
    if (!order) {
      throw new AppException('ORD_NOT_FOUND', `Không tìm thấy đơn ${orderId} của kiện.`, HttpStatus.NOT_FOUND, { orderId });
    }
    return order;
  }

  /** Địa chỉ gửi hãng cho 1 đơn: ưu tiên giá trị Coordinator nhập → dữ liệu đơn → mặc định demo. */
  resolveRecipient(order: OrderDocument, toLocation?: ToLocationInput | null): ResolvedRecipient {
    const assumptions: string[] = [];
    const r = order.recipient;
    const usable = (v: string | null | undefined): boolean => !!v?.trim() && !isMaskedValue(v);
    let province = toLocation?.province_name ?? undefined;
    if (!usable(province) && !usable(r.province_name)) {
      const fallback = this.defaultProvince();
      if (fallback) {
        province = fallback;
        assumptions.push(`Đơn không có tỉnh (bị che) — dùng tỉnh mặc định "${fallback}" (CARRIER_DEFAULT_PROVINCE).`);
      }
    }
    const recipient = buildCarrierRecipient(
      {
        full_name: r.full_name,
        phone: r.phone,
        address_line1: r.address_line1,
        province_name: r.province_name ?? null,
        district_name: r.district_name ?? null,
        // Lazada: phường mới nằm ở `city` khi ward_name bị che.
        ward_name: usable(r.ward_name) ? r.ward_name : r.city,
      },
      {
        ...(toLocation?.street !== undefined && toLocation.street !== null ? { street: toLocation.street } : {}),
        ...(toLocation?.ward_name ? { ward_name: toLocation.ward_name } : {}),
        ...(province ? { province_name: province } : {}),
      },
    );
    const overridePhone = toLocation?.phone?.trim();
    if (overridePhone) {
      recipient.phone = overridePhone;
    } else if (!VN_PHONE.test(recipient.phone.replace(/\s+/g, ''))) {
      const demo = this.demoPhone();
      if (demo) {
        recipient.phone = demo;
        assumptions.push(`SĐT người nhận bị che/không hợp lệ — dùng SĐT demo ${demo} (CARRIER_DEMO_RECIPIENT_PHONE).`);
      }
    }
    if (!recipient.name.trim() || isMaskedValue(recipient.name)) {
      // GHN nhận tên có dấu *, nhưng nhãn in rõ ràng hơn khi ghi chú nguồn.
      recipient.name = recipient.name.trim() ? recipient.name : 'Khách hàng';
    }
    return { recipient, assumptions };
  }

  /** Kiện của kế hoạch đóng gói → kích thước/cân gửi hãng (cm làm tròn lên, g nguyên dương). */
  toCarrierParcel(p: ParcelInput): CarrierParcel {
    const cm = (mm: number): number => Math.max(1, Math.ceil(mm / 10));
    return {
      weight_g: Math.max(1, Math.ceil(p.actualG)),
      length_cm: cm(p.outer.length_mm),
      width_cm: cm(p.outer.width_mm),
      height_cm: cm(p.outer.height_mm),
    };
  }

  private itemsOf(order: OrderDocument): { name: string; code: string; quantity: number; price: number }[] {
    return order.items
      .filter((i) => !NOT_PACKABLE_ORDER_STATUSES.includes(i.status))
      .map((i) => ({ name: i.name.slice(0, 500), code: i.sku, quantity: i.quantity, price: Math.round(i.unit_price) }));
  }

  /**
   * Báo giá 1 dịch vụ hãng cho các kiện (Preview — KHÔNG tạo vận đơn). Lỗi của bất kỳ
   * kiện nào ném ra nguyên AppException của adapter (VD CARRIER_ADDRESS_CONFLICT).
   */
  async quoteParcels(service: LiveServiceRef, parcels: ParcelInput[], toLocation?: ToLocationInput | null): Promise<ServiceQuote> {
    const orders = new Map<string, OrderDocument>();
    const assumptions = new Set<string>();
    const quoted: ParcelQuote[] = [];
    let latestEta = 0;
    for (const p of parcels) {
      const orderId = p.orderId ?? '';
      const order = orders.get(orderId) ?? (await this.loadOrder(orderId));
      orders.set(orderId, order);
      const { recipient, assumptions: a } = this.resolveRecipient(order, toLocation);
      a.forEach((x) => assumptions.add(x));
      const carrierParcel = this.toCarrierParcel(p);
      const preview = await this.adapter.previewShipment({
        client_order_code: `Q-${order.platform_order_id}-${String(p.cartonIndex)}`.slice(0, 50),
        recipient,
        parcel: carrierParcel,
        items: this.itemsOf(order),
        content: `Đơn ${order.platform_order_id}`.slice(0, 200),
        cod_amount: 0,
        ...(service.serviceTypeId !== null ? { service_type_id: service.serviceTypeId } : {}),
      });
      const volumetricG = volumetricWeightG(p.outer, service.volumetricDivisor);
      quoted.push({
        orderId: p.orderId,
        cartonIndex: p.cartonIndex,
        ...(p.parcelNo !== undefined ? { parcelNo: p.parcelNo } : {}),
        actualG: p.actualG,
        volumetricG,
        chargeableG: Math.max(Math.ceil(p.actualG), volumetricG),
        costVnd: preview.fee.total,
      });
      if (preview.expected_delivery_at) latestEta = Math.max(latestEta, preview.expected_delivery_at.getTime());
    }
    const etaDays = latestEta > 0 ? Math.max(1, Math.ceil((latestEta - Date.now()) / DAY_MS)) : 2;
    return {
      carrierCode: service.carrierCode,
      carrierName: service.carrierName,
      serviceCode: service.serviceCode,
      serviceName: service.serviceName,
      etaMinDays: etaDays,
      etaMaxDays: etaDays,
      parcels: quoted,
      totalChargeableG: quoted.reduce((s, q) => s + q.chargeableG, 0),
      totalCostVnd: quoted.reduce((s, q) => s + q.costVnd, 0),
      isSample: false,
      isLive: true,
      unavailableReason: null,
      assumptions: [...assumptions],
    };
  }

  /** Tạo vận đơn ở hãng cho 1 kiện (gọi lại cùng clientOrderCode an toàn — hãng trả đơn cũ). */
  async bookParcel(input: ParcelBookingInput): Promise<ParcelBookingResult> {
    const order = await this.loadOrder(input.parcel.orderId ?? '');
    const { recipient, assumptions } = this.resolveRecipient(order, input.toLocation);
    const carrierParcel = this.toCarrierParcel(input.parcel);
    const result = await this.adapter.createShipment({
      client_order_code: input.clientOrderCode,
      recipient,
      parcel: carrierParcel,
      items: this.itemsOf(order),
      content: `Đơn ${order.platform_order_id}`.slice(0, 200),
      cod_amount: 0,
      ...(input.note ? { note: input.note.slice(0, 500) } : {}),
      ...(input.service.serviceTypeId !== null ? { service_type_id: input.service.serviceTypeId } : {}),
    });
    this.logger.log(`Đã tạo vận đơn hãng ${this.adapter.code} ${result.carrier_order_code} cho ${input.clientOrderCode}.`);
    return { carrierParcel, result, assumptions };
  }
}
