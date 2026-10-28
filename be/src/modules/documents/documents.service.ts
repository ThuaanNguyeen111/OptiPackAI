import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { notPackableStatuses } from '../orders/order-sync-policy';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { PackingPlan, PackingPlanDocument } from '../packing/schemas/packing-plan.schema';
import { parcelsOfPlan, type ParcelView } from '../packing/utils/parcels.util';
import {
  Shipment,
  ShipmentDocument,
} from '../shipments/schemas/shipment.schema';
import {
  ShippingSettings,
  ShippingSettingsDocument,
} from '../shipping/schemas/shipping-settings.schema';
import { Warehouse, WarehouseDocument } from '../warehouse/schemas/warehouse.schema';
import { DOC_ERROR_CODES } from './documents.errors';
import {
  ManifestData,
  PackingSlipData,
  ShippingLabelData,
  renderBinLabels,
  renderManifest,
  renderPackingSlip,
  renderPickingList,
  renderShippingLabels,
  renderSkuLabels,
  renderStockReceipt,
} from './pdf/document-renderers';
import { BinLocation, BinLocationDocument } from '../warehouse/schemas/bin-location.schema';
import { WarehouseZone, WarehouseZoneDocument } from '../warehouse/schemas/warehouse-zone.schema';
import { WarehouseService } from '../warehouse/warehouse.service';
import { MasterSku, MasterSkuDocument } from '../master-skus/schemas/master-sku.schema';
import { DemoRecipientService } from '../carriers/demo-recipient.service';
import type { DemoRecipientValue } from '../carriers/utils/demo-recipient.util';

/** (21/10/2026) Giới hạn tem mỗi lần in — tránh dựng PDF hàng nghìn trang làm treo máy chủ. */
const MAX_LABELS = 500;

interface RecipientLike {
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
}

/**
 * Địa chỉ in trên chứng từ. Bỏ đoạn lặp: đơn AURELLE có `address_line1` = số nhà + phường,
 * khách lại hay gõ cả phường/tỉnh vào ô số nhà → trước 25/10/2026 nhãn in "Phường X, Tỉnh Y, Phường X, Tỉnh Y".
 */
const addressOf = (r: RecipientLike): string => {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const part of [r.address_line1, r.address_line2, r.city].flatMap((v) => (v ? v.split(',') : []))) {
    const text = part.trim();
    const key = text.normalize('NFC').toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    parts.push(text);
  }
  return parts.join(', ');
};

/**
 * 28/10/2026 — người nhận in trên chứng từ: đơn dùng địa chỉ MÔ PHỎNG (demo, đơn bị che — tính
 * lại từ dữ liệu, không lưu DB) thì in đúng địa chỉ + SĐT đã gửi hãng, để nhãn khớp vận đơn GHN;
 * tên giữ nguyên tên của sàn.
 */
const printRecipientOf = (
  order: Pick<OrderDocument, 'recipient'>,
  demo: DemoRecipientValue | null,
): { fullName: string; phone: string; address: string } => {
  if (demo) {
    return {
      fullName: order.recipient.full_name,
      phone: demo.phone,
      address: `${demo.street}, ${demo.ward_name}, ${demo.province_name} (địa chỉ mô phỏng)`,
    };
  }
  return { fullName: order.recipient.full_name, phone: order.recipient.phone, address: addressOf(order.recipient) };
};

/**
 * Dựng dữ liệu chứng từ từ DB rồi giao cho renderer thuần (pdf/document-renderers).
 * Chỉ ĐỌC — không đổi trạng thái nào.
 */
