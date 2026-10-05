import { StockReservationService } from './stock-reservation.service';
import { stockKeyOf } from '../master-skus/stock-key.util';
import {
  MarketplaceSkuMapping,
  MarketplaceSkuMappingDocument,
} from '../master-skus/schemas/marketplace-sku-mapping.schema';
import {
  resolveMasterSkus,
  stockFilterFor,
} from '../master-skus/stock-key.util';
import {
  InventoryMovement,
  InventoryMovementDocument,
} from '../warehouse/schemas/inventory-movement.schema';
import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { OrderGroup, OrderGroupDocument } from './schemas/order-group.schema';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { isValidStatusTransition } from './enums/allowed-status-transitions';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
// Đọc TRỰC TIẾP schema Order đã có sẵn (KHÔNG sửa file gốc) — Mongoose/
// Nest cho phép nhiều module cùng đăng ký MongooseModule.forFeature() cho
// CÙNG 1 schema/collection, đây là pattern chuẩn khi 1 module khác cần
// đọc dữ liệu của module kia mà không muốn import chéo Service (tránh
// circular dependency giữa orders/ và order-groups/).
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import {
  NOT_PACKABLE_ORDER_STATUSES,
  OrderStatus,
} from '../orders/enums/order-status.enum';
import {
  aggregateOrderItems,
  RawOrderItemForAggregation,
} from '../orders/utils/aggregate-order-items.util';
import { computeRecipientKey } from '../orders/utils/consolidation-key.util';
import {
  ProductMaster,
  ProductMasterDocument,
} from '../product-master/schemas/product-master.schema';
import { AppException } from '../../common/exceptions/app-exception';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';
import {
  PackableItem,
  PickableItem,
  OrderGroupForPackaging,
  OrderGroupForPicking,
} from '../../common/interfaces/packaging.interface';
// Đọc TRỰC TIẾP schema SkuBinAssignment (module warehouse/) — cùng
// pattern cross-module đã áp dụng cho Order/ProductMaster ở trên.
import {
  SkuBinAssignment,
  SkuBinAssignmentDocument,
} from '../warehouse/schemas/sku-bin-assignment.schema';
import { PickEvent, PickEventDocument } from './schemas/pick-event.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { User, UserDocument } from '../users/schemas/user.schema';
import { addBusinessHours } from './utils/add-business-hours.util';
import { StaffAssignmentService } from './staff-assignment.service';
// Đọc TRỰC TIẾP schema PackingPlan (module packing/) — cùng pattern cross-module
// đã dùng cho Order/ProductMaster/SkuBinAssignment ở trên, tránh vòng lặp import
// PackingModule <-> OrderGroupsModule. Chỉ dùng để vô hiệu kế hoạch khi đơn bị hủy.
import { PackingPlan, PackingPlanDocument } from '../packing/schemas/packing-plan.schema';

/**
 * ===================================================================
 * order-groups.service.ts — MODULE MỚI, KHÔNG sửa orders.service.ts
 * ===================================================================
 * Đọc dữ liệu từ collection `orders` đã có (READ-ONLY, không ghi đè
 * field nào của luồng sync Lazada đang chạy) — CHỈ ghi vào field
 * `consolidated_group_id` cho những đơn đang là `null` (đơn lẻ chưa
 * từng có sibling để gộp), vì field này BẢN THÂN NÓ đã được thiết kế
 * sẵn với đúng mục đích này (xem comment gốc trong order.schema.ts:
 * "khi Package 4 cần thuộc tính riêng cho gói hàng, đó là lúc tách
 * collection riêng"). Đây là ghi DỮ LIỆU vào 1 field vốn luôn null và
 * không được bất kỳ logic HIỆN CÓ nào đọc/dùng tới — KHÔNG phải sửa
 * behavior của syncLazadaOrders()/tryConsolidate() đang chạy.
 * ===================================================================
 */
/**
 * 01/10/2026 — số đơn trong 1 nhóm đơn theo trạng thái, trả kèm danh sách/chi tiết
 * nhóm đơn để FE phân biệt nhóm bình thường / hủy một phần / hủy hết.
 * - activeOrderCount: đơn còn phải xử lý — dùng ĐÚNG quy tắc của Picking List và gợi ý
 *   đóng gói (status KHÔNG thuộc NOT_PACKABLE_ORDER_STATUSES).
 * - canceledOrderCount: đơn có status `canceled`.
 * Đơn sự cố vận chuyển (lost, damaged_by_3pl, failed...) không thuộc 2 nhóm trên:
 * orderCount − activeOrderCount − canceledOrderCount = số đơn sự cố.
 */
export interface GroupOrderCounts {
  activeOrderCount: number;
  canceledOrderCount: number;
}

@Injectable()
export class OrderGroupsService {
  private readonly logger = new Logger(OrderGroupsService.name);

  constructor(
    @InjectModel(OrderGroup.name)
    private readonly orderGroupModel: Model<OrderGroupDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(ProductMaster.name)
    private readonly productMasterModel: Model<ProductMasterDocument>,
    @InjectModel(SkuBinAssignment.name)
    private readonly skuBinAssignmentModel: Model<SkuBinAssignmentDocument>,
    @InjectModel(PickEvent.name)
    private readonly pickEventModel: Model<PickEventDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    // BỔ SUNG (29/09/2026, N1) — nhả giữ chỗ đóng gói khi 1 nhóm tự động
    // hủy (cancelIfAllOrdersUnfulfillable()). Xem comment ở order-groups.module.ts
    // giải thích lý do đăng ký trực tiếp schema thay vì import PackagingModule.
    @InjectModel(PackingPlan.name)
    private readonly packingPlanModel: Model<PackingPlanDocument>,
    private readonly notificationsService: NotificationsService,
    // BỔ SUNG (20/09/2026, đảo luồng theo yêu cầu Thuận) — cần gọi
    // autoAssign() NGAY LÚC TẠO GROUP (xem startPickingPhase() bên
    // dưới). Không có circular dependency: StaffAssignmentService chỉ
    // phụ thuộc trực tiếp 2 Mongoose model, KHÔNG phụ thuộc ngược lại
    // OrderGroupsService — đã kiểm tra trước khi thêm dòng này.
    private readonly staffAssignmentService: StaffAssignmentService,
    // BỔ SUNG (21/09/2026, BE-4a) — transaction cho trừ tồn + ghi pick_event.
    @InjectConnection() private readonly connection: Connection,
    // K3 (27/09/2026) — pick-item ghi sổ cái biến động kho
    @InjectModel(InventoryMovement.name)
    private readonly inventoryMovementModel: Model<InventoryMovementDocument>,
    // K4b — tra SKU sàn -> SKU nội bộ khi trừ tồn
    @InjectModel(MarketplaceSkuMapping.name)
    private readonly mappingModel: Model<MarketplaceSkuMappingDocument>,
    // K5 — giữ chỗ tồn kho chống bán lố
    private readonly stockReservationService: StockReservationService,
  ) {}

  /**
   * Đảm bảo 1 order có group thật sự tồn tại trong `order_groups` —
   * "group-of-1" cho đơn chưa từng gộp, hoặc trỏ đúng group đã có nếu
   * `tryConsolidate()` (orders.service.ts, không đụng) đã gán trước đó.
   * Idempotent — gọi nhiều lần cho cùng 1 order không tạo trùng group.
   */
  async getOrCreateGroupForOrder(
    order: OrderDocument,
  ): Promise<OrderGroupDocument> {
    const group = await this.resolveGroupForOrder(order);
    // 01/10/2026 — mỗi lần đồng bộ chạm tới nhóm (đơn mới, đơn đổi trạng thái như
    // canceled, đơn gộp đến muộn, đơn thay thế EXC-) -> tính lại bản lưu sẵn số đơn.
    await this.refreshOrderCounts(group._id);
    return group;
  }

  private async resolveGroupForOrder(
    order: OrderDocument,
  ): Promise<OrderGroupDocument> {
    if (order.consolidated_group_id) {
      const existing = await this.orderGroupModel.findById(
        order.consolidated_group_id,
      );
      if (existing) {
        // TỰ CHỮA order_count — quan trọng vì tryConsolidate()
        // (orders.service.ts, KHÔNG đụng) có thể gán THÊM 1 đơn vào
        // group này SAU KHI group đã được tạo (sibling đến muộn), mà
        // tryConsolidate() KHÔNG biết gì về collection order_groups để
        // tự cập nhật đếm lại. Đếm lại TRỰC TIẾP từ nguồn sự thật
        // (collection orders) mỗi lần group được chạm tới — rẻ (1 lần
        // count, không phải mỗi request) và luôn đúng, không cần đồng
        // bộ thủ công 2 chiều giữa 2 collection.
        const actualCount = await this.orderModel.countDocuments({
          consolidated_group_id: existing._id,
        });
        if (actualCount !== existing.order_count) {
          existing.order_count = actualCount;
          await existing.save();
          // K5 — có đơn gộp đến muộn -> nhu cầu hàng tăng -> giữ chỗ lại.
          await this.reconcileReservation(existing._id.toString());
        }
        return existing;
      }
      // consolidated_group_id có giá trị nhưng chưa có document group
      // tương ứng (trường hợp đơn được sync TRƯỚC KHI module này tồn
      // tại) — tạo group mới nhưng TÁI SỬ DỤNG đúng _id đã có sẵn trên
      // order, không sinh id mới, không cần ghi lại field trên Order.
      return this.startPickingPhase(
        await this.orderGroupModel.create({
          _id: order.consolidated_group_id,
          platform: order.platform,
          shop_id: order.shop_id,
          order_count: 1,
          // Order schema hiện KHÔNG có field shop_name (chỉ có shop_id
          // dạng string) — dùng tạm shop_id làm snapshot. Khi module
          // marketplace-integration bổ sung tên shop hiển thị được (việc
          // của tương lai, không thuộc phạm vi lượt này), cập nhật lại
          // dòng này để lấy tên thật thay vì id.
          shop_name_snapshot: order.shop_id,
          // BỔ SUNG (29/09/2026, Mục 9.5) — tính 1 LẦN lúc tạo, xem
          // consolidation-key.util.ts giải thích vì sao KHÔNG kèm platform.
          recipient_key: computeRecipientKey(
            order.recipient.full_name,
            order.recipient.phone,
            order.recipient.address_line1,
            order.recipient.city,
          ),
        }),
      );
    }

    // Đơn chưa từng có group (chưa gộp với ai) — tạo group-of-1 mới,
    // rồi ghi NGƯỢC id đó vào field consolidated_group_id vốn đang null.
    const newGroup = await this.orderGroupModel.create({
      platform: order.platform,
      shop_id: order.shop_id,
      order_count: 1,
      shop_name_snapshot: order.shop_id,
      recipient_key: computeRecipientKey(
        order.recipient.full_name,
        order.recipient.phone,
        order.recipient.address_line1,
        order.recipient.city,
      ),
    });
    await this.orderModel.updateOne(
      { _id: order._id },
      { $set: { consolidated_group_id: newGroup._id } },
    );
    return this.startPickingPhase(newGroup);
  }

