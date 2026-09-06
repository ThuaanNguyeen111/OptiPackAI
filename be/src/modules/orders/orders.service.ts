import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from './schemas/order.schema';
import {
  OrderStatus,
  UNFULFILLED_ORDER_STATUSES,
} from './enums/order-status.enum';
import { mapLazadaOrder } from './mappers/lazada-order.mapper';
import {
  MarketplaceIntegrationService,
  LazadaAdapter,
} from '../marketplace-integration';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { AppException } from '../../common/exceptions/app-exception';
import { ORD_ERROR_CODES } from './orders.errors';

// Lần sync ĐẦU TIÊN của 1 shop (last_polled_at = null) — kéo lịch sử tối
// đa 30 ngày trước, KHÔNG kéo toàn bộ lịch sử vô hạn (tránh 1 lần gọi
// đầu tiên kéo hàng chục nghìn đơn cũ làm chậm/tốn quota API không cần
// thiết — 30 ngày đủ cho mục đích demo và vận hành thực tế bắt đầu).
const FIRST_SYNC_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

export interface SyncResult {
  fetched: number;
  upserted: number;
  newlyConsolidated: number;
}

export interface ListOrdersFilter {
  shopId?: string;
  status?: OrderStatus;
  consolidatedGroupId?: string; // xem giải thích ở listOrders() — bổ sung để FE xem được "các đơn trong 1 gói hàng"
  before?: Date; // cursor phân trang — xem giải thích ở listOrders()
  limit: number;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
    private readonly lazadaAdapter: LazadaAdapter,
  ) {}

  /**
   * ===================================================================
   * ĐỒNG BỘ ĐƠN TỪ LAZADA — TƯƠNG ỨNG "Mainflow 1" (bản polling, không
   * webhook — Lazada Open Platform hiện chưa xác nhận cơ chế webhook
   * chính thức, xem ghi chú trong lazada.adapter.ts#verifyWebhookSignature).
   * ===================================================================
   * Gọi tay qua orders.controller.ts (demo) — khi cần chạy TỰ ĐỘNG định
   * kỳ, bọc hàm này trong 1 @Cron() (module @nestjs/schedule) lặp qua
   * marketplaceIntegrationService.listConnectedShops(LAZADA), KHÔNG cần
   * sửa gì bên trong hàm này.
   */
  async syncLazadaOrders(shopId: string): Promise<SyncResult> {
    const shopDoc = await this.marketplaceIntegrationService.getConnectedShop(
      shopId,
      MarketplacePlatform.LAZADA,
    );
    const accessToken =
      await this.marketplaceIntegrationService.getValidAccessToken(
        shopId,
        MarketplacePlatform.LAZADA,
      );

    const updatedAfter =
      shopDoc.last_polled_at ?? new Date(Date.now() - FIRST_SYNC_LOOKBACK_MS);
    const syncStartedAt = new Date();

    let rawOrders;
    try {
      rawOrders = await this.lazadaAdapter.getOrders(accessToken, {
        updatedAfter,
      });
    } catch (error) {
      this.logger.error(
        `Sync đơn Lazada thất bại cho shop ${shopId} (bước GetOrders)`,
        error,
      );
      throw new AppException(
        ORD_ERROR_CODES.SYNC_FAILED,
        `Không lấy được danh sách đơn từ Lazada cho shop ${shopId} — vui lòng thử lại.`,
        HttpStatus.BAD_GATEWAY,
        { shopId },
      );
    }

    let upserted = 0;
    let newlyConsolidated = 0;

    // Tuần tự (KHÔNG Promise.all) — mỗi đơn cần thêm 1 lần gọi
    // GetOrderItems riêng, chạy tuần tự để không dồn dập request lên
    // Lazada trong 1 khoảnh khắc (API Call Limit của app đang là
    // 10.000/ngày — đủ dư cho quy mô hiện tại, nhưng tuần tự vẫn là
    // lựa chọn AN TOÀN mặc định khi chưa đo tải thật; chuyển sang xử
    // lý theo lô nhỏ [vd Promise.all từng nhóm 5] chỉ khi đã xác nhận
    // cần tăng thông lượng).
    for (const rawOrder of rawOrders) {
      try {
        const rawItems = await this.lazadaAdapter.getOrderItems(
          accessToken,
          rawOrder.order_id,
        );
        const mapped = mapLazadaOrder(rawOrder, rawItems);

        const orderDoc = await this.orderModel.findOneAndUpdate(
          {
            platform: MarketplacePlatform.LAZADA,
            shop_id: shopId,
            platform_order_id: mapped.platform_order_id,
          },
          {
            $set: {
              ...mapped,
              platform: MarketplacePlatform.LAZADA,
              shop_id: shopId,
              marketplace_shop: shopDoc._id,
            },
            $setOnInsert: {
              is_consolidated: false,
              consolidated_group_id: null,
              is_active: true,
            },
          },
          { upsert: true, new: true },
        );

        upserted += 1;

        const wasConsolidated = await this.tryConsolidate(orderDoc);
        if (wasConsolidated) {
          newlyConsolidated += 1;
        }
      } catch (error) {
        // 1 đơn lỗi (vd field lạ chưa map được) KHÔNG được làm hỏng cả
        // batch — log lại order_id cụ thể, tiếp tục xử lý đơn tiếp theo.
        this.logger.error(
          `Xử lý đơn Lazada order_id=${String(rawOrder.order_id)} thất bại, bỏ qua đơn này, tiếp tục các đơn còn lại.`,
          error,
        );
      }
    }

    await this.marketplaceIntegrationService.markShopPolled(
      shopDoc._id,
      syncStartedAt,
    );

    this.logger.log(
      `Sync Lazada shop ${shopId}: lấy ${String(rawOrders.length)} đơn, upsert ${String(upserted)}, gộp mới ${String(newlyConsolidated)}.`,
    );

    return { fetched: rawOrders.length, upserted, newlyConsolidated };
  }

  /**
   * ===================================================================
   * BƯỚC "Matching customer's information?" TRONG Mainflow 1
   * ===================================================================
   * Tra `consolidation_key` qua PARTIAL INDEX đã khai ở order.schema.ts
   * (chỉ index đơn UNFULFILLED) — O(log n), không quét toàn bảng.
   * Trả về `true` nếu đơn NÀY vừa được gộp vào 1 nhóm (mới tạo nhóm
   * hoặc nhập vào nhóm đã có sẵn).
   */
  private async tryConsolidate(order: OrderDocument): Promise<boolean> {
    if (!UNFULFILLED_ORDER_STATUSES.includes(order.status)) {
      return false; // đơn đã fulfill xong (shipped/delivered/...) không xét gộp
    }

    const sibling = await this.orderModel.findOne({
      consolidation_key: order.consolidation_key,
      status: { $in: UNFULFILLED_ORDER_STATUSES },
      _id: { $ne: order._id },
      is_active: true,
    });

    if (!sibling) {
      return false; // không có đơn nào khác cùng người nhận đang chờ xử lý — giữ standalone
    }

    // Nhóm đã tồn tại (sibling đã từng gộp với 1 đơn khác trước đó) →
    // dùng LẠI group_id đó, không tạo nhóm mới. Chưa có → tạo mới.
    const groupId = sibling.consolidated_group_id ?? new Types.ObjectId();

    await this.orderModel.updateOne(
      { _id: order._id },
      { $set: { is_consolidated: true, consolidated_group_id: groupId } },
    );

    if (!sibling.consolidated_group_id) {
      await this.orderModel.updateOne(
        { _id: sibling._id },
        { $set: { is_consolidated: true, consolidated_group_id: groupId } },
      );
    }

    this.logger.log(
      `Gộp đơn ${order.platform_order_id} vào nhóm ${groupId.toString()} (cùng consolidation_key với đơn ${sibling.platform_order_id}).`,
    );

    return true;
  }

  /**
   * ===================================================================
   * DANH SÁCH ĐƠN — PHÂN TRANG KIỂU CURSOR
   * ===================================================================
   * skip(N) buộc Mongo phải DUYỆT QUA N document rồi mới bỏ đi — chi
   * phí tăng TUYẾN TÍNH theo N, rất chậm ở các trang xa (vd skip(50000)).
   * Cursor dùng `created_at < before` (before = created_at của document
   * CUỐI CÙNG trang trước) — tận dụng ĐÚNG compound index (b) đã khai ở
   * order.schema.ts, chi phí KHÔNG đổi dù đang ở trang gần hay trang xa.
   */
  async listOrders(
    filter: ListOrdersFilter,
  ): Promise<{ orders: OrderDocument[]; nextCursor: string | null }> {
    const query: Record<string, unknown> = { is_active: true };

    if (filter.shopId) {
      query.shop_id = filter.shopId;
    }
    if (filter.status) {
      query.status = filter.status;
    }
    // Tận dụng ĐÚNG partial index (d) đã khai ở order.schema.ts
    // (`{ consolidated_group_id: 1 }`, chỉ index đơn is_consolidated=true)
    // — filter riêng field này ĐỒNG THỜI với is_consolidated=true để Mongo
    // chắc chắn dùng partial index thay vì collection scan. KHÔNG cần tự
    // validate định dạng ObjectId ở đây — ListOrdersQueryDto đã có
    // @IsMongoId() chặn ở tầng ValidationPipe trước khi vào tới service.
    if (filter.consolidatedGroupId) {
      query.consolidated_group_id = new Types.ObjectId(
        filter.consolidatedGroupId,
      );
      query.is_consolidated = true;
    }
    if (filter.before) {
      query.created_at = { $lt: filter.before };
    }

    // +1 để biết có "trang sau" hay không mà KHÔNG cần thêm 1 lần
    // count() riêng (count trên collection lớn cũng tốn chi phí).
    const orders = await this.orderModel
      .find(query)
      .sort({ created_at: -1 })
      .limit(filter.limit + 1);

    const hasMore = orders.length > filter.limit;
    const page = hasMore ? orders.slice(0, filter.limit) : orders;
    const lastOrder = page.at(-1);
    const nextCursor =
      hasMore && lastOrder?.created_at
        ? lastOrder.created_at.toISOString()
        : null;

    return { orders: page, nextCursor };
  }

  /**
   * ===================================================================
   * CHI TIẾT 1 ĐƠN — GET /orders/:id
   * ===================================================================
   * Tra theo `_id` — dùng ĐÚNG index unique mặc định Mongo tự tạo cho
   * MỌI collection (`_id`), KHÔNG cần khai thêm index nào ở order.schema.ts
   * — độ phức tạp tra cứu O(log n) bất kể collection lớn cỡ nào, đây đã
   * là tối ưu nhất có thể cho truy vấn "lấy đúng 1 document theo khóa
   * chính", không có kỹ thuật nào nhanh hơn thao tác này.
   *
   * 2 lớp validate TÁCH BIỆT có chủ đích (không gộp thành 1 lỗi chung):
   *   (a) `id` sai ĐỊNH DẠNG ObjectId (vd FE gõ tay id lạ) → 400, lỗi
   *       CHẮC CHẮN do request sai, KHÔNG cần chạm Mongo để biết.
   *   (b) `id` đúng định dạng nhưng KHÔNG tồn tại/đã bị vô hiệu hóa
   *       (is_active=false) → 404, đây mới thực sự là "not found".
   * Tách 2 lỗi này giúp FE debug nhanh hơn (400 = do FE tự gõ/gửi sai,
   * 404 = dữ liệu thực sự không có) thay vì gộp chung 1 mã lỗi mơ hồ.
   */
  async findOrderDetail(id: string): Promise<OrderDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(
        ORD_ERROR_CODES.INVALID_ORDER_ID,
        `"${id}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { id },
      );
    }

    const order = await this.orderModel.findOne({ _id: id, is_active: true });

    if (!order) {
      throw new AppException(
        ORD_ERROR_CODES.ORDER_NOT_FOUND,
        `Không tìm thấy đơn hàng với id "${id}".`,
        HttpStatus.NOT_FOUND,
        { id },
      );
    }

    return order;
  }
}
