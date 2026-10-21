import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { StockReservation, StockReservationDocument, StockReservationTotal, StockReservationTotalDocument } from './schemas/stock-reservation.schema';
import { OrderGroup, OrderGroupDocument } from './schemas/order-group.schema';
import { SkuBinAssignment, SkuBinAssignmentDocument } from '../warehouse/schemas/sku-bin-assignment.schema';
import { Warehouse, WarehouseDocument } from '../warehouse/schemas/warehouse.schema';
import { MarketplaceSkuMapping, MarketplaceSkuMappingDocument } from '../master-skus/schemas/marketplace-sku-mapping.schema';
import { resolveMasterSkus, stockFilterFor, stockKeyOf } from '../master-skus/stock-key.util';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { reservationTotalId } from './reservation-key.util';

export interface ShortageItem { sku: string; needed: number; reserved: number; shortage: number }

interface KeyedItem { key: string; master: string | undefined; sku: string; quantity: number }

/**
 * ===================================================================
 * K5 (27/09/2026) — CHỐNG BÁN LỐ: tồn khả dụng + giữ chỗ
 * ===================================================================
 *   tồn thực      = tổng quantity_on_hand của khóa tồn TRONG KHO của nhóm đơn
 *   đã giữ        = stock_reservation_totals.reserved (theo kho + khóa)
 *   tồn khả dụng  = tồn thực − đã giữ
 * Giữ chỗ NGAY khi nhóm đơn được tạo (và tính lại khi có đơn gộp đến muộn).
 * Không đủ -> giữ phần có được + gắn cờ stock_shortage lên nhóm đơn NGAY TỪ ĐẦU.
 * pick-item tiêu phần đã giữ (cùng transaction); nhóm đơn "picked" -> nhả phần dư.
 * Khóa tồn theo K4b: SKU đã nối -> SKU nội bộ (chung mọi sàn); chưa nối -> SKU sàn.
 *
 * 21/10/2026 — GIỮ CHỖ THEO KHO. Trước đây tồn thực cộng MỌI kho trong khi quét chỉ trừ
 * ở 1 kho → báo "đủ hàng" rồi quét bị 409. Nay nhóm đơn gắn 1 kho (`order_groups.warehouse_id`,
 * tự chọn lần giữ chỗ đầu), tồn và tổng đang giữ đều tính trong kho đó. Giữ chỗ cũ chưa có
 * kho được chuyển sang kho của nhóm ở lần tính lại kế tiếp.
 * ===================================================================
 */
@Injectable()
export class StockReservationService {
  private readonly logger = new Logger(StockReservationService.name);

  constructor(
    @InjectModel(StockReservation.name) private readonly reservationModel: Model<StockReservationDocument>,
    @InjectModel(StockReservationTotal.name) private readonly totalModel: Model<StockReservationTotalDocument>,
    @InjectModel(OrderGroup.name) private readonly groupModel: Model<OrderGroupDocument>,
    @InjectModel(SkuBinAssignment.name) private readonly assignmentModel: Model<SkuBinAssignmentDocument>,
    @InjectModel(MarketplaceSkuMapping.name) private readonly mappingModel: Model<MarketplaceSkuMappingDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly notificationsService: NotificationsService,
    // 21/10/2026 — chọn kho cho nhóm đơn. @Optional: test cũ không có → giữ chỗ trên mọi kho như trước.
    @Optional() @InjectModel(Warehouse.name) private readonly warehouseModel?: Model<WarehouseDocument>,
  ) {}