  /**
   * MỚI (29/09/2026, Mục 9.5) — các nhóm đơn KHÁC (có thể khác sàn) cùng
   * `recipient_key` với `groupId`, "chưa giao xong" (chưa DELIVERED/RETURNED/
   * CANCELED). Dùng cho `GET :id/linked`, `linkedGroupCount`, và cảnh báo
   * "lệch nhịp" (linkedPending) khi ship 1 group còn sibling chưa packed.
   */
  async findLinkedGroups(groupId: string): Promise<OrderGroupDocument[]> {
    const group = await this.findOrderGroupById(groupId);
    if (!group.recipient_key) return [];

    return this.orderGroupModel
      .find({
        recipient_key: group.recipient_key,
        _id: { $ne: group._id },
        fulfillment_status: {
          $nin: [
            GroupFulfillmentStatus.DELIVERED,
            GroupFulfillmentStatus.RETURNED,
            GroupFulfillmentStatus.CANCELED,
          ],
        },
      })
      .lean();
  }

  /**
   * BỔ SUNG (20/09/2026, đảo luồng theo yêu cầu Thuận) — NGAY SAU KHI
   * group vừa được tạo (còn ở AWAITING_PACKAGING, giá trị default của
   * schema), gán NGAY 1 Warehouse Staft rảnh nhất + chuyển sang PICKING
   * — không còn chờ Packaging Staff Approve mới gán như thiết kế cũ.
   *
   * best-effort NGOÀI mọi transaction (giống tinh thần auto-assign cũ
   * ở packaging.service.ts trước khi dời sang đây) — nếu auto-assign
   * lỗi (VD chưa có Warehouse Staff nào active), group VẪN được tạo
   * thành công, chỉ log cảnh báo — Admin gán tay sau qua POST .../assign.
   * KHÔNG để lỗi auto-assign chặn đứng cả luồng đồng bộ đơn hàng.
   */
  private async startPickingPhase(
    group: OrderGroupDocument,
  ): Promise<OrderGroupDocument> {
    try {
      await this.staffAssignmentService.autoAssign(group._id.toString());
    } catch (error) {
      this.logger.warn(
        `Auto-assign Warehouse Staff thất bại ngay lúc tạo group ${group._id.toString()} — cần gán tay qua POST .../assign.`,
        error,
      );
    }

    // K5 — giữ chỗ tồn NGAY khi tạo nhóm đơn; thiếu thì gắn cờ từ đầu. Best-effort:
    // lỗi giữ chỗ KHÔNG được chặn luồng đồng bộ đơn hàng.
    await this.reconcileReservation(group._id.toString());

    try {
      return await this.transitionFulfillmentStatus(
        group._id.toString(),
        GroupFulfillmentStatus.PICKING,
        group.__v,
      );
    } catch (error) {
      // Cực hiếm khi xảy ra (group vừa tạo, __v chắc chắn đúng) — vẫn
      // phòng thủ, không để lỗi transition làm mất group vừa tạo, trả
      // lại đúng bản group hiện có (dù còn AWAITING_PACKAGING) thay vì
      // throw làm hỏng cả luồng sync đơn hàng đang gọi hàm này.
      this.logger.error(
        `Chuyển group ${group._id.toString()} sang PICKING thất bại ngay sau khi tạo — group vẫn ở AWAITING_PACKAGING, cần xử lý tay.`,
        error,
      );
      return group;
    }
  }

  /**
   * Hợp đồng INPUT cho thành viên làm AI Packaging (xem
   * common/interfaces/packaging.interface.ts). Áp dụng Rule #16
   * (CLAUDE.md, Database Design Standards) — 1 query `$in` DUY NHẤT
   * cho product_master, KHÔNG loop query riêng từng SKU (N+1).
   */
  async getPackableItemsForGroup(
    groupId: string,
  ): Promise<OrderGroupForPackaging> {
    const group = await this.loadGroupOrThrow(groupId);
    const skuQuantities = await this.getOrderedSkuQuantities(group);

    // 1 query $in duy nhất — Rule #16, tránh N+1
    const items = await this.mapSkuQuantitiesToPackableItems(
      group.platform,
      group.shop_id,
      groupId,
      skuQuantities,
    );

    return { order_group_id: groupId, items };
  }

