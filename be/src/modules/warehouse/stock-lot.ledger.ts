import { ClientSession, Model, Types } from 'mongoose';
import { LotAllocation, StockLotDocument, StockLotSource } from './schemas/stock-lot.schema';

/** Các field của 1 dòng tồn (sku_bin_assignments) mà sổ lô cần. */
export interface LotAssignmentRef {
  _id: Types.ObjectId;
  warehouse_id: Types.ObjectId;
  bin_location_id: Types.ObjectId;
  platform: string;
  shop_id: string;
  seller_sku: string;
  master_sku?: string | null;
  created_at?: Date;
}

export interface OldestLotInfo {
  lot_code: string;
  received_at: Date;
  quantity_remaining: number;
}

/** Mã lô dự phòng cho tồn có từ trước khi có lô (dữ liệu cũ). */
export const OPENING_LOT_CODE = 'TON-DAU-KY';

/** Chuỗi đã trim; rỗng → null. */
export function trimOrNull(value: string | undefined | null): string | null {
  const t = value?.trim();
  if (!t) return null; // chuỗi rỗng cũng coi là không nhập (`??` không bắt '')
  return t;
}

/** `PN-251015-7KQ2` — dùng cho mã phiếu nhập và mã lô mặc định. */
export function generateLotCode(prefix: string, at: Date = new Date()): string {
  const yy = String(at.getFullYear() % 100).padStart(2, '0');
  const mm = String(at.getMonth() + 1).padStart(2, '0');
  const dd = String(at.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 36 ** 4).toString(36).toUpperCase().padStart(4, '0');
  return `${prefix}-${yy}${mm}${dd}-${rand}`;
}

/**
 * Từ các pick_event của 1 dòng (kho + ô + SKU) tính ra các lô CÒN đang nằm trong
 * giỏ (đã lấy ra − đã trả/bỏ), mới nhất trước — lô lấy sau cùng được trả trước.
 * Event dương mang lô đã trừ; event âm mang lô đã trả/bỏ.
 */
export function netLotsInHand(
  events: { scanned_quantity: number; lot_allocations?: LotAllocation[] | null }[],
): LotAllocation[] {
  const net = new Map<string, LotAllocation>();
  for (const e of events) {
    const sign = e.scanned_quantity >= 0 ? 1 : -1;
    for (const a of e.lot_allocations ?? []) {
      const key = a.lot_id.toString();
      const cur = net.get(key) ?? { lot_id: a.lot_id, lot_code: a.lot_code, received_at: a.received_at, quantity: 0 };
      cur.quantity += sign * a.quantity;
      net.set(key, cur);
    }
  }
  return [...net.values()]
    .filter((a) => a.quantity > 0)
    .sort((x, y) => new Date(y.received_at).getTime() - new Date(x.received_at).getTime());
}

/** Lấy `quantity` từ danh sách lô (theo thứ tự đã sắp). Phần không đủ lô → `unknown`. */
export function takeFromLots(lots: LotAllocation[], quantity: number): { allocations: LotAllocation[]; unknown: number } {
  const allocations: LotAllocation[] = [];
  let left = quantity;
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(left, lot.quantity);
    if (take <= 0) continue;
    allocations.push({ lot_id: lot.lot_id, lot_code: lot.lot_code, received_at: lot.received_at, quantity: take });
    left -= take;
  }
  return { allocations, unknown: left };
}

/**
 * ===================================================================
 * SỔ LÔ HÀNG — 15/10/2026 (FIFO theo ngày nhập kho)
 * ===================================================================
 * Gọi TRONG transaction của nơi đang đổi `quantity_on_hand` (bất biến Σ lô =
 * quantity_on_hand phải giữ cùng lúc). Đặt ở dạng lớp nhận model để warehouse,
 * order-groups, master-skus dùng chung mà không import module của nhau.
 *
 * Không có model (unit test cũ không đăng ký `stock_lots`) → mọi hàm là no-op,
 * hành vi giống hệt trước khi có lô.
 * ===================================================================
 */
