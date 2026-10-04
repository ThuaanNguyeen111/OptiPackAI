import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { StockReservation, StockReservationDocument, StockReservationTotal, StockReservationTotalDocument } from './schemas/stock-reservation.schema';
import { OrderGroup, OrderGroupDocument } from './schemas/order-group.schema';
import { SkuBinAssignment, SkuBinAssignmentDocument } from '../warehouse/schemas/sku-bin-assignment.schema';
import { MarketplaceSkuMapping, MarketplaceSkuMappingDocument } from '../master-skus/schemas/marketplace-sku-mapping.schema';
import { resolveMasterSkus, stockFilterFor, stockKeyOf } from '../master-skus/stock-key.util';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

export interface ShortageItem { sku: string; needed: number; reserved: number; shortage: number }

/**
 * ===================================================================
 * K5 (27/09/2026) — CHỐNG BÁN LỐ: tồn khả dụng + giữ chỗ
 * ===================================================================
 *   tồn thực      = tổng quantity_on_hand của khóa tồn (mọi kho, mọi ô)
 *   đã giữ        = stock_reservation_totals.reserved
 *   tồn khả dụng  = tồn thực − đã giữ
 * Giữ chỗ NGAY khi nhóm đơn được tạo (và tính lại khi có đơn gộp đến muộn).
 * Không đủ -> giữ phần có được + gắn cờ stock_shortage lên nhóm đơn NGAY TỪ ĐẦU.
 * pick-item tiêu phần đã giữ (cùng transaction); nhóm đơn "picked" -> nhả phần dư.
 * Khóa tồn theo K4b: SKU đã nối -> SKU nội bộ (chung mọi sàn); chưa nối -> SKU sàn.
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
  ) {}

  /** Giữ chỗ / tính lại cho 1 nhóm đơn theo danh sách hàng HIỆN TẠI của nó. */
  async reconcile(group: { _id: Types.ObjectId; platform: MarketplacePlatform; shop_id: string }, items: { sku: string; quantity: number }[]): Promise<ShortageItem[]> {
    const masters = await resolveMasterSkus(this.mappingModel, group.platform, group.shop_id, items.map((i) => i.sku));
    const shortages: ShortageItem[] = [];
    for (const item of items) {
      const master = masters.get(item.sku);
      const key = stockKeyOf(master, group.platform, group.shop_id, item.sku);
      const r = await this.runTx(async (session) => {
        // "Chạm" document tổng -> tạo xung đột ghi nếu có giao dịch khác cùng khóa.
        const total = await this.totalModel.findOneAndUpdate(
          { _id: key }, { $set: { touched_at: new Date() }, $setOnInsert: { reserved: 0 } }, { upsert: true, returnDocument: 'after', session },
        );
        const onHand = await this.onHand(master, group.platform, group.shop_id, item.sku, session);
        const existing = await this.reservationModel.findOne({ order_group_id: group._id, stock_key: key }).session(session);
        const picked = existing?.quantity_picked ?? 0;
        const mine = existing?.status === 'active' ? existing.quantity_reserved : 0;
        const target = Math.max(0, item.quantity - picked);
        const available = Math.max(0, onHand - (total.reserved - mine));
        const newReserved = Math.min(target, available);
        await this.totalModel.updateOne({ _id: key }, { $inc: { reserved: newReserved - mine } }, { session });
        await this.reservationModel.updateOne(
          { order_group_id: group._id, stock_key: key },
          {
            $set: { quantity_needed: item.quantity, quantity_reserved: newReserved, status: 'active', master_sku: master ?? null },
            $setOnInsert: { platform: group.platform, shop_id: group.shop_id, seller_sku: item.sku, quantity_picked: 0 },
          },
          { upsert: true, session },
        );
        return { needed: target, reserved: newReserved };
      });
      if (r.reserved < r.needed) shortages.push({ sku: item.sku, needed: r.needed, reserved: r.reserved, shortage: r.needed - r.reserved });
    }
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

  /** Gọi TRONG transaction của pick-item: tiêu phần đã giữ tương ứng số vừa quét. */
  async consume(groupId: string, stockKey: string, quantity: number, session: ClientSession): Promise<void> {
    const res = await this.reservationModel.findOne({ order_group_id: new Types.ObjectId(groupId), stock_key: stockKey, status: 'active' }).session(session);
    if (!res) return; // nhóm đơn tạo trước K5 — không có giữ chỗ
    const take = Math.min(quantity, res.quantity_reserved);
    await this.reservationModel.updateOne({ _id: res._id }, { $inc: { quantity_reserved: -take, quantity_picked: quantity } }, { session });
    if (take > 0) await this.totalModel.updateOne({ _id: stockKey }, { $inc: { reserved: -take } }, { session });
  }

  /** Nhả toàn bộ phần còn giữ của nhóm đơn (đã lấy xong / hủy). Idempotent. */
  async releaseGroup(groupId: string): Promise<number> {
    const gid = new Types.ObjectId(groupId);
    const active = await this.reservationModel.find({ order_group_id: gid, status: 'active' });
    let released = 0;
    for (const res of active) {
      await this.runTx(async (session) => {
        const r = await this.reservationModel.findOneAndUpdate(
          { _id: res._id, status: 'active' }, { $set: { status: 'released', quantity_reserved: 0 } }, { session },
        );
        if (r && r.quantity_reserved > 0) {
          await this.totalModel.updateOne({ _id: r.stock_key }, { $inc: { reserved: -r.quantity_reserved } }, { session });
          released += r.quantity_reserved;
        }
      });
    }
    await this.groupModel.updateOne({ _id: gid }, { $set: { stock_shortage: false, stock_shortage_items: [] } });
    return released;
  }

  async listForGroup(groupId: string): Promise<StockReservationDocument[]> {
    return this.reservationModel.find({ order_group_id: new Types.ObjectId(groupId) }).sort({ seller_sku: 1 });
  }

  /** Tồn thực / đã giữ / khả dụng cho 1 SKU sàn (tự tra K4b). */
  async availability(platform: MarketplacePlatform, shopId: string, sellerSku: string): Promise<{ stockKey: string; masterSku: string | null; onHand: number; reserved: number; available: number }> {
    const master = (await resolveMasterSkus(this.mappingModel, platform, shopId, [sellerSku])).get(sellerSku);
    const key = stockKeyOf(master, platform, shopId, sellerSku);
    const onHand = await this.onHand(master, platform, shopId, sellerSku);
    const total = await this.totalModel.findById(key).lean();
    const reserved = total?.reserved ?? 0;
    return { stockKey: key, masterSku: master ?? null, onHand, reserved, available: Math.max(0, onHand - reserved) };
  }

  private async onHand(master: string | undefined, platform: string, shopId: string, sku: string, session?: ClientSession): Promise<number> {
    const agg = this.assignmentModel.aggregate<{ total: number }>([
      { $match: stockFilterFor(master, platform, shopId, sku) },
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