  /**
   * BỔ SUNG (20/09/2026, đảo luồng theo yêu cầu Thuận) — gợi ý đóng
   * gói giờ PHẢI tính theo số lượng THẬT ĐÃ QUÉT (`pick_events`), KHÔNG
   * phải số lượng ĐẶT ban đầu (`getPackableItemsForGroup()` ở trên,
   * vẫn giữ nguyên — dùng cho Picking, KHÔNG đổi). Lý do nghiệp vụ
   * (đã thống nhất khi thiết kế): nếu Warehouse Staff báo thiếu hàng và
   * Packaging Staff/Admin duyệt tiếp với phần có sẵn (partial), gợi ý
   * đóng gói tính theo số lượng ĐẶT sẽ ra thùng TO HƠN THỰC TẾ CẦN —
   * sai logic, lãng phí vật liệu. SKU nào có 0 lần quét (report-missing
   * toàn bộ, không lấy được chút nào) → LOẠI HẲN khỏi gợi ý, không có
   * gì để đóng gói cho SKU đó.
   *
   * SỬA (21/09/2026, BE-4a): chỉ cộng pick_events của LƯỢT LẤY HIỆN TẠI
   * (`pick_round`) — trước đây cộng mọi lượt, lấy lại sau
   * decide-partial(false) bị đếm gấp đôi.
   */
  async getActuallyPickedItemsForGroup(
    groupId: string,
  ): Promise<OrderGroupForPackaging> {
    const group = await this.loadGroupOrThrow(groupId);
    const skuQuantities = await this.getPickedSkuQuantities(group);

    if (skuQuantities.size === 0) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.NO_PICK_EVENTS,
        `Group "${groupId}" chưa có lần quét lấy hàng nào trong lượt hiện tại — không thể tính gợi ý đóng gói.`,
        HttpStatus.CONFLICT,
        { groupId, pickRound: group.pick_round },
      );
    }

    const items = await this.mapSkuQuantitiesToPackableItems(
      group.platform,
      group.shop_id,
      groupId,
      skuQuantities,
    );

    return { order_group_id: groupId, items };
  }

  /**
   * MỚI (21/09/2026, BE-3a) — MỖI ĐƠN MỘT KIỆN: chia số lượng đã quét
   * (lượt hiện tại) về từng đơn nguồn còn đóng gói được, theo thứ tự đơn
   * tạo trước được ưu tiên, mỗi đơn không vượt số đặt của chính nó. Đơn
   * không nhận được món nào (thiếu hàng, đã duyệt partial) bị bỏ qua.
   * Vẫn đi qua mapSkuQuantitiesToPackableItems() → giữ kiểm tra hồ sơ
   * đóng gói `ready` của BE-1.
   */
  async allocatePickedItemsToOrders(groupId: string): Promise<
    {
      order_id: string;
      platform_order_id: string;
      items: PackableItem[];
    }[]
  > {
    const group = await this.loadGroupOrThrow(groupId);
    const remaining = await this.getPickedSkuQuantities(group);
    if (remaining.size === 0) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.NO_PICK_EVENTS,
        `Group "${groupId}" chưa có lần quét lấy hàng nào trong lượt hiện tại — không thể tính gợi ý đóng gói.`,
        HttpStatus.CONFLICT,
        { groupId, pickRound: group.pick_round },
      );
    }

    const orders = await this.orderModel
      .find({
        consolidated_group_id: group._id,
        status: { $nin: NOT_PACKABLE_ORDER_STATUSES },
      })
      .select('_id platform_order_id items created_at')
      .sort({ created_at: 1, _id: 1 })
      .lean();

    const allocations: { order_id: string; platform_order_id: string; items: PackableItem[] }[] = [];
    for (const order of orders) {
      const orderQuantities = new Map<string, number>();
      for (const item of aggregateOrderItems(
        order.items.filter((i) => i.status !== OrderStatus.CANCELED),
      )) {
        orderQuantities.set(item.sku, (orderQuantities.get(item.sku) ?? 0) + item.quantity);
      }

      const allocated = new Map<string, number>();
      for (const [sku, ordered] of orderQuantities) {
        const available = remaining.get(sku) ?? 0;
        const take = Math.min(ordered, available);
        if (take > 0) {
          allocated.set(sku, take);
          remaining.set(sku, available - take);
        }
      }
      if (allocated.size === 0) continue;

      allocations.push({
        order_id: order._id.toString(),
        platform_order_id: order.platform_order_id,
        items: await this.mapSkuQuantitiesToPackableItems(
          group.platform,
          group.shop_id,
          groupId,
          allocated,
        ),
      });
    }

    if (allocations.length === 0) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.ALL_ORDERS_CANCELED,
        `Không còn đơn nào trong group "${groupId}" nhận được hàng đã lấy — không có gì để đóng gói.`,
        HttpStatus.CONFLICT,
        { groupId },
      );
    }
    return allocations;
  }

  private async loadGroupOrThrow(groupId: string): Promise<OrderGroupDocument> {
    if (!Types.ObjectId.isValid(groupId)) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.INVALID_GROUP_ID,
        `"${groupId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { groupId },
      );
    }

    const group = await this.orderGroupModel.findById(groupId);
    if (!group) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.GROUP_NOT_FOUND,
        `Không tìm thấy order group với id "${groupId}".`,
        HttpStatus.NOT_FOUND,
        { groupId },
      );
    }
    return group;
  }

  /**
   * Số lượng ĐẶT theo SKU của các đơn còn đóng gói được trong group —
   * KHÔNG tra Product Master (lấy hàng không cần hồ sơ đóng gói).
   * Tách ra 21/09/2026 (BE-4a) để pickItem/confirmPicked dùng lại.
   */
  private async getOrderedSkuQuantities(
    group: OrderGroupDocument,
  ): Promise<Map<string, number>> {
    // .lean() (Rule #12) — chỉ đọc để tính toán, không cần Document đầy đủ.
    // Lọc bỏ đơn KHÔNG THỂ ĐÓNG GÓI (AOFP-XX, fix 15/09/2026, mở rộng
    // 15/09/2026 thêm nhóm sự cố logistics) — trước đây chỉ lọc
    // CANCELED, giờ lọc thêm LOST/DAMAGED_BY_3PL/PACKAGE_SCRAPPED...
    // (xem NOT_PACKABLE_ORDER_STATUSES) — hàng đã báo sự cố thì không
    // còn gì để đóng gói/đi lấy, y hệt lý do lọc CANCELED. Ảnh hưởng
    // CẢ Packaging lẫn Picking List (warehouse.service.ts tái dùng
    // đúng hàm này).
    const orders = await this.orderModel
      .find({
        consolidated_group_id: group._id,
        status: { $nin: NOT_PACKABLE_ORDER_STATUSES },
      })
      .select('items platform shop_id') // Rule #13 — chỉ lấy field cần
      .lean();

    // Case biên: TOÀN BỘ đơn trong group đã bị hủy (group từng có nhiều
    // đơn, tất cả lần lượt bị hủy sau khi đã gộp) — không được âm thầm
    // trả về items rỗng (dễ bị hiểu nhầm là "group hợp lệ nhưng 0 SKU"),
    // phải báo lỗi nghiệp vụ rõ ràng để FE/nhân viên biết group này không
    // còn gì để xử lý.
    if (orders.length === 0) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.ALL_ORDERS_CANCELED,
        `Toàn bộ đơn hàng trong group "${group._id.toString()}" đã bị hủy — không còn sản phẩm nào để đóng gói/lấy hàng.`,
        HttpStatus.CONFLICT,
        { groupId: group._id.toString() },
      );
    }

    // Lọc thêm ở TẦNG ITEM (BE-1): đơn vẫn còn hiệu lực nhưng từng
    // order_item_id có thể bị hủy riêng lẻ (Lazada trả status theo từng
    // đơn vị) — bộ lọc status ở query trên chỉ loại được cả đơn.
    const allRawItems: RawOrderItemForAggregation[] = orders
      .flatMap((o) => o.items)
      .filter((item) => item.status !== OrderStatus.CANCELED);
    const quantities = new Map<string, number>();
    for (const item of aggregateOrderItems(allRawItems)) {
      quantities.set(item.sku, (quantities.get(item.sku) ?? 0) + item.quantity);
    }
    return quantities;
  }

  /** Tổng đã quét theo SKU trong LƯỢT LẤY HIỆN TẠI của group. */
  private async getPickedSkuQuantities(
    group: OrderGroupDocument,
    sku?: string,
  ): Promise<Map<string, number>> {
    const round = group.pick_round;
    const events = await this.pickEventModel
      .find({
        order_group_id: group._id,
        ...this.roundFilter(round),
        ...(sku !== undefined && { seller_sku: sku }),
      })
      .select('seller_sku scanned_quantity')
      .lean();

    const quantities = new Map<string, number>();
    for (const event of events) {
      quantities.set(event.seller_sku, (quantities.get(event.seller_sku) ?? 0) + event.scanned_quantity);
    }
    return quantities;
  }

  /**
   * Dùng CHUNG cho cả getPackableItemsForGroup() (theo đơn ĐẶT) và
   * getActuallyPickedItemsForGroup() (theo số lượng THẬT đã quét) —
   * tránh viết trùng logic tra Product Master + xử lý thiếu dimension
   * an toàn (xem lý do ?. kép ở comment gốc bên trong hàm).
   */
  private async mapSkuQuantitiesToPackableItems(
    platform: MarketplacePlatform,
    shopId: string,
    groupId: string,
    skuQuantities: Map<string, number>,
  ): Promise<PackableItem[]> {
    const skus = Array.from(skuQuantities.keys());
    const products = await this.productMasterModel
      .find({ platform, shop_id: shopId, seller_sku: { $in: skus } })
      .lean();
    const productMap = new Map(products.map((p) => [p.seller_sku, p]));

    // BE-1 (12/09/2026): KHÔNG thay số đo thiếu bằng 20 cm/0,5 kg hay
    // is_fragile=false — SKU chưa có hồ sơ kho `ready` phải chặn rõ ràng.
    // Áp cho cả 2 nguồn gọi (theo đơn đặt và theo số lượng đã quét).
    return skus.map((sku) => {
      const product = productMap.get(sku);
      const dimension = product?.dimension;
      if (
        product?.packaging_profile_status !== 'ready' ||
        product.is_fragile === undefined ||
        dimension?.package_length_cm === undefined ||
        dimension.package_width_cm === undefined ||
        dimension.package_height_cm === undefined ||
        dimension.package_weight_kg === undefined
      ) {
        throw new AppException(
          ORD_GROUP_ERROR_CODES.PACKAGING_PROFILE_NOT_READY,
          `SKU ${sku} chưa có hồ sơ đóng gói được kho xác nhận (đủ số đo và độ nhạy).`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          { groupId, sku, reason: product ? 'needs_measurement' : 'missing_product_master' },
        );
      }
      return {
        sku,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- sku LUÔN có trong Map vì lấy trực tiếp từ skuQuantities.keys() ngay phía trên, không thể undefined.
        quantity: skuQuantities.get(sku)!,
        length_cm: dimension.package_length_cm,
        width_cm: dimension.package_width_cm,
        height_cm: dimension.package_height_cm,
        weight_kg: dimension.package_weight_kg,
        is_fragile: product.is_fragile,
        orientation_rule: product.orientation_rule ?? 'any',
        max_stack_load_kg: product.max_stack_load_kg ?? null,
        product_category: product.product_category ?? null,
        zip_bag_code: product.zip_bag_code ?? null,
        zip_bag_folded: product.zip_bag_folded ?? false,
        can_fold_in_half: product.can_fold_in_half ?? false,
      };
    });
  }

  /**
   * ===================================================================
   * MỚI (2026-09-09) — phục vụ order-groups.controller.ts, để FE thật
   * sự gọi được (trước đó Service chỉ dùng nội bộ qua Scheduler, không
   * ai gọi từ bên ngoài HTTP).
   * ===================================================================
   */
  async listOrderGroups(filter: {
    fulfillmentStatus?: GroupFulfillmentStatus;
    platform?: MarketplacePlatform;
    orderPriority?: 'normal' | 'express';
  }): Promise<OrderGroupDocument[]> {
    const query: Record<string, unknown> = {};
    if (filter.fulfillmentStatus)
      query.fulfillment_status = filter.fulfillmentStatus;
    if (filter.platform) query.platform = filter.platform;
    if (filter.orderPriority) query.order_priority = filter.orderPriority;

    // .lean() (Rule #12) — endpoint chỉ đọc để trả JSON, không cần
    // Document đầy đủ. Sort theo created_at mới nhất trước, tận dụng
    // ĐÚNG compound index { platform, fulfillment_status, created_at }
    // đã khai ở order-group.schema.ts (Rule #3, ESR).
    return this.orderGroupModel
      .find(query)
      .sort({ created_at: -1 })
      .limit(100) // giới hạn an toàn — chưa có cursor pagination như orders/, đủ dùng cho quy mô demo hiện tại
      .lean();
  }

  /**
   * 01/10/2026 — đếm đơn còn hiệu lực / đã hủy cho NHIỀU nhóm đơn trong 1 truy vấn
   * (Rule #16 — tránh N+1: danh sách 100 nhóm = 1 aggregation, không phải 100 lần đếm).
   * Tính trực tiếp từ collection `orders` (nguồn sự thật) lúc đọc — không lưu sẵn trên
   * order_groups, nên không cần migration và không bao giờ lệch với trạng thái đơn.
   * Nhóm không có đơn nào trong kết quả -> { 0, 0 }.
   */
  async getOrderCountsForGroups(
    groupIds: Types.ObjectId[],
  ): Promise<Map<string, GroupOrderCounts>> {
    const result = new Map<string, GroupOrderCounts>();
    if (groupIds.length === 0) return result;
    // KHÔNG thêm `is_consolidated: true` vào $match dù index consolidated_group_id là
    // partial theo field đó: nhóm 1 đơn có consolidated_group_id nhưng is_consolidated
    // vẫn false (xem getOrCreateGroupForOrder) — thêm điều kiện sẽ đếm thiếu.
    const rows = await this.orderModel.aggregate<{
      _id: Types.ObjectId;
      active: number;
      canceled: number;
    }>([
      { $match: { consolidated_group_id: { $in: groupIds } } },
      {
        $group: {
          _id: '$consolidated_group_id',
          active: {
            $sum: {
              $cond: [{ $in: ['$status', NOT_PACKABLE_ORDER_STATUSES] }, 0, 1],
            },
          },
          canceled: {
            $sum: { $cond: [{ $eq: ['$status', OrderStatus.CANCELED] }, 1, 0] },
          },
        },
      },
    ]);
    for (const row of rows) {
      result.set(row._id.toString(), {
        activeOrderCount: row.active,
        canceledOrderCount: row.canceled,
      });
    }
    return result;
  }

  /**
   * 01/10/2026 — tính lại và LƯU bản sao số đơn còn hiệu lực / đã hủy lên nhóm đơn.
   * Dùng `updateOne` (không `save`) để KHÔNG tăng `__v` — tránh làm hỏng
   * `expected_version` FE đang giữ (Rule #18). Best-effort: lỗi chỉ ghi log,
   * không chặn luồng đồng bộ.
   */
  /**
   * 02/10/2026 — chặn đóng gói nhóm đơn KHÔNG còn đơn nào cần xử lý (mọi đơn đã hủy /
   * gặp sự cố). Trước đây nút "pack" không kiểm tra -> đóng gói được cả nhóm hủy hết.
   */
  async assertHasActiveOrders(groupId: string): Promise<void> {
    if (!Types.ObjectId.isValid(groupId)) return; // để transitionFulfillmentStatus báo lỗi id như cũ
    const id = new Types.ObjectId(groupId);
    const counts = await this.getOrderCountsForGroups([id]);
    const active = counts.get(id.toString())?.activeOrderCount ?? 0;
    if (active === 0) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.ALL_ORDERS_CANCELED,
        `Toàn bộ đơn hàng trong group "${groupId}" đã bị hủy — không còn gì để đóng gói.`,
        HttpStatus.CONFLICT,
        { groupId },
      );
    }
  }

  async refreshOrderCounts(groupId: Types.ObjectId): Promise<void> {
    try {
      const counts = await this.getOrderCountsForGroups([groupId]);
      const c = counts.get(groupId.toString()) ?? {
        activeOrderCount: 0,
        canceledOrderCount: 0,
      };
      await this.orderGroupModel.updateOne(
        { _id: groupId },
        {
          $set: {
            active_order_count: c.activeOrderCount,
            canceled_order_count: c.canceledOrderCount,
            order_counts_refreshed_at: new Date(),
          },
        },
      );
    } catch (error) {
      this.logger.warn(
        `Cập nhật số đơn còn hiệu lực/đã hủy cho nhóm ${groupId.toString()} thất bại (không chặn luồng chính).`,
        error,
      );
    }
  }

  async findOrderGroupById(groupId: string): Promise<OrderGroupDocument> {
    if (!Types.ObjectId.isValid(groupId)) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.INVALID_GROUP_ID,
        `"${groupId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { groupId },
      );
    }
    const group = await this.orderGroupModel.findById(groupId);
    if (!group) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.GROUP_NOT_FOUND,
        `Không tìm thấy order group với id "${groupId}".`,
        HttpStatus.NOT_FOUND,
        { groupId },
      );
    }
    return group;
  }

  /**
   * ===================================================================
   * MỚI (2026-09-09) — dùng CHUNG cho cả 5 endpoint fulfillment
   * (pick/pack/ship/deliver/return) trong Controller. Viết 1 lần duy
   * nhất ở tầng Service, Controller chỉ truyền đúng targetStatus khác
   * nhau cho mỗi route — tránh lặp lại logic validate + optimistic
   * concurrency ở 5 chỗ khác nhau (đúng lý do ban đầu sinh ra
   * allowed-status-transitions.ts: định nghĩa 1 lần, dùng chung).
   * ===================================================================
   * Rule #18 (Database Design Standards, CLAUDE.md) — Optimistic
   * Concurrency: nhiều nhân viên (VD Packaging Staff Approve + Warehouse
   * Staff Pick) có thể cùng sửa 1 group gần như đồng thời. Filter theo
   * ĐÚNG {_id, __v: expectedVersion} — nếu ai khác đã sửa group giữa
   * lúc FE đọc dữ liệu và lúc gọi API này, __v không khớp nữa,
   * findOneAndUpdate trả về null (KHÔNG throw lỗi Mongo, chỉ đơn giản
   * không match được document nào) → tự ném lỗi CONFLICT rõ ràng, báo
   * FE tải lại dữ liệu mới nhất thay vì âm thầm ghi đè lên thao tác
   * của người khác (lost update).
   * ===================================================================
   */
  async transitionFulfillmentStatus(
    groupId: string,
    targetStatus: GroupFulfillmentStatus,
    expectedVersion: number,
    // BỔ SUNG (29/09/2026, Phần D — shipments/) — optional, cho phép gọi
    // BÊN TRONG 1 Mongo transaction đã mở sẵn ở nơi khác (VD tạo Shipment
    // + chuyển group cùng lúc). KHÔNG truyền session = hành vi CŨ y hệt,
    // 4 chỗ gọi hiện có (pick/ship/deliver/return) không cần sửa gì.
    session?: ClientSession,
  ): Promise<OrderGroupDocument> {
    const group = await this.findOrderGroupById(groupId); // đã tự validate id + tồn tại

    if (!isValidStatusTransition(group.fulfillment_status, targetStatus)) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.INVALID_TRANSITION,
        `Không thể chuyển Order Group từ trạng thái "${group.fulfillment_status}" sang "${targetStatus}".`,
        HttpStatus.BAD_REQUEST,
        { groupId, from: group.fulfillment_status, to: targetStatus },
      );
    }

    // findOneAndUpdate với filter kèm __v — atomic ở tầng MongoDB, KHÔNG
    // phải "đọc rồi ghi" (đúng Rule #7, dù mục đích chính ở đây là Rule
    // #18). Dùng `returnDocument: 'after'` (API mới), CỐ Ý KHÔNG dùng
    // `{ new: true }` — pattern cũ này đã bị phát hiện gây warning
    // deprecated ở users.service.ts/orders.service.ts/
    // marketplace-integration.service.ts (xem CLAUDE.md), code MỚI
    // không lặp lại lỗi đó.
    const updated = await this.orderGroupModel.findOneAndUpdate(
      { _id: groupId, __v: expectedVersion },
      { $set: { fulfillment_status: targetStatus }, $inc: { __v: 1 } },
      { returnDocument: 'after', session },
    );

    if (!updated) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
        `Order Group đã bị thay đổi bởi thao tác khác trong lúc bạn đang xử lý (version không khớp) — vui lòng tải lại dữ liệu mới nhất rồi thử lại.`,
        HttpStatus.CONFLICT,
        { groupId, expectedVersion },
      );
    }

    this.logger.log(
      `Order Group ${groupId}: ${group.fulfillment_status} -> ${targetStatus} (version ${String(expectedVersion)} -> ${String(expectedVersion + 1)}).`,
    );
    // K5 — lấy hàng xong: phần giữ chỗ chưa quét tới (thiếu hàng/bỏ bớt) được nhả cho đơn khác.
    if (targetStatus === GroupFulfillmentStatus.PICKED && !session)
      await this.releaseReservation(groupId);

    return updated;
  }

  /**
   * ===================================================================
   * MỚI (29/09/2026, N1 — AURELLE_MARKETPLACE_DESIGN.md Mục 9.6)
   * ===================================================================
   * Khách AURELLE tự hủy đơn qua webhook (hoặc đơn Lazada rơi vào sự cố
   * logistics) — nếu KHÔNG còn đơn nào trong nhóm còn fulfill được, tự
   * động chuyển nhóm sang CANCELED và nhả giữ chỗ đóng gói đang active
   * (is_active: false, mirror đúng cách `reject()` làm ở packaging.service.ts).
   * CHỈ áp dụng cho nhóm CHƯA đóng gói (allowed-status-transitions.ts đã
   * chặn cứng, hàm này chỉ là lớp kiểm tra sớm để không gọi transition vô ích).
   *
   * Gọi từ orders.service.ts (syncShopOrders()) ngay sau khi 1 đơn được
   * cập nhật trạng thái thuộc NOT_PACKABLE_ORDER_STATUSES — BEST-EFFORT,
   * không được làm hỏng cả lượt sync (caller tự bọc try/catch).
   * ===================================================================
   */
  async cancelIfAllOrdersUnfulfillable(
    groupId: string,
    options: { keepPackingPlan?: boolean } = {},
  ): Promise<void> {
    const group = await this.orderGroupModel.findById(groupId);
    if (!group) return;

    const TERMINAL_OR_PACKED_STATUSES: GroupFulfillmentStatus[] = [
      GroupFulfillmentStatus.SHIPPED,
      GroupFulfillmentStatus.DELIVERED,
      GroupFulfillmentStatus.RETURNED,
      GroupFulfillmentStatus.CANCELED,
    ];
    // (05/10/2026) Nhóm đã đóng (packed) chỉ hủy được khi kiện của nó đã được
    // chuyển "phải tháo" (keepPackingPlan) — hàng còn nằm trong thùng thật.
    if (!options.keepPackingPlan) TERMINAL_OR_PACKED_STATUSES.push(GroupFulfillmentStatus.PACKED);
    if (TERMINAL_OR_PACKED_STATUSES.includes(group.fulfillment_status)) return;

    const stillFulfillableCount = await this.orderModel.countDocuments({
      consolidated_group_id: group._id,
      status: { $nin: NOT_PACKABLE_ORDER_STATUSES },
    });
    if (stillFulfillableCount > 0) return;

    await this.transitionFulfillmentStatus(
      groupId,
      GroupFulfillmentStatus.CANCELED,
      group.__v,
    );

    // Nhả giữ chỗ thùng: kế hoạch đang hoạt động (chưa đóng) bị thay. Đã bắt đầu
    // đóng thì GIỮ kế hoạch tới khi tháo xong các kiện (05/10/2026).
    if (!options.keepPackingPlan) await this.deactivatePackingPlan(group._id);

    const { title, message } =
      this.notificationsService.buildGroupAutoCanceledMessage({ groupId });
    await this.notificationsService.notify({
      recipientRole: UserRole.STORE_OWNER,
      type: NotificationType.GROUP_AUTO_CANCELED,
      severity: 'warning',
      title,
      message,
      relatedEntityType: 'order_group',
      relatedEntityId: groupId,
    });
    await this.notificationsService.notify({
      recipientRole: UserRole.ADMIN,
      type: NotificationType.GROUP_AUTO_CANCELED,
      severity: 'warning',
      title,
      message,
      relatedEntityType: 'order_group',
      relatedEntityId: groupId,
    });
    if (group.assigned_staff_id) {
      await this.notificationsService.notify({
        recipientUserId: group.assigned_staff_id.toString(),
        type: NotificationType.GROUP_AUTO_CANCELED,
        severity: 'warning',
        title,
        message,
        relatedEntityType: 'order_group',
        relatedEntityId: groupId,
      });
    }

    this.logger.warn(
      `Order Group ${groupId}: tự động hủy (N1) — mọi đơn trong nhóm đã không còn fulfill được.`,
    );
  }

  /**
   * ===================================================================
   * MỚI (2026-09-10) — Điểm yếu #10 mục 1+4. Quét/nhập tay 1 SKU khi
   * lấy hàng — trừ tồn kho ATOMIC (Rule #7), có idempotency chống trừ
   * trùng khi Mobile App gửi lại do mất mạng.
   * ===================================================================
   */
  async pickItem(
    groupId: string,
    warehouseId: string,
    sku: string,
    scannedQuantity: number,
    scanMethod: 'barcode' | 'manual',
    clientEventId?: string,
    binLocationId?: string, // K3
    actorId = 'system', // K3 — ghi sổ cái
  ): Promise<{ sku: string; decrementedBy: number; remainingStock: number }> {
    // Idempotency TRƯỚC mọi kiểm tra khác — Mobile App gửi lại sau khi
    // mất mạng phải nhận lại kết quả CŨ, kể cả khi group đã sang trạng
    // thái khác do lần gửi đầu đã được xử lý.
    if (clientEventId) {
      const already = await this.findPickEventByClientId(clientEventId);
      if (already) return already;
    }

    const group = await this.loadGroupOrThrow(groupId);
    // SỬA (21/09/2026, BE-4a): chỉ quét được khi group đang PICKING.
    if (group.fulfillment_status !== GroupFulfillmentStatus.PICKING) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.PICK_NOT_ALLOWED,
        `Chỉ quét lấy hàng khi group đang "picking" (hiện "${group.fulfillment_status}").`,
        HttpStatus.CONFLICT,
        { groupId, status: group.fulfillment_status },
      );
    }

    // Xác nhận SKU quét THẬT SỰ thuộc group (19/09/2026), theo số lượng ĐẶT
    // trực tiếp — lấy hàng không phụ thuộc SKU đã có hồ sơ đóng gói hay chưa.
    const ordered = await this.getOrderedSkuQuantities(group);
    const orderedQuantity = ordered.get(sku);
    if (orderedQuantity === undefined) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.ITEM_NOT_IN_GROUP,
        `SKU "${sku}" không thuộc Order Group "${groupId}".`,
        HttpStatus.NOT_FOUND,
        { groupId, sku },
      );
    }

    // K4b (main) — SKU đã nối SKU nội bộ: trừ vào tồn CHUNG; chưa nối: theo sàn+shop+SKU.
    const masterSku = (
      await resolveMasterSkus(this.mappingModel, group.platform, group.shop_id, [sku])
    ).get(sku);

    const round = group.pick_round;
    let result: { sku: string; decrementedBy: number; remainingStock: number };
    const session = await this.connection.startSession();
    try {
      result = await session.withTransaction(async () => {
        // Chạm document group trong CÙNG transaction: 2 lần quét đồng thời →
        // xung đột ghi → withTransaction chạy lại và kiểm tra lại "không vượt số đặt".
        const touched = await this.orderGroupModel.updateOne(
          {
            _id: group._id,
            pick_round: round,
            fulfillment_status: GroupFulfillmentStatus.PICKING,
          },
          { $set: { last_picked_at: new Date() } },
          { session },
        );
        if (touched.matchedCount === 0) {
          throw new AppException(
            ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
            'Order Group vừa đổi trạng thái/lượt lấy — tải lại dữ liệu rồi quét lại.',
            HttpStatus.CONFLICT,
            { groupId },
          );
        }

        const pickedRows = await this.pickEventModel
          .find({ order_group_id: group._id, seller_sku: sku, ...this.roundFilter(round) })
          .select('scanned_quantity')
          .session(session)
          .lean();
        const alreadyPicked = pickedRows.reduce((sum, e) => sum + e.scanned_quantity, 0);
        if (alreadyPicked + scannedQuantity > orderedQuantity) {
          throw new AppException(
            ORD_GROUP_ERROR_CODES.PICK_EXCEEDS_ORDERED,
            `SKU "${sku}" chỉ cần ${String(orderedQuantity)}, đã quét ${String(alreadyPicked)} — không quét thêm ${String(scannedQuantity)}.`,
            HttpStatus.CONFLICT,
            { groupId, sku, orderedQuantity, alreadyPicked, scannedQuantity },
          );
        }

        // Atomic check-and-decrement — điều kiện `quantity_on_hand: {$gte}` trong
        // CÙNG 1 lệnh. Phạm vi tồn: kho + (SKU nội bộ | sàn+shop+SKU) [+ ô nếu chỉ định].
        const doc = await this.skuBinAssignmentModel.findOneAndUpdate(
          {
            warehouse_id: warehouseId,
            ...stockFilterFor(masterSku, group.platform, group.shop_id, sku),
            ...(binLocationId ? { bin_location_id: new Types.ObjectId(binLocationId) } : {}),
            quantity_on_hand: { $gte: scannedQuantity },
          },
          { $inc: { quantity_on_hand: -scannedQuantity } },
          { returnDocument: 'after', session },
        );
        if (!doc) {
          throw new AppException(
            ORD_GROUP_ERROR_CODES.INSUFFICIENT_STOCK,
            `SKU "${sku}" không đủ tồn kho tại kho "${warehouseId}" (cần ${String(scannedQuantity)}) — dùng POST .../fulfillment/report-missing để báo thiếu hàng.`,
            HttpStatus.CONFLICT,
            { sku, warehouseId, requestedQuantity: scannedQuantity },
          );
        }

        // K3 (main) — sổ cái biến động kho, cùng transaction.
        await this.inventoryMovementModel.create(
          [
            {
              warehouse_id: doc.warehouse_id,
              assignment_id: doc._id,
              bin_location_id: doc.bin_location_id,
              platform: doc.platform,
              shop_id: doc.shop_id,
              seller_sku: doc.seller_sku,
              master_sku: doc.master_sku ?? null,
              type: 'pick',
              delta: -scannedQuantity,
              quantity_before: doc.quantity_on_hand + scannedQuantity,
              quantity_after: doc.quantity_on_hand,
              reason_code: null,
              note: null,
              ref_type: 'order_group',
              ref_id: groupId,
              actor_id: actorId,
              created_at: new Date(),
            },
          ],
          { session },
        );

        // Audit lần quét (luôn ghi, kể cả không có client_event_id). Lưu lượt +
        // kho + ô để nhập lại đúng chỗ nếu lượt lấy bị hủy.
        await this.pickEventModel.create(
          [
            {
              order_group_id: group._id,
              seller_sku: sku,
              scanned_quantity: scannedQuantity,
              scan_method: scanMethod,
              client_event_id: clientEventId ?? null,
              remaining_stock_after: doc.quantity_on_hand,
              pick_round: round,
              warehouse_id: new Types.ObjectId(warehouseId),
              bin_location_id: doc.bin_location_id,
            },
          ],
          { session },
        );

        // K5 (main) — tiêu phần đã giữ chỗ tương ứng số vừa quét, cùng transaction.
        await this.stockReservationService.consume(
          groupId,
          stockKeyOf(masterSku, group.platform, group.shop_id, sku),
          scannedQuantity,
          session,
        );

        return { sku, decrementedBy: scannedQuantity, remainingStock: doc.quantity_on_hand };
      });
    } catch (error: unknown) {
      // 2 request cùng client_event_id tới đồng thời: bản thua đụng unique
      // index → trả kết quả của bản thắng, không trừ tồn lần 2.
      if (clientEventId && this.isDuplicateKeyError(error)) {
        const already = await this.findPickEventByClientId(clientEventId);
        if (already) return already;
      }
      throw error;
    } finally {
      await session.endSession();
    }

    this.logger.log(
      `Pick item: group ${groupId} (lượt ${String(round)}), SKU ${sku}, số lượng ${String(scannedQuantity)} (${scanMethod}) — còn lại ${String(result.remainingStock)}.`,
    );
    return result;
  }

  /**
   * MỚI (30/09/2026) — nhập lại tồn cho MỘT lượt lấy hàng bị hủy: cộng số đã quét
   * về đúng dòng tồn (kho + sàn + shop + SKU), đánh dấu event đã nhập để không
   * nhập lại 2 lần. Chạy trong transaction của caller.
   */
  private async restockPickRound(
    group: OrderGroupDocument,
    round: number,
    session: ClientSession,
    actorId = 'system',
  ): Promise<{ units: number; skipped: number }> {
    const events = await this.pickEventModel
      .find({ order_group_id: group._id, ...this.roundFilter(round), restocked_at: null })
      .session(session)
      .lean();
    let units = 0;
    let skipped = 0;
    // Gom theo kho + ô + SKU: trả về ĐÚNG ô đã trừ (K3); event cũ không có ô thì
    // trả vào dòng tồn đầu tiên khớp phạm vi.
    const perLine = new Map<
      string,
      { warehouse: Types.ObjectId; bin: Types.ObjectId | null; sku: string; qty: number; ids: Types.ObjectId[] }
    >();
    for (const event of events) {
      if (!event.warehouse_id) {
        skipped += 1;
        continue;
      }
      const bin = event.bin_location_id ?? null;
      const key = `${event.warehouse_id.toString()}|${bin?.toString() ?? '-'}|${event.seller_sku}`;
      const line = perLine.get(key) ?? { warehouse: event.warehouse_id, bin, sku: event.seller_sku, qty: 0, ids: [] };
      line.qty += event.scanned_quantity;
      line.ids.push(event._id);
      perLine.set(key, line);
    }
    // K4b (main) — SKU đã nối SKU nội bộ thì tồn nằm ở dòng gộp theo master_sku.
    const masters = await resolveMasterSkus(
      this.mappingModel,
      group.platform,
      group.shop_id,
      Array.from(new Set(Array.from(perLine.values(), (l) => l.sku))),
    );
    for (const line of perLine.values()) {
      // (05/10/2026) Event điều chỉnh âm (món hỏng/đã trả kệ lúc đóng) có thể làm
      // dòng ròng về 0 — không còn gì để nhập lại, chỉ đánh dấu đã xử lý.
      if (line.qty <= 0) {
        await this.pickEventModel.updateMany(
          { _id: { $in: line.ids } },
          { $set: { restocked_at: new Date() } },
          { session },
        );
        continue;
      }
      const doc = await this.skuBinAssignmentModel.findOneAndUpdate(
        {
          warehouse_id: line.warehouse,
          ...stockFilterFor(masters.get(line.sku), group.platform, group.shop_id, line.sku),
          ...(line.bin ? { bin_location_id: line.bin } : {}),
        },
        { $inc: { quantity_on_hand: line.qty } },
        { returnDocument: 'after', session },
      );
      if (!doc) {
        // Dòng tồn đã bị xóa/đổi — không nuốt im lặng: coi như cần đối soát tay.
        skipped += line.ids.length;
        continue;
      }
      await this.inventoryMovementModel.create(
        [
          {
            warehouse_id: doc.warehouse_id,
            assignment_id: doc._id,
            bin_location_id: doc.bin_location_id,
            platform: doc.platform,
            shop_id: doc.shop_id,
            seller_sku: doc.seller_sku,
            master_sku: doc.master_sku ?? null,
            type: 'pick_cancel',
            delta: line.qty,
            quantity_before: doc.quantity_on_hand - line.qty,
            quantity_after: doc.quantity_on_hand,
            reason_code: null,
            note: `Hủy lượt lấy ${String(round)}`,
            ref_type: 'order_group',
            ref_id: group._id.toString(),
            actor_id: actorId,
            created_at: new Date(),
          },
        ],
        { session },
      );
      await this.pickEventModel.updateMany(
        { _id: { $in: line.ids } },
        { $set: { restocked_at: new Date() } },
        { session },
      );
      units += line.qty;
    }
    return { units, skipped };
  }

  /**
   * ===================================================================
   * MỚI (05/10/2026) — điều chỉnh "đã lấy" từ khâu đóng gói
   * ===================================================================
   * Bớt `quantity` món của SKU khỏi lượt lấy hiện tại: chia theo các ô đã lấy
   * (ròng theo pick_events, kể cả điều chỉnh trước đó). `restock=true` → cộng
   * lại tồn đúng ô + ghi sổ kho (tháo kiện trả kệ); `restock=false` → món bị
   * loại (hỏng/thiếu), không cộng tồn. Luôn ghi pick_event ÂM để mọi phép đếm
   * "đã lấy" (phân bổ đơn, confirmPicked, lấy hàng tiếp) khớp hàng thật.
   * Chạy TRONG transaction của caller. Trả số món đã nhập lại kho.
   * ===================================================================
   */
  async adjustPickedUnits(
    groupId: string,
    lines: { sku: string; quantity: number }[],
    options: {
      restock: boolean;
      kind: 'pack_issue' | 'unpack';
      note: string;
      actorId: string;
      session: ClientSession;
    },
  ): Promise<{ restocked: number; withoutLocation: number }> {
    const { session } = options;
    const group = await this.loadGroupOrThrow(groupId);
    const masters = await resolveMasterSkus(
      this.mappingModel,
      group.platform,
      group.shop_id,
      Array.from(new Set(lines.map((l) => l.sku))),
    );
    let restocked = 0;
    let withoutLocation = 0;
    for (const { sku, quantity } of lines) {
      if (quantity <= 0) continue;
      const events = await this.pickEventModel
        .find({ order_group_id: group._id, seller_sku: sku, ...this.roundFilter(group.pick_round), restocked_at: null })
        .session(session)
        .lean();
      // Ròng theo (kho, ô) — ô lấy sau cùng trả trước (giống thứ tự lấy ra khỏi giỏ).
      const net = new Map<string, { warehouse: Types.ObjectId; bin: Types.ObjectId | null; qty: number; last: number }>();
      for (const e of events) {
        if (!e.warehouse_id) continue;
        const bin = e.bin_location_id ?? null;
        const key = `${e.warehouse_id.toString()}|${bin?.toString() ?? '-'}`;
        const cur = net.get(key) ?? { warehouse: e.warehouse_id, bin, qty: 0, last: 0 };
        cur.qty += e.scanned_quantity;
        cur.last = Math.max(cur.last, e.created_at?.getTime() ?? 0);
        net.set(key, cur);
      }
      let left = quantity;
      for (const line of [...net.values()].filter((l) => l.qty > 0).sort((a, b) => b.last - a.last)) {
        if (left === 0) break;
        const take = Math.min(left, line.qty);
        let remainingAfter = 0;
        if (options.restock) {
          const doc = await this.skuBinAssignmentModel.findOneAndUpdate(
            {
              warehouse_id: line.warehouse,
              ...stockFilterFor(masters.get(sku), group.platform, group.shop_id, sku),
              ...(line.bin ? { bin_location_id: line.bin } : {}),
            },
            { $inc: { quantity_on_hand: take } },
            { returnDocument: 'after', session },
          );
          if (doc) {
            remainingAfter = doc.quantity_on_hand;
            await this.inventoryMovementModel.create(
              [
                {
                  warehouse_id: doc.warehouse_id,
                  assignment_id: doc._id,
                  bin_location_id: doc.bin_location_id,
                  platform: doc.platform,
                  shop_id: doc.shop_id,
                  seller_sku: doc.seller_sku,
                  master_sku: doc.master_sku ?? null,
                  type: 'cancel_unpack',
                  delta: take,
                  quantity_before: doc.quantity_on_hand - take,
                  quantity_after: doc.quantity_on_hand,
                  reason_code: null,
                  note: options.note,
                  ref_type: 'order_group',
                  ref_id: groupId,
                  actor_id: options.actorId,
                  created_at: new Date(),
                },
              ],
              { session },
            );
            restocked += take;
          } else {
            // Dòng tồn đã bị xóa — hàng vẫn rời giỏ đóng gói, kho phải đối soát tay.
            withoutLocation += take;
          }
        }
        await this.pickEventModel.create(
          [
            {
              order_group_id: group._id,
              seller_sku: sku,
              scanned_quantity: -take,
              scan_method: 'manual',
              kind: options.kind,
              client_event_id: null,
              remaining_stock_after: remainingAfter,
              pick_round: group.pick_round,
              warehouse_id: line.warehouse,
              bin_location_id: line.bin,
            },
          ],
          { session },
        );
        left -= take;
      }
      // Bộ đếm "đã lấy" của giữ chỗ phải giảm theo — không thì reconcile không giữ chỗ món thay.
      await this.stockReservationService.unconsume(
        groupId,
        stockKeyOf(masters.get(sku), group.platform, group.shop_id, sku),
        quantity,
        session,
      );
      if (left > 0) {
        // Lần quét cũ không lưu kho/ô: vẫn bớt "đã lấy" nhưng không biết trả về đâu.
        withoutLocation += options.restock ? left : 0;
        await this.pickEventModel.create(
          [
            {
              order_group_id: group._id,
              seller_sku: sku,
              scanned_quantity: -left,
              scan_method: 'manual',
              kind: options.kind,
              client_event_id: null,
              remaining_stock_after: 0,
              pick_round: group.pick_round,
              warehouse_id: null,
              bin_location_id: null,
              restocked_at: new Date(),
            },
          ],
          { session },
        );
      }
    }
    return { restocked, withoutLocation };
  }

  /**
   * MỚI (05/10/2026) — lấy 1 món THAY từ kệ ngay tại bàn đóng gói (món cũ hỏng/
   * thiếu/sai). Trừ tồn có điều kiện như pick-item, ghi sổ kho `pack_replace` và
   * pick_event dương. Chạy TRONG transaction của caller.
   */
  async takeReplacementUnit(
    groupId: string,
    sku: string,
    warehouseId: string,
    binLocationId: string | undefined,
    actorId: string,
    session: ClientSession,
  ): Promise<{ binLocationId: string; remainingStock: number }> {
    const group = await this.loadGroupOrThrow(groupId);
    const masterSku = (await resolveMasterSkus(this.mappingModel, group.platform, group.shop_id, [sku])).get(sku);
    const doc = await this.skuBinAssignmentModel.findOneAndUpdate(
      {
        warehouse_id: new Types.ObjectId(warehouseId),
        ...stockFilterFor(masterSku, group.platform, group.shop_id, sku),
        ...(binLocationId ? { bin_location_id: new Types.ObjectId(binLocationId) } : {}),
        quantity_on_hand: { $gte: 1 },
      },
      { $inc: { quantity_on_hand: -1 } },
      { returnDocument: 'after', session },
    );
    if (!doc) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.INSUFFICIENT_STOCK,
        `Kho "${warehouseId}" không còn "${sku}" để lấy món thay — chọn "trả về lấy hàng" hoặc báo thiếu hàng.`,
        HttpStatus.CONFLICT,
        { sku, warehouseId, binLocationId: binLocationId ?? null },
      );
    }
    await this.inventoryMovementModel.create(
      [
        {
          warehouse_id: doc.warehouse_id,
          assignment_id: doc._id,
          bin_location_id: doc.bin_location_id,
          platform: doc.platform,
          shop_id: doc.shop_id,
          seller_sku: doc.seller_sku,
          master_sku: doc.master_sku ?? null,
          type: 'pack_replace',
          delta: -1,
          quantity_before: doc.quantity_on_hand + 1,
          quantity_after: doc.quantity_on_hand,
          reason_code: null,
          note: 'Lấy món thay lúc đóng gói',
          ref_type: 'order_group',
          ref_id: groupId,
          actor_id: actorId,
          created_at: new Date(),
        },
      ],
      { session },
    );
    await this.pickEventModel.create(
      [
        {
          order_group_id: group._id,
          seller_sku: sku,
          scanned_quantity: 1,
          scan_method: 'manual',
          kind: 'pack_replace',
          client_event_id: null,
          remaining_stock_after: doc.quantity_on_hand,
          pick_round: group.pick_round,
          warehouse_id: doc.warehouse_id,
          bin_location_id: doc.bin_location_id,
        },
      ],
      { session },
    );
    await this.stockReservationService.recordPicked(
      groupId,
      stockKeyOf(masterSku, group.platform, group.shop_id, sku),
      1,
      session,
    );
    return { binLocationId: doc.bin_location_id.toString(), remainingStock: doc.quantity_on_hand };
  }

  /** Số lượng ĐẶT theo SKU của group (đã loại đơn/món hủy) — cho luồng nhận hàng hoàn. */
  async getOrderedQuantitiesForGroup(groupId: string): Promise<Map<string, number>> {
    return this.getOrderedSkuQuantities(await this.loadGroupOrThrow(groupId));
  }

  /**
   * MỚI (30/09/2026) — điểm vào DUY NHẤT khi 1 đơn trong nhóm chuyển sang
   * trạng thái không fulfill được: hủy cả nhóm nếu hết đơn (N1), còn đơn
   * khác thì vô hiệu phương án đóng gói đang có (nếu có) vì nó vẫn chứa
   * hàng của đơn đã hủy.
   */
  async handleOrderBecameUnfulfillable(groupId: string): Promise<void> {
    // (05/10/2026) Đã bắt đầu đóng (kế hoạch packing/packed): KHÔNG thay cả kế
    // hoạch — mỗi đơn có kiện riêng nên chỉ kiện của đơn bị hủy phải tháo.
    const sessionStarted = await this.markCanceledOrdersForUnpack(groupId);
    await this.cancelIfAllOrdersUnfulfillable(groupId, { keepPackingPlan: sessionStarted });
    if (!sessionStarted) await this.invalidateStalePackagingPlan(groupId);
  }

  /**
   * MỚI (05/10/2026) — kế hoạch đã vào phiên đóng (packing/packed): đơn bị hủy →
   * đơn trong kế hoạch thành `canceled`, mọi kiện của đơn thành `to_unpack`
   * (kể cả kiện chưa niêm phong — hàng đã lấy ra khỏi kệ vẫn phải trả về).
   * Trả true nếu nhóm đang có phiên đóng (dù có thay đổi gì hay không).
   */
  private async markCanceledOrdersForUnpack(groupId: string): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const plan = await this.packingPlanModel
        .findOne({
          order_group_id: new Types.ObjectId(groupId),
          is_active: true,
          status: { $in: ['packing', 'packed'] },
        })
        .lean();
      if (!plan) return false;
      const dead = await this.orderModel
        .find({ consolidated_group_id: plan.order_group_id, status: { $in: NOT_PACKABLE_ORDER_STATUSES } })
        .select('_id')
        .lean();
      const deadIds = new Set(dead.map((o) => o._id.toString()));
      const now = new Date();
      let changed = 0;
      const orders = plan.orders.map((o) => {
        if (!deadIds.has(o.order_id.toString()) || o.status === 'canceled') return o;
        return Object.assign({}, o, {
          status: 'canceled' as const,
          cp_sat: o.cp_sat === 'pending' ? ('skipped' as const) : o.cp_sat,
          explanation: [...o.explanation, 'Đơn bị hủy sau khi đã bắt đầu đóng — các kiện của đơn phải tháo.'],
        });
      });
      const parcels = plan.parcels.map((p) => {
        if (!deadIds.has(p.order_id.toString()) || p.status === 'to_unpack' || p.status === 'voided') return p;
        changed += 1;
        return Object.assign({}, p, {
          status: 'to_unpack' as const,
          unpack: {
            reason: 'Đơn bị hủy sau khi đã bắt đầu đóng gói',
            requested_at: now,
            box_condition: null,
            units_restocked: 0,
            note: null,
            by: null,
            done_at: null,
          },
        });
      });
      if (changed === 0) return true;
      const res = await this.packingPlanModel.updateOne(
        { _id: plan._id, version: plan.version, is_active: true },
        { $set: { orders, parcels }, $inc: { version: 1 } },
      );
      if (res.matchedCount === 0) continue;

      const title = 'Cần tháo kiện của đơn đã hủy';
      const message = `${String(changed)} kiện của nhóm đơn có đơn vừa bị hủy sau khi đã bắt đầu đóng gói. Tháo kiện, trả hàng về kệ và ghi nhận tình trạng thùng.`;
      const recipients: { recipientRole?: UserRole; recipientUserId?: string }[] = [
        { recipientRole: UserRole.PACKAGING_STAFF },
      ];
      if (plan.assigned_packer_id) recipients.push({ recipientUserId: plan.assigned_packer_id.toString() });
      for (const r of recipients) {
        try {
          await this.notificationsService.notify({
            ...r,
            type: NotificationType.UNPACK_REQUIRED,
            severity: 'warning',
            title,
            message,
            relatedEntityType: 'order_group',
            relatedEntityId: groupId,
          });
        } catch (error: unknown) {
          this.logger.warn(`Gửi thông báo tháo kiện thất bại: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.logger.warn(`Order Group ${groupId}: ${String(changed)} kiện chuyển "phải tháo" vì đơn bị hủy sau khi bắt đầu đóng.`);
      return true;
    }
    this.logger.warn(`Order Group ${groupId}: không đánh dấu được kiện phải tháo (kế hoạch đổi liên tục).`);
    return true;
  }

  /** Kế hoạch đóng gói đang hoạt động (chưa đóng) → superseded, nhả giữ chỗ thùng. */
  private async deactivatePackingPlan(groupId: Types.ObjectId): Promise<void> {
    await this.packingPlanModel.updateMany(
      { order_group_id: groupId, is_active: true, status: { $ne: 'packed' } },
      { $set: { is_active: false, status: 'superseded' } },
    );
  }

  private async invalidateStalePackagingPlan(groupId: string): Promise<void> {
    const group = await this.orderGroupModel.findById(groupId);
    if (!group) return;
    if (
      group.fulfillment_status !== GroupFulfillmentStatus.PENDING_APPROVAL &&
      group.fulfillment_status !== GroupFulfillmentStatus.APPROVED_FOR_PACKING
    ) {
      return; // chưa có phương án, hoặc đã packed/canceled — không có gì để vô hiệu
    }

    await this.transitionFulfillmentStatus(
      groupId,
      GroupFulfillmentStatus.PICKED,
      group.__v,
    );
    // Nhóm về `picked` + không còn kế hoạch hoạt động → cron packing tự tính lại.
    await this.deactivatePackingPlan(group._id);

    const { title, message } =
      this.notificationsService.buildPackagingPlanInvalidatedMessage({ groupId });
    for (const recipientRole of [UserRole.PACKAGING_STAFF, UserRole.ADMIN]) {
      await this.notificationsService.notify({
        recipientRole,
        type: NotificationType.PACKAGING_PLAN_INVALIDATED,
        severity: 'warning',
        title,
        message,
        relatedEntityType: 'order_group',
        relatedEntityId: groupId,
      });
    }
    this.logger.warn(
      `Order Group ${groupId}: có đơn bị hủy sau khi có phương án đóng gói — đã vô hiệu hóa phương án, quay về picked để tính lại.`,
    );
  }

  /**
   * MỚI (30/09/2026) — nhóm còn "mở" cho đơn mới nhập vào không? Chỉ khi
   * chưa quét xong (awaiting_packaging/picking); từ picked trở đi danh sách
   * đơn đã bị khóa vì lượt lấy hàng và phương án đóng gói dựa trên nó.
   */
  async isGroupOpenForNewOrders(groupId: string): Promise<boolean> {
    const group = await this.orderGroupModel
      .findById(groupId)
      .select('fulfillment_status')
      .lean();
    if (!group) return true; // document group chưa tạo (chờ backfill) — chưa có gì để khóa
    return (
      group.fulfillment_status === GroupFulfillmentStatus.AWAITING_PACKAGING ||
      group.fulfillment_status === GroupFulfillmentStatus.PICKING
    );
  }

  /**
   * MỚI (21/09/2026, BE-4a) — "Đã lấy xong": chỉ cho `picked` khi MỌI
   * SKU đã quét đủ số đặt trong lượt hiện tại. Thiếu → 409 kèm danh sách,
   * nhân viên dùng report-missing (partial) thay vì bấm lấy xong.
   */
  async confirmPicked(groupId: string, expectedVersion: number): Promise<OrderGroupDocument> {
    const group = await this.loadGroupOrThrow(groupId);
    if (group.fulfillment_status === GroupFulfillmentStatus.PICKING) {
      const ordered = await this.getOrderedSkuQuantities(group);
      const picked = await this.getPickedSkuQuantities(group);
      const missing = Array.from(ordered.entries())
        .map(([sku, orderedQuantity]) => ({
          sku,
          orderedQuantity,
          pickedQuantity: picked.get(sku) ?? 0,
        }))
        .filter((row) => row.pickedQuantity < row.orderedQuantity);

      if (missing.length > 0) {
        throw new AppException(
          ORD_GROUP_ERROR_CODES.PICK_INCOMPLETE,
          `Còn ${String(missing.length)} SKU chưa quét đủ — quét tiếp hoặc dùng report-missing nếu thiếu hàng.`,
          HttpStatus.CONFLICT,
          { groupId, missing },
        );
      }
    }
    // Chỉ PICKING mới được đi qua route "lấy xong". PARTIAL_NEEDS_REVIEW → PICKED
    // là cạnh hợp lệ trong bảng transition, nhưng CHỈ dành cho decidePartial()
    // (Packaging Staff/Admin duyệt) — nếu không chặn ở đây, Warehouse Staff
    // gọi route này sẽ bỏ qua bước duyệt thiếu hàng.
    if (group.fulfillment_status !== GroupFulfillmentStatus.PICKING) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.INVALID_TRANSITION,
        `Không thể xác nhận lấy xong khi nhóm đang ở trạng thái "${group.fulfillment_status}" — thiếu hàng phải chờ Packaging Staff/Admin duyệt (decide-partial).`,
        HttpStatus.BAD_REQUEST,
        { groupId, from: group.fulfillment_status, to: GroupFulfillmentStatus.PICKED },
      );
    }
    return this.transitionFulfillmentStatus(groupId, GroupFulfillmentStatus.PICKED, expectedVersion);
  }

  private roundFilter(round: number): Record<string, unknown> {
    // Event cũ (trước 21/09) không có field pick_round → coi là lượt 0.
    return round === 0 ? { pick_round: { $in: [0, null] } } : { pick_round: round };
  }

  private async findPickEventByClientId(
    clientEventId: string,
  ): Promise<{ sku: string; decrementedBy: number; remainingStock: number } | null> {
    const already = await this.pickEventModel.findOne({ client_event_id: clientEventId });
    if (!already) return null;
    return {
      sku: already.seller_sku,
      decrementedBy: already.scanned_quantity,
      remainingStock: already.remaining_stock_after,
    };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }

  /**
   * ===================================================================
   * MỚI (2026-09-10) — Report Missing Item, đúng UC-07 Alt Flow gốc.
   * Hướng Y đã chốt: group DỪNG LẠI ở PARTIAL_NEEDS_REVIEW, KHÔNG tự
   * động đi tiếp — chờ Packaging Staff/Admin quyết định qua
   * decidePartial(). Thông báo Store Owner NGAY qua "cổng thông báo
   * chung" — đúng yêu cầu user: tất cả kênh (in-app + email).
   * ===================================================================
   */
  async reportMissing(
    groupId: string,
    reporterId: string,
    sku: string,
    missingQuantity: number,
    expectedVersion: number,
    note?: string,
  ): Promise<OrderGroupDocument> {
    const reporter = await this.userModel
      .findById(reporterId)
      .select('name')
      .lean();
    const reporterName = reporter?.name ?? 'Nhân viên kho';

    const group = await this.transitionFulfillmentStatus(
      groupId,
      GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW,
      expectedVersion,
    );

    const { title, message } =
      this.notificationsService.buildMissingItemMessage({
        groupId,
        sku,
        requestedQuantity: missingQuantity,
        reportedBy: reporterName,
      });

    await this.notificationsService.notify({
      recipientRole: UserRole.STORE_OWNER,
      type: NotificationType.MISSING_ITEM,
      severity: 'critical',
      title: note ? `${title} — Ghi chú: ${note}` : title,
      message,
      relatedEntityType: 'order_group',
      relatedEntityId: groupId,
    });

    this.logger.warn(
      `Report missing: group ${groupId}, SKU ${sku}, thiếu ${String(missingQuantity)} — đã thông báo Store Owner.`,
    );
    return group;
  }

  /**
   * Packaging Staff/Admin quyết định group đang PARTIAL_NEEDS_REVIEW —
   * approve=true: tiếp tục với phần có sẵn (PICKED). approve=false:
   * hủy, quay lại AWAITING_PACKAGING làm lại từ đầu.
   */
  async decidePartial(
    groupId: string,
    approve: boolean,
    expectedVersion: number,
  ): Promise<OrderGroupDocument> {
    if (approve) {
      return this.transitionFulfillmentStatus(
        groupId,
        GroupFulfillmentStatus.PICKED,
        expectedVersion,
      );
    }

    // SỬA (21/09/2026, BE-4a): hủy lượt lấy hiện tại → mở LƯỢT MỚI
    // (pick_round + 1) cùng lúc chuyển trạng thái, để lấy lại không bị
    // cộng dồn số đã quét của lượt cũ. Tồn kho KHÔNG tự cộng lại (roadmap
    // BE-4): hàng đã lấy ra phải được kho đối soát/restock tay.
    const group = await this.loadGroupOrThrow(groupId);
    // Vào thẳng PICKING (lượt mới): nhân viên phụ trách đã có từ lúc tạo
    // nhóm, không còn trạng thái treo chờ một API "bắt đầu lấy lại".
    if (
      !isValidStatusTransition(
        group.fulfillment_status,
        GroupFulfillmentStatus.PICKING,
      )
    ) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.INVALID_TRANSITION,
        `Không thể chuyển Order Group từ trạng thái "${group.fulfillment_status}" sang "${GroupFulfillmentStatus.PICKING}".`,
        HttpStatus.BAD_REQUEST,
        { groupId, from: group.fulfillment_status, to: GroupFulfillmentStatus.PICKING },
      );
    }
    // (30/09/2026) Mở lượt mới VÀ nhập lại tồn của lượt cũ trong CÙNG transaction:
    // hàng đã lấy của lượt bị hủy được trả về kệ (theo đúng kho lúc quét), không
    // còn "mất" khỏi tồn. Event cũ chưa lưu kho thì không nhập lại được — báo log.
    const session = await this.connection.startSession();
    let restocked = { units: 0, skipped: 0 };
    let result: OrderGroupDocument;
    try {
      result = await session.withTransaction(async () => {
        const doc = await this.orderGroupModel.findOneAndUpdate(
          { _id: group._id, __v: expectedVersion },
          {
            $set: { fulfillment_status: GroupFulfillmentStatus.PICKING },
            $inc: { __v: 1, pick_round: 1 },
          },
          { returnDocument: 'after', session },
        );
        if (!doc) {
          throw new AppException(
            ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
            'Order Group đã bị thay đổi bởi thao tác khác — vui lòng tải lại dữ liệu mới nhất rồi thử lại.',
            HttpStatus.CONFLICT,
            { groupId, expectedVersion },
          );
        }
        restocked = await this.restockPickRound(group, group.pick_round, session);
        return doc;
      });
    } finally {
      await session.endSession();
    }
    // K5 (main) — lượt mới cần giữ chỗ lại phần đã tiêu ở lượt bị hủy.
    await this.reconcileReservation(groupId);
    this.logger.warn(
      `Group ${groupId} hủy lượt lấy ${String(group.pick_round)} → lượt ${String(result.pick_round)}: đã nhập lại ${String(restocked.units)} sản phẩm vào kho` +
        (restocked.skipped > 0
          ? `; ${String(restocked.skipped)} lần quét cũ chưa lưu kho nên cần kho đối soát tay.`
          : '.'),
    );
    return result;
  }

  /**
   * MỚI (21/09/2026) — danh sách LẤY HÀNG: số đặt + đã quét trong lượt
   * hiện tại, kèm số đo NẾU hồ sơ đã `ready`. KHÔNG chặn khi SKU chưa đo
   * (trước đây picking-list dùng getPackableItemsForGroup() nên SKU chưa
   * đo làm kho không xem được việc cần lấy — sai với luồng lấy hàng trước).
   */
  async getPickableItemsForGroup(groupId: string): Promise<OrderGroupForPicking> {
    const group = await this.loadGroupOrThrow(groupId);
    const ordered = await this.getOrderedSkuQuantities(group);
    const picked = await this.getPickedSkuQuantities(group);
    const skus = Array.from(ordered.keys());
    const products = await this.productMasterModel
      .find({ platform: group.platform, shop_id: group.shop_id, seller_sku: { $in: skus } })
      .lean();
    const productMap = new Map(products.map((p) => [p.seller_sku, p]));

    const items: PickableItem[] = skus.map((sku) => {
      const product = productMap.get(sku);
      const ready = product?.packaging_profile_status === 'ready';
      const d = ready ? product.dimension : undefined;
      return {
        sku,
        quantity: ordered.get(sku) ?? 0,
        picked_quantity: picked.get(sku) ?? 0,
        packaging_profile_ready: ready,
        length_cm: d?.package_length_cm ?? null,
        width_cm: d?.package_width_cm ?? null,
        height_cm: d?.package_height_cm ?? null,
        weight_kg: d?.package_weight_kg ?? null,
        is_fragile: ready ? (product.is_fragile ?? null) : null,
      };
    });
    return { order_group_id: groupId, items };
  }

  /**
   * MỚI (2026-09-10) — chi tiết 1 món hàng riêng lẻ trong group (phục
   * vụ Stepper số lượng/confirm từng item). 🔄 21/09/2026: dùng danh sách
   * LẤY HÀNG (không bắt hồ sơ đóng gói).
   */
  async getPickableItemDetail(groupId: string, sku: string): Promise<PickableItem> {
    const { items } = await this.getPickableItemsForGroup(groupId);
    const item = items.find((i) => i.sku === sku);
    if (!item) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.ITEM_NOT_IN_GROUP,
        `SKU "${sku}" không thuộc Order Group "${groupId}".`,
        HttpStatus.NOT_FOUND,
        { groupId, sku },
      );
    }
    return item;
  }

  /**
   * MỚI (2026-09-10) — Đơn Hỏa Tốc. Store Owner/Admin tự tay đánh dấu
   * (đã xác minh Lazada KHÔNG cung cấp tín hiệu tự động — xem CLAUDE.md).
   * KHÔNG áp Rule #18 Optimistic Concurrency ở đây — đặt priority là
   * hành động độc lập, ít rủi ro xung đột hơn chuyển fulfillment_status.
   */
  async setPriority(
    groupId: string,
    priority: 'normal' | 'express',
    deadlineHours = 4,
  ): Promise<OrderGroupDocument> {
    const update: Record<string, unknown> = { order_priority: priority };
    if (priority === 'express') {
      update.packaging_deadline = addBusinessHours(new Date(), deadlineHours);
      update.is_overdue = false;
    } else {
      update.packaging_deadline = null;
      update.is_overdue = false;
    }

    const group = await this.orderGroupModel.findByIdAndUpdate(
      groupId,
      { $set: update },
      { returnDocument: 'after' },
    );
    if (!group) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.GROUP_NOT_FOUND,
        `Không tìm thấy order group với id "${groupId}".`,
        HttpStatus.NOT_FOUND,
        { groupId },
      );
    }
    this.logger.log(
      `Group ${groupId} đặt priority=${priority}${priority === 'express' ? `, hạn ${update.packaging_deadline as string}` : ''}.`,
    );
    return group;
  }

  // ===================================================================
  // K5 (27/09/2026) — GIỮ CHỖ TỒN KHO
  // ===================================================================

  /** Tính lại giữ chỗ theo hàng HIỆN TẠI của nhóm đơn. Best-effort, không throw. */
  async reconcileReservation(groupId: string): Promise<void> {
    try {
      const group = await this.loadGroupOrThrow(groupId);
      // Theo số lượng ĐẶT (không qua Product Master): giữ chỗ không được phụ
      // thuộc việc SKU đã có hồ sơ đóng gói — getPackableItemsForGroup báo lỗi
      // khi hồ sơ chưa ready (gộp main + thi_dev 04/10/2026).
      const ordered = await this.getOrderedSkuQuantities(group);
      const items = Array.from(ordered, ([sku, quantity]) => ({ sku, quantity }));
      await this.stockReservationService.reconcile(group, items);
    } catch (error) {
      this.logger.warn(
        `Giữ chỗ tồn kho cho nhóm đơn ${groupId} thất bại (không chặn luồng chính).`,
        error,
      );
    }
  }

  /** Nhả phần giữ chỗ còn dư. Best-effort, không throw. */
  async releaseReservation(groupId: string): Promise<number> {
    try {
      return await this.stockReservationService.releaseGroup(groupId);
    } catch (error) {
      this.logger.warn(`Nhả giữ chỗ nhóm đơn ${groupId} thất bại.`, error);
      return 0;
    }
  }
}
