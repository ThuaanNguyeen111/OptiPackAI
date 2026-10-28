import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Shipment, ShipmentDocument } from '../shipments/schemas/shipment.schema';
import { ReturnRequest, ReturnRequestDocument } from '../shipments/schemas/return-request.schema';
import { MarketplaceIntegrationService } from '../marketplace-integration/marketplace-integration.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import {
  MARKETPLACE_ADAPTERS,
  MarketplaceAdapter,
} from '../marketplace-integration/interfaces/marketplace-adapter.interface';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { ReturnType } from '../shipments/enums/return.enums';
import { isExchangeShipmentStatus } from '../storefront/aurelle-return-api';
import { carrierStatusOfOrder } from '../shipments/carrier-status.util';
import { ShipmentStatus } from '../shipments/enums/shipment-status.enum';
import {
  MarketplaceStatusOutbox,
  MarketplaceStatusOutboxDocument,
} from './schemas/status-outbox.schema';

/**
 * 21/10/2026 — Mã vận đơn cho đúng đơn của khách: nhóm gộp nhiều đơn / nhiều kiện thì
 * mỗi kiện có mã hãng riêng (`carrier_parcels`); ưu tiên kiện của chính đơn đó, rồi
 * mọi kiện có mã, cuối cùng mới tới mã vận đơn chung (`tracking_code`, có thể là mã nội bộ).
 */
/** Phần vận đơn mà bước ghi ngược đọc (mã vận đơn từng kiện, tên hãng, mã chuyến). */
interface ShipmentForWriteback {
  tracking_code?: string | null;
  trip_code?: string | null;
  carrier_name?: string | null;
  shipper_name?: string | null;
  shipper_phone?: string | null;
  carrier_parcels?: { order_id?: unknown; carrier_order_code?: string | null; carrier_status?: string | null }[] | null;
}

export function trackingCodeForOrder(
  shipment: {
    tracking_code?: string | null;
    carrier_parcels?: { order_id?: unknown; carrier_order_code?: string | null }[] | null;
  },
  orderId: unknown,
): string | undefined {
  const parcels = (shipment.carrier_parcels ?? []).flatMap((p) =>
    p.carrier_order_code ? [{ orderId: String(p.order_id), code: p.carrier_order_code }] : []);
  const own = parcels.filter((p) => p.orderId === String(orderId));
  const codes = [...new Set((own.length > 0 ? own : parcels).map((p) => p.code))];
  if (codes.length > 0) return codes.join(', ');
  return shipment.tracking_code ?? undefined;
}

/** Sau chừng này lần lỗi thì thôi, đánh dấu failed để người xem lại (không thử mãi). */
export const MAX_WRITEBACK_ATTEMPTS = 8;
const BATCH_SIZE = 50;
/** Chờ 30 s, 1 phút, 2 phút, 4 phút… tối đa 30 phút giữa 2 lần thử. */
const BACKOFF_BASE_MS = 30 * 1000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;

export interface WritebackRunResult {
  processed: number;
  sent: number;
  skipped: number;
  retrying: number;
  failed: number;
}

/**
 * 20/10/2026 — Gửi hàng đợi ghi ngược trạng thái đơn lên sàn (hiện chỉ AURELLE).
 *
 * Mỗi dòng outbox là 1 sự kiện của NHÓM ĐƠN; lúc gửi tách ra từng đơn của
 * AURELLE trong nhóm (nhóm gộp nhiều đơn → mỗi đơn 1 lần gọi, khóa idempotency
 * riêng nên gửi lại an toàn). Đơn Lazada trong cùng nhóm KHÔNG ghi ngược
 * (quyết định đã chốt: OptiPack không đổi trạng thái đơn trên Lazada).
 * Không bao giờ ném lỗi ra ngoài — lỗi chỉ tăng `attempts` và hẹn thử lại.
 */
@Injectable()
export class MarketplaceWritebackService {
  private readonly logger = new Logger(MarketplaceWritebackService.name);

