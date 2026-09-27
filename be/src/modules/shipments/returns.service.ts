import { PackagingMaterialsService } from '../packaging-materials/packaging-materials.service';
import { InventoryMovement, InventoryMovementDocument } from '../warehouse/schemas/inventory-movement.schema';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { WarehouseService } from '../warehouse/warehouse.service';
import { ReturnRequest, ReturnRequestDocument } from './schemas/return-request.schema';
import { Shipment, ShipmentDocument } from './schemas/shipment.schema';
import {
  InspectionResult, OPEN_RETURN_STATUSES, RETURN_WINDOW_DAYS, ReturnReason, ReturnStatus, ReturnType,
} from './enums/return.enums';
import { CreateReturnDto, InspectReturnDto } from './dto/return.dto';
import { RETURN_ERROR_CODES } from './returns.errors';

/**
 * ===================================================================
 * G3 (27/09/2026) — TRẢ HÀNG / HOÀN HÀNG (bản gọn, bấm nút)
 * ===================================================================
 * 2 nguồn phiếu:
 *  - failed_delivery: HỆ THỐNG tự tạo khi kho nhận lại kiện giao thất bại
 *    (ShipmentsService.receiveReturn) — trạng thái "received", đi thẳng vào kiểm hàng.
 *  - simulated: Admin đóng vai khách bấm "Yêu cầu trả hàng" -> Store Owner duyệt.
 * Kiểm hàng: đạt -> nhập lại ô bán qua SỔ CÁI (K3, return_restock); nghi lỗi ->
 * cách ly (không cộng tồn bán); hỏng -> loại bỏ. Tiền hoàn do sàn quyết định.
 * ===================================================================
 */