  /** Giữ chỗ / tính lại cho 1 nhóm đơn theo danh sách hàng HIỆN TẠI của nó. */
  async reconcile(group: { _id: Types.ObjectId; platform: MarketplacePlatform; shop_id: string }, items: { sku: string; quantity: number }[]): Promise<ShortageItem[]> {
    const masters = await resolveMasterSkus(this.mappingModel, group.platform, group.shop_id, items.map((i) => i.sku));
    // Gom theo khóa tồn: 2 SKU sàn cùng nối 1 SKU nội bộ là CÙNG một phần tồn.
    const byKey = new Map<string, KeyedItem>();
    for (const item of items) {
      const master = masters.get(item.sku);
      const key = stockKeyOf(master, group.platform, group.shop_id, item.sku);
      const entry = byKey.get(key);
      if (entry) entry.quantity += item.quantity;
      else byKey.set(key, { key, master, sku: item.sku, quantity: item.quantity });
    }
    const warehouseId = await this.ensureWarehouse(group, [...byKey.values()]);

    const shortages: ShortageItem[] = [];
    for (const entry of byKey.values()) {
      const r = await this.runTx(async (session) => {
        const totalId = reservationTotalId(entry.key, warehouseId);
        // "Chạm" document tổng -> tạo xung đột ghi nếu có giao dịch khác cùng khóa.
        const total = await this.totalModel.findOneAndUpdate(
          { _id: totalId },
          { $set: { touched_at: new Date(), stock_key: entry.key, warehouse_id: warehouseId }, $setOnInsert: { reserved: 0 } },
          { upsert: true, returnDocument: 'after', session },
        );
        const existing = await this.reservationModel.findOne({ order_group_id: group._id, stock_key: entry.key }).session(session);
        const picked = existing?.quantity_picked ?? 0;
        const activeMine = existing?.status === 'active' ? existing.quantity_reserved : 0;
        let mine = activeMine;
        // Giữ chỗ đang nằm ở tổng khác (giữ chỗ cũ chưa có kho) → trả về tổng cũ, giữ lại ở kho của nhóm.
        const existingTotalId = existing ? reservationTotalId(entry.key, existing.warehouse_id ?? null) : totalId;
        if (existingTotalId !== totalId) {
          if (activeMine > 0) {
            await this.totalModel.updateOne({ _id: existingTotalId }, { $inc: { reserved: -activeMine }, $set: { touched_at: new Date() } }, { session });
          }
          mine = 0;
        }
        const onHand = await this.onHand(entry.master, group.platform, group.shop_id, entry.sku, warehouseId, session);
        const target = Math.max(0, entry.quantity - picked);
        const available = Math.max(0, onHand - (total.reserved - mine));
        const newReserved = Math.min(target, available);
        await this.totalModel.updateOne({ _id: totalId }, { $inc: { reserved: newReserved - mine } }, { session });
        await this.reservationModel.updateOne(
          { order_group_id: group._id, stock_key: entry.key },
          {
            $set: { quantity_needed: entry.quantity, quantity_reserved: newReserved, status: 'active', master_sku: entry.master ?? null, warehouse_id: warehouseId },
            $setOnInsert: { platform: group.platform, shop_id: group.shop_id, seller_sku: entry.sku, quantity_picked: 0 },
          },
          { upsert: true, session },
        );
        return { needed: target, reserved: newReserved };
      });
      if (r.reserved < r.needed) shortages.push({ sku: entry.sku, needed: r.needed, reserved: r.reserved, shortage: r.needed - r.reserved });
    }
    // 21/10/2026 — món không còn trong nhóm (đơn hủy một phần, SKU đổi khóa) → nhả phần đang giữ.
    await this.releaseKeysNotIn(group._id, new Set(byKey.keys()));

    const before = await this.groupModel.findOneAndUpdate({ _id: group._id }, { $set: { stock_shortage: shortages.length > 0, stock_shortage_items: shortages } });
    // Chỉ báo khi CHUYỂN từ "đủ hàng" sang "thiếu hàng" — bấm Tính lại nhiều lần không spam chuông.
    if (shortages.length > 0 && before?.stock_shortage !== true) {
      try {
        await this.notificationsService.notify({
          recipientRole: UserRole.STORE_OWNER, type: NotificationType.STOCK_SHORTAGE, severity: 'critical',
          title: 'Nhóm đơn thiếu hàng ngay khi tạo',
          message: shortages.map((x) => `${x.sku}: cần ${String(x.needed)}, giữ được ${String(x.reserved)}`).join('; '),
          relatedEntityType: 'order_group', relatedEntityId: group._id.toString(),
        });
      } catch (error) {
        this.logger.warn('Gửi thông báo thiếu hàng thất bại.', error);
      }
    }
    if (shortages.length > 0) this.logger.warn(`Nhóm đơn ${group._id.toString()} THIẾU HÀNG ngay khi tạo: ${shortages.map((s) => `${s.sku} thiếu ${String(s.shortage)}`).join(', ')}`);
    return shortages;
  }

  /**
   * 21/10/2026 — Đổi kho lấy hàng của nhóm đơn (nhân viên lấy ở kho khác kho hệ thống chọn).
   * Chỉ khi lượt hiện tại CHƯA quét món nào (caller kiểm tra); giữ chỗ tính lại ở caller.
   */
  async setGroupWarehouse(groupId: Types.ObjectId, warehouseId: Types.ObjectId): Promise<void> {
    await this.groupModel.updateOne({ _id: groupId }, { $set: { warehouse_id: warehouseId } });
  }