export class StockLotLedger {
  constructor(private readonly model?: Model<StockLotDocument>) {}

  get enabled(): boolean {
    return this.model !== undefined;
  }

  /**
   * Bù lô `opening` nếu tổng lô < tồn của dòng TRƯỚC thao tác (dòng tồn có từ
   * trước khi có lô). Ngày lô = ngày tạo dòng tồn → luôn được xuất trước hàng mới.
   */
  async ensureCovers(a: LotAssignmentRef, quantityOnHandBefore: number, session: ClientSession): Promise<void> {
    if (!this.model || quantityOnHandBefore <= 0) return;
    const [row] = await this.model
      .aggregate<{ total: number }>([
        { $match: { assignment_id: a._id } },
        { $group: { _id: null, total: { $sum: '$quantity_remaining' } } },
      ])
      .session(session);
    const missing = quantityOnHandBefore - (row?.total ?? 0);
    if (missing <= 0) return;
    await this.model.create(
      [
        {
          ...this.base(a),
          lot_code: OPENING_LOT_CODE,
          received_at: a.created_at ?? new Date(),
          quantity_received: missing,
          quantity_remaining: missing,
          source: 'opening',
          receipt_id: null,
          note: 'Tồn có trước khi theo dõi lô',
        },
      ],
      { session },
    );
  }

  /** Tạo 1 lô mới (nhập hàng, tồn ban đầu, kiểm kê thừa, hàng hoàn). */
  async add(
    a: LotAssignmentRef,
    input: { quantity: number; receivedAt: Date; source: StockLotSource; lotCode?: string; receiptId?: Types.ObjectId | null; note?: string | null },
    quantityOnHandBefore: number,
    session: ClientSession,
  ): Promise<LotAllocation[]> {
    if (!this.model || input.quantity <= 0) return [];
    await this.ensureCovers(a, quantityOnHandBefore, session);
    const lotCode = input.lotCode ?? generateLotCode('LOT', input.receivedAt);
    const [lot] = await this.model.create(
      [
        {
          ...this.base(a),
          lot_code: lotCode,
          received_at: input.receivedAt,
          quantity_received: input.quantity,
          quantity_remaining: input.quantity,
          source: input.source,
          receipt_id: input.receiptId ?? null,
          note: input.note ?? null,
        },
      ],
      { session },
    );
    if (!lot) throw new Error('Tạo lô hàng không trả về document');
    return [{ lot_id: lot._id, lot_code: lotCode, received_at: input.receivedAt, quantity: input.quantity }];
  }

  /**
   * Trừ `quantity` theo FIFO (lô nhập sớm nhất trước). `quantityOnHandBefore` = tồn
   * của dòng TRƯỚC khi trừ. Trừ từng lô có điều kiện `$gte`; xung đột đồng thời đã
   * được chặn ở dòng tồn (cùng transaction) nên ở đây không đủ lô = dữ liệu lệch.
   */
  async consume(a: LotAssignmentRef, quantity: number, quantityOnHandBefore: number, session: ClientSession): Promise<LotAllocation[]> {
    if (!this.model || quantity <= 0) return [];
    await this.ensureCovers(a, quantityOnHandBefore, session);
    const lots = await this.model
      .find({ assignment_id: a._id, quantity_remaining: { $gt: 0 } })
      .sort({ received_at: 1, _id: 1 })
      .session(session)
      .lean();
    const allocations: LotAllocation[] = [];
    let left = quantity;
    for (const lot of lots) {
      if (left <= 0) break;
      const take = Math.min(left, lot.quantity_remaining);
      const res = await this.model.updateOne(
        { _id: lot._id, quantity_remaining: { $gte: take } },
        { $inc: { quantity_remaining: -take } },
        { session },
      );
      if (res.modifiedCount === 0) throw new Error(`Lô ${lot.lot_code} vừa thay đổi trong lúc trừ hàng`);
      allocations.push({ lot_id: lot._id, lot_code: lot.lot_code, received_at: lot.received_at, quantity: take });
      left -= take;
    }
    if (left > 0) throw new Error(`Tổng lô của dòng tồn ${a._id.toString()} thiếu ${String(left)} so với tồn`);
    return allocations;
  }

