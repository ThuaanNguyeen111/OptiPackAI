import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { mapWithConcurrency } from '../../common/utils/concurrency.util';
import { CARRIER_ADAPTER } from '../carriers/carrier-adapter.interface';
import type { CarrierAdapter } from '../carriers/carrier-adapter.interface';
import type {
  CarrierParcel,
  CarrierRecipient,
  CreateShipmentResult,
} from '../carriers/carrier.types';
import { buildCarrierRecipient } from '../carriers/utils/recipient-address.util';
import { CARRIER_ERROR_CODES } from '../carriers/carriers.errors';
import type { DemoRecipientValue } from '../carriers/utils/demo-recipient.util';
import { DemoRecipientService } from '../carriers/demo-recipient.service';
import { isMaskedValue } from '../orders/utils/vn-administrative-area.util';
import { notPackableStatuses } from '../orders/order-sync-policy';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import type { ParcelInput, ParcelQuote, ServiceQuote } from './utils/shipping-cost.util';
import { volumetricWeightG } from './utils/shipping-cost.util';

/** Số kiện hỏi hãng cùng lúc (tránh chạm giới hạn tần suất GHN). */
export const QUOTE_CONCURRENCY = 4;
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
  /** 28/10/2026 — true khi địa chỉ là địa chỉ MÔ PHỎNG (đơn bị che, môi trường demo). */
  isDemo?: boolean;
  /** Số nhà gửi hãng lấy từ địa chỉ mô phỏng (không phải Coordinator nhập) → được tự bỏ khi GHN báo lệch phường. */
  demoStreetUsed?: boolean;
  /** Bản mô phỏng đã dùng (null khi địa chỉ thật). */
  demo?: DemoRecipientValue | null;
}

/** 28/10/2026 — địa chỉ gửi hãng của 1 đơn, để màn Giao hàng điền sẵn (GET /shipping/recipients/:groupId). */
export interface RecipientPreview {
  orderId: string;
  platformOrderId: string;
  platform: string;
  name: string;
  phone: string | null;
  street: string | null;
  wardName: string | null;
  provinceName: string | null;
  address: string | null;
  isDemo: boolean;
  demoSeq: number | null;
  assumptions: string[];
  /** Mã lỗi khi chưa dựng được địa chỉ (VD CARRIER_ADDRESS_INCOMPLETE) — Coordinator nhập tay. */
  errorCode: string | null;
  errorMessage: string | null;
}