  /** Gọi TRONG transaction của pick-item: tiêu phần đã giữ tương ứng số vừa quét. */
  async consume(groupId: string, stockKey: string, quantity: number, session: ClientSession): Promise<void> {
    const res = await this.reservationModel.findOne({ order_group_id: new Types.ObjectId(groupId), stock_key: stockKey, status: 'active' }).session(session);
    if (!res) return; // nhóm đơn tạo trước K5 — không có giữ chỗ
    const take = Math.min(quantity, res.quantity_reserved);
    await this.reservationModel.updateOne({ _id: res._id }, { $inc: { quantity_reserved: -take, quantity_picked: quantity } }, { session });
    if (take > 0) await this.totalModel.updateOne({ _id: reservationTotalId(stockKey, res.warehouse_id ?? null) }, { $inc: { reserved: -take } }, { session });
  }

  /**
   * (05/10/2026) Bớt `quantity_picked` khi món đã lấy rời giỏ đóng gói (món hỏng bị
   * loại, trả kệ khi tháo kiện / đơn hủy). Không có thì `reconcile` tính
   * "cần giữ = đặt − đã lấy" theo số cũ → món thay không được giữ chỗ. Áp mọi
   * trạng thái giữ chỗ, không xuống dưới 0; không đụng phần đang giữ (reconcile lo).
   */
  async unconsume(groupId: string, stockKey: string, quantity: number, session: ClientSession): Promise<void> {
    if (quantity <= 0) return;
    await this.reservationModel.updateOne(
      { order_group_id: new Types.ObjectId(groupId), stock_key: stockKey },
      [{ $set: { quantity_picked: { $max: [0, { $subtract: ['$quantity_picked', quantity] }] } } }],
      { session },
    );
  }

  /**
   * (05/10/2026) Ghi nhận món vừa lấy thêm (món thay lúc đóng gói). Giữ chỗ còn
   * hoạt động → tiêu như quét thường; đã nhả (nhóm đã picked) → chỉ cộng bộ đếm
   * "đã lấy" để lần reconcile sau không giữ thừa.
   */
  async recordPicked(groupId: string, stockKey: string, quantity: number, session: ClientSession): Promise<void> {
    const res = await this.reservationModel
      .findOne({ order_group_id: new Types.ObjectId(groupId), stock_key: stockKey })
      .session(session);
    if (!res) return;
    if (res.status === 'active') {
      await this.consume(groupId, stockKey, quantity, session);
      return;
    }
    await this.reservationModel.updateOne({ _id: res._id }, { $inc: { quantity_picked: quantity } }, { session });
  }

  /** Nhả toàn bộ phần còn giữ của nhóm đơn (đã lấy xong / hủy). Idempotent. */
  async releaseGroup(groupId: string): Promise<number> {
    const gid = new Types.ObjectId(groupId);
    const active = await this.reservationModel.find({ order_group_id: gid, status: 'active' });
    let released = 0;
    for (const res of active) released += await this.releaseOne(res._id);
    await this.groupModel.updateOne({ _id: gid }, { $set: { stock_shortage: false, stock_shortage_items: [] } });
    return released;
  }

  async listForGroup(groupId: string): Promise<StockReservationDocument[]> {
    return this.reservationModel.find({ order_group_id: new Types.ObjectId(groupId) }).sort({ seller_sku: 1 });
  }

  /**
   * Tồn thực / đã giữ / khả dụng cho 1 SKU sàn (tự tra K4b) — MỌI kho (dùng để đẩy tồn sang sàn).
   * (21/10/2026) `managed` = kho OptiPack đã có ít nhất 1 dòng tồn (ô) cho SKU này,
   * kể cả đang 0 — chỉ SKU managed mới được đẩy tồn sang sàn (tránh xoá về 0 tồn
   * của SKU mà kho chưa từng nhập, website vẫn đang tự quản).
   */
  async availability(platform: MarketplacePlatform, shopId: string, sellerSku: string): Promise<{ stockKey: string; masterSku: string | null; onHand: number; reserved: number; available: number; managed: boolean }> {
    const master = (await resolveMasterSkus(this.mappingModel, platform, shopId, [sellerSku])).get(sellerSku);
    const key = stockKeyOf(master, platform, shopId, sellerSku);
    const onHand = await this.onHand(master, platform, shopId, sellerSku, null);
    const managed = onHand > 0 || (await this.assignmentModel.exists(stockFilterFor(master, platform, shopId, sellerSku))) !== null;
    // Tổng theo kho (`stock_key`) + tổng cũ chưa có kho (`_id` = khóa).
    const totals = await this.totalModel.find({ $or: [{ _id: key }, { stock_key: key }] }).select('reserved').lean();
    const reserved = totals.reduce((sum, t) => sum + t.reserved, 0);
    return { stockKey: key, masterSku: master ?? null, onHand, reserved, available: Math.max(0, onHand - reserved), managed };
  }