  constructor(
    @InjectModel(MarketplaceStatusOutbox.name)
    private readonly outboxModel: Model<MarketplaceStatusOutboxDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Shipment.name) private readonly shipmentModel: Model<ShipmentDocument>,
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
    @Inject(MARKETPLACE_ADAPTERS)
    private readonly adapters: Partial<Record<MarketplacePlatform, MarketplaceAdapter>>,
    @InjectModel(ReturnRequest.name) private readonly returnModel: Model<ReturnRequestDocument>,
  ) {}

  async processPending(now: Date = new Date()): Promise<WritebackRunResult> {
    const rows = await this.outboxModel
      .find({ state: 'pending', next_attempt_at: { $lte: now } })
      .sort({ event_time: 1 })
      .limit(BATCH_SIZE);

    const result: WritebackRunResult = { processed: 0, sent: 0, skipped: 0, retrying: 0, failed: 0 };
    // Token theo shop chỉ lấy 1 lần mỗi lượt (có thể phải làm mới token).
    const tokens = new Map<string, string>();

    for (const row of rows) {
      result.processed += 1;
      try {
        const outcome = await this.processOne(row, tokens);
        if (outcome === 'sent') result.sent += 1;
        else result.skipped += 1;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const attempts = row.attempts + 1;
        const giveUp = attempts >= MAX_WRITEBACK_ATTEMPTS;
        await this.outboxModel.updateOne(
          { _id: row._id },
          {
            $set: {
              attempts,
              last_error: message.slice(0, 500),
              state: giveUp ? 'failed' : 'pending',
              next_attempt_at: new Date(now.getTime() + backoffMs(attempts)),
            },
          },
        );
        if (giveUp) {
          result.failed += 1;
          this.logger.error(`Ghi ngược ${row.idempotency_key} thất bại ${String(attempts)} lần — dừng. ${message}`);
        } else {
          result.retrying += 1;
          this.logger.warn(`Ghi ngược ${row.idempotency_key} lỗi (lần ${String(attempts)}): ${message}`);
        }
      }
    }
    return result;
  }

  private async processOne(
    row: MarketplaceStatusOutboxDocument,
    tokens: Map<string, string>,
  ): Promise<'sent' | 'skipped'> {
    if (row.kind === 'return_status') return this.processReturn(row, tokens);
    const adapter = this.adapters[MarketplacePlatform.AURELLE];
    if (!adapter?.updateOrderStatus) {
      await this.markDone(row, 'skipped', 'Adapter AURELLE chưa hỗ trợ updateOrderStatus.');
      return 'skipped';
    }

    // 28/10/2026 (G2) — trạng thái giao của RIÊNG 1 đơn (sự kiện hãng theo kiện của đơn đó).
    if (row.order_id && row.shipment_id) return this.processShipmentOrder(row, adapter, tokens);
    if (row.order_id) return this.processSingleOrder(row, adapter, tokens);
    // Chỉ đơn AURELLE còn hiệu lực — đơn đã hủy không cần báo "đã đóng gói/giao".
    const orders = await this.orderModel
      .find({
        consolidated_group_id: row.order_group_id,
        platform: MarketplacePlatform.AURELLE,
        status: { $ne: OrderStatus.CANCELED },
        // 21/10/2026 — đơn thay thế khi đổi hàng (mã EXC-...) không có trên website → không báo.
        origin: { $ne: 'replacement' },
      })
      .select('_id platform_order_id shop_id')
      .lean();
    // 22/10/2026 — đơn thay thế (EXC-…) của yêu cầu ĐỔI HÀNG khách gửi trên AURELLE: không
    // có đơn trên website, nên báo mốc giao về đúng yêu cầu đổi hàng (khách xem hàng đổi đi đâu).
    const exchangeStatus = isExchangeShipmentStatus(row.status) ? row.status : null;
    const replacements = exchangeStatus && adapter.updateExchangeShipment
      ? await this.orderModel
        .find({
          consolidated_group_id: row.order_group_id,
          platform: MarketplacePlatform.AURELLE,
          status: { $ne: OrderStatus.CANCELED },
          origin: 'replacement',
          source_return_id: { $ne: null },
        })
        .select('_id shop_id source_return_id')
        .lean()
      : [];
    if (orders.length === 0 && replacements.length === 0) {
      await this.markDone(row, 'skipped', null);
      return 'skipped';
    }

    const shipment = row.shipment_id
      ? await this.shipmentModel
        .findById(row.shipment_id)
        .select('tracking_code trip_code carrier_name carrier_kind carrier_parcels carrier_booking_error shipper_name shipper_phone')
        .lean()
      : null;
    // 21/10/2026 — vận đơn qua hãng thật (GHN) được đặt NGOÀI transaction, ngay sau dòng
    // "shipped" này. Chưa có mã hãng và chưa báo lỗi đặt → hẹn lượt sau (backoff 30 s),
    // để khách thấy mã GHN thay vì mã nội bộ.
    if (
      row.status === 'shipped'
      && shipment?.carrier_kind === 'live'
      && !shipment.carrier_booking_error
      && !(shipment.carrier_parcels ?? []).some((p) => p.carrier_order_code)
    ) {
      throw new Error('Đang chờ mã vận đơn của hãng vận chuyển.');
    }

    // 28/10/2026 (G2) — vận đơn hãng có kiện theo đơn: đơn mà các kiện của nó đã giao xong
    // không nhận trạng thái gộp khác "đã giao" (VD kho quét nhận hàng hoàn của kiện đơn B
    // thì đơn A đã giao không bị báo "đã hoàn").
    const deliveredAlready = (orderId: unknown): boolean =>
      row.status !== 'delivered'
      && (shipment?.carrier_parcels?.length ?? 0) > 0
      && carrierStatusOfOrder(shipment?.carrier_parcels ?? [], String(orderId)) === ShipmentStatus.DELIVERED;
    for (const order of orders) {
      if (deliveredAlready(order._id)) continue;
      const token = await this.tokenFor(order.shop_id, tokens);
      await adapter.updateOrderStatus(token, {
        orderId: order.platform_order_id,
        status: row.status,
        eventTime: row.event_time,
        trackingCode: shipment ? trackingCodeForOrder(shipment, order._id) : undefined,
        tripCode: shipment?.trip_code ?? undefined,
        carrier: shipment?.carrier_name ?? undefined,
        // 29/10/2026 — hỏa tốc (shop tự giao): shipper cho khách liên hệ.
        shipperName: shipment?.shipper_name ?? undefined,
        shipperPhone: shipment?.shipper_phone ?? undefined,
        reason: row.status === 'failed_delivery' ? (row.reason ?? 'Giao không thành công') : undefined,
        idempotencyKey: `${row.idempotency_key}:${order.platform_order_id}`,
      });
    }
    let exchangeSent = 0;
    for (const order of replacements) {
      if (deliveredAlready(order._id)) continue;
      if (await this.sendExchange(row, adapter, tokens, shipment, order)) exchangeSent += 1;
    }
    if (orders.length === 0 && exchangeSent === 0) {
      await this.markDone(row, 'skipped', 'Đơn thay thế không gắn yêu cầu đổi hàng của khách trên sàn.');
      return 'skipped';
    }
    await this.markDone(row, 'sent', null);
    return 'sent';
  }

  /**
   * Báo hành trình giao hàng ĐỔI (đơn thay thế EXC-…) về đúng yêu cầu đổi hàng khách gửi trên sàn.
   * Trả false khi không có gì để báo (trạng thái không thuộc từ vựng đổi hàng / phiếu không phải của sàn).
   */
  private async sendExchange(
    row: MarketplaceStatusOutboxDocument,
    adapter: MarketplaceAdapter,
    tokens: Map<string, string>,
    shipment: ShipmentForWriteback | null,
    order: { _id: unknown; source_return_id?: unknown },
  ): Promise<boolean> {
    const exchangeStatus = isExchangeShipmentStatus(row.status) ? row.status : null;
    if (!exchangeStatus || !adapter.updateExchangeShipment || !order.source_return_id) return false;
    const rma = await this.returnModel
      .findById(order.source_return_id)
      .select('source external_ref type shop_id')
      .lean();
    if (rma?.source !== 'marketplace' || !rma.external_ref || rma.type !== ReturnType.EXCHANGE) return false;
    const token = await this.tokenFor(rma.shop_id, tokens);
    await adapter.updateExchangeShipment(token, {
      returnId: rma.external_ref,
      status: exchangeStatus,
      eventTime: row.event_time,
      carrier: shipment?.carrier_name ?? undefined,
      trackingCode: shipment ? trackingCodeForOrder(shipment, order._id) : undefined,
      reason: exchangeStatus === 'failed_delivery' ? (row.reason ?? 'Giao không thành công') : undefined,
      idempotencyKey: `${row.idempotency_key}:exchange:${rma.external_ref}`,
    });
    return true;
  }

  /**
   * 28/10/2026 (G2) — Trạng thái giao của RIÊNG 1 đơn trong vận đơn hãng (mỗi đơn 1 vận đơn hãng):
   * gửi kèm mã vận đơn của đúng đơn đó. Đơn thay thế (đổi hàng) báo về yêu cầu đổi hàng.
   */
  private async processShipmentOrder(
    row: MarketplaceStatusOutboxDocument,
    adapter: MarketplaceAdapter,
    tokens: Map<string, string>,
  ): Promise<'sent' | 'skipped'> {
    const order = await this.orderModel
      .findOne({ _id: row.order_id, platform: MarketplacePlatform.AURELLE, status: { $ne: OrderStatus.CANCELED } })
      .select('_id platform_order_id shop_id origin source_return_id')
      .lean();
    if (!order) {
      await this.markDone(row, 'skipped', 'Không phải đơn AURELLE còn hiệu lực để báo ngược.');
      return 'skipped';
    }
    const shipment = await this.shipmentModel
      .findById(row.shipment_id)
      .select('tracking_code trip_code carrier_name carrier_kind carrier_parcels carrier_booking_error shipper_name shipper_phone')
      .lean();
    if (order.origin === 'replacement') {
      const sent = await this.sendExchange(row, adapter, tokens, shipment, order);
      await this.markDone(row, sent ? 'sent' : 'skipped', sent ? null : 'Đơn thay thế không có yêu cầu đổi hàng của sàn để báo.');
      return sent ? 'sent' : 'skipped';
    }
    if (!adapter.updateOrderStatus) {
      await this.markDone(row, 'skipped', 'Adapter AURELLE chưa hỗ trợ updateOrderStatus.');
      return 'skipped';
    }
    const token = await this.tokenFor(order.shop_id, tokens);
    await adapter.updateOrderStatus(token, {
      orderId: order.platform_order_id,
      status: row.status,
      eventTime: row.event_time,
      trackingCode: shipment ? trackingCodeForOrder(shipment, order._id) : undefined,
      tripCode: shipment?.trip_code ?? undefined,
      carrier: shipment?.carrier_name ?? undefined,
      shipperName: shipment?.shipper_name ?? undefined,
      shipperPhone: shipment?.shipper_phone ?? undefined,
      reason: row.status === 'failed_delivery' ? (row.reason ?? 'Giao không thành công') : undefined,
      idempotencyKey: `${row.idempotency_key}:${order.platform_order_id}`,
    });
    await this.markDone(row, 'sent', null);
    return 'sent';
  }

  /**
   * 22/10/2026 — Sự kiện của RIÊNG 1 đơn (người bán hủy / giao thiếu): gửi đúng đơn đó, kể cả
   * khi đơn đã ở trạng thái hủy (chính sự kiện hủy cần báo cho khách).
   */
  private async processSingleOrder(
    row: MarketplaceStatusOutboxDocument,
    adapter: MarketplaceAdapter,
    tokens: Map<string, string>,
  ): Promise<'sent' | 'skipped'> {
    const order = await this.orderModel
      .findOne({ _id: row.order_id, platform: MarketplacePlatform.AURELLE, origin: { $ne: 'replacement' } })
      .select('_id platform_order_id shop_id')
      .lean();
    if (!order || !adapter.updateOrderStatus) {
      await this.markDone(row, 'skipped', 'Không phải đơn AURELLE để báo ngược.');
      return 'skipped';
    }
    const token = await this.tokenFor(order.shop_id, tokens);
    await adapter.updateOrderStatus(token, {
      orderId: order.platform_order_id,
      status: row.status,
      eventTime: row.event_time,
      reason: row.reason ?? undefined,
      idempotencyKey: `${row.idempotency_key}:${order.platform_order_id}`,
      items: row.shipped_items?.length ? row.shipped_items.map((i) => ({ sku: i.sku, shipped_quantity: i.shipped_quantity })) : undefined,
    });
    await this.markDone(row, 'sent', null);
    return 'sent';
  }

  /** Kết quả xử lý phiếu trả hàng của khách → báo ngược cho sàn (duyệt/từ chối/nhận hàng/xong/hủy). */
  private async processReturn(
    row: MarketplaceStatusOutboxDocument,
    tokens: Map<string, string>,
  ): Promise<'sent' | 'skipped'> {
    const adapter = this.adapters[MarketplacePlatform.AURELLE];
    const rma = row.return_request_id ? await this.returnModel.findById(row.return_request_id).lean() : null;
    // Chỉ phiếu do khách gửi trên sàn mới có đích để báo.
    const target = rma?.source === 'marketplace' ? rma : null;
    if (!adapter?.updateReturnStatus || !target?.external_ref) {
      await this.markDone(row, 'skipped', 'Không có phiếu trả hàng của sàn để báo ngược.');
      return 'skipped';
    }
    const token = await this.tokenFor(target.shop_id, tokens);
    await adapter.updateReturnStatus(token, {
      returnId: target.external_ref,
      status: row.status,
      eventTime: row.event_time,
      rmaCode: target.rma_code,
      decisionNote: row.note,
      idempotencyKey: row.idempotency_key,
    });
    await this.markDone(row, 'sent', null);
    return 'sent';
  }

  private async tokenFor(shopId: string, cache: Map<string, string>): Promise<string> {
    const cached = cache.get(shopId);
    if (cached) return cached;
    const token = await this.marketplaceIntegrationService.getValidAccessToken(
      shopId,
      MarketplacePlatform.AURELLE,
    );
    cache.set(shopId, token);
    return token;
  }

  private async markDone(
    row: MarketplaceStatusOutboxDocument,
    state: 'sent' | 'skipped',
    note: string | null,
  ): Promise<void> {
    await this.outboxModel.updateOne(
      { _id: row._id },
      { $set: { state, sent_at: new Date(), last_error: note } },
    );
  }
}

export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
}
