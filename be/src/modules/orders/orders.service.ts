import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from './schemas/order.schema';
import { OrderStatus, UNFULFILLED_ORDER_STATUSES } from './enums/order-status.enum';
import { notPackableStatuses, orderSyncPolicy } from './order-sync-policy';
import { computeConsolidationKeyFor } from './utils/consolidation-key.util';
import { mapLazadaOrder } from './mappers/lazada-order.mapper';
import { MarketplaceIntegrationService } from '../marketplace-integration';
import {
  MARKETPLACE_ADAPTERS,
  MarketplaceAdapter,
} from '../marketplace-integration/interfaces/marketplace-adapter.interface';
import {
  extractAdministrativeAreas,
  isMaskedValue,
} from './utils/vn-administrative-area.util';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { AppException } from '../../common/exceptions/app-exception';
import { ORD_ERROR_CODES } from './orders.errors';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrderGroupsService } from '../order-groups/order-groups.service';

// Lần sync ĐẦU TIÊN của 1 shop (last_polled_at = null) — kéo lịch sử tối đa N
// ngày trước. 🔄 15/10/2026: N do Admin cấu hình (order_sync_settings, mặc định 30).
const DAY_MS = 24 * 60 * 60 * 1000;
// 15/10/2026 — GetOrders trả tối đa 100 đơn/lần; lặp offset theo trang (trước đây
// chỉ gọi 1 lần → shop có > 100 đơn thay đổi giữa 2 lượt bị sót đơn, vì
// last_polled_at vẫn tiến lên). Chặn trên 50 trang/lượt; phần còn lại lượt sau lấy tiếp.
const SYNC_PAGE_SIZE = 100;
const SYNC_MAX_PAGES = 50;

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

/** 08/10/2026 (C1) — kết quả bổ sung Tỉnh/Quận/Phường cho đơn cũ. */
export interface RecipientAreaBackfillSample {
  platformOrderId: string;
  statuses: string;
  address1Tail: string | null; // 2 đoạn cuối của address1, chữ số đã thay bằng #
  address3: string | null;
  address4: string | null;
  address5: string | null;
  city: string | null;
  provinceName: string | null;
  districtName: string | null;
  wardName: string | null;
}

export interface RecipientAreaBackfillResult {
  fetched: number; // số đơn Lazada trả về trong khoảng thời gian
  matched: number; // số đơn có trong DB được ghi (0 khi dryRun)
  missingWard: number; // đơn không tách được phường — sẽ phải chọn tay ở bước GHN
  missingProvince: number; // đơn không tách được tỉnh
  maskedAddress: number; // đơn có address3/4/5 bị sàn che (dấu *)
  canceledOrders: number; // đơn mà mọi item đều đã huỷ
  samples: RecipientAreaBackfillSample[]; // tối đa 5 đơn chưa huỷ + 2 đơn huỷ, KHÔNG chứa tên/SĐT/số nhà
}

