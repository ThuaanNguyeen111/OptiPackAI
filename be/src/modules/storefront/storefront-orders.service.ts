import { SF_ERROR_CODES, sfError } from './storefront.errors';
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  StorefrontCounter,
  StorefrontCounterDocument,
  StorefrontInventoryStock,
  StorefrontInventoryStockDocument,
  StorefrontOrderEvent,
  StorefrontOrderEventDocument,
  StorefrontReturnRequest,
  StorefrontReturnRequestDocument,
  OPEN_RETURN_STATUS_VALUES,
  StorefrontShipment,
  StorefrontShipmentDocument,
  StorefrontOrder,
  StorefrontOrderDocument,
  StorefrontOrderItem,
  StorefrontOrderItemDocument,
  StorefrontPayment,
  StorefrontPaymentDocument,
  StorefrontProduct,
  StorefrontProductDocument,
  StorefrontProductVariant,
  StorefrontProductVariantDocument,
} from './schemas/storefront.schema';
import { CheckoutDto } from './dto/storefront.dto';
import { AurelleWebhookPublisher } from './aurelle-webhook.publisher';
import { toOpenApiStatus } from './aurelle-open-api.mapper';
import { STOREFRONT_RETURN_LABELS } from './aurelle-return-api';
import { nextPublicOrderId, type CounterCollection } from './storefront-counter.util';
import { calculateOrderTotal } from './storefront-pricing';
import { sellableQuantity } from './storefront-stock.util';
import { buildOrderProgress, orderDisplayStatus, type ProgressInput } from './storefront-order-progress';

@Injectable()
export class StorefrontOrdersService {
  constructor(
    @InjectModel(StorefrontOrder.name) private readonly orderModel: Model<StorefrontOrderDocument>,
    @InjectModel(StorefrontOrderItem.name) private readonly itemModel: Model<StorefrontOrderItemDocument>,
    @InjectModel(StorefrontPayment.name) private readonly paymentModel: Model<StorefrontPaymentDocument>,
    @InjectModel(StorefrontProductVariant.name) private readonly variantModel: Model<StorefrontProductVariantDocument>,
    @InjectModel(StorefrontProduct.name) private readonly productModel: Model<StorefrontProductDocument>,
    @InjectModel(StorefrontInventoryStock.name) private readonly stockModel: Model<StorefrontInventoryStockDocument>,
    @InjectModel(StorefrontCounter.name) private readonly counterModel: Model<StorefrontCounterDocument>,
    @InjectModel(StorefrontOrderEvent.name) private readonly eventModel: Model<StorefrontOrderEventDocument>,
    @InjectModel(StorefrontShipment.name) private readonly shipmentModel: Model<StorefrontShipmentDocument>,
    private readonly webhookPublisher: AurelleWebhookPublisher,
    // 21/10/2026 — để danh sách/chi tiết đơn biết đơn đang có yêu cầu trả hàng chưa xong (Optional: spec cũ dựng service bằng new).
    @Optional() @InjectModel(StorefrontReturnRequest.name) private readonly returnModel?: Model<StorefrontReturnRequestDocument>,
  ) {}

  /** Yêu cầu trả hàng CHƯA xử lý xong của từng đơn (1 truy vấn cho cả danh sách). Mỗi đơn tối đa 1 phiếu mở (index duy nhất). */
  private async openReturnsByOrder(orderIds: Types.ObjectId[]): Promise<Map<string, { id: string; status: string; statusLabel: string }>> {
    const result = new Map<string, { id: string; status: string; statusLabel: string }>();
    if (!this.returnModel || orderIds.length === 0) return result;
    const rows = await this.returnModel
      .find({ order_id: { $in: orderIds }, status: { $in: [...OPEN_RETURN_STATUS_VALUES] } })
      .select('order_id status')
      .lean();
    for (const row of rows) {
      const status = row.status as keyof typeof STOREFRONT_RETURN_LABELS;
      result.set(String(row.order_id), { id: String(row._id), status, statusLabel: STOREFRONT_RETURN_LABELS[status] });
    }
    return result;
  }

