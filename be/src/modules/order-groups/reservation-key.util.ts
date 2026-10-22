import { ClientSession, Model, Types } from 'mongoose';
import {
  StockReservationDocument,
  StockReservationTotalDocument,
} from './schemas/stock-reservation.schema';

/**
 * 21/10/2026 — Id document tổng giữ chỗ (`stock_reservation_totals`).
 * Giữ chỗ tính THEO KHO: id = "<warehouse_id>|<khóa tồn>". Giữ chỗ cũ (tạo trước khi
 * nhóm đơn gắn kho) không có kho → id = khóa tồn như trước, nên dữ liệu cũ đọc đúng.
 */
export function reservationTotalId(stockKey: string, warehouseId?: Types.ObjectId | null): string {
  return warehouseId ? `${warehouseId.toString()}|${stockKey}` : stockKey;
}

export interface ReservationModels {
  reservationModel: Model<StockReservationDocument>;
  totalModel: Model<StockReservationTotalDocument>;
}

/**
 * 21/10/2026 — Chuyển giữ chỗ sang khóa tồn mới, CÙNG transaction với thao tác đổi khóa
 * (nối SKU sàn → SKU nội bộ, bỏ nối, thay SKU nội bộ). Không chuyển thì phần đang giữ
 * nằm lại ở khóa cũ: quét hàng không trừ được, lần tính lại giữ thêm lần nữa ở khóa mới.
 *  - Trừ phần đang giữ khỏi tổng của khóa cũ, cộng vào tổng của khóa mới (cùng kho).
 *  - Nhóm đơn đã có giữ chỗ ở khóa mới → GỘP số lượng vào dòng đó, xóa dòng cũ.
 * Hàm thuần nhận model (master-skus dùng được mà không phải import module order-groups).
 * Trả số dòng giữ chỗ đã chuyển.
 */
export async function moveReservations(
  models: ReservationModels,
  rows: StockReservationDocument[],
  toKey: string,
  toMasterSku: string | null,
  session: ClientSession,
): Promise<number> {
  let moved = 0;
  for (const row of rows) {
    if (row.stock_key === toKey) continue;
    const warehouseId = row.warehouse_id ?? null;
    const reserved = row.status === 'active' ? row.quantity_reserved : 0;
    const target = await models.reservationModel
      .findOne({ order_group_id: row.order_group_id, stock_key: toKey })
      .session(session);
    // Gộp vào dòng sẵn có → phần giữ chỗ phải nằm cùng tổng (cùng kho) với dòng đó.
    const destWarehouseId = target ? (target.warehouse_id ?? null) : warehouseId;
    if (reserved > 0) {
      await models.totalModel.updateOne(
        { _id: reservationTotalId(row.stock_key, warehouseId) },
        { $inc: { reserved: -reserved }, $set: { touched_at: new Date() } },
        { session },
      );
      await models.totalModel.updateOne(
        { _id: reservationTotalId(toKey, destWarehouseId) },
        { $inc: { reserved }, $set: { touched_at: new Date(), stock_key: toKey, warehouse_id: destWarehouseId } },
        { upsert: true, session },
      );
    }
    if (target) {
      await models.reservationModel.updateOne(
        { _id: target._id },
        {
          $inc: {
            quantity_needed: row.quantity_needed,
            quantity_picked: row.quantity_picked,
            quantity_reserved: reserved,
          },
          $set: {
            master_sku: toMasterSku,
            status: target.status === 'active' || reserved > 0 ? 'active' : target.status,
          },
        },
        { session },
      );
      await models.reservationModel.deleteOne({ _id: row._id }, { session });
    } else {
      await models.reservationModel.updateOne(
        { _id: row._id },
        { $set: { stock_key: toKey, master_sku: toMasterSku } },
        { session },
      );
    }
    moved += 1;
  }
  return moved;
}
