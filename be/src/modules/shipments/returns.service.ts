import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { PackagingMaterialsService } from '../packaging-materials/packaging-materials.service';
import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { WarehouseService } from '../warehouse/warehouse.service';
import { ReturnRequest, ReturnRequestDocument } from './schemas/return-request.schema';
import { Shipment, ShipmentDocument } from './schemas/shipment.schema';
import {
  InspectionResult, OPEN_RETURN_STATUSES, RETURN_WINDOW_DAYS, ReturnReason, ReturnStatus, ReturnType,
} from './enums/return.enums';
import { CreateReturnDto, InspectReturnDto, ResolveQuarantineDto } from './dto/return.dto';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { OrderGroup, OrderGroupDocument } from '../order-groups/schemas/order-group.schema';
import { ProductMaster, ProductMasterDocument } from '../product-master/schemas/product-master.schema';
import { RETURN_ERROR_CODES } from './returns.errors';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import type { MarketplaceReturnRaw } from '../marketplace-integration/interfaces/marketplace-adapter.interface';
import {
  MarketplaceStatusOutbox,
  MarketplaceStatusOutboxDocument,
} from '../marketplace-writeback/schemas/status-outbox.schema';
import { enqueueStatusPush, writebackStatusForReturn } from '../marketplace-writeback/status-outbox.util';
import { ActivityLog, ActivityLogDocument } from '../activity-log/schemas/activity-log.schema';
import { RETURN_STATUS_LABELS, recordActivity } from '../activity-log/activity-log.util';

/** Tham số riêng khi phiếu do KHÁCH gửi trên sàn (không phải Admin đóng vai khách). */
export interface MarketplaceReturnExtra {
  source?: 'simulated' | 'marketplace';
  /** Id yêu cầu bên sàn — chống tạo trùng phiếu. */
  externalRef?: string;
  /** Đơn gốc của khách: số lượng được trả tính theo ĐƠN này, không phải cả nhóm gộp nhiều đơn. */
  orderId?: Types.ObjectId;
  /** Số lượng đã mua theo SKU của đơn gốc (bỏ qua việc đọc cả nhóm, vốn đòi hồ sơ đóng gói). */
  bought?: Map<string, number>;
}

export type MarketplaceReturnOutcome =
  | { outcome: 'created'; rma: ReturnRequestDocument }
  | { outcome: 'exists' }
  | { outcome: 'order_not_ready' }
  | { outcome: 'busy'; reason: string }
  | { outcome: 'rejected'; reason: string };

/** 21/10/2026 — kết quả khi khách hủy yêu cầu trả hàng trên sàn. */
export type MarketplaceReturnCancelOutcome = 'canceled' | 'not_found' | 'already_closed' | 'too_late' | 'busy';

const KNOWN_REASONS: readonly string[] = Object.values(ReturnReason);

/** Lỗi nghiệp vụ khiến yêu cầu của khách KHÔNG BAO GIỜ hợp lệ → tự từ chối kèm lý do. Lỗi khác (dữ liệu/hạ tầng) thử lại sau. */
const AUTO_REJECT_CODES: readonly string[] = [
  RETURN_ERROR_CODES.ORDER_NOT_DELIVERED,
  RETURN_ERROR_CODES.WINDOW_EXPIRED,
  RETURN_ERROR_CODES.INVALID_ITEMS,
  RETURN_ERROR_CODES.EXCHANGE_ITEMS_REQUIRED, // 21/10/2026 — đổi hàng từ website
  RETURN_ERROR_CODES.INVALID_EXCHANGE_ITEMS,
];

/** Lỗi trùng khóa có thuộc index chặn phiếu mở thứ 2 (khác index chống tạo trùng theo id yêu cầu)? */
function isOpenReturnDuplicate(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error) || (error as { code?: unknown }).code !== 11000) return false;
  const pattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern;
  return pattern !== undefined && 'order_group_id' in pattern;
}

/** (09/10/2026) Số phiếu tối đa đọc cho danh sách cách ly. */
const QUARANTINE_MAX_RETURNS = 200;

/**
 * ===================================================================
 * G3 (27/09/2026) — TRẢ HÀNG / HOÀN HÀNG (bản gọn, bấm nút)
 * ===================================================================
 * 2 nguồn phiếu:
 *  - failed_delivery: HỆ THỐNG tự tạo khi kho nhận lại kiện giao thất bại
 *    (ShipmentsService.receiveReturn) — trạng thái "received", đi thẳng vào kiểm hàng.
 *  - simulated: Admin đóng vai khách bấm "Yêu cầu trả hàng" -> Store Owner duyệt.
 * Kiểm hàng: đạt -> nhập lại ô bán qua SỔ CÁI (K3, return_restock); nghi lỗi ->
 * cách ly (không cộng tồn bán); hỏng -> loại bỏ. Tiền hoàn do sàn quyết định.
 * ===================================================================
 */