  async checkout(customerId: string, dto: CheckoutDto) {
    if (!dto.items.length) throw new BadRequestException(sfError(SF_ERROR_CODES.CART_EMPTY, 'Giỏ hàng đang trống'));

    const customerObjectId = new Types.ObjectId(customerId);
    if (dto.client_order_id) {
      const existing = await this.orderModel.findOne({
        customer_id: customerObjectId,
        client_order_id: dto.client_order_id,
      });
      if (existing) return this.toResponse(existing);
    }

    const ids = dto.items.map((item) => new Types.ObjectId(item.variant_id));
    const variants = await this.variantModel.find({ _id: { $in: ids }, is_active: true });
    if (variants.length !== dto.items.length) throw new BadRequestException(sfError(SF_ERROR_CODES.VARIANT_UNAVAILABLE, 'Một sản phẩm không còn khả dụng'));

    const products = await this.productModel.find({
      _id: { $in: variants.map((variant) => variant.product_id) },
      status: 'active',
    });
    const productMap = new Map(products.map((product) => [product._id.toString(), product]));
    const stockMap = new Map(
      (await this.stockModel.find({ variant_id: { $in: ids } }))
        .map((stock) => [stock.variant_id.toString(), stock]),
    );

    const itemDocs = dto.items.map((input) => {
      const variant = variants.find((candidate) => candidate.id === input.variant_id);
      if (!variant) throw new NotFoundException(sfError(SF_ERROR_CODES.VARIANT_NOT_FOUND, 'Không tìm thấy biến thể'));
      const stock = stockMap.get(variant.id);
      // 22/10/2026 — chỉ bán SKU có tồn do kho OptiPack quản (xem `sellableQuantity`).
      const available = sellableQuantity(variant, stock);
      if (available < input.quantity) throw new BadRequestException(sfError(SF_ERROR_CODES.OUT_OF_STOCK, `SKU ${variant.sku} không đủ tồn kho`));
      const product = productMap.get(variant.product_id.toString());
      if (!product) throw new NotFoundException(sfError(SF_ERROR_CODES.PRODUCT_NOT_FOUND, 'Không tìm thấy sản phẩm'));
      return {
        product_id: product._id,
        variant_id: variant._id,
        sku_snapshot: variant.sku,
        product_name_snapshot: product.name,
        variant_snapshot: variant.variant_name,
        image_snapshot: variant.image_url ?? product.thumbnail_url,
        unit_price: variant.price,
        quantity: input.quantity,
        discount_amount: 0,
        line_total: variant.price * input.quantity,
      };
    });

    const subtotal = itemDocs.reduce((sum, item) => sum + item.line_total, 0);
    const discountAmount = 0;
    const { shippingFee, total } = calculateOrderTotal(subtotal, discountAmount);
    let order: StorefrontOrderDocument;
    try {
      order = await this.orderModel.create({
        customer_id: customerObjectId,
        client_order_id: dto.client_order_id,
        order_number: `KA-${Date.now().toString(36).toUpperCase()}`,
        public_order_id: await nextPublicOrderId(
          this.counterModel.collection as unknown as CounterCollection,
        ),
        subtotal,
        discount_amount: discountAmount,
        shipping_fee: shippingFee,
        total_amount: total,
        currency: 'VND',
        shipping_address_snapshot: dto.shipping_address,
        customer_note: dto.customer_note ?? '',
        placed_at: new Date(),
      });
    } catch (error) {
      if (!dto.client_order_id || !this.isDuplicateKeyError(error)) throw error;
      const existing = await this.orderModel.findOne({
        customer_id: customerObjectId,
        client_order_id: dto.client_order_id,
      });
      if (!existing) throw error;
      return this.toResponse(existing);
    }
    await this.itemModel.insertMany(itemDocs.map((item) => ({ ...item, order_id: order._id })));
    await this.paymentModel.create({
      order_id: order._id,
      payment_method: dto.payment_method,
      amount: order.total_amount,
      status: 'pending',
    });
    for (const item of itemDocs) {
      await this.stockModel.updateOne(
        { variant_id: item.variant_id },
        { $inc: { reserved_quantity: item.quantity } },
      );
    }

    // Báo ứng dụng đối tác (OptiPack) qua webhook; OptiPack tự gọi Open API
    // lấy đơn. Không còn ghi thẳng vào collection orders (kênh nội bộ đã gỡ).
    if (order.public_order_id !== null) {
      this.webhookPublisher.notifyOrderChanged(order.public_order_id, toOpenApiStatus(order));
    }
    return this.toResponse(order);
  }