  /**
   * Đưa hàng vào dòng `a` giữ NGUYÊN mã lô + ngày nhập (chuyển ô, gộp tồn K4b).
   * Cùng mã + ngày trên cùng dòng → cộng dồn vào lô đã có.
   */
  async deposit(a: LotAssignmentRef, allocations: LotAllocation[], quantityOnHandBefore: number, session: ClientSession): Promise<LotAllocation[]> {
    if (!this.model || allocations.length === 0) return [];
    await this.ensureCovers(a, quantityOnHandBefore, session);
    const out: LotAllocation[] = [];
    for (const alloc of allocations) {
      if (alloc.quantity <= 0) continue;
      const lot = await this.model.findOneAndUpdate(
        { assignment_id: a._id, lot_code: alloc.lot_code, received_at: alloc.received_at },
        {
          $inc: { quantity_received: alloc.quantity, quantity_remaining: alloc.quantity },
          $setOnInsert: { ...this.baseWithoutKey(a), source: 'transfer', receipt_id: null, note: null },
        },
        { upsert: true, returnDocument: 'after', session },
      );
      out.push({ lot_id: lot._id, lot_code: alloc.lot_code, received_at: alloc.received_at, quantity: alloc.quantity });
    }
    return out;
  }

  /**
   * Trả hàng về kệ: cộng vào ĐÚNG lô đã lấy (`preferred`, lô thuộc dòng khác bị bỏ qua).
   * Phần không rõ lô → lô cũ nhất của dòng; dòng chưa có lô → lô `return` ngày hiện tại.
   */
  async restore(
    a: LotAssignmentRef,
    quantity: number,
    preferred: LotAllocation[],
    quantityOnHandBefore: number,
    session: ClientSession,
  ): Promise<LotAllocation[]> {
    if (!this.model || quantity <= 0) return [];
    await this.ensureCovers(a, quantityOnHandBefore, session);
    const out: LotAllocation[] = [];
    let left = quantity;
    for (const alloc of preferred) {
      if (left <= 0) break;
      const take = Math.min(left, alloc.quantity);
      if (take <= 0) continue;
      const res = await this.model.updateOne(
        { _id: alloc.lot_id, assignment_id: a._id },
        { $inc: { quantity_remaining: take } },
        { session },
      );
      if (res.matchedCount === 0) continue;
      out.push({ lot_id: alloc.lot_id, lot_code: alloc.lot_code, received_at: alloc.received_at, quantity: take });
      left -= take;
    }
    if (left > 0) {
      const oldest = await this.model.findOne({ assignment_id: a._id }).sort({ received_at: 1, _id: 1 }).session(session).lean();
      if (oldest) {
        await this.model.updateOne({ _id: oldest._id }, { $inc: { quantity_remaining: left } }, { session });
        out.push({ lot_id: oldest._id, lot_code: oldest.lot_code, received_at: oldest.received_at, quantity: left });
      } else {
        const now = new Date();
        const [lot] = await this.model.create(
          [{ ...this.base(a), lot_code: generateLotCode('HOAN', now), received_at: now, quantity_received: left, quantity_remaining: left, source: 'return', receipt_id: null, note: 'Trả kệ không rõ lô gốc' }],
          { session },
        );
        if (lot) out.push({ lot_id: lot._id, lot_code: lot.lot_code, received_at: now, quantity: left });
      }
    }
    return out;
  }