@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    @InjectModel(ReturnRequest.name) private readonly returnModel: Model<ReturnRequestDocument>,
    @InjectModel(Shipment.name) private readonly shipmentModel: Model<ShipmentDocument>,
    private readonly orderGroupsService: OrderGroupsService,
    private readonly warehouseService: WarehouseService,
    @InjectConnection() private readonly connection: Connection,
    private readonly packagingMaterialsService: PackagingMaterialsService, // G4
    @InjectModel(InventoryMovement.name) private readonly movementModel: Model<InventoryMovementDocument>, // G4
  ) {}

  async get(id: string): Promise<ReturnRequestDocument> {
    if (!Types.ObjectId.isValid(id)) this.fail(RETURN_ERROR_CODES.INVALID_ID, `"${id}" không đúng định dạng ObjectId.`, HttpStatus.BAD_REQUEST);
    const doc = await this.returnModel.findById(id);
    if (!doc) this.fail(RETURN_ERROR_CODES.NOT_FOUND, `Không tìm thấy phiếu trả hàng "${id}".`, HttpStatus.NOT_FOUND);
    return doc;
  }

  async list(params: { status?: ReturnStatus; orderGroupId?: string; page: number; limit: number }): Promise<{ items: ReturnRequestDocument[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (params.status) filter.status = params.status;
    if (params.orderGroupId && Types.ObjectId.isValid(params.orderGroupId)) filter.order_group_id = new Types.ObjectId(params.orderGroupId);
    const [items, total] = await Promise.all([
      this.returnModel.find(filter).sort({ updated_at: -1 }).skip((params.page - 1) * params.limit).limit(params.limit),
      this.returnModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  /** Gọi TRONG transaction của ShipmentsService.receiveReturn. */
  async createFromFailedDelivery(orderGroupId: string, shipmentId: string, actorId: string, session: ClientSession): Promise<void> {
    const group = await this.orderGroupsService.findOrderGroupById(orderGroupId);
    let items: { seller_sku: string; quantity: number; reason_code: ReturnReason }[] = [];
    // 🔄 G4 (27/09/2026) — SỬA ĐIỂM YẾU G3: lấy số lượng ĐÃ QUÉT THẬT (sổ cái K3,
    // type "pick") thay vì số lượng đặt — lúc lấy hàng bị thiếu thì kiện về kho cũng
    // chỉ có đúng số đã lấy. Nhóm đơn lấy hàng trước K3 (chưa có sổ cái) -> dùng số đặt.
    const picked = await this.movementModel.aggregate<{ _id: string; qty: number }>([
      { $match: { type: 'pick', ref_type: 'order_group', ref_id: orderGroupId } },
      { $group: { _id: '$seller_sku', qty: { $sum: { $multiply: ['$delta', -1] } } } },
    ]);
    try {
      if (picked.length > 0) {
        items = picked.filter((p) => p.qty > 0).map((p) => ({ seller_sku: p._id, quantity: p.qty, reason_code: ReturnReason.FAILED_DELIVERY }));
      } else {
        const packable = await this.orderGroupsService.getPackableItemsForGroup(orderGroupId);
        items = packable.items.map((i) => ({ seller_sku: i.sku, quantity: i.quantity, reason_code: ReturnReason.FAILED_DELIVERY }));
      }
    } catch (error: unknown) {
      // VD toàn bộ đơn trong nhóm đã hủy -> không đọc được danh sách hàng. Vẫn tạo phiếu
      // (rỗng) để kho biết có kiện về, ghi log để kiểm tra tay.
      this.logger.warn(`Không đọc được hàng của nhóm đơn ${orderGroupId} khi tạo phiếu hoàn: ${String(error)}`);
    }
    await this.returnModel.create([{
      rma_code: this.newCode(),
      order_group_id: group._id,
      shipment_id: new Types.ObjectId(shipmentId),
      type: ReturnType.FAILED_DELIVERY,
      source: 'failed_delivery',
      status: ReturnStatus.RECEIVED, // hàng đã nằm ở kho
      platform: group.platform,
      shop_id: group.shop_id,
      items,
      created_by: actorId,
      received_by: actorId,
    }], { session });
  }

  /** [Admin — đóng vai khách] Giả lập khách yêu cầu trả hàng. */
  async createSimulated(dto: CreateReturnDto, actorId: string): Promise<ReturnRequestDocument> {
    const group = await this.orderGroupsService.findOrderGroupById(dto.order_group_id);
    if (group.fulfillment_status !== GroupFulfillmentStatus.DELIVERED) {
      this.fail(RETURN_ERROR_CODES.ORDER_NOT_DELIVERED, `Nhóm đơn đang "${group.fulfillment_status}" — chỉ trả hàng được khi đã giao thành công.`, HttpStatus.CONFLICT);
    }
    const open = await this.returnModel.exists({ order_group_id: group._id, status: { $in: OPEN_RETURN_STATUSES } });
    if (open) this.fail(RETURN_ERROR_CODES.OPEN_EXISTS, 'Nhóm đơn đang có phiếu trả hàng chưa xử lý xong.', HttpStatus.CONFLICT, { returnId: open._id.toString() });

    const shipment = await this.shipmentModel.findOne({ order_group_id: group._id, direction: 'forward' });
    const deliveredAt = shipment?.delivered_at ?? group.updated_at ?? new Date();
    const ageDays = (Date.now() - deliveredAt.getTime()) / 86_400_000;
    if (ageDays > RETURN_WINDOW_DAYS) {
      this.fail(RETURN_ERROR_CODES.WINDOW_EXPIRED, `Đã quá ${String(RETURN_WINDOW_DAYS)} ngày kể từ khi giao — hết hạn trả hàng.`, HttpStatus.CONFLICT, { deliveredAt });
    }

    const bought = new Map((await this.orderGroupsService.getPackableItemsForGroup(dto.order_group_id)).items.map((i) => [i.sku, i.quantity]));
    const seen = new Set<string>();
    for (const item of dto.items) {
      const max = bought.get(item.seller_sku);
      if (seen.has(item.seller_sku) || max === undefined || item.quantity > max) {
        this.fail(RETURN_ERROR_CODES.INVALID_ITEMS, `SKU "${item.seller_sku}" không thuộc nhóm đơn, bị khai trùng, hoặc vượt số lượng đã mua (${String(max ?? 0)}).`, HttpStatus.BAD_REQUEST, { sku: item.seller_sku });
      }
      seen.add(item.seller_sku);
    }

    const [doc] = await this.returnModel.create([{
      rma_code: this.newCode(),
      order_group_id: group._id,
      type: dto.type,
      source: 'simulated',
      status: ReturnStatus.REQUESTED,
      platform: group.platform,
      shop_id: group.shop_id,
      items: dto.items,
      customer_note: dto.customer_note ?? null,
      created_by: actorId,
    }]);
    if (!doc) throw new Error('Tạo phiếu trả hàng không trả về document');
    return doc;
  }

  /** [Store Owner] Duyệt. Hoàn tiền không cần trả hàng -> đóng luôn. Người tạo phiếu không tự duyệt. */
  async approve(id: string, expectedVersion: number, actorId: string, note?: string): Promise<ReturnRequestDocument> {
    const rma = await this.get(id);
    if (rma.created_by === actorId) {
      this.fail(RETURN_ERROR_CODES.SELF_APPROVAL, 'Người tạo phiếu không được tự duyệt — cần Store Owner khác duyệt.', HttpStatus.FORBIDDEN);
    }
    const refundOnly = rma.type === ReturnType.REFUND_ONLY;
    return this.move(rma, expectedVersion, ReturnStatus.REQUESTED, refundOnly ? ReturnStatus.CLOSED : ReturnStatus.AWAITING_RECEIPT, {
      decided_by: actorId, decision_note: note ?? null, ...(refundOnly ? { closed_at: new Date() } : {}),
    });
  }

  async reject(id: string, expectedVersion: number, actorId: string, note?: string): Promise<ReturnRequestDocument> {
    if (!note?.trim()) this.fail(RETURN_ERROR_CODES.NOTE_REQUIRED, 'Từ chối phải ghi rõ lý do.', HttpStatus.BAD_REQUEST);
    const rma = await this.get(id);
    return this.move(rma, expectedVersion, ReturnStatus.REQUESTED, ReturnStatus.REJECTED, { decided_by: actorId, decision_note: note, closed_at: new Date() });
  }

  /** [Warehouse] Hàng khách trả đã về kho. Trả TOÀN BỘ -> nhóm đơn -> returned. */
  async receive(id: string, expectedVersion: number, actorId: string): Promise<ReturnRequestDocument> {
    const rma = await this.get(id);
    const bought = (await this.orderGroupsService.getPackableItemsForGroup(rma.order_group_id.toString())).items;
    const returnedAll = bought.every((b) => rma.items.find((i) => i.seller_sku === b.sku)?.quantity === b.quantity);
    return this.runTx(async (session) => {
      const updated = await this.move(rma, expectedVersion, ReturnStatus.AWAITING_RECEIPT, ReturnStatus.RECEIVED, { received_by: actorId }, session);
      if (returnedAll) {
        const group = await this.orderGroupsService.findOrderGroupById(rma.order_group_id.toString());
        await this.orderGroupsService.transitionFulfillmentStatus(group._id.toString(), GroupFulfillmentStatus.RETURNED, group.__v, session);
      }
      return updated;
    });
  }

  /**
   * [Warehouse] Kiểm hàng. Mỗi SKU: tổng các dòng PHẢI bằng số lượng trả (không
   * để "mất" hàng giữa chừng). restock -> nhập lại ô qua sổ cái, CÙNG transaction.
   */
  async inspect(id: string, dto: InspectReturnDto, actorId: string): Promise<ReturnRequestDocument> {
    const rma = await this.get(id);
    const expected = new Map(rma.items.map((i) => [i.seller_sku, i.quantity]));
    const counted = new Map<string, number>();
    for (const line of dto.lines) {
      if (!expected.has(line.seller_sku)) {
        this.fail(RETURN_ERROR_CODES.INSPECTION_MISMATCH, `SKU "${line.seller_sku}" không có trong phiếu trả.`, HttpStatus.BAD_REQUEST);
      }
      if (line.result === InspectionResult.RESTOCK && (!line.warehouse_id || !line.bin_location_id)) {
        this.fail(RETURN_ERROR_CODES.BIN_REQUIRED, `Dòng nhập lại kho của "${line.seller_sku}" phải chọn kho và ô.`, HttpStatus.BAD_REQUEST);
      }
      counted.set(line.seller_sku, (counted.get(line.seller_sku) ?? 0) + line.quantity);
    }
    for (const [sku, qty] of expected) {
      if ((counted.get(sku) ?? 0) !== qty) {
        this.fail(RETURN_ERROR_CODES.INSPECTION_MISMATCH, `SKU "${sku}": trả ${String(qty)} nhưng kiểm ${String(counted.get(sku) ?? 0)} — phải khớp đủ.`, HttpStatus.BAD_REQUEST, { sku, expected: qty });
      }
    }

    return this.runTx(async (session) => {
      // G4 — thu hồi vật liệu đóng gói (hạng A đã gỡ nhãn -> kho tái sử dụng), cùng transaction.
      const packagingOutcomes = dto.packaging?.length
        ? await this.packagingMaterialsService.recoverFromReturn(dto.packaging, rma._id.toString(), actorId, session)
        : [];
      for (const line of dto.lines) {
        if (line.result === InspectionResult.RESTOCK && line.warehouse_id && line.bin_location_id) {
          await this.warehouseService.restockReturnedItem({
            warehouseId: line.warehouse_id,
            binLocationId: line.bin_location_id,
            platform: rma.platform,
            shopId: rma.shop_id,
            sellerSku: line.seller_sku,
            quantity: line.quantity,
            returnRequestId: rma._id.toString(),
            actorId,
          }, session);
        }
      }
      return this.move(rma, dto.expected_version, ReturnStatus.RECEIVED, ReturnStatus.CLOSED, {
        inspection: dto.lines.map((l) => ({
          seller_sku: l.seller_sku,
          quantity: l.quantity,
          result: l.result,
          warehouse_id: l.warehouse_id ? new Types.ObjectId(l.warehouse_id) : null,
          bin_location_id: l.bin_location_id ? new Types.ObjectId(l.bin_location_id) : null,
          note: l.note ?? null,
        })),
        inspected_by: actorId,
        closed_at: new Date(),
        packaging_inspection: packagingOutcomes.map((o) => ({
          material_code: o.line.material_code,
          quantity: o.line.quantity,
          grade: o.line.grade,
          reuse_cycle_seen: o.line.reuse_cycle_seen ?? 0,
          old_label_removed: o.line.old_label_removed === true,
          recovered_to_reuse: o.recoveredToReuse,
          outcome: o.outcome,
        })),
      }, session);
    });
  }

  // ------------------------------------------------------------ nội bộ

  private async move(
    rma: ReturnRequestDocument,
    expectedVersion: number,
    from: ReturnStatus,
    to: ReturnStatus,
    set: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<ReturnRequestDocument> {
    if (rma.status !== from) {
      this.fail(RETURN_ERROR_CODES.INVALID_STATUS, `Phiếu đang "${rma.status}" — thao tác này chỉ làm được khi phiếu "${from}".`, HttpStatus.CONFLICT, { status: rma.status });
    }
    const updated = await this.returnModel.findOneAndUpdate(
      { _id: rma._id, __v: expectedVersion, status: from },
      { $set: { status: to, ...set }, $inc: { __v: 1 } },
      { returnDocument: 'after', session },
    );
    if (!updated) this.fail(RETURN_ERROR_CODES.STATE_CONFLICT, 'Phiếu vừa được người khác thay đổi — tải lại rồi thử lại.', HttpStatus.CONFLICT, { expectedVersion });
    return updated;
  }

  private newCode(): string {
    const d = new Date();
    const ymd = `${String(d.getFullYear() % 100).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `RMA-${ymd}-${new Types.ObjectId().toString().slice(-6).toUpperCase()}`;
  }

  private fail(code: string, message: string, status: HttpStatus, details?: Record<string, unknown>): never {
    throw new AppException(code, message, status, details);
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
