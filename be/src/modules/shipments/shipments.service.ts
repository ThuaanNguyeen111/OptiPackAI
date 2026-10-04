import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Connection, Model, Types } from 'mongoose';
import { Shipment, ShipmentDocument } from './schemas/shipment.schema';
import { SHP_ERROR_CODES } from './shipments.errors';
import { AppException } from '../../common/exceptions/app-exception';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { OrderGroupDocument } from '../order-groups/schemas/order-group.schema';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { ShippingService } from '../shipping/shipping.service';
import type { ServiceQuote } from '../shipping/utils/shipping-cost.util';

export interface ShipmentBatchResult {
  tripCode: string;
  carrierCode: string;
  serviceCode: string;
  totalCostVnd: number;
  shipments: {
    id: string;
    orderGroupId: string;
    trackingCode: string;
    parcelCount: number;
    estimatedCostVnd: number;
    etaFrom: Date;
    etaTo: Date;
  }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ===================================================================
 * shipments.service.ts — Mục 9.5 (29/09/2026) + vận chuyển thật (30/09/2026)
 * ===================================================================
 * Tạo N vận đơn (mỗi group 1 cái) trong 1 giao dịch, chung 1 mã chuyến — chỉ
 * nhận group đã `packed`, ≥2 group thì BẮT BUỘC cùng `recipient_key`.
 * 🔄 30/09/2026: bắt buộc CHỌN hãng + dịch vụ; cước tính từ các kiện thật của
 * nhóm (đa kiện) và ghi lên vận đơn + lên phương án đóng gói của từng đơn.
 * ===================================================================
 */
@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    @InjectModel(Shipment.name)
    private readonly shipmentModel: Model<ShipmentDocument>,
    private readonly orderGroupsService: OrderGroupsService,
    @InjectConnection() private readonly connection: Connection,
    private readonly shippingService: ShippingService,
  ) {}

  async createBatch(
    orderGroupIds: string[],
    carrierCode: string,
    serviceCode: string,
    note: string | undefined,
    userId: string,
    pickupAt?: Date,
  ): Promise<ShipmentBatchResult> {
    const uniqueIds = Array.from(new Set(orderGroupIds));
    if (uniqueIds.length === 0) {
      throw new AppException(
        SHP_ERROR_CODES.EMPTY_GROUP_LIST,
        'Phải chọn ít nhất 1 Order Group.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (pickupAt && pickupAt.getTime() < Date.now() - 60_000) {
      throw new AppException(
        SHP_ERROR_CODES.PICKUP_IN_PAST,
        'Thời điểm hãng đến lấy hàng không được ở quá khứ.',
        HttpStatus.BAD_REQUEST,
        { pickupAt: pickupAt.toISOString() },
      );
    }

    // Load + validate NGOÀI transaction — đọc dữ liệu để kiểm tra sớm,
    // lỗi rõ ràng trước khi mở giao dịch. Ghi (create Shipment + transition
    // group) mới cần transaction thật (Rule #6, ghi đa collection).
    const groups: OrderGroupDocument[] = [];
    for (const id of uniqueIds) {
      // findOrderGroupById() ném ORD_GROUP_NOT_FOUND/ORD_GROUP_INVALID_ID
      // tự nhiên nếu sai — không cần mã lỗi riêng cho case này.
      const group = await this.orderGroupsService.findOrderGroupById(id);
      if (group.fulfillment_status !== GroupFulfillmentStatus.PACKED) {
        throw new AppException(
          SHP_ERROR_CODES.GROUP_NOT_PACKED,
          `Order Group ${id} chưa ở trạng thái "packed" — không thể tạo vận đơn.`,
          HttpStatus.CONFLICT,
          { orderGroupId: id, fulfillmentStatus: group.fulfillment_status },
        );
      }
      groups.push(group);
    }

    if (groups.length > 1) {
      const firstRecipientKey = groups[0]?.recipient_key ?? null;
      const allSameRecipient =
        firstRecipientKey !== null &&
        groups.every((g) => g.recipient_key === firstRecipientKey);
      if (!allSameRecipient) {
        throw new AppException(
          SHP_ERROR_CODES.RECIPIENT_MISMATCH,
          'Chỉ được giao chung chuyến các Order Group cùng người nhận (recipient_key khớp nhau).',
          HttpStatus.BAD_REQUEST,
          { orderGroupIds: uniqueIds },
        );
      }
    }

    // Báo giá đúng dịch vụ đã chọn cho TỪNG group (ném SHIP_SERVICE_NOT_FOUND / SHIP_NO_PARCELS).
    const quotes = new Map<string, ServiceQuote>();
    for (const group of groups) {
      quotes.set(
        group._id.toString(),
        await this.shippingService.quoteChosenService(
          group._id.toString(),
          carrierCode,
          serviceCode,
        ),
      );
    }

    const tripCode = this.generateTripCode();
    const created: ShipmentBatchResult['shipments'] = [];
    const now = Date.now();

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        created.length = 0; // withTransaction có thể chạy lại callback — không cộng dồn kết quả lần trước
        for (const group of groups) {
          const trackingCode = this.generateTrackingCode();
          const quote = quotes.get(group._id.toString());
          if (!quote)
            throw new Error('Thiếu báo giá cho group ' + group._id.toString());
          const etaFrom = new Date(now + quote.etaMinDays * DAY_MS);
          const etaTo = new Date(now + quote.etaMaxDays * DAY_MS);
          try {
            const [shipment] = await this.shipmentModel.create(
              [
                {
                  order_group_id: group._id,
                  trip_code: tripCode,
                  tracking_code: trackingCode,
                  note: note ?? null,
                  created_by: new Types.ObjectId(userId),
                  carrier_code: quote.carrierCode,
                  carrier_name: quote.carrierName,
                  service_code: quote.serviceCode,
                  service_name: quote.serviceName,
                  parcel_count: quote.parcels.length,
                  chargeable_weight_g: quote.totalChargeableG,
                  estimated_cost_vnd: quote.totalCostVnd,
                  is_sample_rate: quote.isSample,
                  eta_from: etaFrom,
                  eta_to: etaTo,
                  pickup_at: pickupAt ?? null,
                },
              ],
              { session },
            );
            if (!shipment) {
              throw new Error('shipmentModel.create() không trả về document.');
            }
            created.push({
              id: shipment._id.toString(),
              orderGroupId: group._id.toString(),
              trackingCode,
              parcelCount: quote.parcels.length,
              estimatedCostVnd: quote.totalCostVnd,
              etaFrom,
              etaTo,
            });
          } catch (error) {
            if (this.isDuplicateKeyError(error)) {
              throw new AppException(
                SHP_ERROR_CODES.GROUP_ALREADY_SHIPPED,
                `Order Group ${group._id.toString()} đã có vận đơn từ trước.`,
                HttpStatus.CONFLICT,
                { orderGroupId: group._id.toString() },
              );
            }
            throw error;
          }

          // Cước ước tính từng đơn thay cho `null` ("chưa có bảng cước").
          await this.shippingService.persistCosts(
            group._id.toString(),
            quote,
            session,
          );
          await this.orderGroupsService.transitionFulfillmentStatus(
            group._id.toString(),
            GroupFulfillmentStatus.SHIPPED,
            group.__v,
            session,
          );
        }
      });
    } finally {
      await session.endSession();
    }

    this.logger.log(
      `Tạo ${String(created.length)} vận đơn (${carrierCode}/${serviceCode}), mã chuyến ${tripCode}, group: ${uniqueIds.join(', ')}.`,
    );

    return {
      tripCode,
      carrierCode,
      serviceCode,
      totalCostVnd: created.reduce((sum, s) => sum + s.estimatedCostVnd, 0),
      shipments: created,
    };
  }

  // ------------------------------------------------------------------ tra cứu

  async findByGroup(groupId: string): Promise<ShipmentDocument | null> {
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    return this.shipmentModel.findOne({ order_group_id: group._id });
  }

  async listShipments(filter: {
    tripCode?: string;
    carrierCode?: string;
    limit?: number;
  }): Promise<ShipmentDocument[]> {
    const query: Record<string, unknown> = {};
    if (filter.tripCode) query.trip_code = filter.tripCode;
    if (filter.carrierCode) query.carrier_code = filter.carrierCode;
    return this.shipmentModel
      .find(query)
      .sort({ created_at: -1 })
      .limit(Math.min(Math.max(filter.limit ?? 50, 1), 200));
  }

  /** Đặt/đổi lịch hãng đến lấy hàng cho 1 vận đơn (chỉ lịch — chưa gọi API hãng thật). */
  async schedulePickup(id: string, pickupAt: Date): Promise<ShipmentDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(
        SHP_ERROR_CODES.SHIPMENT_NOT_FOUND,
        `Không tìm thấy vận đơn "${id}".`,
        HttpStatus.NOT_FOUND,
        { id },
      );
    }
    if (pickupAt.getTime() < Date.now() - 60_000) {
      throw new AppException(
        SHP_ERROR_CODES.PICKUP_IN_PAST,
        'Thời điểm hãng đến lấy hàng không được ở quá khứ.',
        HttpStatus.BAD_REQUEST,
        { pickupAt: pickupAt.toISOString() },
      );
    }
    const updated = await this.shipmentModel.findByIdAndUpdate(
      id,
      { $set: { pickup_at: pickupAt } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new AppException(
        SHP_ERROR_CODES.SHIPMENT_NOT_FOUND,
        `Không tìm thấy vận đơn "${id}".`,
        HttpStatus.NOT_FOUND,
        { id },
      );
    }
    return updated;
  }

  private generateTripCode(): string {
    const now = new Date();
    const yy = String(now.getFullYear() % 100).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const suffix = randomBytes(2).toString('hex').toUpperCase();
    return `TRIP-${yy}${mm}${dd}-${suffix}`;
  }

  private generateTrackingCode(): string {
    return `OPK-${randomBytes(5).toString('hex').toUpperCase()}`;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