  /**
   * Chuyển TOÀN BỘ lô của dòng `from` sang dòng `to` (gộp tồn K4b), giữ ngày + mã lô.
   * Bù lô `opening` cho cả 2 dòng trước để tổng lô khớp tồn sau khi gộp.
   */
  async moveAll(
    from: LotAssignmentRef,
    fromQuantityOnHand: number,
    to: LotAssignmentRef,
    toQuantityOnHandBefore: number,
    session: ClientSession,
  ): Promise<void> {
    if (!this.model) return;
    await this.ensureCovers(from, fromQuantityOnHand, session);
    await this.ensureCovers(to, toQuantityOnHandBefore, session);
    await this.model.updateMany(
      { assignment_id: from._id },
      { $set: { assignment_id: to._id, bin_location_id: to.bin_location_id, master_sku: to.master_sku ?? null } },
      { session },
    );
  }

  /** Đổi nhãn SKU nội bộ trên các lô (nối/bỏ nối/thay thế SKU) — chỉ để tra cứu. */
  async relabel(filter: { assignment_id?: Types.ObjectId; master_sku?: string }, masterSku: string | null, session: ClientSession): Promise<void> {
    if (!this.model) return;
    await this.model.updateMany(filter, { $set: { master_sku: masterSku } }, { session });
  }

  /** Dời ô của các lô khi sửa gán nhầm ô (dòng tồn đổi `bin_location_id`). */
  async moveBin(assignmentId: Types.ObjectId, binLocationId: Types.ObjectId, session?: ClientSession): Promise<void> {
    if (!this.model) return;
    await this.model.updateMany({ assignment_id: assignmentId }, { $set: { bin_location_id: binLocationId } }, session ? { session } : {});
  }

  /**
   * Lô cũ nhất CÒN HÀNG của từng dòng tồn — 1 aggregate. Dòng chưa có lô (dữ liệu
   * cũ) không có trong map → nơi gọi coi ngày nhập = ngày tạo dòng tồn.
   */
  async oldestLots(assignmentIds: Types.ObjectId[]): Promise<Map<string, OldestLotInfo>> {
    const out = new Map<string, OldestLotInfo>();
    if (!this.model || assignmentIds.length === 0) return out;
    const rows = await this.model.aggregate<{ _id: Types.ObjectId; lot_code: string; received_at: Date; quantity_remaining: number }>([
      { $match: { assignment_id: { $in: assignmentIds }, quantity_remaining: { $gt: 0 } } },
      { $sort: { received_at: 1, _id: 1 } },
      { $group: { _id: '$assignment_id', lot_code: { $first: '$lot_code' }, received_at: { $first: '$received_at' }, quantity_remaining: { $first: '$quantity_remaining' } } },
    ]);
    for (const r of rows) out.set(r._id.toString(), { lot_code: r.lot_code, received_at: r.received_at, quantity_remaining: r.quantity_remaining });
    return out;
  }

  /** Như `base` nhưng bỏ `assignment_id` (đã nằm trong điều kiện upsert). */
  private baseWithoutKey(a: LotAssignmentRef): Record<string, unknown> {
    const { assignment_id: _omit, ...rest } = this.base(a);
    void _omit;
    return rest;
  }

  private base(a: LotAssignmentRef): Record<string, unknown> {
    return {
      warehouse_id: a.warehouse_id,
      assignment_id: a._id,
      bin_location_id: a.bin_location_id,
      platform: a.platform,
      shop_id: a.shop_id,
      seller_sku: a.seller_sku,
      master_sku: a.master_sku ?? null,
    };
  }
}

/** Ngày dùng để so FIFO cho 1 dòng tồn: lô cũ nhất, chưa có lô thì ngày tạo dòng. */
export function fifoDateOf(
  assignment: { _id: Types.ObjectId; created_at?: Date },
  oldest: Map<string, OldestLotInfo>,
): number {
  const lot = oldest.get(assignment._id.toString());
  if (lot) return new Date(lot.received_at).getTime();
  return assignment.created_at ? new Date(assignment.created_at).getTime() : 0;
}
