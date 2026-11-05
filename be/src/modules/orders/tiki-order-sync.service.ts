import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from './schemas/order.schema';
import { OrdersService, type SyncResult } from './orders.service';
import { mapTikiOrder } from './mappers/tiki-order.mapper';
import { orderSyncPolicy } from './order-sync-policy';
import { UNFULFILLED_ORDER_STATUSES } from './enums/order-status.enum';
import { ORD_ERROR_CODES } from './orders.errors';
import { MarketplaceIntegrationService } from '../marketplace-integration';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { TikiAdapter, TikiApiError } from '../marketplace-integration/adapters/tiki.adapter';
import {
  TIKI_NOT_ACCEPTED_STATUSES,
  TIKI_ORDER_EVENT_TYPES,
  formatTikiTime,
  type TikiOrderRaw,
} from '../marketplace-integration/adapters/tiki.types';
import type { MarketplaceShopDocument } from '../marketplace-integration/schemas/marketplace-shop.schema';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { AppException } from '../../common/exceptions/app-exception';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Kéo tối đa 10 lần × 100 sự kiện mỗi lượt; còn nữa thì lượt sau (mỗi phút) kéo tiếp. */
const MAX_PULLS_PER_RUN = 10;
/** Quét dự phòng theo ngày tạo: lùi thêm 2 giờ so với lần quét trước để không lọt đơn ở mép. */
const SWEEP_OVERLAP_MS = 2 * HOUR_MS;
const SWEEP_PAGE_SIZE = 50;
const SWEEP_MAX_PAGES = 20;
/** Đơn còn đang xử lý trong OptiPack được đọc lại mỗi lần quét (bù sự kiện đổi trạng thái bị mất). */
const OPEN_ORDER_RECHECK_LIMIT = 100;
/** Gọi "xác nhận đủ hàng" lỗi thì chờ 5 phút mới thử lại. */
const CONFIRM_RETRY_MS = 5 * 60 * 1000;
/** Còn ≤ 60 phút tới hạn xác nhận mà vẫn thiếu hàng → báo Store Owner (1 lần). */
const CONFIRM_WARN_BEFORE_MS = HOUR_MS;
/** Chỉ nhận đơn kiểu dropship (Thuận chốt 31/10/2026: shop đóng gói, shipper Tiki tới lấy). */
const SUPPORTED_FULFILLMENT_TYPES = ['dropship'];

export interface TikiSyncResult extends SyncResult {
  events: number;
  confirmed: number;
}

/**
 * ===================================================================
 * ĐỒNG BỘ ĐƠN TIKI (31/10/2026) — "chạy như Lazada" nhưng đúng cách Tiki khuyên
 * ===================================================================
 * Lớp TRIGGER riêng của Tiki (kiến trúc đa sàn đã chốt 09/09: trigger khác nhau, PIPELINE chung):
 * 1. Event queue (doc "Get order updates": KHÔNG quét đơn định kỳ rồi so sánh): OptiPack tự tạo
 *    1 hàng đợi + đăng ký ORDER_CREATED_SUCCESSFULLY, ORDER_STATUS_UPDATED; mỗi phút kéo sự kiện,
 *    gửi lại `ack_id` để không nhận lại sự kiện cũ. Sự kiện có thể tới 2 lần — không sao vì mỗi
 *    mã đơn được đọc lại chi tiết rồi upsert (lấy kết quả mới nhất, không cộng dồn).
 * 2. Quét dự phòng theo chu kỳ đồng bộ Admin cấu hình: đơn TẠO sau lần quét trước (lọc ngày cập
 *    nhật của Tiki đã bị bỏ vì lỗi) + đọc lại các đơn Tiki còn đang xử lý trong OptiPack.
 * 3. Mỗi mã đơn → GET chi tiết → `mapTikiOrder` → `OrdersService.ingestMappedOrder` (đúng luồng
 *    Lazada: lưu, gom, tạo nhóm, giữ chỗ tồn).
 * 4. Tự "xác nhận đủ hàng" lên Tiki khi nhóm đơn giữ chỗ đủ tồn (Thuận chốt); thiếu hàng → không
 *    xác nhận, sắp hết hạn thì báo Store Owner xử lý tay.
 * ===================================================================
 */