  async list(customerId: string) {
    const orders = await this.orderModel
      .find({ customer_id: new Types.ObjectId(customerId) })
      .sort({ created_at: -1 })
      .limit(50);
    const openReturns = await this.openReturnsByOrder(orders.map((order) => order._id));
    return orders.map((order) => this.toResponse(order, openReturns.get(String(order._id)) ?? null));
  }

  async findOne(customerId: string, id: string) {
    // id sai định dạng → cùng 404 (trước đây CastError lọt thành 500).
    const order = Types.ObjectId.isValid(id)
      ? await this.orderModel.findOne({ _id: id, customer_id: new Types.ObjectId(customerId) })
      : null;
    if (!order) throw new NotFoundException(sfError(SF_ERROR_CODES.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng'));
    const [items, payment, shipment, events, openReturns] = await Promise.all([
      this.itemModel.find({ order_id: order._id }).lean(),
      this.paymentModel.findOne({ order_id: order._id }).lean(),
      this.shipmentModel.findOne({ order_id: order._id }).lean(),
      // Hành trình: sự kiện đối tác (đóng gói, giao...) theo thứ tự thời gian.
      this.eventModel.find({ order_id: order._id }).sort({ occurred_at: 1 }).limit(100).lean(),
      this.openReturnsByOrder([order._id]),
    ]);
    return {
      ...this.toResponse(order, openReturns.get(String(order._id)) ?? null),
      shippingAddress: order.shipping_address_snapshot,
      paymentMethod: payment?.payment_method ?? null,
      items,
      trackingCode: shipment?.tracking_number && shipment.tracking_number.length > 0 ? shipment.tracking_number : null,
      tripCode: shipment?.trip_code ?? null,
      // 21/10/2026 — tên hãng OptiPack báo về; bản ghi cũ ghi sẵn "OptiPack" → coi như chưa biết.
      carrier: shipment?.carrier && shipment.carrier !== 'OptiPack' ? shipment.carrier : null,
      events: events.map((event) => ({
        status: event.status,
        label: event.label,
        reason: event.reason,
        occurredAt: event.occurred_at,
        source: event.source,
      })),
      // 23/10/2026 — thanh tiến trình 7 bước + nhánh hủy/giao thất bại/hoàn (storefront-order-progress.ts).
      progress: buildOrderProgress({
        ...this.progressInput(order),
        events: events.map((event) => ({ status: event.status, reason: event.reason, occurredAt: event.occurred_at })),
      }),
    };
  }

  /**
   * Khách tự hủy đơn (20/10/2026). Chỉ khi đơn còn `pending` và CHƯA đóng gói
   * (`fulfillment_status = awaiting_packaging`) — sau đó hàng đã ra khỏi kho, phải
   * dùng luồng trả hàng. Cổng chuyển trạng thái là 1 lệnh nguyên tử có điều kiện nên
   * 2 lần bấm cùng lúc chỉ trả tồn đúng 1 lần. Hủy xong báo OptiPack bằng webhook;
   * OptiPack đồng bộ lại thấy `canceled` → nhả giữ chỗ, hủy nhóm nếu hết đơn.
   */
  async cancel(customerId: string, id: string, reason?: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(sfError(SF_ERROR_CODES.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng'));
    }
    const filter = { _id: new Types.ObjectId(id), customer_id: new Types.ObjectId(customerId) };
    const cancelled = await this.orderModel.findOneAndUpdate(
      { ...filter, status: 'pending', fulfillment_status: 'awaiting_packaging' },
      // stock_state released (21/10/2026): đơn còn chờ đóng gói chắc chắn chưa trừ tồn
      // thực → chỉ trả giữ chỗ (vòng $inc bên dưới) và đánh dấu để bước "rời kho" không trừ nữa.
      { $set: { status: 'cancelled', stock_state: 'released', cancel_source: 'customer' } },
      { returnDocument: 'after' },
    );
    if (!cancelled) {
      const exists = await this.orderModel.exists(filter);
      if (!exists) throw new NotFoundException(sfError(SF_ERROR_CODES.ORDER_NOT_FOUND, 'Không tìm thấy đơn hàng'));
      throw new ConflictException(
        sfError(SF_ERROR_CODES.ORDER_NOT_CANCELLABLE, 'Đơn hàng đã được xử lý nên không thể hủy. Bạn có thể yêu cầu trả hàng sau khi nhận hàng.'),
      );
    }

    // Trả lại phần tồn đã giữ lúc đặt (cổng nguyên tử ở trên bảo đảm chỉ chạy 1 lần).
    const items = await this.itemModel.find({ order_id: cancelled._id }).lean();
    for (const item of items) {
      await this.stockModel.updateOne(
        { variant_id: item.variant_id },
        { $inc: { reserved_quantity: -item.quantity } },
      );
    }
    await this.paymentModel.updateOne(
      { order_id: cancelled._id, status: 'pending' },
      { $set: { status: 'failed', failure_reason: 'Khách hủy đơn' } },
    );
    await this.eventModel.create({
      order_id: cancelled._id,
      public_order_id: cancelled.public_order_id,
      status: 'canceled',
      label: 'Bạn đã hủy đơn hàng',
      reason: reason?.trim() ? reason.trim() : null,
      occurred_at: new Date(),
      source: 'customer',
      idempotency_key: null,
    });

    if (cancelled.public_order_id !== null) {
      this.webhookPublisher.notifyOrderChanged(cancelled.public_order_id, toOpenApiStatus(cancelled));
    }
    return this.toResponse(cancelled);
  }

  private toResponse(order: StorefrontOrderDocument, activeReturn: { id: string; status: string; statusLabel: string } | null = null) {
    return {
      activeReturn,
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      paymentStatus: order.payment_status,
      fulfillmentStatus: order.fulfillment_status,
      totalAmount: order.total_amount,
      subtotal: order.subtotal,
      discountAmount: order.discount_amount,
      shippingFee: order.shipping_fee,
      currency: order.currency,
      createdAt: order.created_at ?? new Date(0),
      publicOrderId: order.public_order_id,
      // 22/10/2026 — ai hủy (khách / người bán), lý do, tiền giảm trừ do giao thiếu, tiền đã hoàn
      cancelSource: order.cancel_source ?? null,
      cancelReason: order.cancel_reason ?? null,
      // `as` — đơn cũ chưa có field (schema có default nhưng document cũ thì không)
      shortRefundAmount: (order.short_refund_amount as number | undefined) ?? 0,
      refundedAmount: (order.refunded_amount as number | undefined) ?? 0,
      // 23/10/2026 — chặng chi tiết + nhãn trạng thái DUY NHẤT cho cả danh sách lẫn chi tiết đơn.
      trackingStage: (order.tracking_stage as string | null | undefined) ?? null,
      displayStatus: orderDisplayStatus(this.progressInput(order)),
    };
  }

  private progressInput(order: StorefrontOrderDocument): Omit<ProgressInput, 'events'> {
    return {
      status: order.status,
      cancelSource: order.cancel_source ?? null,
      cancelReason: order.cancel_reason ?? null,
      fulfillmentStatus: order.fulfillment_status,
      trackingStage: order.tracking_stage,
      placedAt: order.placed_at ?? order.created_at ?? null,
    };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
