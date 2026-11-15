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
import { Injectable, Logger, HttpStatus, Optional } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  StockLot,
  StockLotDocument,
} from '../warehouse/schemas/stock-lot.schema';
import {
  MarketplaceStatusOutbox,
  MarketplaceStatusOutboxDocument,
} from '../marketplace-writeback/schemas/status-outbox.schema';
import {
  ActivityLog,
  ActivityLogDocument,
} from '../activity-log/schemas/activity-log.schema';
import { recordActivity } from '../activity-log/activity-log.util';
import { enqueueStatusPush } from '../marketplace-writeback/status-outbox.util';
import { notPackableStatuses } from '../orders/order-sync-policy';
import { StockLotLedger, netLotsInHand } from '../warehouse/stock-lot.ledger';
import { OrderGroup, OrderGroupDocument } from './schemas/order-group.schema';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { isValidStatusTransition } from './enums/allowed-status-transitions';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { AppException } from '../../common/exceptions/app-exception';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';
import { PickableItem } from '../../common/interfaces/packaging.interface';
import {
  SkuBinAssignment,
  SkuBinAssignmentDocument,
} from '../warehouse/schemas/sku-bin-assignment.schema';
import { PickEvent, PickEventDocument } from './schemas/pick-event.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { User, UserDocument } from '../users/schemas/user.schema';
import { OrderGroupsService } from './order-groups.service';

/**
 * 13/11/2026 — tách từ OrderGroupsService: lấy hàng theo lượt (quét món, báo thiếu,
 * quyết định thiếu hàng, xác nhận lấy xong) và danh sách món cần lấy.
 * Trạng thái, giữ chỗ và FIFO giữa các ô vẫn đi qua OrderGroupsService (core);
 * các hàm điều chỉnh hàng đã lấy mà đóng gói dùng (adjustPickedUnits,
 * returnSurplusPickedUnits, takeReplacementUnit) ở lại core vì luồng huỷ đơn của core gọi chúng.
 */
@Injectable()
export class OrderGroupPickingService {
  private readonly logger = new Logger(OrderGroupPickingService.name);
  private readonly lots: StockLotLedger;

