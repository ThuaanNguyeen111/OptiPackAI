import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
  OrderGroupForPackaging,
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
        `Toàn bộ đơn hàng trong group "${groupId}" đã bị hủy — không còn sản phẩm nào để đóng gói/lấy hàng.`,
        HttpStatus.CONFLICT,
        { groupId },
      );
    }

    const allRawItems: RawOrderItemForAggregation[] = orders.flatMap(
      (o) => o.items,
    );
    const aggregated = aggregateOrderItems(allRawItems);

    // 1 query $in duy nhất — Rule #16, tránh N+1
    const skuQuantities = new Map(aggregated.map((i) => [i.sku, i.quantity]));
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
   * Chỉ dùng cho mục đích TÍNH GỢI Ý ĐÓNG GÓI (packaging.service.ts) —
   * KHÔNG dùng cho Picking (picking-list vẫn phải hiển thị theo đơn
   * ĐẶT, không phải đã lấy — nếu không sẽ không biết cần lấy gì).
   */
  async getActuallyPickedItemsForGroup(
    groupId: string,
  ): Promise<OrderGroupForPackaging> {
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

    // Cộng dồn TOÀN BỘ pick_events của group này theo SKU — 1 SKU có
    // thể được quét NHIỀU LẦN riêng lẻ (VD quét từng cái 1), phải cộng
    // dồn đúng tổng số lượng THẬT đã lấy, không chỉ lấy lần quét cuối.
    const events = await this.pickEventModel
      .find({ order_group_id: group._id })
      .select('seller_sku scanned_quantity')
      .lean();

    const skuQuantities = new Map<string, number>();
    for (const event of events) {
      const current = skuQuantities.get(event.seller_sku) ?? 0;
      skuQuantities.set(event.seller_sku, current + event.scanned_quantity);
    }

    if (skuQuantities.size === 0) {
      // Group đang ở PICKED nhưng KHÔNG có pick_event nào — về lý
      // thuyết không nên xảy ra (phải quét ít nhất 1 SKU mới hợp lệ đi
      // tới PICKED qua luồng thật), nhưng phòng thủ rõ ràng thay vì để
      // hàm dưới trả mảng rỗng âm thầm (dễ hiểu nhầm là group hợp lệ
      // nhưng 0 SKU).
      throw new AppException(
        ORD_GROUP_ERROR_CODES.ALL_ORDERS_CANCELED,
        `Group "${groupId}" chưa có bản ghi lấy hàng (pick_events) nào — không thể tính gợi ý đóng gói.`,
        HttpStatus.CONFLICT,
        { groupId },
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

    return skus.map((sku) => {
      const product = productMap.get(sku);
      if (!product) {
        this.logger.warn(
          `Thiếu Product Master cho SKU ${sku} (group ${groupId}) — dùng giá trị mặc định an toàn (giả định cồng kềnh nhẹ).`,
        );
      }
      return {
        sku,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- sku LUÔN có trong Map vì lấy trực tiếp từ skuQuantities.keys() ngay phía trên, không thể undefined.
        quantity: skuQuantities.get(sku)!,
        // BỔ SUNG (19/09/2026, báo cáo thật) — thêm `?.` cho CHÍNH
        // `dimension`, không chỉ cho `product`. Trước đây `product?.` chỉ
        // bảo vệ trường hợp KHÔNG tìm thấy document (product=undefined),
        // nhưng nếu document CÓ tồn tại mà `dimension` lại thiếu/undefined
        // (dữ liệu chèn tay bỏ qua validation Mongoose — schema khai
        // `dimension` required:true nên code ứng dụng KHÔNG BAO GIỜ tạo
        // ra tình huống này, chỉ xảy ra khi dữ liệu bị can thiệp trực
        // tiếp ngoài luồng) — truy cập `.package_length_cm` trên
        // `undefined` ném TypeError → 500 Internal Server Error, sập cả
        // API picking-list.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- CỐ Ý: schema khai dimension required:true nên TS tin chắc không undefined, nhưng dữ liệu CHÈN TAY bỏ qua Mongoose validation (đã xác nhận gặp thật) vẫn có thể thiếu field này — giữ ?. để không sập 500 khi gặp đúng tình huống đó.
        length_cm: product?.dimension?.package_length_cm ?? 20,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- xem lý do dòng trên
        width_cm: product?.dimension?.package_width_cm ?? 20,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- xem lý do dòng trên
        height_cm: product?.dimension?.package_height_cm ?? 20,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- xem lý do dòng trên
        weight_kg: product?.dimension?.package_weight_kg ?? 0.5,
        is_fragile: product?.is_fragile ?? false,
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
    // BỔ SUNG (19/09/2026, báo cáo thật Hải Phượng) — TRƯỚC KHI trừ tồn,
    // xác nhận SKU quét THẬT SỰ thuộc group này — trước đây hàm nhận
    // `groupId` nhưng CHỈ dùng để ghi log audit (pick_events), không hề
    // dùng để kiểm tra SKU có liên quan gì tới đơn đang lấy hay không.
    // Hậu quả nếu không kiểm tra: quét NHẦM 1 mã vạch bất kỳ (miễn còn
    // tồn trong kho) vẫn trừ tồn THẬT, dù SKU đó không nằm trong đơn nào
    // của group — làm sai lệch tồn kho cho sản phẩm hoàn toàn không liên
    // quan. Tái dùng ĐÚNG getPackableItemDetail() đã có sẵn (viết cho
    // API item-detail 2026-09-10) — không viết lại logic kiểm tra từ đầu,
    // tự động throw ORD_GROUP_ITEM_NOT_IN_GROUP (404) nếu SKU sai.
    await this.getPackableItemDetail(groupId, sku);

    // Idempotency — client_event_id đã xử lý trước đó -> trả lại kết
    // quả CŨ, KHÔNG trừ lần 2 (Mobile App gửi lại sau khi mất mạng).
    if (clientEventId) {
      const already = await this.pickEventModel.findOne({
        client_event_id: clientEventId,
      });
      if (already) {
        return {
          sku: already.seller_sku,
          decrementedBy: already.scanned_quantity,
          remainingStock: already.remaining_stock_after,
        };
      }
    }

    // Atomic check-and-decrement — filter kèm `quantity_on_hand: {$gte}`
    // ngay trong CÙNG 1 lệnh, không tách "check rồi ghi" (tránh race
    // condition 2 nhân viên quét cùng lúc cùng 1 SKU sắp hết hàng).
    const updated = await this.skuBinAssignmentModel.findOneAndUpdate(
      {
        warehouse_id: warehouseId,
        seller_sku: sku,
        quantity_on_hand: { $gte: scannedQuantity },
      },
      { $inc: { quantity_on_hand: -scannedQuantity } },
      { returnDocument: 'after' },
    );

    if (!updated) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.INSUFFICIENT_STOCK,
        `SKU "${sku}" không đủ tồn kho tại kho "${warehouseId}" (cần ${String(scannedQuantity)}) — dùng POST .../fulfillment/report-missing để báo thiếu hàng.`,
        HttpStatus.CONFLICT,
        { sku, warehouseId, requestedQuantity: scannedQuantity },
      );
    }

    if (clientEventId) {
      await this.pickEventModel.create({
        order_group_id: groupId,
        seller_sku: sku,
        scanned_quantity: scannedQuantity,
        scan_method: scanMethod,
        client_event_id: clientEventId,
        remaining_stock_after: updated.quantity_on_hand,
      });
    } else {
      // Vẫn ghi log audit dù không có client_event_id (gọi trực tiếp
      // Swagger/web, không qua offline-sync) — chỉ khác là không cần
      // check idempotency cho lần này.
      await this.pickEventModel.create({
        order_group_id: groupId,
        seller_sku: sku,
        scanned_quantity: scannedQuantity,
        scan_method: scanMethod,
        client_event_id: null,
        remaining_stock_after: updated.quantity_on_hand,
      });
    }

    this.logger.log(
      `Pick item: group ${groupId}, SKU ${sku}, số lượng ${String(scannedQuantity)} (${scanMethod}) — còn lại ${String(updated.quantity_on_hand)}.`,
    );

    return {
      sku,
      decrementedBy: scannedQuantity,
      remainingStock: updated.quantity_on_hand,
    };
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
    const targetStatus = approve
      ? GroupFulfillmentStatus.PICKED
      : GroupFulfillmentStatus.AWAITING_PACKAGING;
    return this.transitionFulfillmentStatus(
      groupId,
      targetStatus,
      expectedVersion,
    );
  }

  /**
   * MỚI (2026-09-10) — chi tiết 1 món hàng riêng lẻ trong group (phục
   * vụ Stepper số lượng/confirm từng item, đã ghi nhận thiếu ở CLAUDE.md
   * khi review FE). TÁI DÙNG getPackableItemsForGroup() đã có, không
   * viết lại logic lấy item từ đầu — chỉ lọc đúng 1 SKU.
   */
  async getPackableItemDetail(
    groupId: string,
    sku: string,
  ): Promise<PackableItem> {
    const { items } = await this.getPackableItemsForGroup(groupId);
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
