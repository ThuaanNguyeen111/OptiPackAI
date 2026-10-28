import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  StorefrontOrder,
  StorefrontOrderDocument,
  StorefrontSetting,
  StorefrontSettingDocument,
  StorefrontShipment,
  StorefrontShipmentDocument,
} from './schemas/storefront.schema';
import { DEFAULT_EXPRESS_WARDS } from './express-delivery-wards';
import { deliveryOptionsFor, isExpressLate, type DeliveryOptionView } from './express-delivery.policy';
import { SF_ERROR_CODES, sfError } from './storefront.errors';

const SETTINGS_ID = 'express_delivery';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExpressOrderRow {
  id: string;
  orderNumber: string;
  publicOrderId: number | null;
  recipientName: string;
  phone: string;
  ward: string;
  placedAt: Date | null;
  promisedDeliveryAt: Date | null;
  status: string;
  fulfillmentStatus: string;
  trackingStage: string | null;
  deliveredAt: Date | null;
  shipperName: string | null;
  shipperPhone: string | null;
  isLate: boolean;
}

/**
 * 29/10/2026 — Giao hỏa tốc phía website: danh sách phường (Admin sửa), báo các cách giao cho
 * trang thanh toán, danh sách đơn hỏa tốc cho Admin (kèm nhãn "Trễ").
 */
@Injectable()
export class StorefrontExpressService {
  constructor(
    @InjectModel(StorefrontSetting.name) private readonly settingModel: Model<StorefrontSettingDocument>,
    @InjectModel(StorefrontOrder.name) private readonly orderModel: Model<StorefrontOrderDocument>,
    @InjectModel(StorefrontShipment.name) private readonly shipmentModel: Model<StorefrontShipmentDocument>,
  ) {}

  /** Phường được giao hỏa tốc: Admin đã lưu thì dùng bản đó, chưa thì danh sách mặc định. */
  async wards(): Promise<{ wards: string[]; isDefault: boolean }> {
    const doc = await this.settingModel.findById(SETTINGS_ID).lean();
    if (doc?.express_wards?.length) return { wards: doc.express_wards, isDefault: false };
    return { wards: [...DEFAULT_EXPRESS_WARDS], isDefault: true };
  }

  async updateWards(input: string[]): Promise<{ wards: string[]; isDefault: boolean }> {
    const wards = [...new Set(input.map((w) => w.trim().replace(/\s+/g, ' ')).filter(Boolean))];
    if (wards.length === 0) {
      throw new BadRequestException(sfError(SF_ERROR_CODES.EXPRESS_WARDS_INVALID, 'Danh sách phường giao hỏa tốc không được rỗng.'));
    }
    await this.settingModel.updateOne({ _id: SETTINGS_ID }, { $set: { express_wards: wards } }, { upsert: true });
    return { wards, isDefault: false };
  }

  /** Quay về danh sách mặc định (xoá bản Admin đã lưu). */
  async resetWards(): Promise<{ wards: string[]; isDefault: boolean }> {
    await this.settingModel.deleteOne({ _id: SETTINGS_ID });
    return { wards: [...DEFAULT_EXPRESS_WARDS], isDefault: true };
  }

  async options(
    query: { province?: string; ward?: string; subtotal?: number },
    now: Date = new Date(),
  ): Promise<{ options: DeliveryOptionView[]; freeShippingThreshold: number }> {
    const { wards } = await this.wards();
    return deliveryOptionsFor({ province: query.province, ward: query.ward, subtotal: query.subtotal ?? 0, at: now, wards });
  }

  /** Đơn hỏa tốc đặt trong `days` ngày gần nhất (mới → cũ), kèm shipper và nhãn trễ. */
  async listExpressOrders(days = 7, now: Date = new Date()): Promise<ExpressOrderRow[]> {
    const span = Math.min(Math.max(Math.floor(days), 1), 90);
    const orders = await this.orderModel
      .find({ delivery_option: 'express', created_at: { $gte: new Date(now.getTime() - span * DAY_MS) } })
      .sort({ created_at: -1 })
      .limit(500)
      .lean();
    const shipments = await this.shipmentModel
      .find({ order_id: { $in: orders.map((o) => o._id) } })
      .select('order_id shipper_name shipper_phone delivered_at')
      .lean();
    const byOrder = new Map(shipments.map((s) => [String(s.order_id), s]));
    return orders.map((o) => {
      const shipment = byOrder.get(String(o._id));
      const deliveredAt = shipment?.delivered_at ?? (o.fulfillment_status === 'delivered' ? o.fulfillment_updated_at : null);
      return {
        id: String(o._id),
        orderNumber: o.order_number,
        publicOrderId: o.public_order_id,
        recipientName: o.shipping_address_snapshot.recipient_name,
        phone: o.shipping_address_snapshot.phone,
        ward: o.shipping_address_snapshot.ward,
        placedAt: o.placed_at ?? o.created_at ?? null,
        promisedDeliveryAt: o.promised_delivery_at,
        status: o.status,
        fulfillmentStatus: o.fulfillment_status,
        trackingStage: o.tracking_stage,
        deliveredAt,
        shipperName: shipment?.shipper_name ?? null,
        shipperPhone: shipment?.shipper_phone ?? null,
        isLate: isExpressLate({ delivery_option: o.delivery_option, promised_delivery_at: o.promised_delivery_at, status: o.status, delivered_at: deliveredAt }, now),
      };
    });
  }
}
