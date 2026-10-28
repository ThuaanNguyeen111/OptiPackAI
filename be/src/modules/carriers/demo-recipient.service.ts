import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import {
  buildDemoRecipient,
  needsDemoRecipient,
  seededRandom,
  type DemoRecipientSettings,
  type DemoRecipientValue,
} from './utils/demo-recipient.util';

/** Phần đơn hàng cần để tính địa chỉ mô phỏng (chấp nhận cả document lẫn bản lean). */
export interface OrderForDemo {
  _id: Types.ObjectId;
  recipient: Order['recipient'];
  consolidated_group_id?: Types.ObjectId | null;
  created_at?: Date;
}

/** Đơn "bị che" theo cách đếm trong DB: SĐT hoặc số nhà có dấu `*` (đúng cách Lazada che). */
const MASKED_FILTER = {
  $or: [{ 'recipient.phone': { $regex: '\\*' } }, { 'recipient.address_line1': { $regex: '\\*' } }],
};

/**
 * ===================================================================
 * 28/10/2026 — ĐỊA CHỈ MÔ PHỎNG, CHỈ ĐỌC DB (Thuận chốt: không ghi DB)
 * ===================================================================
 * Đơn bị che (Lazada) + CARRIER_DEMO_RECIPIENT_ENABLED=true → địa chỉ mô phỏng tính lại
 * mỗi lần, không lưu:
 *   - Đơn "neo" = đơn cũ nhất cần mô phỏng trong cùng nhóm gộp (không có nhóm → chính nó),
 *     để cả nhóm (cùng 1 người nhận) dùng chung 1 địa chỉ.
 *   - Số thứ tự = CARRIER_DEMO_START_NUMBER + số đơn bị che tạo TRƯỚC đơn neo (thứ tự
 *     created_at, rồi _id). Đơn mới đến sau không làm đổi số của đơn cũ.
 *   - SĐT: đơn số đầu tiên = CARRIER_DEMO_RECIPIENT_PHONE; còn lại sinh cố định theo _id
 *     của đơn neo (cùng đơn → cùng SĐT).
 * Đánh đổi đã nói với Thuận: xoá bớt đơn bị che cũ khỏi DB thì số của các đơn sau lùi lại.
 * Dùng chung cho báo giá / tạo vận đơn (LiveCarrierService) và in nhãn (DocumentsService).
 * ===================================================================
 */
@Injectable()
export class DemoRecipientService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly configService: ConfigService,
  ) {}

  settings(): DemoRecipientSettings {
    const key = (name: string): string => `carrier.demoRecipient.${name}`;
    const start = this.configService.get<number>(key('startNumber'));
    const phone = this.configService.get<string>('carrier.demoRecipientPhone')?.trim();
    let firstPhone: string | null = null;
    if (phone) firstPhone = phone;
    return {
      enabled: this.configService.get<boolean>(key('enabled')) === true,
      streetTemplate: this.configService.get<string>(key('streetTemplate')) ?? '47/{n} Nguyễn Văn Đậu',
      startNumber: typeof start === 'number' && Number.isFinite(start) ? start : 10,
      wardName: this.configService.get<string | null>(key('wardName')) ?? null,
      provinceName: this.configService.get<string | null>(key('provinceName')) ?? null,
      firstPhone,
    };
  }

  /** Địa chỉ mô phỏng của đơn, hoặc null (tắt, đơn đủ địa chỉ thật, thiếu cấu hình phường/tỉnh). */
  async resolve(order: OrderForDemo): Promise<DemoRecipientValue | null> {
    const settings = this.settings();
    if (!settings.enabled || !settings.wardName?.trim() || !settings.provinceName?.trim()) return null;
    if (!needsDemoRecipient(order.recipient)) return null;
    const anchor = await this.anchorOf(order);
    const createdAt = anchor.created_at ?? anchor._id.getTimestamp();
    const before = await this.orderModel.countDocuments({
      $and: [
        MASKED_FILTER,
        { $or: [{ created_at: { $lt: createdAt } }, { created_at: createdAt, _id: { $lt: anchor._id } }] },
      ],
    });
    return buildDemoRecipient(settings.startNumber + before, settings, seededRandom(String(anchor._id)));
  }

  /** Đơn cũ nhất cần mô phỏng trong cùng nhóm gộp — cả nhóm dùng chung 1 địa chỉ. */
  private async anchorOf(order: OrderForDemo): Promise<OrderForDemo> {
    if (!order.consolidated_group_id) return order;
    const siblings = await this.orderModel
      .find({ consolidated_group_id: order.consolidated_group_id })
      .select('_id recipient consolidated_group_id created_at')
      .sort({ created_at: 1, _id: 1 })
      .lean<OrderForDemo[]>();
    return siblings.find((o) => needsDemoRecipient(o.recipient)) ?? order;
  }
}