/** Chuỗi có nội dung và không bị sàn che (`*`) → trả lại; ngược lại null. */
const usableText = (value: string | null | undefined): string | null => {
  const text = value?.trim();
  return text && !isMaskedValue(text) ? text : null;
};

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
    // 28/10/2026 — địa chỉ mô phỏng (chỉ đọc DB); optional để test cũ dựng service không cần.
    @Optional() private readonly demoRecipients?: DemoRecipientService,
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

  /** 28/10/2026 — địa chỉ mô phỏng của đơn (tính lại từ dữ liệu, KHÔNG ghi DB), null nếu không dùng. */
  async demoRecipientOf(order: OrderDocument): Promise<DemoRecipientValue | null> {
    return this.demoRecipients ? this.demoRecipients.resolve(order) : null;
  }

  /** Báo giá / tạo vận đơn / xem trước đều đi qua đây: tính địa chỉ mô phỏng nếu cần rồi dựng địa chỉ. */
  async prepareRecipient(order: OrderDocument, toLocation?: ToLocationInput | null): Promise<ResolvedRecipient> {
    const demo = await this.demoRecipientOf(order);
    return this.resolveRecipient(order, toLocation, demo);
  }

  /**
   * GHN báo "To address conflict" (số nhà nằm ở phường khác) với địa chỉ MÔ PHỎNG → tự gửi lại
   * chỉ phường + tỉnh (dạng GHN đã nhận, kiểm 10/10/2026). Địa chỉ thật hoặc số nhà Coordinator
   * nhập thì KHÔNG tự bỏ — báo lỗi như cũ để người dùng sửa.
   */
  private async withDemoStreetFallback<T>(
    resolved: ResolvedRecipient,
    call: (recipient: CarrierRecipient) => Promise<T>,
  ): Promise<{ value: T; assumptions: string[] }> {
    try {
      return { value: await call(resolved.recipient), assumptions: resolved.assumptions };
    } catch (error: unknown) {
      const conflict = error instanceof AppException && error.errorCode === CARRIER_ERROR_CODES.ADDRESS_CONFLICT;
      if (!conflict || !resolved.demoStreetUsed) throw error;
      const r = resolved.recipient;
      const withoutStreet: CarrierRecipient = { ...r, address: [r.ward_name, r.province_name].join(', ') };
      return {
        value: await call(withoutStreet),
        assumptions: [
          ...resolved.assumptions,
          `GHN báo số nhà mô phỏng không thuộc ${r.ward_name} — đã gửi lại chỉ phường + tỉnh.`,
        ],
      };
    }
  }

  async loadOrder(orderId: string): Promise<OrderDocument> {
    const order = Types.ObjectId.isValid(orderId) ? await this.orderModel.findById(orderId) : null;
    if (!order) {
      throw new AppException('ORD_NOT_FOUND', `Không tìm thấy đơn ${orderId} của kiện.`, HttpStatus.NOT_FOUND, { orderId });
    }
    return order;
  }

  /** Địa chỉ gửi hãng cho 1 đơn: ưu tiên giá trị Coordinator nhập → dữ liệu đơn → mặc định demo. */
  resolveRecipient(
    order: OrderDocument,
    toLocation?: ToLocationInput | null,
    demo?: DemoRecipientValue | null,
  ): ResolvedRecipient {
    if (demo) return this.resolveDemoRecipient(order, demo, toLocation);
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

  /**
   * 28/10/2026 — dựng địa chỉ từ bản MÔ PHỎNG (cả bộ: số nhà + phường + tỉnh + SĐT, không trộn
   * với phường thật của sàn để tránh GHN báo lệch). Giá trị Coordinator nhập vẫn được ưu tiên.
   * Tên người nhận giữ nguyên tên (bị che) của sàn.
   */
  private resolveDemoRecipient(
    order: OrderDocument,
    demo: DemoRecipientValue,
    toLocation?: ToLocationInput | null,
  ): ResolvedRecipient {
    const streetOverride = toLocation?.street !== undefined && toLocation.street !== null;
    const recipient = buildCarrierRecipient(
      {
        full_name: order.recipient.full_name,
        phone: demo.phone,
        address_line1: demo.street,
        province_name: demo.province_name,
        district_name: null,
        ward_name: demo.ward_name,
      },
      {
        ...(streetOverride ? { street: toLocation.street ?? '' } : {}),
        ...(toLocation?.ward_name ? { ward_name: toLocation.ward_name } : {}),
        ...(toLocation?.province_name ? { province_name: toLocation.province_name } : {}),
      },
    );
    const overridePhone = toLocation?.phone?.trim();
    if (overridePhone) recipient.phone = overridePhone;
    if (!recipient.name.trim()) recipient.name = 'Khách hàng';
    return {
      recipient,
      assumptions: [
        `Đơn bị che địa chỉ — dùng địa chỉ mô phỏng #${String(demo.seq)}: ${demo.street}, ${demo.ward_name}, ${demo.province_name}, SĐT ${demo.phone} (chỉ môi trường demo).`,
      ],
      isDemo: true,
      demoStreetUsed: !streetOverride,
      demo,
    };
  }

  /** 28/10/2026 — các đơn còn giao được của nhóm (bỏ đơn đã hủy/không đóng được), cũ trước. */
  async previewRecipientsForGroup(groupId: Types.ObjectId): Promise<RecipientPreview[]> {
    const orders = await this.orderModel
      .find({ consolidated_group_id: groupId, status: { $nin: notPackableStatuses() } })
      .sort({ created_at: 1 });
    return this.previewRecipients(orders);
  }

  /** 28/10/2026 — địa chỉ gửi hãng của từng đơn trong nhóm, để màn Giao hàng điền sẵn. */
  async previewRecipients(orders: OrderDocument[]): Promise<RecipientPreview[]> {
    const out: RecipientPreview[] = [];
    for (const order of orders) {
      const base = {
        orderId: String(order._id),
        platformOrderId: order.platform_order_id,
        platform: order.platform,
      };
      try {
        const resolved = await this.prepareRecipient(order);
        const r = resolved.recipient;
        const demo = resolved.demo ?? null;
        out.push({
          ...base,
          name: r.name,
          phone: r.phone,
          street: demo ? demo.street : usableText(order.recipient.address_line1),
          wardName: r.ward_name,
          provinceName: r.province_name,
          address: r.address,
          isDemo: resolved.isDemo === true,
          demoSeq: demo?.seq ?? null,
          assumptions: resolved.assumptions,
          errorCode: null,
          errorMessage: null,
        });
      } catch (error: unknown) {
        if (!(error instanceof AppException)) throw error;
        out.push({
          ...base,
          name: order.recipient.full_name,
          phone: null,
          street: null,
          wardName: null,
          provinceName: null,
          address: null,
          isDemo: false,
          demoSeq: null,
          assumptions: [],
          errorCode: error.errorCode,
          errorMessage: error.message,
        });
      }
    }
    return out;
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
      .filter((i) => !notPackableStatuses().includes(i.status))
      .map((i) => ({ name: i.name.slice(0, 500), code: i.sku, quantity: i.quantity, price: Math.round(i.unit_price) }));
  }

  /**
   * Báo giá 1 dịch vụ hãng cho các kiện (Preview — KHÔNG tạo vận đơn). Lỗi của bất kỳ
   * kiện nào ném ra nguyên AppException của adapter (VD CARRIER_ADDRESS_CONFLICT).
   */
  async quoteParcels(service: LiveServiceRef, parcels: ParcelInput[], toLocation?: ToLocationInput | null): Promise<ServiceQuote> {
    // (14/10/2026) Đọc mỗi đơn 1 lần rồi hỏi hãng SONG SONG (tối đa QUOTE_CONCURRENCY kiện
    // cùng lúc) — trước đây tuần tự từng kiện, nhóm nhiều kiện vượt timeout 12 s của FE.
    const orderIds = [...new Set(parcels.map((p) => p.orderId ?? ''))];
    const loaded = await Promise.all(orderIds.map((id) => this.loadOrder(id)));
    const orders = new Map<string, OrderDocument>();
    orderIds.forEach((id, i) => {
      const o = loaded[i];
      if (o) orders.set(id, o);
    });
    // 28/10/2026 — dựng địa chỉ MỖI ĐƠN 1 lần (địa chỉ mô phỏng cần đọc DB) trước khi hỏi
    // hãng song song, để các kiện cùng đơn không đọc lại nhiều lần.
    const recipients = new Map<string, ResolvedRecipient>();
    for (const [id, order] of orders) recipients.set(id, await this.prepareRecipient(order, toLocation));
    const assumptions = new Set<string>();
    const results = await mapWithConcurrency(parcels, QUOTE_CONCURRENCY, async (p) => {
      const order = orders.get(p.orderId ?? '') ?? (await this.loadOrder(p.orderId ?? ''));
      const resolved = recipients.get(p.orderId ?? '') ?? (await this.prepareRecipient(order, toLocation));
      const carrierParcel = this.toCarrierParcel(p);
      const { value: preview, assumptions: a } = await this.withDemoStreetFallback(resolved, (recipient) =>
        this.adapter.previewShipment({
          client_order_code: `Q-${order.platform_order_id}-${String(p.cartonIndex)}`.slice(0, 50),
          recipient,
          parcel: carrierParcel,
          items: this.itemsOf(order),
          content: `Đơn ${order.platform_order_id}`.slice(0, 200),
          cod_amount: 0,
          ...(service.serviceTypeId !== null ? { service_type_id: service.serviceTypeId } : {}),
        }),
      );
      const volumetricG = volumetricWeightG(p.outer, service.volumetricDivisor);
      const quote: ParcelQuote = {
        orderId: p.orderId,
        cartonIndex: p.cartonIndex,
        ...(p.parcelNo !== undefined ? { parcelNo: p.parcelNo } : {}),
        actualG: p.actualG,
        volumetricG,
        chargeableG: Math.max(Math.ceil(p.actualG), volumetricG),
        costVnd: preview.fee.total,
      };
      return { quote, assumptions: a, eta: preview.expected_delivery_at?.getTime() ?? 0 };
    });
    const quoted = results.map((r) => r.quote);
    for (const r of results) for (const x of r.assumptions) assumptions.add(x);
    const latestEta = results.reduce((m, r) => Math.max(m, r.eta), 0);
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
    const resolved = await this.prepareRecipient(order, input.toLocation);
    const carrierParcel = this.toCarrierParcel(input.parcel);
    const { value: result, assumptions } = await this.withDemoStreetFallback(resolved, (recipient) =>
      this.adapter.createShipment({
        client_order_code: input.clientOrderCode,
        recipient,
        parcel: carrierParcel,
        items: this.itemsOf(order),
        content: `Đơn ${order.platform_order_id}`.slice(0, 200),
        cod_amount: 0,
        ...(input.note ? { note: input.note.slice(0, 500) } : {}),
        ...(input.service.serviceTypeId !== null ? { service_type_id: input.service.serviceTypeId } : {}),
      }),
    );
    this.logger.log(`Đã tạo vận đơn hãng ${this.adapter.code} ${result.carrier_order_code} cho ${input.clientOrderCode}.`);
    return { carrierParcel, result, assumptions };
  }
}