const BACKFILL_PAGE_SIZE = 100; // Lazada GetOrders tối đa 100/lần

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
    // 🔄 ĐÃ ĐỔI (29/09/2026, AURELLE_MARKETPLACE_DESIGN.md Mục 9.3 #5) —
    // trước đây inject thẳng LazadaAdapter (class cụ thể). Giờ tra qua
    // registry theo `platform` — thêm sàn mới (đã tương thích Lazada,
    // implement getOrders/getOrderItems trên MarketplaceAdapter) KHÔNG
    // cần sửa gì trong service này nữa.
    @Inject(MARKETPLACE_ADAPTERS)
    private readonly adapters: Partial<Record<MarketplacePlatform, MarketplaceAdapter>>,
    private readonly notificationsService: NotificationsService,
    // BỔ SUNG (21/09/2026, báo cáo thật từ FE) — tạo group NGAY sau sync,
    // xem tryConsolidate() call site bên dưới. Không circular: đã kiểm
    // tra trước — OrderGroupsModule chủ động KHÔNG import OrdersModule
    // (comment sẵn trong order-groups.module.ts dự đoán đúng việc này).
    private readonly orderGroupsService: OrderGroupsService,
  ) {}

  /**
   * ===================================================================
   * ĐỒNG BỘ ĐƠN — TƯƠNG ỨNG "Mainflow 1" (bản polling). Dùng CHUNG cho
   * mọi sàn tương thích Lazada (Lazada thật + AURELLE — xem
   * AURELLE_MARKETPLACE_DESIGN.md Mục 9.3 #5).
   * ===================================================================
   * 🔄 ĐÃ ĐỔI (29/09/2026): trước đây tên `syncLazadaOrders(shopId)`,
   * gắn cứng Lazada. Giờ nhận thêm `platform` — tra adapter qua registry
   * (MARKETPLACE_ADAPTERS), sàn nào CHƯA implement getOrders/getOrderItems
   * (VD TikTok/Tiki hiện tại) sẽ nhận lỗi rõ ràng ORD_UNSUPPORTED_PLATFORM
   * thay vì lỗi runtime khó hiểu.
   *
   * Gọi tay qua orders.controller.ts (demo) — hoặc từ @Cron() (xem
   * lazada-order-sync.scheduler.ts, quét mọi platform tương thích), KHÔNG
   * cần sửa gì bên trong hàm này khi thêm sàn mới.
   */
  async syncShopOrders(
    platform: MarketplacePlatform,
    shopId: string,
  ): Promise<SyncResult> {
    const adapter = this.adapters[platform];
    // Gọi qua `adapter.getOrders(...)`/`adapter.getOrderItems(...)` TRỰC
    // TIẾP ở dưới (không tách riêng thành biến cục bộ) — tách method khỏi
    // object gốc bị ESLint `unbound-method` cảnh báo (rủi ro mất đúng
    // `this` khi tách rời). `adapter` là `const` nên TypeScript vẫn thu
    // hẹp kiểu đúng cho các field optional sau guard bên dưới.
    if (!adapter?.getOrders || !adapter.getOrderItems) {
      throw new AppException(
        ORD_ERROR_CODES.UNSUPPORTED_PLATFORM,
        `Sàn "${platform}" chưa hỗ trợ đồng bộ đơn hàng (adapter chưa implement getOrders/getOrderItems).`,
        HttpStatus.NOT_IMPLEMENTED,
        { platform },
      );
    }

    const shopDoc = await this.marketplaceIntegrationService.getConnectedShop(
      shopId,
      platform,
    );
    const accessToken =
      await this.marketplaceIntegrationService.getValidAccessToken(
        shopId,
        platform,
      );

    const policy = orderSyncPolicy();
    const updatedAfter =
      shopDoc.last_polled_at ?? new Date(Date.now() - policy.sync.firstSyncLookbackDays * DAY_MS);
    let syncStartedAt = new Date();

    const rawOrders: Awaited<ReturnType<typeof adapter.getOrders>> = [];
    try {
      for (let page = 0; page < SYNC_MAX_PAGES; page += 1) {
        const batch = await adapter.getOrders(accessToken, { updatedAfter, offset: page * SYNC_PAGE_SIZE, limit: SYNC_PAGE_SIZE });
        rawOrders.push(...batch);
        if (batch.length < SYNC_PAGE_SIZE) break;
        if (page === SYNC_MAX_PAGES - 1) {
          // Còn đơn chưa lấy hết: KHÔNG tiến last_polled_at quá mốc cũ để lượt sau lấy tiếp.
          syncStartedAt = updatedAfter;
          this.logger.warn(`Sync ${platform} shop ${shopId}: quá ${String(SYNC_MAX_PAGES * SYNC_PAGE_SIZE)} đơn trong 1 lượt — lượt sau lấy tiếp.`);
        }
      }
    } catch (error) {
      this.logger.error(
        `Sync đơn ${platform} thất bại cho shop ${shopId} (bước GetOrders)`,
        error,
      );
      throw new AppException(
        ORD_ERROR_CODES.SYNC_FAILED,
        `Không lấy được danh sách đơn từ ${platform} cho shop ${shopId} — vui lòng thử lại.`,
        HttpStatus.BAD_GATEWAY,
        { shopId, platform },
      );
    }

    let upserted = 0;
    let newlyConsolidated = 0;

    // Tuần tự (KHÔNG Promise.all) — mỗi đơn cần thêm 1 lần gọi
    // GetOrderItems riêng, chạy tuần tự để không dồn dập request lên
    // sàn trong 1 khoảnh khắc (API Call Limit của Lazada là 10.000/ngày —
    // đủ dư cho quy mô hiện tại, nhưng tuần tự vẫn là lựa chọn AN TOÀN
    // mặc định khi chưa đo tải thật; chuyển sang xử lý theo lô nhỏ [vd
    // Promise.all từng nhóm 5] chỉ khi đã xác nhận cần tăng thông lượng).
    for (const rawOrder of rawOrders) {
      try {
        const rawItems = await adapter.getOrderItems(accessToken, rawOrder.order_id);
        const mapped = mapLazadaOrder(rawOrder, rawItems, platform);
        // 15/10/2026 — khoá gom theo trường Admin chọn (mặc định trùng công thức cũ).
        mapped.consolidation_key = computeConsolidationKeyFor(platform, mapped.recipient, policy.consolidation.keyFields);

        // Đọc trạng thái need_cancel_confirm TRƯỚC KHI update — để chỉ
        // bắn Notification đúng 1 LẦN lúc chuyển từ false -> true, không
        // spam lại mỗi 10 phút trong lúc đơn vẫn đang chờ seller phản hồi
        // (cron chạy liên tục, nếu không check sẽ tạo Notification mới
        // mỗi lần sync trong khi bản chất là CÙNG 1 sự kiện chưa xử lý).
        const previous = await this.orderModel
          .findOne({
            platform,
            shop_id: shopId,
            platform_order_id: mapped.platform_order_id,
          })
          .select('need_cancel_confirm raw_statuses')
          .lean();
        // 22/10/2026 — người bán đã hủy trong OptiPack (sellerCancelOrder) mà website chưa kịp
        // nhận ghi ngược → lượt sync không được "hồi sinh" đơn về pending.
        if (previous?.raw_statuses.includes('seller_canceled')) {
          mapped.status = OrderStatus.CANCELED;
          mapped.raw_statuses = [...new Set([...mapped.raw_statuses, 'seller_canceled'])];
          mapped.items = mapped.items.map((item) => ({ ...item, status: OrderStatus.CANCELED }));
        }

        const orderDoc = await this.orderModel.findOneAndUpdate(
          {
            platform,
            shop_id: shopId,
            platform_order_id: mapped.platform_order_id,
          },
          {
            $set: {
              ...mapped,
              platform,
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

        // Mục 7.6 AURELLE_MARKETPLACE_DESIGN.md — báo sàn đã lưu đơn
        // thành công, sàn chuyển occupied_quantity sang cho OptiPack.
        // Lazada không implement acknowledgeOrder (seller tự giao hàng,
        // không ghi ngược Lazada — quyết định đã chốt) → `?.()` no-op.
        // Best-effort — lỗi ghi ngược KHÔNG được làm hỏng cả lượt sync.
        try {
          await adapter.acknowledgeOrder?.(
            accessToken,
            mapped.platform_order_id,
            orderDoc._id.toString(),
          );
        } catch (ackError) {
          this.logger.warn(
            `Acknowledge đơn ${mapped.platform_order_id} (${platform}) thất bại — không chặn sync.`,
            ackError,
          );
        }

        // Chỉ bắn khi CHUYỂN từ chưa cần xác nhận -> cần xác nhận (xem
        // giải thích đọc `previous` ở trên) — báo cả Store Owner lẫn
        // Admin, mức `critical` vì có hạn chót cứng (cancel_trigger_time),
        // bỏ lỡ sẽ bị Lazada TỰ ĐỘNG hủy đơn, hậu quả không đảo ngược được.
        if (mapped.need_cancel_confirm && !previous?.need_cancel_confirm) {
          const deadlineText = mapped.cancel_trigger_time
            ? mapped.cancel_trigger_time.toLocaleString('vi-VN')
            : 'không xác định';
          const title = `Đơn hàng #${mapped.platform_order_number ?? mapped.platform_order_id} cần xác nhận hủy`;
          // Chỉ Lazada thật ghi nhận field này (AURELLE giữ field để đúng
          // hình dạng API — Mục 5.2 AURELLE_MARKETPLACE_DESIGN.md — nhưng
          // không có luồng hủy nào bật need_cancel_confirm=true) — nhắc
          // đúng nơi seller cần vào theo từng sàn.
          const sellerCenterHint =
            platform === MarketplacePlatform.LAZADA
              ? 'trên Lazada Seller Center'
              : `trên ${platform}`;
          const message = `Khách hàng yêu cầu hủy đơn #${mapped.platform_order_number ?? mapped.platform_order_id}. Vui lòng phản hồi ${sellerCenterHint} trước ${deadlineText} — nếu không, đơn sẽ TỰ ĐỘNG bị hủy.`;

          await this.notificationsService.notify({
            recipientRole: UserRole.STORE_OWNER,
            type: NotificationType.CANCEL_CONFIRMATION_REQUIRED,
            severity: 'critical',
            title,
            message,
            relatedEntityType: 'order',
            relatedEntityId: String(orderDoc._id),
          });
          await this.notificationsService.notify({
            recipientRole: UserRole.ADMIN,
            type: NotificationType.CANCEL_CONFIRMATION_REQUIRED,
            severity: 'critical',
            title,
            message,
            relatedEntityType: 'order',
            relatedEntityId: String(orderDoc._id),
          });
        }

        const wasConsolidated = await this.tryConsolidate(orderDoc);
        if (wasConsolidated) {
          newlyConsolidated += 1;
        }

        // BỔ SUNG (21/09/2026, báo cáo thật từ FE) — tạo OrderGroup THẬT
        // NGAY trong vòng sync, không đợi cron backfill (tối đa 15 phút
        // sau) — Warehouse/Packaging "không thấy đơn" ngay sau khi sync
        // xong, phải đợi tới lần backfill kế tiếp mới có group để làm
        // việc. Reload document TRƯỚC KHI gọi — tryConsolidate() ở trên
        // dùng updateOne() (không phải orderDoc.save()), nên biến
        // `orderDoc` trong bộ nhớ CHƯA có consolidated_group_id mới nhất.
        try {
          const freshOrder = await this.orderModel.findById(orderDoc._id);
          if (freshOrder) {
            const group =
              await this.orderGroupsService.getOrCreateGroupForOrder(freshOrder);
            // BỔ SUNG (29/09/2026, N1) — nếu đơn vừa sync rơi vào 1 trạng
            // thái không còn fulfill được (khách hủy qua webhook, sự cố
            // logistics...), kiểm tra xem CẢ NHÓM có còn đơn nào fulfill
            // được không — hết thì tự động hủy nhóm + nhả giữ chỗ đóng gói
            // (xem order-groups.service.ts). BEST-EFFORT, dùng chung cho cả
            // cron lẫn webhook vì cả 2 đều gọi qua syncShopOrders() này.
            if (notPackableStatuses().includes(freshOrder.status)) {
              await this.orderGroupsService
                .handleOrderBecameUnfulfillable(group._id.toString())
                .catch((cancelError: unknown) => {
                  this.logger.error(
                    `Kiểm tra tự động hủy nhóm ${group._id.toString()} thất bại — không chặn lượt sync.`,
                    cancelError,
                  );
                });
            }
          }
        } catch (groupError) {
          // KHÔNG fail cả lượt sync chỉ vì 1 đơn tạo group lỗi — cron
          // backfill (order-group-backfill.scheduler.ts) là lưới an
          // toàn, sẽ tự thử lại cho đơn này ở lượt kế tiếp.
          this.logger.warn(
            `Tạo OrderGroup ngay sau sync thất bại cho đơn ${orderDoc.platform_order_id} — cron backfill sẽ thử lại.`,
            groupError,
          );
        }
      } catch (error) {
        // 1 đơn lỗi (vd field lạ chưa map được) KHÔNG được làm hỏng cả
        // batch — log lại order_id cụ thể, tiếp tục xử lý đơn tiếp theo.
        this.logger.error(
          `Xử lý đơn ${platform} order_id=${String(rawOrder.order_id)} thất bại, bỏ qua đơn này, tiếp tục các đơn còn lại.`,
          error,
        );
      }
    }

    await this.marketplaceIntegrationService.markShopPolled(
      shopDoc._id,
      syncStartedAt,
    );

    this.logger.log(
      `Sync ${platform} shop ${shopId}: lấy ${String(rawOrders.length)} đơn, upsert ${String(upserted)}, gộp mới ${String(newlyConsolidated)}.`,
    );

    return { fetched: rawOrders.length, upserted, newlyConsolidated };
  }

  /**
   * 🔄 GIỮ TƯƠNG THÍCH NGƯỢC (29/09/2026) — `POST /orders/lazada/sync`
   * (orders.controller.ts) và FE đã tích hợp theo đúng tên method/route
   * này (xem INTEGRATION_GUIDE_ORDERS.md) — KHÔNG đổi route, chỉ ủy
   * quyền sang `syncShopOrders()` đã tổng quát hóa.
   */
  async syncLazadaOrders(shopId: string): Promise<SyncResult> {
    return this.syncShopOrders(MarketplacePlatform.LAZADA, shopId);
  }

  /**
   * ===================================================================
   * MỚI (29/09/2026) — sync 1 shop khi có TÍN HIỆU (webhook) thay vì chờ
   * cron. Theo AURELLE_MARKETPLACE_DESIGN.md Mục 8.1: "Payload chỉ có mã
   * đơn; OptiPack gọi /orders/get + /order/items/get để lấy chi tiết —
   * MỘT LUỒNG XỬ LÝ CHUNG với kéo định kỳ".
   * ===================================================================
   * KHÔNG có API "lấy 1 đơn theo order_id" ở tầng nghiệp vụ (Mục 7.3 chỉ
   * lọc theo cửa sổ thời gian) — nên "sync 1 đơn" ở đây nghĩa là chạy lại
   * `syncShopOrders()` NGAY (thay vì đợi cron), tận dụng đúng
   * `last_polled_at` để chỉ kéo đúng phần thay đổi gần nhất (luôn bao
   * gồm đơn vừa đổi trạng thái vì webhook luôn bắn SAU khi sàn đã cập
   * nhật `updated_at`). `orderId` chỉ dùng để LOG — không lọc được ở
   * tầng gọi API, nhưng vẫn hữu ích khi tra soát log webhook.
   */
  async syncSingleOrder(
    platform: MarketplacePlatform,
    shopId: string,
    orderId: string,
  ): Promise<SyncResult> {
    this.logger.log(
      `Webhook báo đơn ${orderId} (${platform}, shop ${shopId}) đổi trạng thái — chạy sync ngay.`,
    );
    return this.syncShopOrders(platform, shopId);
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
    // 🔄 15/10/2026 — tiêu chí gom do Admin cấu hình (order_sync_settings).
    const { consolidation, statuses } = orderSyncPolicy();
    if (!consolidation.enabled) return false; // tắt gom: mỗi đơn một nhóm
    if (!statuses.consolidatable.includes(order.status)) {
      return false; // đơn đã fulfill xong (shipped/delivered/...) không xét gộp
    }

    // Đơn đã thuộc 1 nhóm rồi (re-sync) thì KHÔNG chuyển nhóm — tránh kéo
    // 1 đơn đang được xử lý sang nhóm khác chỉ vì lượt sync sau.
    if (order.consolidated_group_id) {
      return false;
    }

    // Cùng platform + shop: nhóm mang platform/shop_id của MỘT shop, gộp
    // đơn khác shop vào sẽ trừ tồn/tra hồ sơ SKU sai phạm vi.
    const candidates = await this.orderModel
      .find({
        consolidation_key: order.consolidation_key,
        platform: order.platform,
        shop_id: order.shop_id,
        // Giữ nguyên điều kiện của partial index (đủ 6 trạng thái) để Mongo dùng index;
        // điều kiện thứ 2 lọc theo tập con Admin chọn.
        status: { $in: UNFULFILLED_ORDER_STATUSES },
        $and: [
          { status: { $in: statuses.consolidatable } },
          ...(consolidation.timeWindowHours !== null && order.created_at
            ? [{ created_at: { $gte: new Date(order.created_at.getTime() - consolidation.timeWindowHours * 3_600_000) } }]
            : []),
        ],
        _id: { $ne: order._id },
        is_active: true,
      })
      .sort({ created_at: 1 })
      .limit(20);

    // Chỉ nhập vào nhóm còn "mở" (chưa qua bước lấy hàng xong) — nhóm đã
    // picked/duyệt/đóng gói có danh sách đơn cố định, đơn đến muộn tự lập
    // nhóm mới thay vì chen vào phương án đã tính.
    let sibling: OrderDocument | null = null;
    for (const candidate of candidates) {
      if (
        !candidate.consolidated_group_id ||
        (await this.orderGroupsService.isGroupOpenForNewOrders(
          candidate.consolidated_group_id.toString(),
        ))
      ) {
        sibling = candidate;
        break;
      }
    }

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
   * 08/10/2026 (C1 — GHN) — bổ sung province/district/ward cho đơn đã đồng bộ
   * TRƯỚC khi có 3 field này. Đọc lại địa chỉ từ Lazada GetOrders (không gọi
   * GetOrderItems — chỉ cần address_shipping), phân trang 100 đơn/lần, ghi bằng
   * bulkWrite mỗi trang (Rule DB #14). KHÔNG upsert (không tạo đơn mới), KHÔNG
   * đụng field khác của đơn. Chạy lại bao nhiêu lần cũng ra cùng kết quả.
   * dryRun = chỉ đọc + trả mẫu để đối chiếu cách tách địa chỉ với dữ liệu thật.
   */
  async backfillRecipientAreas(
    shopId: string,
    options: { lookbackDays: number; dryRun: boolean },
  ): Promise<RecipientAreaBackfillResult> {
    const adapter = this.adapters[MarketplacePlatform.LAZADA];
    if (!adapter?.getOrders) {
      throw new AppException(
        ORD_ERROR_CODES.UNSUPPORTED_PLATFORM,
        'Lazada chưa hỗ trợ đọc đơn hàng để bổ sung địa chỉ.',
        HttpStatus.NOT_IMPLEMENTED,
        { platform: MarketplacePlatform.LAZADA },
      );
    }
    const accessToken =
      await this.marketplaceIntegrationService.getValidAccessToken(
        shopId,
        MarketplacePlatform.LAZADA,
      );
    const updatedAfter = new Date(
      Date.now() - options.lookbackDays * 24 * 60 * 60 * 1000,
    );
    const result: RecipientAreaBackfillResult = {
      fetched: 0,
      matched: 0,
      missingWard: 0,
      missingProvince: 0,
      maskedAddress: 0,
      canceledOrders: 0,
      samples: [],
    };

    let activeSampleCount = 0;
    let canceledSampleCount = 0;

    for (let offset = 0; ; offset += BACKFILL_PAGE_SIZE) {
      const page = await adapter.getOrders(accessToken, {
        updatedAfter,
        offset,
        limit: BACKFILL_PAGE_SIZE,
      });
      result.fetched += page.length;

      const operations = page.map((raw) => {
        const address = raw.address_shipping;
        // Cùng thứ tự phần tử với mapLazadaOrder (address3/4/5 + city).
        const areas = extractAdministrativeAreas([
          address.address3,
          address.address4,
          address.address5,
          address.city,
        ]);
        if (areas.ward_name === null) result.missingWard += 1;
        if (areas.province_name === null) result.missingProvince += 1;
        if (
          [address.address3, address.address4, address.address5].some(
            (part) => part !== undefined && isMaskedValue(part),
          )
        ) {
          result.maskedAddress += 1;
        }
        // Mẫu: tối đa 5 đơn chưa huỷ + 2 đơn huỷ. Đơn huỷ bị Lazada che gần hết
        // địa chỉ nên không đại diện cho đơn sẽ thực sự đi giao.
        const isCanceledOnly = raw.statuses.every((st) => st === 'canceled');
        if (isCanceledOnly) result.canceledOrders += 1;
        const canTakeSample = isCanceledOnly
          ? canceledSampleCount < 2
          : activeSampleCount < 5;
        if (canTakeSample) {
          if (isCanceledOnly) canceledSampleCount += 1;
          else activeSampleCount += 1;
          result.samples.push({
            platformOrderId: String(raw.order_id),
            statuses: raw.statuses.join(','),
            address1Tail: address.address1
              ? address.address1
                  .split(',')
                  .slice(-2)
                  .join(',')
                  .replace(/[0-9]/g, '#')
                  .trim()
              : null,
            address3: address.address3 ?? null,
            address4: address.address4 ?? null,
            address5: address.address5 ?? null,
            city: address.city || null,
            provinceName: areas.province_name,
            districtName: areas.district_name,
            wardName: areas.ward_name,
          });
        }
        return {
          updateOne: {
            filter: {
              platform: MarketplacePlatform.LAZADA,
              shop_id: shopId,
              platform_order_id: String(raw.order_id),
            },
            update: {
              $set: {
                'recipient.province_name': areas.province_name,
                'recipient.district_name': areas.district_name,
                'recipient.ward_name': areas.ward_name,
              },
            },
          },
        };
      });

      if (!options.dryRun && operations.length > 0) {
        const write = await this.orderModel.bulkWrite(operations, {
          ordered: false,
        });
        result.matched += write.matchedCount;
      }
      if (page.length < BACKFILL_PAGE_SIZE) break;
    }

    return result;
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
