import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { AppException } from '../../../common/exceptions/app-exception';
import { envOrDefault } from '../../../common/utils/env.util';
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
import { CARRIER_ERROR_CODES, CarrierErrorCode } from '../carriers.errors';
import { validateParcel } from '../utils/parcel.util';

/**
 * ===================================================================
 * ADAPTER — GIAO HÀNG NHANH (GHN) (08/10/2026, C2)
 * ===================================================================
 * Nguồn: tài liệu chính thức developer.ghn.vn (đọc từng trang 07/10/2026) +
 * kiểm chứng bằng gọi thật môi trường test 08/10/2026 (shop 227609):
 *   - Calculate Fee chỉ nhận địa chỉ kiểu cũ (to_district_id + to_ward_code).
 *   - Create Order nhận cả mã lẫn tên; gửi tên tiếng Việt phải là JSON UTF-8.
 *   - Tạo lại cùng client_order_code trả lại ĐÚNG vận đơn cũ (không tạo trùng)
 *     → createShipment được phép tự thử lại khi lỗi mạng/5xx.
 *   - Cancel: 1 mã sai làm hỏng cả lô → luôn gửi từng mã; KHÔNG tự thử lại.
 * Không bao giờ ghi Token vào log (khuyến cáo của GHN).
 * ===================================================================
 */

const API_PREFIX = '/shiip/public-api';
const LABEL_TOKEN_TTL_MS = 25 * 60 * 1000; // GHN: token in ~30 phút — trừ hao 5 phút

// --- Hình dạng response gốc của GHN (chỉ dùng trong file này) ---
interface GhnEnvelope<T> {
  code: number;
  message?: string;
  code_message?: string;
  code_message_value?: string;
  message_display?: string;
  data: T;
}

interface GhnFeeData {
  total: number;
  service_fee: number;
  insurance_fee: number;
  cod_fee: number;
  pick_remote_areas_fee: number;
  deliver_remote_areas_fee: number;
}

interface GhnOrderFee {
  main_service?: number;
  insurance?: number;
  cod_fee?: number;
  pick_remote_areas_fee?: number;
  deliver_remote_areas_fee?: number;
}

interface GhnCreateOrderData {
  order_code: string;
  sort_code?: string;
  fee?: GhnOrderFee;
  total_fee: number;
  expected_delivery_time?: string;
}

interface GhnOrderDetailData {
  order_code: string;
  client_order_code?: string;
  status: string;
  converted_weight?: number;
  updated_date?: string;
}

interface GhnCancelItem {
  order_code: string;
  result: boolean;
  message?: string;
}

interface GhnServiceItem {
  service_id: number;
  short_name: string;
  service_type_id: number;
}

interface GhnShopItem {
  _id: number;
  district_id: number;
}

interface RequestOptions {
  retry: boolean;
  notFoundAsNull?: boolean; // dùng cho tra cứu theo mã — không thấy thì trả null
}

@Injectable()
export class GhnAdapter implements CarrierAdapter {
  readonly code = CarrierCode.GHN;
  private readonly logger = new Logger(GhnAdapter.name);
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly shopId: number;
  private readonly defaultServiceTypeId: number;
  private readonly defaultRequiredNote: string;
  private readonly defaultPaymentTypeId: number;
  private shopDistrictId: number | null = null; // cache — địa chỉ kho ít khi đổi

