import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SF_ERROR_CODES, sfError } from './storefront.errors';
import {
  OPEN_RETURN_STATUS_VALUES,
  StorefrontOrder,
  StorefrontOrderDocument,
  StorefrontOrderEvent,
  StorefrontOrderEventDocument,
  StorefrontOrderItem,
  StorefrontOrderItemDocument,
  StorefrontInventoryStock,
  StorefrontInventoryStockDocument,
  StorefrontProductVariant,
  StorefrontProductVariantDocument,
  StorefrontReturnRequest,
  StorefrontReturnRequestDocument,
} from './schemas/storefront.schema';
import { CreateStorefrontReturnDto } from './dto/storefront.dto';
import { AurelleWebhookPublisher } from './aurelle-webhook.publisher';
import { STOREFRONT_RETURN_LABELS, STOREFRONT_RETURN_REASON_LABELS } from './aurelle-return-api';

/** Cùng hạn với phía kho (RETURN_WINDOW_DAYS = 15 ngày kể từ khi nhận hàng). */
export const STOREFRONT_RETURN_WINDOW_DAYS = 15;
const DAY_MS = 86_400_000;

/** Tra nhãn theo chuỗi bất kỳ (dữ liệu cũ có thể có giá trị lạ) — không có thì trả lại chính giá trị đó. */
function lookup(labels: Record<string, string>, key: string): string {
  return (labels as Record<string, string | undefined>)[key] ?? key;
}

/**
 * 20/10/2026 — Khách tự gửi yêu cầu trả hàng. Website CHỈ ghi nhận yêu cầu và báo OptiPack
 * (webhook `return_requested`); OptiPack kéo qua Open API, kiểm tra lại điều kiện phía kho,
 * rồi báo kết quả duyệt/từ chối/nhận hàng ngược lại (`/reverse/order/update`).
 * 21/10/2026 — thêm đổi hàng (`type = exchange`, chọn biến thể cùng sản phẩm) và khách tự hủy
 * yêu cầu khi cửa hàng chưa xử lý (`requested`).
 */
@Injectable()
export class StorefrontReturnsService {
  constructor(
    @InjectModel(StorefrontOrder.name) private readonly orderModel: Model<StorefrontOrderDocument>,
    @InjectModel(StorefrontOrderItem.name) private readonly itemModel: Model<StorefrontOrderItemDocument>,
    @InjectModel(StorefrontReturnRequest.name) private readonly returnModel: Model<StorefrontReturnRequestDocument>,
    @InjectModel(StorefrontOrderEvent.name) private readonly eventModel: Model<StorefrontOrderEventDocument>,
    private readonly webhookPublisher: AurelleWebhookPublisher,
    // 21/10/2026 — đổi hàng: kiểm biến thể đổi sang + tồn còn bán. @Optional: test cũ không có.
    @Optional() @InjectModel(StorefrontProductVariant.name) private readonly variantModel?: Model<StorefrontProductVariantDocument>,
    @Optional() @InjectModel(StorefrontInventoryStock.name) private readonly stockModel?: Model<StorefrontInventoryStockDocument>,
  ) {}

