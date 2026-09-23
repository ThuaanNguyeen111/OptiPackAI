import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { OrderGroup, OrderGroupDocument } from './schemas/order-group.schema';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { isValidStatusTransition } from './enums/allowed-status-transitions';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { OrderStatus } from '../orders/enums/order-status.enum';
// Đọc TRỰC TIẾP schema Order đã có sẵn (KHÔNG sửa file gốc) — Mongoose/
// Nest cho phép nhiều module cùng đăng ký MongooseModule.forFeature() cho
// CÙNG 1 schema/collection, đây là pattern chuẩn khi 1 module khác cần
// đọc dữ liệu của module kia mà không muốn import chéo Service (tránh
// circular dependency giữa orders/ và order-groups/).
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { NOT_PACKABLE_ORDER_STATUSES } from '../orders/enums/order-status.enum';
import {
  aggregateOrderItems,
  RawOrderItemForAggregation,
} from '../orders/utils/aggregate-order-items.util';
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
    private readonly notificationsService: NotificationsService,
    // BỔ SUNG (20/09/2026, đảo luồng theo yêu cầu Thuận) — cần gọi
    // autoAssign() NGAY LÚC TẠO GROUP (xem startPickingPhase() bên
    // dưới). Không có circular dependency: StaffAssignmentService chỉ
    // phụ thuộc trực tiếp 2 Mongoose model, KHÔNG phụ thuộc ngược lại
    // OrderGroupsService — đã kiểm tra trước khi thêm dòng này.
    private readonly staffAssignmentService: StaffAssignmentService,
    // BỔ SUNG (21/09/2026, BE-4a) — transaction cho trừ tồn + ghi pick_event.
    @InjectConnection() private readonly connection: Connection,
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
    });
    await this.orderModel.updateOne(
      { _id: order._id },
      { $set: { consolidated_group_id: newGroup._id } },
    );
    return this.startPickingPhase(newGroup);
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
      { returnDocument: 'after' },
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

    return updated;
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

    // BỔ SUNG (19/09/2026, báo cáo thật Hải Phượng) — TRƯỚC KHI trừ tồn,
    // xác nhận SKU quét THẬT SỰ thuộc group này. SỬA (21/09/2026): dùng
    // số lượng ĐẶT trực tiếp, KHÔNG đi qua Product Master — lấy hàng
    // không được phụ thuộc việc SKU đã có hồ sơ đóng gói hay chưa.
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

    const round = group.pick_round;
    let result: { sku: string; decrementedBy: number; remainingStock: number };
    const session = await this.connection.startSession();
    try {
      result = await session.withTransaction(async () => {
        // Chạm document group trong CÙNG transaction: 2 lần quét đồng
        // thời → xung đột ghi → withTransaction chạy lại callback và
        // kiểm tra "không vượt số đặt" với dữ liệu mới nhất.
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

        // Atomic check-and-decrement — filter kèm `quantity_on_hand: {$gte}`
        // ngay trong CÙNG 1 lệnh (tránh race 2 nhân viên cùng lấy SKU sắp hết).
        const updated = await this.skuBinAssignmentModel.findOneAndUpdate(
          {
            warehouse_id: warehouseId,
            seller_sku: sku,
            quantity_on_hand: { $gte: scannedQuantity },
          },
          { $inc: { quantity_on_hand: -scannedQuantity } },
          { returnDocument: 'after', session },
        );
        if (!updated) {
          throw new AppException(
            ORD_GROUP_ERROR_CODES.INSUFFICIENT_STOCK,
            `SKU "${sku}" không đủ tồn kho tại kho "${warehouseId}" (cần ${String(scannedQuantity)}) — dùng POST .../fulfillment/report-missing để báo thiếu hàng.`,
            HttpStatus.CONFLICT,
            { sku, warehouseId, requestedQuantity: scannedQuantity },
          );
        }

        // Ghi event cùng transaction — lỗi ghi event thì tồn kho tự rollback.
        // Luôn ghi audit, kể cả khi không có client_event_id (gọi từ web/Swagger).
        await this.pickEventModel.create(
          [
            {
              order_group_id: group._id,
              seller_sku: sku,
              scanned_quantity: scannedQuantity,
              scan_method: scanMethod,
              client_event_id: clientEventId ?? null,
              remaining_stock_after: updated.quantity_on_hand,
              pick_round: round,
            },
          ],
          { session },
        );

        return { sku, decrementedBy: scannedQuantity, remainingStock: updated.quantity_on_hand };
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
    // Trạng thái khác PICKING: để transitionFulfillmentStatus() báo
    // INVALID_TRANSITION đúng như trước.
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
    if (
      !isValidStatusTransition(
        group.fulfillment_status,
        GroupFulfillmentStatus.AWAITING_PACKAGING,
      )
    ) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.INVALID_TRANSITION,
        `Không thể chuyển Order Group từ trạng thái "${group.fulfillment_status}" sang "${GroupFulfillmentStatus.AWAITING_PACKAGING}".`,
        HttpStatus.BAD_REQUEST,
        { groupId, from: group.fulfillment_status, to: GroupFulfillmentStatus.AWAITING_PACKAGING },
      );
    }
    const updated = await this.orderGroupModel.findOneAndUpdate(
      { _id: group._id, __v: expectedVersion },
      {
        $set: { fulfillment_status: GroupFulfillmentStatus.AWAITING_PACKAGING },
        $inc: { __v: 1, pick_round: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
        'Order Group đã bị thay đổi bởi thao tác khác — vui lòng tải lại dữ liệu mới nhất rồi thử lại.',
        HttpStatus.CONFLICT,
        { groupId, expectedVersion },
      );
    }
    this.logger.warn(
      `Group ${groupId} hủy lượt lấy ${String(group.pick_round)} → lượt ${String(updated.pick_round)}. Hàng đã lấy ở lượt cũ cần kho đối soát/restock tay.`,
    );
    return updated;
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
}
