import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { NOT_PACKABLE_ORDER_STATUSES } from '../orders/enums/order-status.enum';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { PackingPlan, PackingPlanDocument } from '../packing/schemas/packing-plan.schema';
import { parcelsOfPlan, type ParcelView } from '../packing/utils/parcels.util';
import {
  Shipment,
  ShipmentDocument,
} from '../shipments/schemas/shipment.schema';
import { DOC_ERROR_CODES } from './documents.errors';
import {
  ManifestData,
  PackingSlipData,
  ShippingLabelData,
  renderManifest,
  renderPackingSlip,
  renderShippingLabels,
} from './pdf/document-renderers';

interface RecipientLike {
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
}

const addressOf = (r: RecipientLike): string =>
  [r.address_line1, r.address_line2, r.city]
    .filter((p): p is string => !!p)
    .join(', ');

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
    private readonly orderGroupsService: OrderGroupsService,
  ) {}

  private async loadActiveOrders(groupId: Types.ObjectId): Promise<OrderDocument[]> {
    return this.orderModel
      .find({
        consolidated_group_id: groupId,
        status: { $nin: NOT_PACKABLE_ORDER_STATUSES },
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

    const data: PackingSlipData = {
      groupId,
      shopName: group.shop_name_snapshot,
      generatedAt: new Date(),
      orders: orders.map((order) => {
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
          if (NOT_PACKABLE_ORDER_STATUSES.includes(item.status)) continue;
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
          recipient: {
            fullName: order.recipient.full_name,
            phone: order.recipient.phone,
            address: addressOf(order.recipient),
          },
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
      ? {
          fullName: recipientOrder.recipient.full_name,
          phone: recipientOrder.recipient.phone,
          address: addressOf(recipientOrder.recipient),
        }
      : { fullName: '—', phone: '—', address: '—' };

    const parcels: ShippingLabelData['parcels'] = [];
    for (const order of orders) {
      for (const p of parcelsByOrder.get(String(order._id)) ?? []) {
        parcels.push({
          orderId: order.platform_order_id,
          index: 0,
          total: 0,
          boxCode: p.boxCode,
          // Nhãn in sau khi đóng: dùng cân thật nếu đã có.
          weightG: p.actualWeightKg !== null ? Math.ceil(p.actualWeightKg * 1000) : p.estimatedWeightG,
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
      carrierName: shipment.carrier_name ?? 'Chưa chọn hãng',
      serviceName: shipment.service_name ?? '',
      trackingCode: shipment.tracking_code ?? shipment.shipment_code,
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
      rows.push({
        trackingCode: s.tracking_code ?? s.shipment_code,
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
