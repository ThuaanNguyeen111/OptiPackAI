import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
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
import { CreateReturnDto, InspectReturnDto, ResolveQuarantineDto } from './dto/return.dto';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { OrderGroup, OrderGroupDocument } from '../order-groups/schemas/order-group.schema';
import { ProductMaster, ProductMasterDocument } from '../product-master/schemas/product-master.schema';
import { RETURN_ERROR_CODES } from './returns.errors';

/** (09/10/2026) Số phiếu tối đa đọc cho danh sách cách ly. */
const QUARANTINE_MAX_RETURNS = 200;

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
    private readonly notificationsService: NotificationsService,
    // Đổi hàng: tạo đơn + nhóm đơn thay thế; kiểm hàng đổi sang có trong danh mục shop
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(OrderGroup.name) private readonly orderGroupModel: Model<OrderGroupDocument>,
    @InjectModel(ProductMaster.name) private readonly productMasterModel: Model<ProductMasterDocument>,
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

    const exchangeItems = dto.exchange_items ?? [];
    if (dto.type === ReturnType.EXCHANGE) {
      if (exchangeItems.length === 0) {
        this.fail(RETURN_ERROR_CODES.EXCHANGE_ITEMS_REQUIRED, 'Phiếu đổi hàng phải khai hàng khách muốn đổi sang (exchange_items).', HttpStatus.BAD_REQUEST);
      }
      const known = await this.productMasterModel.find({ platform: group.platform, shop_id: group.shop_id, seller_sku: { $in: exchangeItems.map((i) => i.seller_sku) } }).select('seller_sku').lean();
      const knownSet = new Set(known.map((k) => k.seller_sku));
      const unknown = exchangeItems.filter((i) => !knownSet.has(i.seller_sku)).map((i) => i.seller_sku);
      if (unknown.length > 0) {
        this.fail(RETURN_ERROR_CODES.INVALID_EXCHANGE_ITEMS, `Hàng đổi sang không có trong danh mục sản phẩm của shop: ${unknown.join(', ')}.`, HttpStatus.BAD_REQUEST, { unknown });
      }
    }

    const [doc] = await this.returnModel.create([{
      rma_code: this.newCode(),
      order_group_id: group._id,
      type: dto.type,
      exchange_items: dto.type === ReturnType.EXCHANGE ? exchangeItems : [],
      source: 'simulated',
      status: ReturnStatus.REQUESTED,
      platform: group.platform,
      shop_id: group.shop_id,
      items: dto.items,
      customer_note: dto.customer_note ?? null,
      created_by: actorId,
    }]);
    if (!doc) throw new Error('Tạo phiếu trả hàng không trả về document');
    try {
      await this.notificationsService.notify({
        recipientRole: UserRole.STORE_OWNER, type: NotificationType.RETURN_REQUESTED, severity: 'warning',
        title: `Yêu cầu ${dto.type === ReturnType.REFUND_ONLY ? 'hoàn tiền' : dto.type === ReturnType.EXCHANGE ? 'đổi hàng' : 'trả hàng'} mới — ${doc.rma_code}`,
        message: `${String(dto.items.length)} dòng hàng, chờ duyệt.${dto.customer_note ? ` Khách ghi: ${dto.customer_note}` : ''}`,
        relatedEntityType: 'return_request', relatedEntityId: doc._id.toString(),
      });
    } catch (error) {
      this.logger.warn('Gửi thông báo yêu cầu trả hàng thất bại (không ảnh hưởng phiếu).', error);
    }
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

    const closed = await this.runTx(async (session) => {
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
          disposition: l.result === InspectionResult.QUARANTINE ? 'pending' : null,
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
    // Đổi hàng: kiểm hàng xong -> tạo đơn thay thế. Lỗi ở bước này KHÔNG hủy kết quả
    // kiểm hàng (đã lưu) — phiếu ghi replacement_status "failed", bấm tạo lại được.
    if (closed.type === ReturnType.EXCHANGE) {
      try {
        return await this.createReplacement(closed._id.toString(), actorId);
      } catch (error) {
        this.logger.error(`Tạo đơn thay thế cho ${closed.rma_code} thất bại — tạo lại qua POST /returns/:id/create-replacement.`, error);
        const failed = await this.returnModel.findByIdAndUpdate(closed._id, { $set: { replacement_status: 'failed', replacement_error: String(error) } }, { returnDocument: 'after' });
        return failed ?? closed;
      }
    }
    return closed;
  }

  /**
   * Đổi hàng — tạo ĐƠN THAY THẾ (mã EXC-<RMA>, giá 0, khóa gộp đơn riêng nên không bao
   * giờ bị gộp với đơn sàn) rồi sinh nhóm đơn mới đi lại đúng luồng lấy hàng -> đóng gói
   * -> giao như đơn thường (có giữ chỗ tồn K5). Đã tạo rồi thì báo lỗi, không tạo trùng.
   */
  async createReplacement(id: string, actorId: string): Promise<ReturnRequestDocument> {
    const rma = await this.get(id);
    if (rma.type !== ReturnType.EXCHANGE || rma.status !== ReturnStatus.CLOSED) {
      this.fail(RETURN_ERROR_CODES.NOT_EXCHANGE, 'Chỉ tạo đơn thay thế cho phiếu ĐỔI HÀNG đã kiểm hàng xong.', HttpStatus.CONFLICT);
    }
    if (rma.replacement_status === 'created') {
      this.fail(RETURN_ERROR_CODES.REPLACEMENT_EXISTS, 'Phiếu này đã có đơn thay thế.', HttpStatus.CONFLICT, { replacementGroupId: rma.replacement_group_id?.toString() });
    }
    const original = await this.orderModel.findOne({ consolidated_group_id: rma.order_group_id });
    if (!original) throw new Error('Không tìm thấy đơn gốc của nhóm đơn để chép thông tin người nhận');

    const platformOrderId = `EXC-${rma.rma_code}`;
    const order = (await this.orderModel.findOne({ platform: original.platform, shop_id: original.shop_id, platform_order_id: platformOrderId }))
      ?? (await this.orderModel.create({
        marketplace_shop: original.marketplace_shop,
        platform: original.platform,
        shop_id: original.shop_id,
        platform_order_id: platformOrderId,
        platform_order_number: platformOrderId,
        status: OrderStatus.PENDING,
        raw_statuses: ['replacement'],
        recipient: original.recipient,
        consolidation_key: `replacement:${rma._id.toString()}`, // duy nhất -> không gộp với đơn nào
        items: rma.exchange_items.map((it, i) => ({
          platform_order_item_id: `${platformOrderId}-${String(i + 1)}`,
          sku: it.seller_sku,
          name: `Hàng đổi (${rma.rma_code})`,
          quantity: it.quantity,
          unit_price: 0,
          status: OrderStatus.PENDING,
        })),
        total_amount: 0,
        currency: original.currency,
        synced_at: new Date(),
        origin: 'replacement',
        source_return_id: rma._id,
      }));
    const group = await this.orderGroupsService.getOrCreateGroupForOrder(order);
    await this.orderGroupModel.updateOne({ _id: group._id }, { $set: { origin: 'replacement', source_return_id: rma._id } });
    const updated = await this.returnModel.findByIdAndUpdate(
      rma._id,
      { $set: { replacement_status: 'created', replacement_order_id: order._id, replacement_group_id: group._id, replacement_error: null } },
      { returnDocument: 'after' },
    );
    this.logger.log(`Đổi hàng ${rma.rma_code}: tạo đơn thay thế ${platformOrderId} -> nhóm đơn ${group._id.toString()} (người thao tác ${actorId}).`);
    return updated ?? rma;
  }

  // ------------------------------------------------------ hàng cách ly

  /** Danh sách dòng hàng đang cách ly chờ xử lý (mọi phiếu), cũ nhất trước. */
  /** (09/10/2026) Tối đa 200 phiếu cũ nhất mỗi lần (trước đây không giới hạn). */
  async listQuarantine(): Promise<{ returnId: string; rmaCode: string; lineIndex: number; sellerSku: string; quantity: number; note: string | null; since: Date | null }[]> {
    const rmas = await this.returnModel.find({ inspection: { $elemMatch: { result: InspectionResult.QUARANTINE, disposition: { $in: ['pending', null] } } } }).sort({ closed_at: 1 }).limit(QUARANTINE_MAX_RETURNS);
    const out: { returnId: string; rmaCode: string; lineIndex: number; sellerSku: string; quantity: number; note: string | null; since: Date | null }[] = [];
    for (const r of rmas) {
      r.inspection.forEach((l, i) => {
        if (l.result === InspectionResult.QUARANTINE && (l.disposition ?? 'pending') === 'pending') {
          out.push({ returnId: r._id.toString(), rmaCode: r.rma_code, lineIndex: i, sellerSku: l.seller_sku, quantity: l.quantity, note: l.note, since: r.closed_at });
        }
      });
    }
    return out;
  }

  /** Xử lý 1 dòng cách ly: nhập lại ô bán (qua sổ cái) hoặc loại bỏ. */
  async resolveQuarantine(id: string, lineIndex: number, dto: ResolveQuarantineDto, actorId: string): Promise<ReturnRequestDocument> {
    const rma = await this.get(id);
    const line = rma.inspection.at(lineIndex);
    if (line?.result !== InspectionResult.QUARANTINE) {
      this.fail(RETURN_ERROR_CODES.QUARANTINE_LINE_NOT_FOUND, `Phiếu không có dòng cách ly số ${String(lineIndex)}.`, HttpStatus.NOT_FOUND);
    }
    if ((line.disposition ?? 'pending') !== 'pending') {
      this.fail(RETURN_ERROR_CODES.QUARANTINE_ALREADY_RESOLVED, 'Dòng cách ly này đã được xử lý.', HttpStatus.CONFLICT);
    }
    if (dto.action === 'restock' && (!dto.warehouse_id || !dto.bin_location_id)) {
      this.fail(RETURN_ERROR_CODES.BIN_REQUIRED, 'Nhập lại kho phải chọn kho và ô.', HttpStatus.BAD_REQUEST);
    }
    const key = `inspection.${String(lineIndex)}`;
    return this.runTx(async (session) => {
      if (dto.action === 'restock' && dto.warehouse_id && dto.bin_location_id) {
        await this.warehouseService.restockReturnedItem({
          warehouseId: dto.warehouse_id, binLocationId: dto.bin_location_id, platform: rma.platform, shopId: rma.shop_id,
          sellerSku: line.seller_sku, quantity: line.quantity, returnRequestId: rma._id.toString(), actorId,
        }, session);
      }
      const updated = await this.returnModel.findOneAndUpdate(
        { _id: rma._id, [`${key}.disposition`]: { $in: ['pending', null] } },
        { $set: { [`${key}.disposition`]: dto.action === 'restock' ? 'restocked' : 'discarded', [`${key}.disposed_at`]: new Date(), [`${key}.disposed_by`]: actorId, [`${key}.disposition_note`]: dto.note ?? null } },
        { returnDocument: 'after', session },
      );
      if (!updated) this.fail(RETURN_ERROR_CODES.QUARANTINE_ALREADY_RESOLVED, 'Dòng cách ly vừa được người khác xử lý.', HttpStatus.CONFLICT);
      return updated;
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