  /**
   * 21/10/2026 — Kho lấy hàng của nhóm đơn. Đã có thì dùng; chưa có thì chọn:
   * 1 kho đang hoạt động → kho đó; nhiều kho → kho giữ chỗ được nhiều đơn vị nhất
   * (hòa thì mã kho nhỏ hơn). Không có kho nào → null (giữ chỗ trên mọi kho như cũ).
   */
  private async ensureWarehouse(group: { _id: Types.ObjectId; platform: MarketplacePlatform; shop_id: string }, entries: KeyedItem[]): Promise<Types.ObjectId | null> {
    const current = await this.groupModel.findById(group._id).select('warehouse_id').lean();
    if (current?.warehouse_id) return current.warehouse_id;
    if (!this.warehouseModel) return null;
    const warehouses = await this.warehouseModel.find({ is_active: { $ne: false } }).select('_id warehouse_code').sort({ warehouse_code: 1 }).lean();
    const first = warehouses.at(0);
    if (!first) return null;
    let chosen = first._id;
    if (warehouses.length > 1) {
      let best = -1;
      for (const wh of warehouses) {
        let score = 0;
        for (const entry of entries) {
          const onHand = await this.onHand(entry.master, group.platform, group.shop_id, entry.sku, wh._id);
          const total = await this.totalModel.findById(reservationTotalId(entry.key, wh._id)).select('reserved').lean();
          score += Math.min(entry.quantity, Math.max(0, onHand - (total?.reserved ?? 0)));
        }
        if (score > best) {
          best = score;
          chosen = wh._id;
        }
      }
    }
    // Chỉ ghi khi chưa có — 2 lần tính lại đồng thời cùng chọn thì bên sau đọc lại kết quả bên trước.
    await this.groupModel.updateOne({ _id: group._id, warehouse_id: { $in: [null] } }, { $set: { warehouse_id: chosen } });
    const after = await this.groupModel.findById(group._id).select('warehouse_id').lean();
    return after?.warehouse_id ?? chosen;
  }

  /** Nhả giữ chỗ đang hoạt động của các khóa không còn trong nhóm đơn. */
  private async releaseKeysNotIn(groupId: Types.ObjectId, keys: Set<string>): Promise<void> {
    const active = await this.reservationModel.find({ order_group_id: groupId, status: 'active' }).select('_id stock_key').lean();
    for (const res of active) {
      if (keys.has(res.stock_key)) continue;
      await this.releaseOne(res._id, { quantity_needed: 0 });
    }
  }

  private async releaseOne(id: Types.ObjectId, extraSet: Record<string, unknown> = {}): Promise<number> {
    return this.runTx(async (session) => {
      const r = await this.reservationModel.findOneAndUpdate(
        { _id: id, status: 'active' }, { $set: { status: 'released', quantity_reserved: 0, ...extraSet } }, { session },
      );
      if (r && r.quantity_reserved > 0) {
        await this.totalModel.updateOne({ _id: reservationTotalId(r.stock_key, r.warehouse_id ?? null) }, { $inc: { reserved: -r.quantity_reserved } }, { session });
        return r.quantity_reserved;
      }
      return 0;
    });
  }

  private async onHand(master: string | undefined, platform: string, shopId: string, sku: string, warehouseId: Types.ObjectId | null, session?: ClientSession): Promise<number> {
    const agg = this.assignmentModel.aggregate<{ total: number }>([
      { $match: { ...stockFilterFor(master, platform, shopId, sku), ...(warehouseId ? { warehouse_id: warehouseId } : {}) } },
      { $group: { _id: null, total: { $sum: '$quantity_on_hand' } } },
    ]);
    if (session) agg.session(session);
    const [row] = await agg;
    return row?.total ?? 0;
  }

  private async runTx<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result as T;
    } finally {
      await session.endSession();
    }
  }
}