  async create(customerId: string, orderId: string, dto: CreateStorefrontReturnDto) {
    const order = Types.ObjectId.isValid(orderId)
      ? await this.orderModel.findOne({ _id: orderId, customer_id: new Types.ObjectId(customerId) })
      : null;
    if (!order) throw new NotFoundException(sfError(SF_ERROR_CODES.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng'));

    if (order.fulfillment_status !== 'delivered') {
      throw new ConflictException(
        sfError(SF_ERROR_CODES.RETURN_ORDER_NOT_DELIVERED, 'Chỉ gửi yêu cầu trả hàng được sau khi bạn đã nhận hàng.'),
      );
    }
    const deliveredAt = order.fulfillment_updated_at ?? order.updated_at ?? new Date();
    if (Date.now() - deliveredAt.getTime() > STOREFRONT_RETURN_WINDOW_DAYS * DAY_MS) {
      throw new ConflictException(
        sfError(SF_ERROR_CODES.RETURN_WINDOW_EXPIRED, `Đã quá ${String(STOREFRONT_RETURN_WINDOW_DAYS)} ngày kể từ khi nhận hàng nên không thể trả hàng.`),
      );
    }
    if (await this.returnModel.exists({ order_id: order._id, status: { $in: [...OPEN_RETURN_STATUS_VALUES] } })) {
      throw new ConflictException(sfError(SF_ERROR_CODES.RETURN_OPEN_EXISTS, 'Đơn hàng này đang có một yêu cầu trả hàng chưa xử lý xong.'));
    }

    await this.assertItemsReturnable(order._id, dto);
    const exchangeItems = await this.resolveExchangeItems(order._id, dto);

    let created: StorefrontReturnRequestDocument;
    try {
      created = await this.returnModel.create({
        customer_id: new Types.ObjectId(customerId),
        order_id: order._id,
        public_order_id: order.public_order_id,
        type: dto.type,
        items: dto.items.map((item) => ({ sku: item.sku, quantity: item.quantity, reason_code: item.reason_code })),
        exchange_items: exchangeItems,
        customer_note: dto.customer_note?.trim() ?? '',
      });
    } catch (error: unknown) {
      // Hai lần bấm cùng lúc: index duy nhất theo đơn chặn lần thứ hai.
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000) {
        throw new ConflictException(sfError(SF_ERROR_CODES.RETURN_OPEN_EXISTS, 'Đơn hàng này đang có một yêu cầu trả hàng chưa xử lý xong.'));
      }
      throw error;
    }

    await this.eventModel.create({
      order_id: order._id,
      public_order_id: order.public_order_id,
      status: 'return_requested',
      label: STOREFRONT_RETURN_LABELS.requested,
      reason: dto.customer_note?.trim() ? dto.customer_note.trim() : null,
      occurred_at: new Date(),
      source: 'customer',
      idempotency_key: null,
    });
    if (order.public_order_id !== null) {
      this.webhookPublisher.notifyReturnRequested(order.public_order_id, created._id.toString());
    }
    return this.toResponse(created, order.order_number);
  }

  async list(customerId: string) {
    const returns = await this.returnModel
      .find({ customer_id: new Types.ObjectId(customerId) })
      .sort({ created_at: -1 })
      .limit(50);
    const orders = await this.orderModel
      .find({ _id: { $in: returns.map((r) => r.order_id) } })
      .select('order_number')
      .lean();
    const numbers = new Map(orders.map((o) => [o._id.toString(), o.order_number]));
    return returns.map((r) => this.toResponse(r, numbers.get(r.order_id.toString()) ?? ''));
  }

  async findOne(customerId: string, id: string) {
    const doc = Types.ObjectId.isValid(id)
      ? await this.returnModel.findOne({ _id: id, customer_id: new Types.ObjectId(customerId) })
      : null;
    if (!doc) throw new NotFoundException(sfError(SF_ERROR_CODES.RETURN_NOT_FOUND, 'Không tìm thấy yêu cầu trả hàng'));
    const order = await this.orderModel.findById(doc.order_id).select('order_number').lean();
    const events = await this.eventModel
      .find({ order_id: doc.order_id, status: /^return_/ })
      .sort({ occurred_at: 1 })
      .limit(50)
      .lean();
    return {
      ...this.toResponse(doc, order?.order_number ?? ''),
      events: events.map((event) => ({ label: event.label, reason: event.reason, occurredAt: event.occurred_at, source: event.source })),
    };
  }

  /**
   * 21/10/2026 — Khách tự hủy yêu cầu trả hàng. Chỉ khi cửa hàng CHƯA xử lý (`requested`);
   * đổi trạng thái có điều kiện nên bấm 2 lần / đua với kết quả duyệt vẫn chỉ 1 bên thắng.
   * Báo OptiPack (webhook `return_canceled`) để hủy phiếu bên kho; webhook mất thì cron kéo bù.
   */
  async cancel(customerId: string, id: string) {
    const customer = new Types.ObjectId(customerId);
    const doc = Types.ObjectId.isValid(id)
      ? await this.returnModel.findOneAndUpdate(
        { _id: id, customer_id: customer, status: 'requested' },
        { $set: { status: 'canceled', status_updated_at: new Date() } },
        { returnDocument: 'after' },
      )
      : null;
    if (!doc) {
      const exists = Types.ObjectId.isValid(id) ? await this.returnModel.exists({ _id: id, customer_id: customer }) : null;
      if (!exists) throw new NotFoundException(sfError(SF_ERROR_CODES.RETURN_NOT_FOUND, 'Không tìm thấy yêu cầu trả hàng'));
      throw new ConflictException(
        sfError(SF_ERROR_CODES.RETURN_NOT_CANCELLABLE, 'Cửa hàng đã xử lý yêu cầu này nên không thể tự hủy — vui lòng liên hệ cửa hàng.'),
      );
    }
    await this.eventModel.create({
      order_id: doc.order_id,
      public_order_id: doc.public_order_id,
      status: 'return_canceled',
      label: STOREFRONT_RETURN_LABELS.canceled,
      reason: 'Bạn đã hủy yêu cầu',
      occurred_at: new Date(),
      source: 'customer',
      idempotency_key: null,
    });
    if (doc.public_order_id !== null) this.webhookPublisher.notifyReturnCanceled(doc.public_order_id, doc._id.toString());
    const order = await this.orderModel.findById(doc.order_id).select('order_number').lean();
    return this.toResponse(doc, order?.order_number ?? '');
  }

  /**
   * 21/10/2026 — Biến thể có thể đổi sang cho từng sản phẩm trong đơn (cùng sản phẩm, đang
   * bán), kèm số còn bán được để khách chọn.
   */
  async exchangeOptions(customerId: string, orderId: string) {
    const order = Types.ObjectId.isValid(orderId)
      ? await this.orderModel.findOne({ _id: orderId, customer_id: new Types.ObjectId(customerId) })
      : null;
    if (!order) throw new NotFoundException(sfError(SF_ERROR_CODES.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng'));
    if (!this.variantModel || !this.stockModel) return [];
    const items = await this.itemModel.find({ order_id: order._id }).lean();
    const productIds = [...new Set(items.map((item) => item.product_id.toString()))].map((pid) => new Types.ObjectId(pid));
    const variants = await this.variantModel.find({ product_id: { $in: productIds }, is_active: true }).sort({ sku: 1 }).lean();
    const available = await this.sellableByVariant(variants.map((v) => v._id));
    const seen = new Set<string>();
    const result: { sku: string; options: { sku: string; variantName: string; color: string | null; size: string | null; available: number }[] }[] = [];
    for (const item of items) {
      if (seen.has(item.sku_snapshot)) continue;
      seen.add(item.sku_snapshot);
      result.push({
        sku: item.sku_snapshot,
        options: variants
          .filter((variant) => variant.product_id.equals(item.product_id))
          .map((variant) => ({
            sku: variant.sku,
            variantName: variant.variant_name,
            color: variant.color,
            size: variant.size,
            available: available.get(variant._id.toString()) ?? 0,
          })),
      });
    }
    return result;
  }

  /**
   * 21/10/2026 — Đổi hàng: hàng đổi sang phải là biến thể ĐANG BÁN của cùng sản phẩm với món trả,
   * tổng số lượng bằng tổng số trả, và còn hàng bán. Trả về danh sách đã chuẩn hóa mã (viết hoa).
   */
  private async resolveExchangeItems(orderId: Types.ObjectId, dto: CreateStorefrontReturnDto): Promise<{ sku: string; quantity: number }[]> {
    if (dto.type !== 'exchange') return [];
    const invalid = (message: string): never => this.exchangeInvalid(message);
    const wanted = new Map<string, number>();
    for (const item of dto.exchange_items ?? []) {
      const sku = item.sku.trim().toUpperCase();
      wanted.set(sku, (wanted.get(sku) ?? 0) + item.quantity);
    }
    if (wanted.size === 0) invalid('Vui lòng chọn sản phẩm muốn đổi sang.');
    const returned = dto.items.reduce((sum, item) => sum + item.quantity, 0);
    const exchanged = [...wanted.values()].reduce((sum, quantity) => sum + quantity, 0);
    if (returned !== exchanged) invalid(`Số lượng đổi sang (${String(exchanged)}) phải bằng số lượng trả (${String(returned)}).`);
    const variantModel = this.variantModel ?? this.exchangeInvalid('Cửa hàng chưa hỗ trợ đổi hàng.');

    const orderItems = await this.itemModel.find({ order_id: orderId }).lean();
    const returnedSkus = new Set(dto.items.map((item) => item.sku));
    const products = new Set(orderItems.filter((item) => returnedSkus.has(item.sku_snapshot)).map((item) => item.product_id.toString()));
    const variants = await variantModel.find({ sku: { $in: [...wanted.keys()] } }).lean();
    const bySku = new Map(variants.map((variant) => [variant.sku, variant]));
    const available = await this.sellableByVariant(variants.map((variant) => variant._id));
    for (const [sku, quantity] of wanted) {
      const variant = bySku.get(sku);
      if (!variant?.is_active || !products.has(variant.product_id.toString())) {
        return this.exchangeInvalid(`Không đổi sang "${sku}" được — chỉ đổi sang size/màu khác của chính sản phẩm bạn trả.`);
      }
      if ((available.get(variant._id.toString()) ?? 0) < quantity) {
        throw new BadRequestException(sfError(SF_ERROR_CODES.OUT_OF_STOCK, `"${variant.variant_name}" (${sku}) không còn đủ hàng để đổi.`));
      }
    }
    return [...wanted].map(([sku, quantity]) => ({ sku, quantity }));
  }

  private exchangeInvalid(message: string): never {
    throw new BadRequestException(sfError(SF_ERROR_CODES.EXCHANGE_INVALID, message));
  }

  /** Số còn bán được theo biến thể = tồn − đang giữ chỗ (cộng mọi kho của website). */
  private async sellableByVariant(variantIds: Types.ObjectId[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!this.stockModel || variantIds.length === 0) return out;
    const rows = await this.stockModel.find({ variant_id: { $in: variantIds } }).lean();
    for (const row of rows) {
      const key = row.variant_id.toString();
      out.set(key, (out.get(key) ?? 0) + Math.max(0, row.quantity_on_hand - row.reserved_quantity));
    }
    return out;
  }

  /** Món phải thuộc đơn, không khai trùng, không vượt số lượng còn được trả (trừ các phiếu trước đã duyệt/đang xử lý). */
  private async assertItemsReturnable(orderId: Types.ObjectId, dto: CreateStorefrontReturnDto): Promise<void> {
    const items = await this.itemModel.find({ order_id: orderId }).lean();
    const remaining = new Map<string, number>();
    for (const item of items) remaining.set(item.sku_snapshot, (remaining.get(item.sku_snapshot) ?? 0) + item.quantity);

    const earlier = await this.returnModel
      .find({ order_id: orderId, status: { $nin: ['rejected', 'canceled'] } })
      .select('items')
      .lean();
    for (const request of earlier) {
      for (const item of request.items) remaining.set(item.sku, (remaining.get(item.sku) ?? 0) - item.quantity);
    }

    const seen = new Set<string>();
    for (const item of dto.items) {
      const max = remaining.get(item.sku);
      if (seen.has(item.sku) || max === undefined || item.quantity > max) {
        throw new BadRequestException(
          sfError(
            SF_ERROR_CODES.RETURN_INVALID_ITEMS,
            `Sản phẩm "${item.sku}" không thuộc đơn hàng, bị chọn trùng, hoặc vượt số lượng còn được trả (${String(Math.max(max ?? 0, 0))}).`,
          ),
        );
      }
      seen.add(item.sku);
    }
  }

  private toResponse(doc: StorefrontReturnRequestDocument, orderNumber: string) {
    return {
      id: doc.id,
      orderId: doc.order_id.toString(),
      orderNumber,
      type: doc.type,
      status: doc.status,
      statusLabel: lookup(STOREFRONT_RETURN_LABELS, doc.status),
      items: doc.items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        reasonCode: item.reason_code,
        reasonLabel: lookup(STOREFRONT_RETURN_REASON_LABELS, item.reason_code),
      })),
      exchangeItems: doc.exchange_items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
      customerNote: doc.customer_note,
      rmaCode: doc.rma_code,
      decisionNote: doc.decision_note,
      createdAt: doc.created_at ?? new Date(0),
      updatedAt: doc.updated_at ?? new Date(0),
    };
  }
}
