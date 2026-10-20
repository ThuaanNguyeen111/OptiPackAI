import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
 * Chưa hỗ trợ: đổi hàng; khách tự hủy yêu cầu (phải liên hệ shop).
 */
@Injectable()
export class StorefrontReturnsService {
  constructor(
    @InjectModel(StorefrontOrder.name) private readonly orderModel: Model<StorefrontOrderDocument>,
    @InjectModel(StorefrontOrderItem.name) private readonly itemModel: Model<StorefrontOrderItemDocument>,
    @InjectModel(StorefrontReturnRequest.name) private readonly returnModel: Model<StorefrontReturnRequestDocument>,
    @InjectModel(StorefrontOrderEvent.name) private readonly eventModel: Model<StorefrontOrderEventDocument>,
    private readonly webhookPublisher: AurelleWebhookPublisher,
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

    let created: StorefrontReturnRequestDocument;
    try {
      created = await this.returnModel.create({
        customer_id: new Types.ObjectId(customerId),
        order_id: order._id,
        public_order_id: order.public_order_id,
        type: dto.type,
        items: dto.items.map((item) => ({ sku: item.sku, quantity: item.quantity, reason_code: item.reason_code })),
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
      customerNote: doc.customer_note,
      rmaCode: doc.rma_code,
      decisionNote: doc.decision_note,
      createdAt: doc.created_at ?? new Date(0),
      updatedAt: doc.updated_at ?? new Date(0),
    };
  }
}