@Injectable()
export class TikiOrderSyncService {
  private readonly logger = new Logger(TikiOrderSyncService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly ordersService: OrdersService,
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
    private readonly tiki: TikiAdapter,
    private readonly orderGroupsService: OrderGroupsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Đồng bộ 1 shop Tiki. `sweep` = quét dự phòng (bấm tay luôn true; cron theo chu kỳ). */
  async syncShop(shopId: string, options: { sweep: boolean } = { sweep: true }): Promise<TikiSyncResult> {
    const shop = await this.marketplaceIntegrationService.getConnectedShop(shopId, MarketplacePlatform.TIKI);
    const token = await this.marketplaceIntegrationService.getValidAccessToken(shopId, MarketplacePlatform.TIKI);
    const startedAt = new Date();
    const codes = new Set<string>();

    let events = 0;
    let pendingAckId: string | null = null;
    let queueCode: string | null = null;
    try {
      queueCode = await this.ensureQueue(token, shop);
      const pulled = await this.pullOrderCodes(token, queueCode, shop.event_ack_id);
      events = pulled.events;
      pulled.codes.forEach((c) => codes.add(c));
      pendingAckId = pulled.ackId;
    } catch (error) {
      // Hàng đợi lỗi không chặn quét dự phòng — lượt sau thử lại.
      this.logger.warn(`Tiki shop ${shopId}: kéo sự kiện thất bại — ${errorText(error)}`);
    }

    if (options.sweep) {
      try {
        (await this.sweepOrderCodes(token, shop)).forEach((c) => codes.add(c));
      } catch (error) {
        if (codes.size === 0) {
          throw new AppException(
            ORD_ERROR_CODES.SYNC_FAILED,
            `Không lấy được danh sách đơn Tiki cho shop ${shopId}: ${errorText(error)}`,
            HttpStatus.BAD_GATEWAY,
            { shopId, platform: MarketplacePlatform.TIKI },
          );
        }
        this.logger.warn(`Tiki shop ${shopId}: quét dự phòng thất bại — ${errorText(error)}`);
      }
    }

    let upserted = 0;
    let newlyConsolidated = 0;
    for (const code of codes) {
      try {
        const raw = await this.tiki.getOrder(token, code);
        const result = await this.ingest(shop, raw);
        if (result) {
          upserted += 1;
          if (result.consolidated) newlyConsolidated += 1;
        }
      } catch (error) {
        this.logger.error(`Tiki shop ${shopId}: xử lý đơn ${code} thất bại, bỏ qua đơn này.`, error);
      }
    }

    // Báo Tiki đã nhận tới sự kiện cuối SAU khi xử lý xong (đơn lỗi vẫn được quét dự phòng đọc lại).
    if (queueCode && pendingAckId) {
      try {
        await this.tiki.ackEvents(token, queueCode, pendingAckId);
        await this.marketplaceIntegrationService.saveEventQueueState(shop._id, { ackId: pendingAckId, pulledAt: startedAt });
      } catch (error) {
        this.logger.warn(`Tiki shop ${shopId}: ack sự kiện thất bại — ${errorText(error)}`);
      }
    }

    const confirmed = await this.confirmPendingOrders(token, shop);
    if (options.sweep) await this.marketplaceIntegrationService.markShopPolled(shop._id, startedAt);

    if (codes.size > 0 || confirmed > 0) {
      this.logger.log(`Tiki shop ${shopId}: ${String(events)} sự kiện, ${String(codes.size)} đơn đọc lại, upsert ${String(upserted)}, gộp mới ${String(newlyConsolidated)}, xác nhận ${String(confirmed)}.`);
    }
    return { fetched: codes.size, upserted, newlyConsolidated, events, confirmed };
  }

  /** Nhãn dropship của 1 đơn Tiki (link HTML do Tiki cấp) — chỉ sau khi đã xác nhận đủ hàng. */
  async getDropshipLabels(orderId: string): Promise<{ platformOrderId: string; shippingLabelUrl: string | null; shippingStampUrl: string | null }> {
    const order = await this.ordersService.findOrderDetail(orderId);
    if (order.platform !== MarketplacePlatform.TIKI || order.marketplace_meta?.fulfillment_type !== 'dropship') {
      throw new AppException(ORD_ERROR_CODES.MARKETPLACE_LABEL_UNAVAILABLE, 'Chỉ đơn Tiki giao kiểu dropship mới có nhãn của Tiki.', HttpStatus.CONFLICT, { orderId });
    }
    if (order.marketplace_meta.confirmation_status !== 'confirmed') {
      throw new AppException(
        ORD_ERROR_CODES.MARKETPLACE_LABEL_UNAVAILABLE,
        'Đơn Tiki chưa xác nhận đủ hàng — Tiki chỉ cấp nhãn sau khi xác nhận.',
        HttpStatus.CONFLICT,
        { orderId, confirmationStatus: order.marketplace_meta.confirmation_status },
      );
    }
    const token = await this.marketplaceIntegrationService.getValidAccessToken(order.shop_id, MarketplacePlatform.TIKI);
    try {
      const labels = await this.tiki.getDropshipLabels(token, order.platform_order_id);
      return { platformOrderId: order.platform_order_id, shippingLabelUrl: labels.shipping_label_url ?? null, shippingStampUrl: labels.shipping_stamp_url ?? null };
    } catch (error) {
      throw new AppException(ORD_ERROR_CODES.SYNC_FAILED, `Tiki không trả nhãn: ${errorText(error)}`, HttpStatus.BAD_GATEWAY, { orderId });
    }
  }

  // ---------------------------------------------------------------- nhận đơn

  private async ingest(shop: MarketplaceShopDocument, raw: TikiOrderRaw): Promise<{ consolidated: boolean } | null> {
    const existing = await this.orderModel.exists({ platform: MarketplacePlatform.TIKI, shop_id: shop.shop_id, platform_order_id: raw.code });
    if (!existing) {
      // Đơn mới: chỉ nhận dropship đã được Tiki tiếp nhận. Đơn đã lưu thì luôn cập nhật (VD hủy).
      if (!SUPPORTED_FULFILLMENT_TYPES.includes(raw.fulfillment_type)) return null;
      if ((TIKI_NOT_ACCEPTED_STATUSES as readonly string[]).includes(raw.status)) return null;
    }
    const mapped = mapTikiOrder(raw);
    if (!mapped) return null; // không còn món ở kho nhà bán
    const { consolidated } = await this.ordersService.ingestMappedOrder(MarketplacePlatform.TIKI, shop.shop_id, shop._id, mapped);
    return { consolidated };
  }

  private async ensureQueue(token: string, shop: MarketplaceShopDocument): Promise<string> {
    let queueCode = shop.event_queue_code;
    if (!queueCode) {
      const name = `optipack-orders-${shop.shop_id}`;
      const existing = (await this.tiki.listQueues(token)).find((q) => q.name === name);
      queueCode = existing?.code ?? (await this.tiki.createQueue(token, name)).code;
      await this.marketplaceIntegrationService.saveEventQueueState(shop._id, { queueCode, ackId: null });
      shop.event_queue_code = queueCode;
      shop.event_ack_id = null;
    }
    const subscribed = new Set((await this.tiki.listSubscriptions(token, queueCode)).filter((s) => s.active).map((s) => s.event_type));
    for (const type of TIKI_ORDER_EVENT_TYPES) {
      if (!subscribed.has(type)) await this.tiki.createSubscription(token, queueCode, type);
    }
    return queueCode;
  }

  private async pullOrderCodes(token: string, queueCode: string, ackId: string | null): Promise<{ codes: string[]; ackId: string | null; events: number }> {
    const codes = new Set<string>();
    let current = ackId;
    let events = 0;
    for (let i = 0; i < MAX_PULLS_PER_RUN; i++) {
      const res = await this.tiki.pullEvents(token, queueCode, current);
      const batch = res.events ?? [];
      if (res.ack_id) current = res.ack_id;
      events += batch.length;
      for (const e of batch) {
        const code = e.payload.order_code;
        if (typeof code === 'string' && code) codes.add(code);
      }
      if (batch.length === 0) break;
    }
    return { codes: [...codes], ackId: current !== ackId ? current : null, events };
  }

  private async sweepOrderCodes(token: string, shop: MarketplaceShopDocument): Promise<string[]> {
    const policy = orderSyncPolicy();
    const since = shop.last_polled_at
      ? new Date(shop.last_polled_at.getTime() - SWEEP_OVERLAP_MS)
      : new Date(Date.now() - policy.sync.firstSyncLookbackDays * DAY_MS);
    const codes = new Set<string>();
    for (let page = 1; page <= SWEEP_MAX_PAGES; page++) {
      const res = await this.tiki.listOrders(token, {
        createdFrom: formatTikiTime(since),
        page,
        limit: SWEEP_PAGE_SIZE,
        fulfillmentTypes: SUPPORTED_FULFILLMENT_TYPES,
        excludeStatuses: TIKI_NOT_ACCEPTED_STATUSES,
      });
      res.data.forEach((o) => codes.add(o.code));
      if (page >= res.paging.last_page || res.data.length < SWEEP_PAGE_SIZE) break;
    }
    const open = await this.orderModel
      .find({ platform: MarketplacePlatform.TIKI, shop_id: shop.shop_id, is_active: true, status: { $in: UNFULFILLED_ORDER_STATUSES } })
      .select('platform_order_id')
      .sort({ updated_at: 1 })
      .limit(OPEN_ORDER_RECHECK_LIMIT)
      .lean();
    open.forEach((o) => codes.add(o.platform_order_id));
    return [...codes];
  }

  // ---------------------------------------------------------------- xác nhận đủ hàng

  /** Đơn đang chờ shop xác nhận: đủ hàng → xác nhận; thiếu → sắp hết hạn thì báo Store Owner. */
  private async confirmPendingOrders(token: string, shop: MarketplaceShopDocument, now: Date = new Date()): Promise<number> {
    const pending = await this.orderModel.find({
      platform: MarketplacePlatform.TIKI,
      shop_id: shop.shop_id,
      is_active: true,
      'marketplace_meta.confirmation_status': 'pending',
      'marketplace_meta.fulfillment_type': 'dropship',
    });
    let confirmed = 0;
    const inventoryCache = new Map<string, number | null>();
    for (const order of pending) {
      try {
        if (await this.tryConfirm(token, order, inventoryCache, now)) confirmed += 1;
      } catch (error) {
        this.logger.warn(`Tiki: xác nhận đơn ${order.platform_order_id} lỗi — ${errorText(error)}`);
      }
    }
    return confirmed;
  }

  private async tryConfirm(token: string, order: OrderDocument, inventoryCache: Map<string, number | null>, now: Date): Promise<boolean> {
    const meta = order.marketplace_meta;
    if (meta?.confirmation_status !== 'pending') return false;
    if (order.marketplace_confirm_attempted_at && order.marketplace_confirm_error && now.getTime() - order.marketplace_confirm_attempted_at.getTime() < CONFIRM_RETRY_MS) {
      return false;
    }
    const groupId = order.consolidated_group_id?.toString() ?? null;
    const group = groupId ? await this.orderGroupsService.findOrderGroupById(groupId) : null;
    if (!group || group.stock_shortage === true) {
      await this.warnIfDue(order, group ? 'Nhóm đơn đang thiếu hàng' : 'Đơn chưa vào nhóm đơn', now);
      return false;
    }

    const warehouseCode = meta.warehouse_code ?? '';
    let inventoryId = inventoryCache.get(warehouseCode);
    if (inventoryId === undefined) {
      const inv = warehouseCode ? await this.tiki.getSellerInventories(token, [warehouseCode]) : null;
      inventoryId = inv?.mappings.find((m) => m.tiki_warehouse_code === warehouseCode)?.seller_inventory_ids[0] ?? null;
      inventoryCache.set(warehouseCode, inventoryId);
    }
    if (inventoryId === null) {
      await this.recordConfirmError(order, `Kho Tiki "${warehouseCode || '?'}" của đơn chưa gán kho nhà bán nào trên Tiki Seller Center.`, now);
      await this.warnIfDue(order, `Kho Tiki "${warehouseCode || '?'}" chưa gán kho nhà bán`, now);
      return false;
    }

    try {
      await this.tiki.dropshipConfirmAvailable(token, order.platform_order_id, 'seller_confirmed', inventoryId);
    } catch (error) {
      await this.recordConfirmError(order, errorText(error), now);
      // 400 thường do đơn đã được xác nhận / không còn chờ — đọc lại đơn để cập nhật trạng thái thật.
      if (error instanceof TikiApiError && error.status === 400) {
        const raw = await this.tiki.getOrder(token, order.platform_order_id);
        const mapped = mapTikiOrder(raw);
        if (mapped?.marketplace_meta) await this.orderModel.updateOne({ _id: order._id }, { $set: { marketplace_meta: mapped.marketplace_meta } });
      }
      return false;
    }
    await this.orderModel.updateOne(
      { _id: order._id },
      { $set: { 'marketplace_meta.confirmation_status': 'confirmed', marketplace_confirm_attempted_at: now, marketplace_confirm_error: null } },
    );
    this.logger.log(`Tiki: đã xác nhận đủ hàng đơn ${order.platform_order_id} (kho nhà bán ${String(inventoryId)}).`);
    return true;
  }

  private async recordConfirmError(order: OrderDocument, message: string, now: Date): Promise<void> {
    await this.orderModel.updateOne({ _id: order._id }, { $set: { marketplace_confirm_attempted_at: now, marketplace_confirm_error: message.slice(0, 500) } });
  }

  private async warnIfDue(order: OrderDocument, reason: string, now: Date): Promise<void> {
    const sla = order.marketplace_meta?.confirm_sla_at ?? null;
    if (!sla || order.marketplace_confirm_warned_at || sla.getTime() - now.getTime() > CONFIRM_WARN_BEFORE_MS) return;
    const res = await this.orderModel.updateOne({ _id: order._id, marketplace_confirm_warned_at: null }, { $set: { marketplace_confirm_warned_at: now } });
    if (res.modifiedCount !== 1) return;
    const deadline = sla.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    await this.notificationsService
      .notify({
        recipientRole: UserRole.STORE_OWNER,
        type: NotificationType.MARKETPLACE_CONFIRM_REQUIRED,
        severity: 'critical',
        title: `Đơn Tiki #${order.platform_order_id} sắp hết hạn xác nhận đủ hàng`,
        message: `${reason}, OptiPack chưa tự xác nhận được. Hạn xác nhận trên Tiki: ${deadline}. Bổ sung hàng để hệ thống tự xác nhận, hoặc xử lý trên Tiki Seller Center — quá hạn Tiki có thể hủy đơn và trừ điểm shop.`,
        relatedEntityType: 'order',
        relatedEntityId: String(order._id),
      })
      .catch((e: unknown) => {
        this.logger.warn('Gửi thông báo hạn xác nhận Tiki thất bại', e);
      });
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