@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(PackingPlan.name)
    private readonly planModel: Model<PackingPlanDocument>,
    @InjectModel(Shipment.name)
    private readonly shipmentModel: Model<ShipmentDocument>,
    @InjectModel(ShippingSettings.name)
    private readonly shippingSettingsModel: Model<ShippingSettingsDocument>,
    @InjectModel(Warehouse.name)
    private readonly warehouseModel: Model<WarehouseDocument>,
    @InjectModel(BinLocation.name)
    private readonly binModel: Model<BinLocationDocument>,
    @InjectModel(WarehouseZone.name)
    private readonly zoneModel: Model<WarehouseZoneDocument>,
    @InjectModel(MasterSku.name)
    private readonly masterSkuModel: Model<MasterSkuDocument>,
    private readonly orderGroupsService: OrderGroupsService,
    private readonly warehouseService: WarehouseService,
    // 28/10/2026 — địa chỉ mô phỏng cho đơn bị che (chỉ đọc). Optional để test cũ dựng service không cần.
    @Optional() private readonly demoRecipients?: DemoRecipientService,
  ) {}

  private assertId(id: string, field: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(DOC_ERROR_CODES.INVALID_ID, `${field} không hợp lệ.`, HttpStatus.BAD_REQUEST, { [field]: id });
    }
    return new Types.ObjectId(id);
  }

  private async requireWarehouse(warehouseId: string): Promise<WarehouseDocument> {
    const warehouse = await this.warehouseModel.findById(this.assertId(warehouseId, 'warehouseId'));
    if (!warehouse) {
      throw new AppException(DOC_ERROR_CODES.WAREHOUSE_NOT_FOUND, 'Không tìm thấy kho.', HttpStatus.NOT_FOUND, { warehouseId });
    }
    return warehouse;
  }

  private assertLabelCount(count: number): void {
    if (count > MAX_LABELS) {
      throw new AppException(
        DOC_ERROR_CODES.TOO_MANY_LABELS,
        `Một lần chỉ in tối đa ${String(MAX_LABELS)} tem (đang yêu cầu ${String(count)}) — lọc theo khu hoặc giảm số bản.`,
        HttpStatus.BAD_REQUEST,
        { requested: count, max: MAX_LABELS },
      );
    }
  }

  /**
   * (21/10/2026) Tem ô kệ: mã quét = đúng `bin_code` (đã dùng ở lấy hàng/nhập kho). Lọc theo
   * khu hoặc danh sách ô; không lọc = cả kho. Sắp theo lộ trình lấy hàng để dán cho nhanh.
   */
  async buildBinLabels(warehouseId: string, opts: { zoneId?: string; binIds?: string[]; copies: number }): Promise<Buffer> {
    const warehouse = await this.requireWarehouse(warehouseId);
    const filter: Record<string, unknown> = { warehouse_id: warehouse._id, is_active: { $ne: false } };
    if (opts.zoneId) filter.zone_id = this.assertId(opts.zoneId, 'zone_id');
    if (opts.binIds && opts.binIds.length > 0) filter._id = { $in: opts.binIds.map((id) => this.assertId(id, 'bin_ids')) };
    const bins = await this.binModel.find(filter).sort({ pick_sequence: 1, bin_code: 1 }).lean();
    if (bins.length === 0) {
      throw new AppException(DOC_ERROR_CODES.NO_BINS, 'Không có ô nào khớp để in tem.', HttpStatus.NOT_FOUND, { warehouseId, ...opts });
    }
    this.assertLabelCount(bins.length * opts.copies);
    const zones = await this.zoneModel.find({ _id: { $in: [...new Set(bins.map((b) => b.zone_id.toString()))].map((id) => new Types.ObjectId(id)) } }).lean();
    const zoneOf = new Map(zones.map((z) => [z._id.toString(), z]));
    return renderBinLabels({
      warehouseCode: warehouse.warehouse_code,
      bins: bins.map((b) => {
        const zone = zoneOf.get(b.zone_id.toString());
        return { binCode: b.bin_code, zoneCode: zone?.zone_code ?? '?', zoneName: zone?.zone_name ?? '', copies: opts.copies };
      }),
    });
  }

  /**
   * (21/10/2026) Tem SKU: mã vạch = mã SKU (quét được ở lấy hàng + đóng gói — cả hai đều nhận
   * SKU nội bộ lẫn SKU sàn). Mã không có trong danh mục SKU nội bộ vẫn in (coi là SKU sàn).
   */
  async buildSkuLabels(codes: string[], copies: number): Promise<Buffer> {
    const unique = [...new Set(codes.map((c) => c.trim()).filter((c) => c.length > 0))];
    if (unique.length === 0) {
      throw new AppException(DOC_ERROR_CODES.NO_CODES, 'Cần ít nhất 1 mã SKU để in tem.', HttpStatus.BAD_REQUEST);
    }
    this.assertLabelCount(unique.length * copies);
    const masters = await this.masterSkuModel.find({ master_sku: { $in: unique } }).lean();
    const byCode = new Map(masters.map((m) => [m.master_sku, m]));
    return renderSkuLabels({
      items: unique.map((code) => {
        const m = byCode.get(code);
        return m
          ? { code, name: m.name, detail: `Màu ${m.color_code} · Size ${m.size}`, copies }
          : { code, name: 'SKU sàn', detail: null, copies };
      }),
    });
  }

  /** (21/10/2026) Picking list in giấy — cùng dữ liệu + thứ tự với GET /warehouse/:id/picking-list/:groupId. */
  async buildPickingList(warehouseId: string, groupId: string): Promise<Buffer> {
    const warehouse = await this.requireWarehouse(warehouseId);
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    const lines = await this.warehouseService.getEnrichedPickingList(warehouseId, groupId);
    const orders = await this.loadActiveOrders(group._id);
    const nameOf = new Map<string, string>();
    for (const o of orders) for (const item of o.items) if (!nameOf.has(item.sku)) nameOf.set(item.sku, item.name);
    return renderPickingList({
      groupId,
      shopName: group.shop_name_snapshot,
      warehouseName: warehouse.warehouse_name,
      generatedAt: new Date(),
      lines: lines.map((l) => ({
        binCode: l.bin_code,
        zoneCode: l.zone_code,
        sku: l.sku,
        masterSku: l.master_sku,
        name: nameOf.get(l.sku) ?? null,
        lot: l.oldest_lot ? { code: l.oldest_lot.lot_code, receivedAt: l.oldest_lot.received_at } : null,
        quantity: l.quantity,
        pickedQuantity: l.picked_quantity,
        otherBins: l.other_bins.map((b) => b.bin_code),
      })),
    });
  }

  /** (21/10/2026) Phiếu nhập kho in giấy để người giao + thủ kho ký. */
  async buildStockReceipt(warehouseId: string, receiptId: string): Promise<Buffer> {
    const warehouse = await this.requireWarehouse(warehouseId);
    const receipt = await this.warehouseService.getReceipt(warehouseId, receiptId);
    const binCodes = await this.warehouseService.binCodesByIds(receipt.lines.map((l) => l.bin_location_id));
    return renderStockReceipt({
      receiptCode: receipt.receipt_code,
      warehouseName: warehouse.warehouse_name,
      warehouseAddress: warehouse.address,
      lotCode: receipt.lot_code,
      receivedAt: receipt.received_at,
      supplier: receipt.supplier,
      note: receipt.note,
      createdAt: receipt.created_at ?? null,
      lines: receipt.lines.map((l) => ({
        sellerSku: l.seller_sku,
        masterSku: l.master_sku,
        platform: l.platform,
        binCode: binCodes.get(l.bin_location_id.toString()) ?? '(ô đã xoá)',
        quantity: l.quantity,
      })),
      totalQuantity: receipt.total_quantity,
    });
  }

  /**
   * (21/10/2026) Người gửi trên nhãn: cấu hình ở tùy chọn vận chuyển (sender_*); field nào
   * bỏ trống thì lấy tên + địa chỉ kho đang hoạt động đầu tiên; không có kho → tên shop.
   */
  private async resolveSender(shopName: string): Promise<ShippingLabelData['sender']> {
    const settings = await this.shippingSettingsModel.findOne({ key: 'default' }).lean();
    const needWarehouse = !settings?.sender_name || !settings.sender_address;
    const warehouse = needWarehouse
      ? await this.warehouseModel.findOne({ is_active: true }).sort({ created_at: 1 }).lean()
      : null;
    return {
      name: settings?.sender_name ?? warehouse?.warehouse_name ?? shopName,
      phone: settings?.sender_phone ?? null,
      address: settings?.sender_address ?? warehouse?.address ?? null,
    };
  }

  private async demoOf(order: OrderDocument): Promise<DemoRecipientValue | null> {
    return this.demoRecipients ? this.demoRecipients.resolve(order) : null;
  }

  private async loadActiveOrders(groupId: Types.ObjectId): Promise<OrderDocument[]> {
    return this.orderModel
      .find({
        consolidated_group_id: groupId,
        status: { $nin: notPackableStatuses() },
      })
      .sort({ _id: 1 });
  }

  /** Kiện của kế hoạch đang hoạt động, gom theo đơn (hợp đồng parcelsOfPlan). */
  private async parcelsByOrder(groupId: Types.ObjectId): Promise<Map<string, ParcelView[]>> {
    const plan = await this.planModel.findOne({ order_group_id: groupId, is_active: true });
    const byOrder = new Map<string, ParcelView[]>();
    for (const p of plan ? parcelsOfPlan(plan) : []) {
      const list = byOrder.get(p.orderId) ?? [];
      list.push(p);
      byOrder.set(p.orderId, list);
    }
    return byOrder;
  }

  async buildPackingSlip(groupId: string): Promise<Buffer> {
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    const orders = await this.loadActiveOrders(group._id);
    if (orders.length === 0) {
      throw new AppException(
        DOC_ERROR_CODES.NO_ORDERS,
        'Nhóm không còn đơn nào (đã hủy/lỗi) để in phiếu đóng gói.',
        HttpStatus.CONFLICT,
        { groupId },
      );
    }
    const parcelsByOrder = await this.parcelsByOrder(group._id);
    const demos = await Promise.all(orders.map((o) => this.demoOf(o)));

    const data: PackingSlipData = {
      groupId,
      shopName: group.shop_name_snapshot,
      generatedAt: new Date(),
      orders: orders.map((order, orderIndex) => {
        const merged = new Map<
          string,
          {
            sku: string;
            name: string;
            variation: string | null;
            quantity: number;
          }
        >();
        for (const item of order.items) {
          if (notPackableStatuses().includes(item.status)) continue;
          const key = `${item.sku}|${item.variation ?? ''}`;
          const cur = merged.get(key);
          if (cur) cur.quantity += item.quantity;
          else
            merged.set(key, {
              sku: item.sku,
              name: item.name,
              variation: item.variation ?? null,
              quantity: item.quantity,
            });
        }
        const parcels = parcelsByOrder.get(String(order._id)) ?? [];
        return {
          platformOrderId: order.platform_order_id,
          recipient: printRecipientOf(order, demos.at(orderIndex) ?? null),
          items: [...merged.values()],
          parcels: parcels.map((p) => ({
            index: p.parcelNo - 1,
            boxCode: p.boxCode,
            boxName: p.boxName,
            estimatedWeightG: p.estimatedWeightG,
          })),
        };
      }),
    };
    return renderPackingSlip(data);
  }

  async buildShippingLabels(groupId: string): Promise<Buffer> {
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    const shipment = await this.shipmentModel.findOne({
      order_group_id: group._id,
    });
    if (!shipment) {
      throw new AppException(
        DOC_ERROR_CODES.SHIPMENT_NOT_FOUND,
        'Nhóm chưa có vận đơn — hãy tạo vận đơn (POST /shipments/batch) trước khi in nhãn.',
        HttpStatus.NOT_FOUND,
        { groupId },
      );
    }
    const orders = await this.loadActiveOrders(group._id);
    const parcelsByOrder = await this.parcelsByOrder(group._id);
    const recipientOrder = orders[0];
    const recipient = recipientOrder
      ? printRecipientOf(recipientOrder, await this.demoOf(recipientOrder))
      : { fullName: '—', phone: '—', address: '—' };

    // C4 (14/10/2026) — vận đơn qua hãng API: mỗi kiện in mã vận đơn của hãng (GHN) cho đúng kiện.
    const carrierByParcel = new Map(
      (shipment.carrier_parcels ?? [])
        .filter((cp) => cp.carrier_order_code && cp.carrier_status !== 'cancel')
        .map((cp) => [cp.parcel_no, cp]),
    );
    const parcels: ShippingLabelData['parcels'] = [];
    for (const order of orders) {
      const own = parcelsByOrder.get(String(order._id)) ?? [];
      // 28/10/2026 (G3) — mỗi kiện in người nhận của CHÍNH đơn đó (khớp đơn GHN của kiện),
      // không lấy đơn đầu tiên cho cả nhóm: nhóm gộp cùng SĐT + địa chỉ vẫn có thể khác tên.
      const orderRecipient = own.length > 0
        ? (order === recipientOrder ? recipient : printRecipientOf(order, await this.demoOf(order)))
        : recipient;
      for (const p of own) {
        const cp = carrierByParcel.get(p.parcelNo);
        parcels.push({
          orderId: order.platform_order_id,
          recipient: orderRecipient,
          index: 0,
          total: 0,
          boxCode: p.boxCode,
          // Nhãn in sau khi đóng: dùng cân thật nếu đã có.
          weightG: p.actualWeightKg !== null ? Math.ceil(p.actualWeightKg * 1000) : p.estimatedWeightG,
          trackingCode: cp?.carrier_order_code ?? null,
          sortCode: cp?.sort_code ?? null,
        });
      }
    }
    // Đánh số kiện k/n trong toàn vận đơn.
    parcels.forEach((p, i) => {
      p.index = i;
      p.total = parcels.length;
    });

    return renderShippingLabels({
      shopName: group.shop_name_snapshot,
      sender: await this.resolveSender(group.shop_name_snapshot),
      carrierName: shipment.carrier_name ?? 'Chưa chọn hãng',
      serviceName: shipment.service_name ?? '',
      // Mã chung = mã vận đơn OptiPack (SHP-...); kiện có mã hãng thì in mã hãng (xem trên).
      trackingCode: carrierByParcel.size > 0 ? shipment.shipment_code : (shipment.tracking_code ?? shipment.shipment_code),
      tripCode: shipment.trip_code ?? '—',
      recipient,
      parcels,
      etaTo: shipment.eta_to,
    });
  }

  async buildManifest(tripCode: string): Promise<Buffer> {
    const shipments = await this.shipmentModel
      .find({ trip_code: tripCode })
      .sort({ created_at: 1 });
    if (shipments.length === 0) {
      throw new AppException(
        DOC_ERROR_CODES.TRIP_NOT_FOUND,
        `Không có vận đơn nào thuộc chuyến "${tripCode}".`,
        HttpStatus.NOT_FOUND,
        { tripCode },
      );
    }
    const rows: ManifestData['shipments'] = [];
    let shopName = '—';
    for (const s of shipments) {
      const group = await this.orderGroupsService.findOrderGroupById(
        s.order_group_id.toString(),
      );
      shopName = group.shop_name_snapshot;
      const first = await this.orderModel
        .findOne({ consolidated_group_id: group._id })
        .sort({ _id: 1 });
      // C4 — vận đơn qua hãng API: liệt kê mã hãng của các kiện (cho shipper đối chiếu khi bàn giao).
      const carrierCodes = (s.carrier_parcels ?? [])
        .map((cp) => cp.carrier_order_code)
        .filter((c): c is string => !!c);
      rows.push({
        trackingCode: carrierCodes.length > 0 ? `${carrierCodes.join(', ')} (${s.shipment_code})` : (s.tracking_code ?? s.shipment_code),
        orderGroupId: s.order_group_id.toString(),
        recipientName: first?.recipient.full_name ?? '—',
        recipientAddress: first ? addressOf(first.recipient) : '—',
        parcelCount: s.parcel_count ?? 0,
        chargeableWeightG: s.chargeable_weight_g ?? 0,
        costVnd: s.estimated_cost_vnd ?? 0,
      });
    }
    const head = shipments[0];
    return renderManifest({
      tripCode,
      shopName,
      carrierName: head?.carrier_name ?? null,
      generatedAt: new Date(),
      pickupAt: head?.pickup_at ?? null,
      shipments: rows,
    });
  }
}