@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    @InjectModel(ReturnRequest.name) private readonly returnModel: Model<ReturnRequestDocument>,
    @InjectModel(Shipment.name) private readonly shipmentModel: Model<ShipmentDocument>,
    private readonly orderGroupsService: OrderGroupsService,
    private readonly warehouseService: WarehouseService,
    @InjectConnection() private readonly connection: Connection,
    private readonly packagingMaterialsService: PackagingMaterialsService, // G4
    private readonly notificationsService: NotificationsService,
    // Đổi hàng: tạo đơn + nhóm đơn thay thế; kiểm hàng đổi sang có trong danh mục shop
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(OrderGroup.name) private readonly orderGroupModel: Model<OrderGroupDocument>,
    @InjectModel(ProductMaster.name) private readonly productMasterModel: Model<ProductMasterDocument>,
    // 20/10/2026 — báo ngược kết quả xử lý phiếu cho khách trên sàn (AURELLE).
    @Optional() @InjectModel(MarketplaceStatusOutbox.name) private readonly statusOutboxModel?: Model<MarketplaceStatusOutboxDocument>,
    // 23/10/2026 — sổ hoạt động (lịch sử từng bước của phiếu trả hàng).
    @Optional() @InjectModel(ActivityLog.name) private readonly activityLogModel?: Model<ActivityLogDocument>,
  ) {}

  async get(id: string): Promise<ReturnRequestDocument> {
    if (!Types.ObjectId.isValid(id)) this.fail(RETURN_ERROR_CODES.INVALID_ID, `"${id}" không đúng định dạng ObjectId.`, HttpStatus.BAD_REQUEST);
    const doc = await this.returnModel.findById(id);
    if (!doc) this.fail(RETURN_ERROR_CODES.NOT_FOUND, `Không tìm thấy phiếu trả hàng "${id}".`, HttpStatus.NOT_FOUND);
    return doc;
  }

  async list(params: { status?: ReturnStatus; orderGroupId?: string; page: number; limit: number }): Promise<{ items: ReturnRequestDocument[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (params.status) filter.status = params.status;
    if (params.orderGroupId && Types.ObjectId.isValid(params.orderGroupId)) filter.order_group_id = new Types.ObjectId(params.orderGroupId);
    const [items, total] = await Promise.all([
      this.returnModel.find(filter).sort({ updated_at: -1 }).skip((params.page - 1) * params.limit).limit(params.limit),
      this.returnModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  /** Gọi TRONG transaction của ShipmentsService.receiveReturn. */
  async createFromFailedDelivery(orderGroupId: string, shipmentId: string, actorId: string, session: ClientSession): Promise<void> {
    const group = await this.orderGroupsService.findOrderGroupById(orderGroupId);
    let items: { seller_sku: string; quantity: number; reason_code: ReturnReason }[] = [];
    // G4 (27/09/2026) — lấy số lượng ĐÃ QUÉT THẬT thay vì số đặt (lấy thiếu thì kiện cũng chỉ có số đã lấy).
    // 🔄 21/10/2026 — đọc từ pick_events (mã SKU của ĐƠN, đã trừ món rút ra khi đóng gói), không đọc
    // sổ cái kho nữa: dòng tồn gộp chung SKU nội bộ ghi mã SKU của sàn đã tạo dòng đó, nên phiếu hoàn
    // từng mang mã sàn khác → nhập lại kệ không tìm ra SKU nội bộ, hàng bị tách thành dòng tồn lạc.
    // Chưa quét gì (dữ liệu rất cũ) → dùng số đặt.
    try {
      const picked = await this.orderGroupsService.getPickedQuantitiesForGroup(orderGroupId);
      const source = [...picked.values()].some((q) => q > 0)
        ? picked
        : await this.orderGroupsService.getOrderedQuantitiesForGroup(orderGroupId);
      items = [...source]
        .filter(([, quantity]) => quantity > 0)
        .map(([sku, quantity]) => ({ seller_sku: sku, quantity, reason_code: ReturnReason.FAILED_DELIVERY }));
    } catch (error: unknown) {
      // VD toàn bộ đơn trong nhóm đã hủy -> không đọc được danh sách hàng. Vẫn tạo phiếu
      // (rỗng) để kho biết có kiện về, ghi log để kiểm tra tay.
      this.logger.warn(`Không đọc được hàng của nhóm đơn ${orderGroupId} khi tạo phiếu hoàn: ${String(error)}`);
    }
    await this.returnModel.create([{
      rma_code: this.newCode(),
      order_group_id: group._id,
      shipment_id: new Types.ObjectId(shipmentId),
      type: ReturnType.FAILED_DELIVERY,
      source: 'failed_delivery',
      status: ReturnStatus.RECEIVED, // hàng đã nằm ở kho
      platform: group.platform,
      shop_id: group.shop_id,
      items,
      created_by: actorId,
      received_by: actorId,
    }], { session });
  }

  /** [Admin — đóng vai khách] Giả lập khách yêu cầu trả hàng. */
  async createSimulated(dto: CreateReturnDto, actorId: string, extra: MarketplaceReturnExtra = {}): Promise<ReturnRequestDocument> {
    const group = await this.orderGroupsService.findOrderGroupById(dto.order_group_id);
    // 21/10/2026 — đơn AURELLE: khách tự gửi yêu cầu trên website, hệ thống tự nhận
    // phiếu (createFromMarketplace). Chặn Admin giả lập để không ra 2 phiếu cho 1 lần trả.
    if (extra.source !== 'marketplace' && group.platform === MarketplacePlatform.AURELLE) {
      this.fail(RETURN_ERROR_CODES.MARKETPLACE_MANAGED, 'Đơn AURELLE: khách tự yêu cầu trả hàng trên website, phiếu tự hiện ở danh sách — không tạo giả lập.', HttpStatus.CONFLICT);
    }
    if (group.fulfillment_status !== GroupFulfillmentStatus.DELIVERED) {
      this.fail(RETURN_ERROR_CODES.ORDER_NOT_DELIVERED, `Nhóm đơn đang "${group.fulfillment_status}" — chỉ trả hàng được khi đã giao thành công.`, HttpStatus.CONFLICT);
    }
    // 21/10/2026 — phiếu của khách trên sàn tính theo ĐƠN: 2 đơn trong cùng nhóm gộp trả song song
    // được; chỉ chặn khi chính đơn đó đang có phiếu mở (hoặc nhóm có phiếu chung không theo đơn).
    const open = await this.returnModel.exists(
      extra.orderId
        ? { order_group_id: group._id, status: { $in: OPEN_RETURN_STATUSES }, source_order_id: { $in: [extra.orderId, null] } }
        : { order_group_id: group._id, status: { $in: OPEN_RETURN_STATUSES } },
    );
    if (open) {
      this.fail(
        RETURN_ERROR_CODES.OPEN_EXISTS,
        extra.orderId ? 'Đơn này đang có phiếu trả hàng chưa xử lý xong.' : 'Nhóm đơn đang có phiếu trả hàng chưa xử lý xong.',
        HttpStatus.CONFLICT,
        { returnId: open._id.toString() },
      );
    }

    const shipment = await this.shipmentModel.findOne({ order_group_id: group._id, direction: 'forward' });
    const earlier = await this.returnModel
      .find({ order_group_id: group._id })
      .select('items status delivered_at_snapshot source_order_id')
      .lean();
    const deliveredAt = shipment?.delivered_at
      ?? earlier.find((r) => r.delivered_at_snapshot)?.delivered_at_snapshot
      ?? group.updated_at ?? new Date();
    const ageDays = (Date.now() - deliveredAt.getTime()) / 86_400_000;
    if (ageDays > RETURN_WINDOW_DAYS) {
      this.fail(RETURN_ERROR_CODES.WINDOW_EXPIRED, `Đã quá ${String(RETURN_WINDOW_DAYS)} ngày kể từ khi giao — hết hạn trả hàng.`, HttpStatus.CONFLICT, { deliveredAt });
    }

    const bought = extra.bought
      ? new Map(extra.bought)
      : new Map((await this.orderGroupsService.getPackableItemsForGroup(dto.order_group_id)).items.map((i) => [i.sku, i.quantity]));
    // (09/10/2026) Trừ số đã trả/hoàn ở các phiếu trước (trừ phiếu bị từ chối/hủy) —
    // trước đây so với toàn bộ số đã mua nên cùng 1 món trả được nhiều lần.
    for (const r of earlier) {
      if (r.status === ReturnStatus.REJECTED || r.status === ReturnStatus.CANCELED) continue;
      // Phiếu của khách theo từng ĐƠN: chỉ trừ số đã trả của chính đơn đó (nhóm có thể gộp nhiều đơn).
      if (extra.orderId && !r.source_order_id?.equals(extra.orderId)) continue;
      for (const it of r.items) bought.set(it.seller_sku, (bought.get(it.seller_sku) ?? 0) - it.quantity);
    }
    const seen = new Set<string>();
    for (const item of dto.items) {
      const max = bought.get(item.seller_sku);
      if (seen.has(item.seller_sku) || max === undefined || item.quantity > max) {
        this.fail(RETURN_ERROR_CODES.INVALID_ITEMS, `SKU "${item.seller_sku}" không thuộc nhóm đơn, bị khai trùng, hoặc vượt số lượng còn được trả (${String(Math.max(max ?? 0, 0))}).`, HttpStatus.BAD_REQUEST, { sku: item.seller_sku });
      }
      seen.add(item.seller_sku);
    }

    const exchangeItems = dto.exchange_items ?? [];
    if (dto.type === ReturnType.EXCHANGE) {
      if (exchangeItems.length === 0) {
        this.fail(RETURN_ERROR_CODES.EXCHANGE_ITEMS_REQUIRED, 'Phiếu đổi hàng phải khai hàng khách muốn đổi sang (exchange_items).', HttpStatus.BAD_REQUEST);
      }
      const known = await this.productMasterModel.find({ platform: group.platform, shop_id: group.shop_id, seller_sku: { $in: exchangeItems.map((i) => i.seller_sku) } }).select('seller_sku').lean();
      const knownSet = new Set(known.map((k) => k.seller_sku));
      const unknown = exchangeItems.filter((i) => !knownSet.has(i.seller_sku)).map((i) => i.seller_sku);
      if (unknown.length > 0) {
        this.fail(RETURN_ERROR_CODES.INVALID_EXCHANGE_ITEMS, `Hàng đổi sang không có trong danh mục sản phẩm của shop: ${unknown.join(', ')}.`, HttpStatus.BAD_REQUEST, { unknown });
      }
    }

    const doc = await this.runTx(async (session) => {
      // Index duy nhất có điều kiện (1 phiếu mở / đơn, phiếu chung: 1 / nhóm) chặn 2 lần gọi đồng thời.
      const [created] = await this.returnModel.create([{
        rma_code: this.newCode(),
        order_group_id: group._id,
        type: dto.type,
        exchange_items: dto.type === ReturnType.EXCHANGE ? exchangeItems : [],
        source: extra.source ?? 'simulated',
        external_ref: extra.externalRef ?? null,
        source_order_id: extra.orderId ?? null,
        status: ReturnStatus.REQUESTED,
        platform: group.platform,
        shop_id: group.shop_id,
        items: dto.items,
        customer_note: dto.customer_note ?? null,
        created_by: actorId,
        delivered_at_snapshot: deliveredAt,
      }], { session });
      if (!created) throw new Error('Tạo phiếu trả hàng không trả về document');
      await this.updateReturnGroup(created, GroupFulfillmentStatus.RETURNING, session);
      return created;
    }).catch((error: unknown) => {
      if (isOpenReturnDuplicate(error)) {
        this.fail(RETURN_ERROR_CODES.OPEN_EXISTS, 'Vừa có phiếu trả hàng khác được tạo cho đơn này — tải lại danh sách.', HttpStatus.CONFLICT);
      }
      throw error;
    });
    try {
      await this.notificationsService.notify({
        recipientRole: UserRole.STORE_OWNER, type: NotificationType.RETURN_REQUESTED, severity: 'warning',
        title: `Yêu cầu ${dto.type === ReturnType.REFUND_ONLY ? 'hoàn tiền' : dto.type === ReturnType.EXCHANGE ? 'đổi hàng' : 'trả hàng'} mới — ${doc.rma_code}`,
        message: `${String(dto.items.length)} dòng hàng, chờ duyệt.${dto.customer_note ? ` Khách ghi: ${dto.customer_note}` : ''}`,
        relatedEntityType: 'return_request', relatedEntityId: doc._id.toString(),
      });
    } catch (error) {
      this.logger.warn('Gửi thông báo yêu cầu trả hàng thất bại (không ảnh hưởng phiếu).', error);
    }
    return doc;
  }

  /**
   * 20/10/2026 — Khách gửi yêu cầu trả hàng trên sàn (AURELLE): đổi yêu cầu bên sàn thành phiếu RMA.
   * Số lượng được trả tính theo ĐƠN gốc của khách (không phải cả nhóm gộp nhiều đơn).
   * Kết quả: `exists` (đã có phiếu), `order_not_ready` (đơn chưa về OptiPack — thử lại lượt sau),
   * `busy` (nhóm đang có phiếu khác chưa xong — thử lại lượt sau), `rejected` (không đủ điều kiện —
   * caller báo từ chối kèm lý do để khách không kẹt ở "đang chờ"), `created`.
   */
  async createFromMarketplace(
    platform: MarketplacePlatform,
    shopId: string,
    raw: MarketplaceReturnRaw,
  ): Promise<MarketplaceReturnOutcome> {
    const externalRef = raw.return_id;
    if (await this.returnModel.exists({ platform, external_ref: externalRef })) return { outcome: 'exists' };

    const order = await this.orderModel
      .findOne({ platform, shop_id: shopId, platform_order_id: String(raw.order_id) })
      .select('items consolidated_group_id')
      .lean();
    if (!order?.consolidated_group_id) return { outcome: 'order_not_ready' };

    const bought = new Map<string, number>();
    for (const item of order.items) {
      if (item.status === OrderStatus.CANCELED) continue;
      bought.set(item.sku, (bought.get(item.sku) ?? 0) + item.quantity);
    }

    const dto: CreateReturnDto = {
      order_group_id: order.consolidated_group_id.toString(),
      type: raw.type === 'refund_only'
        ? ReturnType.REFUND_ONLY
        : raw.type === 'exchange' ? ReturnType.EXCHANGE : ReturnType.RETURN_REFUND,
      // 21/10/2026 — đổi hàng từ website: hàng khách muốn đổi sang.
      exchange_items: raw.type === 'exchange'
        ? (raw.exchange_items ?? []).map((item) => ({ seller_sku: item.seller_sku, quantity: item.quantity }))
        : undefined,
      items: raw.items.map((item) => ({
        seller_sku: item.seller_sku,
        quantity: item.quantity,
        reason_code: (KNOWN_REASONS.includes(item.reason_code) ? item.reason_code : ReturnReason.OTHER) as ReturnReason,
      })),
      customer_note: raw.customer_note ? raw.customer_note : undefined,
    };
    try {
      const rma = await this.createSimulated(dto, `${platform}:${externalRef}`, {
        source: 'marketplace',
        externalRef,
        orderId: order._id,
        bought,
      });
      return { outcome: 'created', rma };
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000) {
        return { outcome: 'exists' }; // webhook và cron kéo bù chạy trùng nhau (index theo id yêu cầu)
      }
      if (error instanceof AppException) {
        if (error.errorCode === RETURN_ERROR_CODES.OPEN_EXISTS) return { outcome: 'busy', reason: error.message };
        if (AUTO_REJECT_CODES.includes(error.errorCode)) return { outcome: 'rejected', reason: error.message };
      }
      throw error;
    }
  }

  /**
   * 21/10/2026 — Khách tự hủy yêu cầu trả hàng trên sàn (AURELLE). Website chỉ cho hủy khi bên đó
   * còn "requested"; phía kho phiếu có thể đã duyệt (kết quả chưa kịp báo ngược) → vẫn hủy được
   * khi hàng CHƯA về kho. Hàng đã về kho → `too_late`, giữ phiếu để kho xử lý tiếp.
   */
  async cancelFromMarketplace(platform: MarketplacePlatform, externalRef: string): Promise<MarketplaceReturnCancelOutcome> {
    const rma = await this.returnModel.findOne({ platform, external_ref: externalRef });
    if (!rma) return 'not_found';
    if (rma.status === ReturnStatus.REJECTED || rma.status === ReturnStatus.CLOSED || rma.status === ReturnStatus.CANCELED) return 'already_closed';
    if (rma.status === ReturnStatus.RECEIVED) return 'too_late';
    try {
      await this.runTx(async (session) => {
        await this.move(rma, rma.__v, rma.status, ReturnStatus.CANCELED, {
          decided_by: `${platform}:customer`,
          decision_note: 'Khách đã hủy yêu cầu trả hàng trên website.',
          closed_at: new Date(),
        }, session);
        await this.updateReturnGroup(rma, GroupFulfillmentStatus.DELIVERED, session);
      });
    } catch (error: unknown) {
      if (error instanceof AppException && error.errorCode === RETURN_ERROR_CODES.STATE_CONFLICT) return 'busy';
      throw error;
    }
    return 'canceled';
  }

  /** [Store Owner] Duyệt. Hoàn tiền không cần trả hàng -> đóng luôn. Người tạo phiếu không tự duyệt. */
  async approve(id: string, expectedVersion: number, actorId: string, note?: string): Promise<ReturnRequestDocument> {
    const rma = await this.get(id);
    if (rma.created_by === actorId) {
      this.fail(RETURN_ERROR_CODES.SELF_APPROVAL, 'Người tạo phiếu không được tự duyệt — cần Store Owner khác duyệt.', HttpStatus.FORBIDDEN);
    }
    const refundOnly = rma.type === ReturnType.REFUND_ONLY;
    return this.runTx(async (session) => {
      const updated = await this.move(rma, expectedVersion, ReturnStatus.REQUESTED, refundOnly ? ReturnStatus.CLOSED : ReturnStatus.AWAITING_RECEIPT, {
        decided_by: actorId, decision_note: note ?? null, ...(refundOnly ? { closed_at: new Date() } : {}),
      }, session);
      await this.updateReturnGroup(rma, GroupFulfillmentStatus.RETURNED, session);
      return updated;
    });
  }

  async reject(id: string, expectedVersion: number, actorId: string, note?: string): Promise<ReturnRequestDocument> {
    if (!note?.trim()) this.fail(RETURN_ERROR_CODES.NOTE_REQUIRED, 'Từ chối phải ghi rõ lý do.', HttpStatus.BAD_REQUEST);
    const rma = await this.get(id);
    return this.runTx(async (session) => {
      const updated = await this.move(rma, expectedVersion, ReturnStatus.REQUESTED, ReturnStatus.REJECTED, { decided_by: actorId, decision_note: note, closed_at: new Date() }, session);
      await this.updateReturnGroup(rma, GroupFulfillmentStatus.DELIVERED, session);
      return updated;
    });
  }

  /**
   * (09/10/2026) [Store Owner/Admin] Hủy phiếu đã duyệt mà hàng không bao giờ về
   * (khách không gửi). Trước đây phiếu `awaiting_receipt` không có lối ra và chặn
   * mọi phiếu mới của nhóm đơn. Bắt buộc lý do.
   */
  async cancel(id: string, expectedVersion: number, actorId: string, note?: string): Promise<ReturnRequestDocument> {
    if (!note?.trim()) this.fail(RETURN_ERROR_CODES.NOTE_REQUIRED, 'Hủy phiếu phải ghi rõ lý do.', HttpStatus.BAD_REQUEST);
    const rma = await this.get(id);
    return this.runTx(async (session) => {
      const updated = await this.move(rma, expectedVersion, ReturnStatus.AWAITING_RECEIPT, ReturnStatus.CANCELED, {
        decided_by: actorId, decision_note: note, closed_at: new Date(),
      }, session);
      await this.updateReturnGroup(rma, GroupFulfillmentStatus.DELIVERED, session);
      return updated;
    });
  }

  /** [Warehouse] Ghi nhận kiện đã về; nhóm trả đủ đã returned từ lúc Store duyệt. */
  async receive(id: string, expectedVersion: number, actorId: string): Promise<ReturnRequestDocument> {
    const rma = await this.get(id);
    return this.runTx(async (session) => {
      const updated = await this.move(rma, expectedVersion, ReturnStatus.AWAITING_RECEIPT, ReturnStatus.RECEIVED, { received_by: actorId }, session);
      if (rma.type === ReturnType.RETURN_REFUND && rma.source !== 'failed_delivery') {
        await this.updateReturnGroup(rma, GroupFulfillmentStatus.RETURNED, session);
      } else {
        const bought = (await this.orderGroupsService.getPackableItemsForGroup(rma.order_group_id.toString())).items;
        if (bought.every((b) => rma.items.find((i) => i.seller_sku === b.sku)?.quantity === b.quantity)) {
          const group = await this.orderGroupsService.findOrderGroupById(rma.order_group_id.toString(), session);
          await this.orderGroupsService.transitionFulfillmentStatus(group._id.toString(), GroupFulfillmentStatus.RETURNED, group.__v, session);
        }
      }
      return updated;
    });
  }

  /**
   * [Warehouse] Kiểm hàng. Mỗi SKU: tổng các dòng PHẢI bằng số lượng trả (không
   * để "mất" hàng giữa chừng). restock -> nhập lại ô qua sổ cái, CÙNG transaction.
   */
  async inspect(id: string, dto: InspectReturnDto, actorId: string): Promise<ReturnRequestDocument> {
    const rma = await this.get(id);
    this.assertStatusVersion(rma, dto.expected_version, ReturnStatus.RECEIVED);
    const expected = new Map(rma.items.map((i) => [i.seller_sku, i.quantity]));
    const counted = new Map<string, number>();
    for (const line of dto.lines) {
      if (!expected.has(line.seller_sku)) {
        this.fail(RETURN_ERROR_CODES.INSPECTION_MISMATCH, `SKU "${line.seller_sku}" không có trong phiếu trả.`, HttpStatus.BAD_REQUEST);
      }
      if (line.result === InspectionResult.RESTOCK && (!line.warehouse_id || !line.bin_location_id)) {
        this.fail(RETURN_ERROR_CODES.BIN_REQUIRED, `Dòng nhập lại kho của "${line.seller_sku}" phải chọn kho và ô.`, HttpStatus.BAD_REQUEST);
      }
      counted.set(line.seller_sku, (counted.get(line.seller_sku) ?? 0) + line.quantity);
    }
    for (const [sku, qty] of expected) {
      if ((counted.get(sku) ?? 0) !== qty) {
        this.fail(RETURN_ERROR_CODES.INSPECTION_MISMATCH, `SKU "${sku}": trả ${String(qty)} nhưng kiểm ${String(counted.get(sku) ?? 0)} — phải khớp đủ.`, HttpStatus.BAD_REQUEST, { sku, expected: qty });
      }
    }

    const closed = await this.runTx(async (session) => {
      // G4 — thu hồi vật liệu đóng gói (hạng A đã gỡ nhãn -> kho tái sử dụng), cùng transaction.
      const packagingOutcomes = dto.packaging?.length
        ? await this.packagingMaterialsService.recoverFromReturn(dto.packaging, rma._id.toString(), actorId, session)
        : [];
      for (const line of dto.lines) {
        if (line.result === InspectionResult.RESTOCK && line.warehouse_id && line.bin_location_id) {
          await this.warehouseService.restockReturnedItem({
            warehouseId: line.warehouse_id,
            binLocationId: line.bin_location_id,
            platform: rma.platform,
            shopId: rma.shop_id,
            sellerSku: line.seller_sku,
            quantity: line.quantity,
            returnRequestId: rma._id.toString(),
            actorId,
            confirmOtherBin: line.confirm_other_bin === true,
          }, session);
        }
      }
      const updated = await this.move(rma, dto.expected_version, ReturnStatus.RECEIVED, ReturnStatus.CLOSED, {
        inspection: dto.lines.map((l) => ({
          seller_sku: l.seller_sku,
          quantity: l.quantity,
          result: l.result,
          warehouse_id: l.warehouse_id ? new Types.ObjectId(l.warehouse_id) : null,
          bin_location_id: l.bin_location_id ? new Types.ObjectId(l.bin_location_id) : null,
          note: l.note ?? null,
          disposition: l.result === InspectionResult.QUARANTINE ? 'pending' : null,
        })),
        inspected_by: actorId,
        closed_at: new Date(),
        packaging_inspection: packagingOutcomes.map((o) => ({
          material_code: o.line.material_code,
          quantity: o.line.quantity,
          grade: o.line.grade,
          reuse_cycle_seen: o.line.reuse_cycle_seen ?? 0,
          old_label_removed: o.line.old_label_removed === true,
          recovered_to_reuse: o.recoveredToReuse,
          outcome: o.outcome,
        })),
      }, session);
      await this.updateReturnGroup(rma, GroupFulfillmentStatus.CANCELED, session);
      return updated;
    });
    this.recheckShortagesSoon('kiểm hàng hoàn');
    // Đổi hàng: kiểm hàng xong -> tạo đơn thay thế. Lỗi ở bước này KHÔNG hủy kết quả
    // kiểm hàng (đã lưu) — phiếu ghi replacement_status "failed", bấm tạo lại được.
    if (closed.type === ReturnType.EXCHANGE) {
      try {
        return await this.createReplacement(closed._id.toString(), actorId);
      } catch (error) {
        this.logger.error(`Tạo đơn thay thế cho ${closed.rma_code} thất bại — tạo lại qua POST /returns/:id/create-replacement.`, error);
        const failed = await this.returnModel.findByIdAndUpdate(closed._id, { $set: { replacement_status: 'failed', replacement_error: String(error) } }, { returnDocument: 'after' });
        return failed ?? closed;
      }
    }
    return closed;
  }

  /**
   * Đổi hàng — tạo ĐƠN THAY THẾ (mã EXC-<RMA>, giá 0, khóa gộp đơn riêng nên không bao
   * giờ bị gộp với đơn sàn) rồi sinh nhóm đơn mới đi lại đúng luồng lấy hàng -> đóng gói
   * -> giao như đơn thường (có giữ chỗ tồn K5). Đã tạo rồi thì báo lỗi, không tạo trùng.
   */
  async createReplacement(id: string, actorId: string): Promise<ReturnRequestDocument> {
    const rma = await this.get(id);
    if (rma.type !== ReturnType.EXCHANGE || rma.status !== ReturnStatus.CLOSED) {
      this.fail(RETURN_ERROR_CODES.NOT_EXCHANGE, 'Chỉ tạo đơn thay thế cho phiếu ĐỔI HÀNG đã kiểm hàng xong.', HttpStatus.CONFLICT);
    }
    if (rma.replacement_status === 'created') {
      this.fail(RETURN_ERROR_CODES.REPLACEMENT_EXISTS, 'Phiếu này đã có đơn thay thế.', HttpStatus.CONFLICT, { replacementGroupId: rma.replacement_group_id?.toString() });
    }
    const original = await this.orderModel.findOne({ consolidated_group_id: rma.order_group_id });
    if (!original) throw new Error('Không tìm thấy đơn gốc của nhóm đơn để chép thông tin người nhận');

    const platformOrderId = `EXC-${rma.rma_code}`;
    const order = (await this.orderModel.findOne({ platform: original.platform, shop_id: original.shop_id, platform_order_id: platformOrderId }))
      ?? (await this.orderModel.create({
        marketplace_shop: original.marketplace_shop,
        platform: original.platform,
        shop_id: original.shop_id,
        platform_order_id: platformOrderId,
        platform_order_number: platformOrderId,
        status: OrderStatus.PENDING,
        raw_statuses: ['replacement'],
        recipient: original.recipient,
        consolidation_key: `replacement:${rma._id.toString()}`, // duy nhất -> không gộp với đơn nào
        items: rma.exchange_items.map((it, i) => ({
          platform_order_item_id: `${platformOrderId}-${String(i + 1)}`,
          sku: it.seller_sku,
          name: `Hàng đổi (${rma.rma_code})`,
          quantity: it.quantity,
          unit_price: 0,
          status: OrderStatus.PENDING,
        })),
        total_amount: 0,
        currency: original.currency,
        synced_at: new Date(),
        origin: 'replacement',
        source_return_id: rma._id,
      }));
    const group = await this.orderGroupsService.getOrCreateGroupForOrder(order);
    await this.orderGroupModel.updateOne({ _id: group._id }, { $set: { origin: 'replacement', source_return_id: rma._id } });
    const updated = await this.returnModel.findByIdAndUpdate(
      rma._id,
      { $set: { replacement_status: 'created', replacement_order_id: order._id, replacement_group_id: group._id, replacement_error: null } },
      { returnDocument: 'after' },
    );
    this.logger.log(`Đổi hàng ${rma.rma_code}: tạo đơn thay thế ${platformOrderId} -> nhóm đơn ${group._id.toString()} (người thao tác ${actorId}).`);
    return updated ?? rma;
  }

  // ------------------------------------------------------ hàng cách ly

  /** Danh sách dòng hàng đang cách ly chờ xử lý (mọi phiếu), cũ nhất trước. */
  /** (09/10/2026) Tối đa 200 phiếu cũ nhất mỗi lần (trước đây không giới hạn). */
  async listQuarantine(): Promise<{ returnId: string; rmaCode: string; lineIndex: number; sellerSku: string; quantity: number; note: string | null; since: Date | null }[]> {
    const rmas = await this.returnModel.find({ inspection: { $elemMatch: { result: InspectionResult.QUARANTINE, disposition: { $in: ['pending', null] } } } }).sort({ closed_at: 1 }).limit(QUARANTINE_MAX_RETURNS);
    const out: { returnId: string; rmaCode: string; lineIndex: number; sellerSku: string; quantity: number; note: string | null; since: Date | null }[] = [];
    for (const r of rmas) {
      r.inspection.forEach((l, i) => {
        if (l.result === InspectionResult.QUARANTINE && (l.disposition ?? 'pending') === 'pending') {
          out.push({ returnId: r._id.toString(), rmaCode: r.rma_code, lineIndex: i, sellerSku: l.seller_sku, quantity: l.quantity, note: l.note, since: r.closed_at });
        }
      });
    }
    return out;
  }

  /** Xử lý 1 dòng cách ly: nhập lại ô bán (qua sổ cái) hoặc loại bỏ. */
  async resolveQuarantine(id: string, lineIndex: number, dto: ResolveQuarantineDto, actorId: string): Promise<ReturnRequestDocument> {
    const rma = await this.get(id);
    const line = rma.inspection.at(lineIndex);
    if (line?.result !== InspectionResult.QUARANTINE) {
      this.fail(RETURN_ERROR_CODES.QUARANTINE_LINE_NOT_FOUND, `Phiếu không có dòng cách ly số ${String(lineIndex)}.`, HttpStatus.NOT_FOUND);
    }
    if ((line.disposition ?? 'pending') !== 'pending') {
      this.fail(RETURN_ERROR_CODES.QUARANTINE_ALREADY_RESOLVED, 'Dòng cách ly này đã được xử lý.', HttpStatus.CONFLICT);
    }
    if (dto.action === 'restock' && (!dto.warehouse_id || !dto.bin_location_id)) {
      this.fail(RETURN_ERROR_CODES.BIN_REQUIRED, 'Nhập lại kho phải chọn kho và ô.', HttpStatus.BAD_REQUEST);
    }
    const key = `inspection.${String(lineIndex)}`;
    const resolved = await this.runTx(async (session) => {
      if (dto.action === 'restock' && dto.warehouse_id && dto.bin_location_id) {
        await this.warehouseService.restockReturnedItem({
          warehouseId: dto.warehouse_id, binLocationId: dto.bin_location_id, platform: rma.platform, shopId: rma.shop_id,
          sellerSku: line.seller_sku, quantity: line.quantity, returnRequestId: rma._id.toString(), actorId,
          confirmOtherBin: dto.confirm_other_bin === true,
        }, session);
      }
      const updated = await this.returnModel.findOneAndUpdate(
        { _id: rma._id, [`${key}.disposition`]: { $in: ['pending', null] } },
        { $set: { [`${key}.disposition`]: dto.action === 'restock' ? 'restocked' : 'discarded', [`${key}.disposed_at`]: new Date(), [`${key}.disposed_by`]: actorId, [`${key}.disposition_note`]: dto.note ?? null } },
        { returnDocument: 'after', session },
      );
      if (!updated) this.fail(RETURN_ERROR_CODES.QUARANTINE_ALREADY_RESOLVED, 'Dòng cách ly vừa được người khác xử lý.', HttpStatus.CONFLICT);
      return updated;
    });
    if (dto.action === 'restock') this.recheckShortagesSoon('hàng cách ly nhập lại kho');
    return resolved;
  }

  /** 22/10/2026 — hàng hoàn vừa vào kệ → nhóm đang thiếu đúng hàng đó tự tính lại giữ chỗ (không chặn). */
  private recheckShortagesSoon(trigger: string): void {
    try {
      this.orderGroupsService.scheduleShortageRecheck(trigger);
    } catch (error) {
      this.logger.warn(`Không xếp được lượt tính lại thiếu hàng (${trigger}).`, error);
    }
  }

  // ------------------------------------------------------------ nội bộ

  private async updateReturnGroup(
    rma: ReturnRequestDocument,
    target: GroupFulfillmentStatus,
    session: ClientSession,
  ): Promise<void> {
    if (rma.type !== ReturnType.RETURN_REFUND || rma.source === 'failed_delivery') return;
    const groupId = rma.order_group_id.toString();
    const bought = (await this.orderGroupsService.getPackableItemsForGroup(groupId)).items;
    const earlier = await this.returnModel.find({
      order_group_id: rma.order_group_id,
      _id: { $ne: rma._id },
      type: ReturnType.RETURN_REFUND,
      source: { $ne: 'failed_delivery' },
      status: ReturnStatus.CLOSED,
    }).select('items').session(session).lean();
    const quantities = new Map<string, number>();
    for (const request of [...earlier, rma]) {
      for (const item of request.items) {
        quantities.set(item.seller_sku, (quantities.get(item.seller_sku) ?? 0) + item.quantity);
      }
    }
    if (bought.length === 0 || !bought.every((b) => quantities.get(b.sku) === b.quantity)) return;

    let group = await this.orderGroupsService.findOrderGroupById(groupId, session);
    if (target === GroupFulfillmentStatus.RETURNING && group.fulfillment_status !== GroupFulfillmentStatus.DELIVERED) {
      this.fail(RETURN_ERROR_CODES.OPEN_EXISTS, 'Nhóm đơn đang có phiếu trả hàng chưa xử lý xong.', HttpStatus.CONFLICT);
    }
    if (group.fulfillment_status === target) return;
    // Phiếu received cũ có thể đã trả đủ qua nhiều lần nhưng nhóm vẫn delivered.
    if (target === GroupFulfillmentStatus.CANCELED && group.fulfillment_status === GroupFulfillmentStatus.DELIVERED) {
      group = await this.orderGroupsService.transitionFulfillmentStatus(groupId, GroupFulfillmentStatus.RETURNED, group.__v, session);
    }
    await this.orderGroupsService.transitionFulfillmentStatus(groupId, target, group.__v, session);
  }

  private assertStatusVersion(rma: ReturnRequestDocument, expectedVersion: number, from: ReturnStatus): void {
    if (rma.status !== from) {
      this.fail(RETURN_ERROR_CODES.INVALID_STATUS, `Phiếu đang "${rma.status}" — thao tác này chỉ làm được khi phiếu "${from}".`, HttpStatus.CONFLICT, { status: rma.status });
    }
    if (rma.__v !== expectedVersion) {
      this.fail(RETURN_ERROR_CODES.STATE_CONFLICT, 'Phiếu vừa được người khác thay đổi — tải lại rồi thử lại.', HttpStatus.CONFLICT, { expectedVersion });
    }
  }

  private async move(
    rma: ReturnRequestDocument,
    expectedVersion: number,
    from: ReturnStatus,
    to: ReturnStatus,
    set: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<ReturnRequestDocument> {
    this.assertStatusVersion(rma, expectedVersion, from);
    const updated = await this.returnModel.findOneAndUpdate(
      { _id: rma._id, __v: expectedVersion, status: from },
      { $set: { status: to, ...set }, $inc: { __v: 1 } },
      { returnDocument: 'after', session },
    );
    if (!updated) this.fail(RETURN_ERROR_CODES.STATE_CONFLICT, 'Phiếu vừa được người khác thay đổi — tải lại rồi thử lại.', HttpStatus.CONFLICT, { expectedVersion });
    // 23/10/2026 — lịch sử: từng bước của phiếu trả hàng (ai duyệt/nhận/kiểm/hủy, lúc nào), cùng transaction.
    const actor = [set.inspected_by, set.received_by, set.decided_by].find((v): v is string => typeof v === 'string') ?? null;
    const note = typeof set.decision_note === 'string' ? set.decision_note : null;
    await recordActivity(this.activityLogModel, {
      category: 'returns',
      action: `return.${to}`,
      summary: `Phiếu trả ${updated.rma_code}: ${RETURN_STATUS_LABELS[from] ?? from} → ${RETURN_STATUS_LABELS[to] ?? to}${note ? ` — ${note}` : ''}`,
      actorId: actor,
      orderGroupId: updated.order_group_id,
      entityType: 'return_request',
      entityId: updated._id,
      entityCode: updated.rma_code,
      fromStatus: from,
      toStatus: to,
      skus: updated.items.map((i) => i.seller_sku),
      quantity: updated.items.reduce((sum, i) => sum + i.quantity, 0),
      note,
    }, session);
    // 20/10/2026 — phiếu do khách gửi trên sàn: xếp hàng báo kết quả (cùng transaction nếu có session).
    if (updated.source === 'marketplace') {
      const writebackStatus = writebackStatusForReturn(to);
      if (writebackStatus) {
        await enqueueStatusPush(
          this.statusOutboxModel,
          {
            orderGroupId: updated.order_group_id,
            returnRequestId: updated._id,
            status: writebackStatus,
            note: typeof set.decision_note === 'string' ? set.decision_note : null,
            discriminator: updated.__v,
          },
          session,
        );
      }
    }
    return updated;
  }

  private newCode(): string {
    const d = new Date();
    const ymd = `${String(d.getFullYear() % 100).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `RMA-${ymd}-${new Types.ObjectId().toString().slice(-6).toUpperCase()}`;
  }

  private fail(code: string, message: string, status: HttpStatus, details?: Record<string, unknown>): never {
    throw new AppException(code, message, status, details);
  }

  private async runTx<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result as T;
    } finally {
      await session.endSession();
    }
  }
}