  constructor(
    @InjectModel(OrderGroup.name)
    private readonly orderGroupModel: Model<OrderGroupDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(SkuBinAssignment.name)
    private readonly skuBinAssignmentModel: Model<SkuBinAssignmentDocument>,
    @InjectModel(PickEvent.name)
    private readonly pickEventModel: Model<PickEventDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(InventoryMovement.name)
    private readonly inventoryMovementModel: Model<InventoryMovementDocument>,
    @InjectModel(MarketplaceSkuMapping.name)
    private readonly mappingModel: Model<MarketplaceSkuMappingDocument>,
    private readonly stockReservationService: StockReservationService,
    private readonly core: OrderGroupsService,
    @Optional()
    @InjectModel(StockLot.name)
    stockLotModel?: Model<StockLotDocument>,
    @Optional()
    @InjectModel(MarketplaceStatusOutbox.name)
    private readonly statusOutboxModel?: Model<MarketplaceStatusOutboxDocument>,
    @Optional()
    @InjectModel(ActivityLog.name)
    private readonly activityLogModel?: Model<ActivityLogDocument>,
  ) {
    this.lots = new StockLotLedger(stockLotModel);
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

    const group = await this.core.loadGroupOrThrow(groupId);
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
    const ordered = await this.core.getOrderedSkuQuantities(group);
    const orderedQuantity = ordered.get(sku);
    if (orderedQuantity === undefined) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.ITEM_NOT_IN_GROUP,
        `SKU "${sku}" không thuộc Order Group "${groupId}".`,
        HttpStatus.NOT_FOUND,
        { groupId, sku },
      );
    }

    // 21/10/2026 — giữ chỗ theo kho: quét phải đúng kho của nhóm đơn (đổi kho chỉ khi chưa quét gì).
    await this.ensurePickWarehouse(group, warehouseId);

    // K4b (main) — SKU đã nối SKU nội bộ: trừ vào tồn CHUNG; chưa nối: theo sàn+shop+SKU.
    const masterSku = (
      await resolveMasterSkus(
        this.mappingModel,
        group.platform,
        group.shop_id,
        [sku],
      )
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
        // 23/10/2026 — lần quét ĐẦU TIÊN của nhóm: báo website "Kho đang chuẩn bị hàng" (cùng
        // transaction; khóa cố định `first_pick` nên quét lại / lượt lấy sau không báo trùng).
        if (!group.last_picked_at) {
          await enqueueStatusPush(
            this.statusOutboxModel,
            {
              orderGroupId: group._id,
              status: 'processing',
              discriminator: 'first_pick',
            },
            session,
          );
        }

        const pickedRows = await this.pickEventModel
          .find({
            order_group_id: group._id,
            seller_sku: sku,
            ...this.core.roundFilter(round),
          })
          .select('scanned_quantity')
          .session(session)
          .lean();
        const alreadyPicked = pickedRows.reduce(
          (sum, e) => sum + e.scanned_quantity,
          0,
        );
        if (alreadyPicked + scannedQuantity > orderedQuantity) {
          throw new AppException(
            ORD_GROUP_ERROR_CODES.PICK_EXCEEDS_ORDERED,
            `SKU "${sku}" chỉ cần ${String(orderedQuantity)}, đã quét ${String(alreadyPicked)} — không quét thêm ${String(scannedQuantity)}.`,
            HttpStatus.CONFLICT,
            { groupId, sku, orderedQuantity, alreadyPicked, scannedQuantity },
          );
        }

        // warehouse_id ép ObjectId — tránh miss khi FE gửi string (assignment lưu ObjectId).
        const warehouseObjectId = Types.ObjectId.isValid(warehouseId)
          ? new Types.ObjectId(warehouseId)
          : warehouseId;
        // Atomic check-and-decrement — điều kiện `quantity_on_hand: {$gte}` trong
        // CÙNG 1 lệnh. Phạm vi tồn: kho + (SKU nội bộ | sàn+shop+SKU) [+ ô nếu chỉ định].
        const scope = {
          warehouse_id: warehouseObjectId,
          ...stockFilterFor(masterSku, group.platform, group.shop_id, sku),
          ...(binLocationId
            ? { bin_location_id: new Types.ObjectId(binLocationId) }
            : {}),
        };
        // 15/10/2026 — không chỉ định ô → lấy ở ô có lô cũ nhất (FIFO theo ngày nhập).
        const fifoId = binLocationId
          ? null
          : await this.core.pickFifoAssignmentId(
              scope,
              scannedQuantity,
              session,
            );
        const doc = await this.skuBinAssignmentModel.findOneAndUpdate(
          {
            ...scope,
            ...(fifoId ? { _id: fifoId } : {}),
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

        // 15/10/2026 — trừ lô theo FIFO (ngày nhập cũ nhất trước) trong ô vừa trừ tồn.
        const lotAllocations = await this.lots.consume(
          doc,
          scannedQuantity,
          doc.quantity_on_hand + scannedQuantity,
          session,
        );

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
              lot_allocations: lotAllocations,
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
              // 🔄 07/10/2026 — SỬA LỖI: trước đây ghi `groupId` (chuỗi) vào field bị Mongoose
              // hiểu là Mixed -> DB lưu CHUỖI, trong khi getActuallyPickedItemsForGroup đọc bằng
              // group._id (ObjectId) -> không bao giờ thấy pick_events -> gợi ý đóng gói lặng lẽ
              // dùng số lượng ĐẶT thay vì số đã quét. Nay lưu ObjectId (schema cũng đã sửa).
              order_group_id: group._id,
              seller_sku: sku,
              scanned_quantity: scannedQuantity,
              scan_method: scanMethod,
              client_event_id: clientEventId ?? null,
              remaining_stock_after: doc.quantity_on_hand,
              pick_round: round,
              warehouse_id: new Types.ObjectId(warehouseId),
              bin_location_id: doc.bin_location_id,
              lot_allocations: lotAllocations,
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

        return {
          sku,
          decrementedBy: scannedQuantity,
          remainingStock: doc.quantity_on_hand,
        };
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
      .find({
        order_group_id: group._id,
        ...this.core.roundFilter(round),
        restocked_at: null,
      })
      .session(session)
      .lean();
    let units = 0;
    let skipped = 0;
    // Gom theo kho + ô + SKU: trả về ĐÚNG ô đã trừ (K3); event cũ không có ô thì
    // trả vào dòng tồn đầu tiên khớp phạm vi.
    const perLine = new Map<
      string,
      {
        warehouse: Types.ObjectId;
        bin: Types.ObjectId | null;
        sku: string;
        qty: number;
        ids: Types.ObjectId[];
        events: typeof events;
      }
    >();
    for (const event of events) {
      if (!event.warehouse_id) {
        skipped += 1;
        continue;
      }
      const bin = event.bin_location_id ?? null;
      const key = `${event.warehouse_id.toString()}|${bin?.toString() ?? '-'}|${event.seller_sku}`;
      const line = perLine.get(key) ?? {
        warehouse: event.warehouse_id,
        bin,
        sku: event.seller_sku,
        qty: 0,
        ids: [],
        events: [],
      };
      line.qty += event.scanned_quantity;
      line.ids.push(event._id);
      line.events.push(event);
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
          ...stockFilterFor(
            masters.get(line.sku),
            group.platform,
            group.shop_id,
            line.sku,
          ),
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
      // 15/10/2026 — trả về ĐÚNG lô đã lấy (lô lấy sau cùng trả trước).
      const restoredLots = await this.lots.restore(
        doc,
        line.qty,
        netLotsInHand(line.events),
        doc.quantity_on_hand - line.qty,
        session,
      );
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
            lot_allocations: restoredLots,
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
   * MỚI (21/09/2026, BE-4a) — "Đã lấy xong": chỉ cho `picked` khi MỌI
   * SKU đã quét đủ số đặt trong lượt hiện tại. Thiếu → 409 kèm danh sách,
   * nhân viên dùng report-missing (partial) thay vì bấm lấy xong.
   */
  async confirmPicked(
    groupId: string,
    expectedVersion: number,
  ): Promise<OrderGroupDocument> {
    const group = await this.core.loadGroupOrThrow(groupId);
    if (group.fulfillment_status === GroupFulfillmentStatus.PICKING) {
      const ordered = await this.core.getOrderedSkuQuantities(group);
      const picked = await this.core.getPickedSkuQuantities(group);
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
        {
          groupId,
          from: group.fulfillment_status,
          to: GroupFulfillmentStatus.PICKED,
        },
      );
    }
    return this.core.transitionFulfillmentStatus(
      groupId,
      GroupFulfillmentStatus.PICKED,
      expectedVersion,
    );
  }

  /**
   * 21/10/2026 — Giữ chỗ tính trong kho của nhóm đơn, nên quét phải ở đúng kho đó.
   * Nhóm đơn chưa gắn kho (dữ liệu cũ) → gắn kho đang quét. Kho khác kho đã gắn:
   * lượt lấy chưa quét món nào → đổi kho + tính lại giữ chỗ; đã quét → 409, vì giữ
   * chỗ và tồn đã trừ đều nằm ở kho cũ.
   */
  private async ensurePickWarehouse(
    group: OrderGroupDocument,
    warehouseId: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(warehouseId)) return;
    const wid = new Types.ObjectId(warehouseId);
    const current = group.warehouse_id ?? null;
    if (current?.equals(wid)) return;
    if (current) {
      const scanned = await this.pickEventModel.exists({
        order_group_id: group._id,
        ...this.core.roundFilter(group.pick_round),
      });
      if (scanned) {
        throw new AppException(
          ORD_GROUP_ERROR_CODES.WRONG_WAREHOUSE,
          'Nhóm đơn đang lấy hàng ở kho khác (đã quét món trong lượt này) — quét tiếp ở đúng kho đó.',
          HttpStatus.CONFLICT,
          {
            groupId: group._id.toString(),
            expectedWarehouseId: current.toString(),
            warehouseId,
          },
        );
      }
    }
    await this.stockReservationService.setGroupWarehouse(group._id, wid);
    group.warehouse_id = wid;
    await this.core.reconcileReservation(group._id.toString());
  }

  private async findPickEventByClientId(
    clientEventId: string,
  ): Promise<{
    sku: string;
    decrementedBy: number;
    remainingStock: number;
  } | null> {
    const already = await this.pickEventModel.findOne({
      client_event_id: clientEventId,
    });
    if (!already) return null;
    return {
      sku: already.seller_sku,
      decrementedBy: already.scanned_quantity,
      remainingStock: already.remaining_stock_after,
    };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
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

    const group = await this.core.transitionFulfillmentStatus(
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

    // (09/10/2026) Báo cả Packaging Staff — họ (hoặc Admin) là người quyết
    // decide-partial; trước đây chỉ Store Owner được báo nên nhóm nằm chờ.
    for (const recipientRole of [
      UserRole.STORE_OWNER,
      UserRole.PACKAGING_STAFF,
    ]) {
      await this.notificationsService.notify({
        recipientRole,
        type: NotificationType.MISSING_ITEM,
        severity: 'critical',
        title: note ? `${title} — Ghi chú: ${note}` : title,
        message,
        relatedEntityType: 'order_group',
        relatedEntityId: groupId,
      });
    }

    this.logger.warn(
      `Report missing: group ${groupId}, SKU ${sku}, thiếu ${String(missingQuantity)} — đã thông báo Store Owner + Packaging Staff.`,
    );
    return group;
  }

  /**
   * 22/10/2026 — Chia số ĐÃ LẤY của từng SKU cho các đơn trong nhóm, đơn cũ trước. Trả về
   * đơn nào bị thiếu: `{ orderId, items: [{ sku, ordered, shipped }] }` (chỉ đơn có thiếu).
   */
  static allocateShortage(
    orders: {
      _id: unknown;
      items: { sku: string; quantity: number; status?: string }[];
    }[],
    picked: Map<string, number>,
  ): {
    orderId: string;
    items: { sku: string; ordered: number; shipped: number }[];
  }[] {
    const remaining = new Map(picked);
    const out: {
      orderId: string;
      items: { sku: string; ordered: number; shipped: number }[];
    }[] = [];
    for (const order of orders) {
      const perSku = new Map<string, { ordered: number; shipped: number }>();
      for (const item of order.items) {
        if (item.status === OrderStatus.CANCELED) continue;
        const left = remaining.get(item.sku) ?? 0;
        const shipped = Math.min(item.quantity, left);
        remaining.set(item.sku, left - shipped);
        const row = perSku.get(item.sku) ?? { ordered: 0, shipped: 0 };
        row.ordered += item.quantity;
        row.shipped += shipped;
        perSku.set(item.sku, row);
      }
      const items = [...perSku].map(([sku, r]) => ({ sku, ...r }));
      if (items.some((i) => i.shipped < i.ordered))
        out.push({ orderId: String(order._id), items });
    }
    return out;
  }

  private async enqueueShortShipments(
    group: OrderGroupDocument,
  ): Promise<void> {
    if (!this.statusOutboxModel) return;
    const orders = await this.orderModel
      .find({
        consolidated_group_id: group._id,
        status: { $nin: notPackableStatuses() },
      })
      .sort({ created_at: 1, _id: 1 })
      .select('_id items platform origin')
      .lean();
    const picked = await this.core.getPickedSkuQuantities(group);
    const shortages = OrderGroupPickingService.allocateShortage(orders, picked);
    for (const short of shortages) {
      const order = orders.find((o) => String(o._id) === short.orderId);
      if (
        order?.platform !== MarketplacePlatform.AURELLE ||
        order.origin === 'replacement'
      )
        continue;
      await recordActivity(this.activityLogModel, {
        category: 'orders',
        action: 'order.short_shipped',
        summary: `Giao thiếu đơn ${String(order._id).slice(-8)}: ${short.items
          .filter((i) => i.shipped < i.ordered)
          .map((i) => `${i.sku} giao ${String(i.shipped)}/${String(i.ordered)}`)
          .join(', ')}`,
        orderGroupId: group._id,
        entityType: 'order',
        entityId: order._id,
        skus: short.items.map((i) => i.sku),
      });
      await enqueueStatusPush(this.statusOutboxModel, {
        orderGroupId: group._id,
        orderId: order._id,
        status: 'short_shipped',
        reason: 'Kho không đủ hàng — giao phần có sẵn',
        shippedItems: short.items.map((i) => ({
          sku: i.sku,
          shipped_quantity: i.shipped,
        })),
        discriminator: `round${String(group.pick_round)}`,
      });
    }
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
    actorId: string | null = null,
  ): Promise<OrderGroupDocument> {
    if (approve) {
      const picked = await this.core.transitionFulfillmentStatus(
        groupId,
        GroupFulfillmentStatus.PICKED,
        expectedVersion,
      );
      await recordActivity(this.activityLogModel, {
        category: 'picking',
        action: 'order_group.partial_approved',
        summary: 'Thiếu hàng — chọn GIAO PHẦN CÓ SẴN',
        actorId,
        orderGroupId: picked._id,
        entityType: 'order_group',
        entityId: picked._id,
        fromStatus: GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW,
        toStatus: GroupFulfillmentStatus.PICKED,
      });
      // 22/10/2026 — đi tiếp với phần có sẵn = giao thiếu → báo từng đơn AURELLE bị thiếu.
      await this.enqueueShortShipments(picked).catch((error: unknown) => {
        this.logger.error(
          `Báo giao thiếu cho nhóm ${groupId} thất bại: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      return picked;
    }

    // SỬA (21/09/2026, BE-4a): hủy lượt lấy hiện tại → mở LƯỢT MỚI
    // (pick_round + 1) cùng lúc chuyển trạng thái, để lấy lại không bị
    // cộng dồn số đã quét của lượt cũ. Tồn kho KHÔNG tự cộng lại (roadmap
    // BE-4): hàng đã lấy ra phải được kho đối soát/restock tay.
    const group = await this.core.loadGroupOrThrow(groupId);
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
        {
          groupId,
          from: group.fulfillment_status,
          to: GroupFulfillmentStatus.PICKING,
        },
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
        restocked = await this.restockPickRound(
          group,
          group.pick_round,
          session,
        );
        return doc;
      });
    } finally {
      await session.endSession();
    }
    // K5 (main) — lượt mới cần giữ chỗ lại phần đã tiêu ở lượt bị hủy.
    await this.core.reconcileReservation(groupId);
    await recordActivity(this.activityLogModel, {
      actorId,
      category: 'picking',
      action: 'order_group.pick_round_restarted',
      summary: `Thiếu hàng — chọn LẤY LẠI: hủy lượt ${String(group.pick_round)}, mở lượt ${String(result.pick_round)}; nhập lại ${String(restocked.units)} sản phẩm về kệ`,
      orderGroupId: group._id,
      entityType: 'order_group',
      entityId: group._id,
      fromStatus: group.fulfillment_status,
      toStatus: GroupFulfillmentStatus.PICKING,
      quantity: restocked.units,
    });
    this.logger.warn(
      `Group ${groupId} hủy lượt lấy ${String(group.pick_round)} → lượt ${String(result.pick_round)}: đã nhập lại ${String(restocked.units)} sản phẩm vào kho` +
        (restocked.skipped > 0
          ? `; ${String(restocked.skipped)} lần quét cũ chưa lưu kho nên cần kho đối soát tay.`
          : '.'),
    );
    return result;
  }

  /**
   * MỚI (2026-09-10) — chi tiết 1 món hàng riêng lẻ trong group (phục
   * vụ Stepper số lượng/confirm từng item). 🔄 21/09/2026: dùng danh sách
   * LẤY HÀNG (không bắt hồ sơ đóng gói).
   */
  async getPickableItemDetail(
    groupId: string,
    sku: string,
  ): Promise<PickableItem> {
    const { items } = await this.core.getPickableItemsForGroup(groupId);
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
}