  private static readonly MAX_RETRIES = 2;
  private static readonly BASE_DELAY_MS = 300;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = envOrDefault(
      this.configService.get<string>('carrier.ghn.baseUrl'),
      'https://dev-online-gateway.ghn.vn',
    );
    this.token = this.configService.get<string>('carrier.ghn.token');
    this.shopId = Number(this.configService.get<string>('carrier.ghn.shopId'));
    this.defaultServiceTypeId = Number(
      envOrDefault(
        this.configService.get<string>('carrier.ghn.defaultServiceTypeId'),
        '2',
      ),
    );
    this.defaultRequiredNote = envOrDefault(
      this.configService.get<string>('carrier.ghn.defaultRequiredNote'),
      'CHOXEMHANGKHONGTHU',
    );
    this.defaultPaymentTypeId = Number(
      envOrDefault(
        this.configService.get<string>('carrier.ghn.defaultPaymentTypeId'),
        '1',
      ),
    );
    const timeoutMs = Number(
      envOrDefault(this.configService.get<string>('carrier.ghn.timeoutMs'), '10000'),
    );
    // Không gắn Token vào instance ở đây: thiếu token vẫn cho app khởi động
    // (chế độ mock) — báo lỗi rõ ràng lúc thực sự gọi GHN.
    this.http = axios.create({
      baseURL: `${this.baseUrl}${API_PREFIX}`,
      timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // ---------------------------------------------------------------- public

  async calculateFee(input: CalculateFeeInput): Promise<CarrierFeeBreakdown> {
    this.assertParcel(input.parcel);
    const data = await this.request<GhnFeeData>(
      'post',
      '/v2/shipping-order/fee',
      {
        service_type_id: input.service_type_id ?? this.defaultServiceTypeId,
        to_district_id: input.to_district_id,
        to_ward_code: input.to_ward_code,
        weight: input.parcel.weight_g,
        length: input.parcel.length_cm,
        width: input.parcel.width_cm,
        height: input.parcel.height_cm,
        insurance_value: input.insurance_value ?? 0,
        cod_value: input.cod_value ?? 0,
      },
      { retry: true },
    );
    return this.toBreakdown({
      total: data.total,
      service: data.service_fee,
      insurance: data.insurance_fee,
      cod: data.cod_fee,
      remote: data.pick_remote_areas_fee + data.deliver_remote_areas_fee,
    });
  }

  async getAvailableServices(toDistrictId: number): Promise<CarrierService[]> {
    const fromDistrict = await this.getShopDistrictId();
    const data = await this.request<GhnServiceItem[] | null>(
      'post',
      '/v2/shipping-order/available-services',
      { shop_id: this.shopId, from_district: fromDistrict, to_district: toDistrictId },
      { retry: true },
    );
    // GHN: body rỗng = không tìm thấy shop (tài liệu Get Service).
    return (data ?? []).map((s) => ({
      service_id: s.service_id,
      service_type_id: s.service_type_id,
      short_name: s.short_name,
    }));
  }

  async previewShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    return this.submitOrder('/v2/shipping-order/preview', input);
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    return this.submitOrder('/v2/shipping-order/create', input);
  }

  async cancelShipment(
    carrierOrderCode: string,
    reasonCode?: string,
  ): Promise<CancelShipmentResult> {
    const data = await this.request<GhnCancelItem[]>(
      'post',
      '/v2/switch-status/cancel',
      reasonCode
        ? { order_codes: [carrierOrderCode], reason_code: reasonCode }
        : { order_codes: [carrierOrderCode] },
      { retry: false }, // thao tác ghi không bảo đảm lặp lại an toàn → không tự thử lại
    );
    const item = data.find((d) => d.order_code === carrierOrderCode);
    return {
      carrier_order_code: carrierOrderCode,
      cancelled: item?.result === true,
      message: item?.message ?? null,
    };
  }

  async getShipmentDetail(carrierOrderCode: string): Promise<CarrierOrderDetail> {
    const data = await this.request<GhnOrderDetailData | null>(
      'get',
      '/v2/shipping-order/detail',
      { order_code: carrierOrderCode },
      { retry: true },
    );
    if (data === null) {
      throw this.error(
        CARRIER_ERROR_CODES.ORDER_NOT_FOUND,
        `Không tìm thấy vận đơn GHN ${carrierOrderCode}.`,
        HttpStatus.NOT_FOUND,
      );
    }
    return this.toDetail(data);
  }

  async getShipmentDetailByClientCode(
    clientOrderCode: string,
  ): Promise<CarrierOrderDetail | null> {
    const data = await this.request<GhnOrderDetailData | null>(
      'get',
      '/v2/shipping-order/detail-by-client-code',
      { client_order_code: clientOrderCode },
      { retry: true, notFoundAsNull: true },
    );
    return data === null ? null : this.toDetail(data);
  }

  async createLabel(carrierOrderCodes: string[]): Promise<CarrierLabel> {
    const data = await this.request<{ token: string }>(
      'post',
      '/v2/a5/gen-token',
      { order_codes: carrierOrderCodes },
      { retry: true }, // chỉ sinh token in, không đổi dữ liệu vận đơn
    );
    return {
      url: `${this.baseUrl}/a5/public-api/printA5?token=${encodeURIComponent(data.token)}`,
      expires_at: new Date(Date.now() + LABEL_TOKEN_TTL_MS),
    };
  }

  // --------------------------------------------------------------- private

  private async submitOrder(
    path: string,
    input: CreateShipmentInput,
  ): Promise<CreateShipmentResult> {
    this.assertParcel(input.parcel);
    const { recipient, parcel } = input;
    const data = await this.request<GhnCreateOrderData>(
      'post',
      path,
      {
        payment_type_id: input.payment_type_id ?? this.defaultPaymentTypeId,
        required_note: input.required_note ?? this.defaultRequiredNote,
        service_type_id: input.service_type_id ?? this.defaultServiceTypeId,
        client_order_code: input.client_order_code,
        to_name: recipient.name,
        to_phone: recipient.phone,
        to_address: recipient.address,
        to_ward_code: recipient.ward_code,
        to_district_id: recipient.district_id,
        to_ward_name: recipient.ward_name,
        to_district_name: recipient.district_name,
        to_province_name: recipient.province_name,
        weight: parcel.weight_g,
        length: parcel.length_cm,
        width: parcel.width_cm,
        height: parcel.height_cm,
        content: input.content,
        cod_amount: input.cod_amount,
        insurance_value: input.insurance_value ?? 0,
        note: input.note ?? '',
        items: input.items.map((item) => ({
          name: item.name,
          code: item.code,
          quantity: item.quantity,
          price: item.price,
        })),
      },
      { retry: true }, // an toàn: GHN chống tạo trùng theo client_order_code
    );
    const fee = data.fee ?? {};
    return {
      carrier_order_code: data.order_code,
      sort_code: data.sort_code ?? null,
      fee: this.toBreakdown({
        total: data.total_fee,
        service: fee.main_service ?? 0,
        insurance: fee.insurance ?? 0,
        cod: fee.cod_fee ?? 0,
        remote: (fee.pick_remote_areas_fee ?? 0) + (fee.deliver_remote_areas_fee ?? 0),
      }),
      expected_delivery_at: data.expected_delivery_time
        ? new Date(data.expected_delivery_time)
        : null,
    };
  }

  private async getShopDistrictId(): Promise<number> {
    if (this.shopDistrictId !== null) return this.shopDistrictId;
    const data = await this.request<{ shops: GhnShopItem[] }>(
      'get',
      '/v2/shop/all',
      { offset: 0, limit: 200 },
      { retry: true },
    );
    const shop = data.shops.find((s) => s._id === this.shopId);
    if (!shop || shop.district_id === 0) {
      throw this.error(
        CARRIER_ERROR_CODES.NOT_CONFIGURED,
        `Cửa hàng GHN ${String(this.shopId)} chưa có địa chỉ lấy hàng — kiểm tra GHN_SHOP_ID.`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    this.shopDistrictId = shop.district_id;
    return shop.district_id;
  }

  private toBreakdown(parts: {
    total: number;
    service: number;
    insurance: number;
    cod: number;
    remote: number;
  }): CarrierFeeBreakdown {
    const known = parts.service + parts.insurance + parts.cod + parts.remote;
    return {
      total: parts.total,
      service_fee: parts.service,
      insurance_fee: parts.insurance,
      cod_fee: parts.cod,
      remote_area_fee: parts.remote,
      other_fee: Math.max(0, parts.total - known),
    };
  }

  private toDetail(data: GhnOrderDetailData): CarrierOrderDetail {
    return {
      carrier_order_code: data.order_code,
      client_order_code: data.client_order_code ?? null,
      carrier_status: data.status,
      converted_weight_g: data.converted_weight ?? null,
      updated_at: data.updated_date ? new Date(data.updated_date) : null,
    };
  }

  private assertParcel(parcel: CarrierParcel): void {
    const problems = validateParcel(parcel);
    if (problems.length > 0) {
      throw this.error(
        CARRIER_ERROR_CODES.PARCEL_LIMIT_EXCEEDED,
        `Kích thước/cân nặng kiện không hợp lệ: ${problems.join('; ')}.`,
        HttpStatus.BAD_REQUEST,
        { problems },
      );
    }
  }

  private assertConfigured(): string {
    if (!this.token || !Number.isInteger(this.shopId) || this.shopId <= 0) {
      throw this.error(
        CARRIER_ERROR_CODES.NOT_CONFIGURED,
        'Chưa cấu hình GHN_TOKEN / GHN_SHOP_ID.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return this.token;
  }

  private async request<T>(
    method: 'get' | 'post',
    path: string,
    payload: Record<string, unknown>,
    options: RequestOptions,
  ): Promise<T> {
    const token = this.assertConfigured();
    const headers = { Token: token, ShopId: String(this.shopId) };
    const maxAttempts = options.retry ? GhnAdapter.MAX_RETRIES + 1 : 1;

    for (let attempt = 1; ; attempt++) {
      try {
        const response =
          method === 'get'
            ? await this.http.get<GhnEnvelope<T>>(path, { params: payload, headers })
            : await this.http.post<GhnEnvelope<T>>(path, payload, { headers });
        return response.data.data;
      } catch (error: unknown) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        const retryable = status === undefined || status === 429 || status >= 500;
        if (axios.isAxiosError(error) && status !== undefined && status < 500 && status !== 429) {
          const body = error.response?.data as Partial<GhnEnvelope<unknown>> | undefined;
          if (options.notFoundAsNull && this.looksLikeNotFound(body)) {
            return null as T;
          }
          throw this.mapGhnError(path, status, body);
        }
        if (!retryable || attempt >= maxAttempts) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`GHN ${path} không phản hồi: ${message}`);
          throw this.error(
            CARRIER_ERROR_CODES.UNAVAILABLE,
            'GHN đang không phản hồi, vui lòng thử lại sau.',
            HttpStatus.BAD_GATEWAY,
          );
        }
        const backoff = GhnAdapter.BASE_DELAY_MS * 2 ** (attempt - 1);
        this.logger.warn(
          `GHN ${path} lỗi tạm thời (lần ${String(attempt)}/${String(maxAttempts)}), thử lại sau ${String(backoff)}ms.`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  private looksLikeNotFound(body: Partial<GhnEnvelope<unknown>> | undefined): boolean {
    const text = `${body?.code_message ?? ''} ${body?.message ?? ''}`.toLowerCase();
    return text.includes('not found') || text.includes('không tìm thấy');
  }

  private mapGhnError(
    path: string,
    status: number,
    body: Partial<GhnEnvelope<unknown>> | undefined,
  ): AppException {
    const ghnCode = body?.code_message ?? '';
    // Chuỗi rỗng cũng coi là "không có" (TS gotcha #14) → lọc chuỗi rỗng tường minh.
    const ghnText =
      [body?.code_message_value, body?.message].find(
        (text): text is string => typeof text === 'string' && text.length > 0,
      ) ?? 'GHN từ chối yêu cầu.';
    this.logger.warn(`GHN ${path} → ${String(status)} ${ghnCode}: ${body?.message ?? ''}`);

    let code: CarrierErrorCode = CARRIER_ERROR_CODES.INVALID_REQUEST;
    if (status === 401 || status === 403 || ghnCode === 'CLIENT_NOT_OWNER_OF_SHOP') {
      code = CARRIER_ERROR_CODES.UNAUTHORIZED;
    } else if (ghnCode === 'PHONE_INVALID') {
      code = CARRIER_ERROR_CODES.INVALID_PHONE;
    } else if (ghnCode === 'ROUTE_NOT_FOUND_SERVICE' || ghnCode === 'SERVICE_NOT_FOUND_CONFIG_FEE') {
      code = CARRIER_ERROR_CODES.ROUTE_NOT_SUPPORTED;
    } else if (/PROVINCE|DISTRICT|WARD|ADDRESS/.test(ghnCode)) {
      code = CARRIER_ERROR_CODES.INVALID_ADDRESS;
    } else if (this.looksLikeNotFound(body)) {
      code = CARRIER_ERROR_CODES.ORDER_NOT_FOUND;
    }
    const httpStatus =
      code === CARRIER_ERROR_CODES.UNAUTHORIZED
        ? HttpStatus.BAD_GATEWAY // lỗi cấu hình phía hệ thống, không phải lỗi quyền của người dùng
        : code === CARRIER_ERROR_CODES.ORDER_NOT_FOUND
          ? HttpStatus.NOT_FOUND
          : HttpStatus.UNPROCESSABLE_ENTITY;
    return this.error(code, ghnText, httpStatus, { carrierCode: ghnCode || null });
  }

  private error(
    code: CarrierErrorCode,
    message: string,
    status: HttpStatus,
    details?: Record<string, unknown>,
  ): AppException {
    return new AppException(code, message, status, { carrier: this.code, ...details });
  }
}
