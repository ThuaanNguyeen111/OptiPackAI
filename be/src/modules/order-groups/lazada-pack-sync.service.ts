import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LazadaPackItemResult,
  LazadaPackStatus,
  OrderGroup,
  OrderGroupDocument,
} from './schemas/order-group.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import {
  NOT_PACKABLE_ORDER_STATUSES,
  OrderStatus,
} from '../orders/enums/order-status.enum';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import {
  LazadaAdapter,
  LazadaPackItemResultRaw,
  LazadaPackRequest,
  LazadaPackResponse,
  parseLazadaBoolean,
} from '../marketplace-integration/adapters/lazada.adapter';
import { MarketplaceIntegrationService } from '../marketplace-integration/marketplace-integration.service';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { AppException } from '../../common/exceptions/app-exception';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';

/**
 * ===================================================================
 * BÁO "ĐÃ ĐÓNG GÓI" LÊN LAZADA — 02/10/2026 (yêu cầu của cô trong buổi meet)
 * ===================================================================
 * Chạy NGAY SAU KHI nút "pack" của OptiPack chuyển nhóm sang `packed` thành công.
 * Trạng thái `packed` của OptiPack vẫn là trạng thái chính (giao hàng G1, trừ vật
 * liệu G4 dựa vào nó); bước này chỉ báo cho sàn, thành công hay lỗi đều ghi lại
 * trên nhóm đơn và KHÔNG BAO GIỜ ném lỗi ra ngoài (không làm hỏng nút "pack").
 *
 * Quy tắc chọn món gửi lên Lazada:
 *  - Chỉ nhóm thuộc Lazada; bỏ đơn đổi hàng `EXC-...` (không tồn tại trên Lazada).
 *  - Bỏ đơn đã hủy / gặp sự cố (NOT_PACKABLE_ORDER_STATUSES — cùng quy tắc Picking List).
 *  - Chỉ gửi món đang `pending`/`topack` (Lazada chỉ cho Pack món pending/repacked).
 *    Món đã `packed` trở đi (seller tự bấm trên Seller Center) -> ghi nhận là đã xong.
 *  - Tối đa 20 đơn / request (giới hạn Lazada).
 * Cầu dao: marketplace.lazada.writeApisEnabled (env LAZADA_WRITE_APIS_ENABLED=true).
 * ===================================================================
 */
export interface LazadaPackSyncResult {
  status: LazadaPackStatus;
  attemptedAt: Date;
  error: string | null;
  items: LazadaPackItemResult[];
}

const PACKABLE_ITEM_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.TO_PACK,
];
const ALREADY_PACKED_ITEM_STATUSES: OrderStatus[] = [
  OrderStatus.PACKED,
  OrderStatus.TO_SHIP,
  OrderStatus.READY_TO_SHIP,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];
const MAX_ORDERS_PER_PACK = 20;
// Mã lỗi Lazada nghĩa là "trạng thái món không cho đóng gói" (đã đóng gói / đã hủy trên sàn).
const STATE_ERROR_CODES = new Set(['700000', '700026', '700031']);

interface PackOrderEntry {
  orderId: string;
  itemIds: string[];
}

@Injectable()
export class LazadaPackSyncService {
  private readonly logger = new Logger(LazadaPackSyncService.name);

  constructor(
    @InjectModel(OrderGroup.name)
    private readonly orderGroupModel: Model<OrderGroupDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    private readonly lazadaAdapter: LazadaAdapter,
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
    private readonly configService: ConfigService,
  ) {}

  private isEnabled(): boolean {
    return (
      this.configService.get<boolean>('marketplace.lazada.writeApisEnabled') ===
      true
    );
  }

  private allocateType(): string {
    return (
      this.configService.get<string>(
        'marketplace.lazada.shippingAllocateType',
      ) ?? 'TFS'
    );
  }

  /** Gửi lại cho nhóm đã `packed` mà lần trước chưa thành công. */
  async retryGroup(groupId: string): Promise<LazadaPackSyncResult> {
    if (!Types.ObjectId.isValid(groupId)) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.INVALID_GROUP_ID,
        `"${groupId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { groupId },
      );
    }
    const group = await this.orderGroupModel
      .findById(groupId)
      .select('fulfillment_status lazada_pack_status')
      .lean();
    if (!group) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.GROUP_NOT_FOUND,
        `Không tìm thấy order group với id "${groupId}".`,
        HttpStatus.NOT_FOUND,
        { groupId },
      );
    }
    if (group.fulfillment_status !== GroupFulfillmentStatus.PACKED) {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.LAZADA_PACK_NOT_ALLOWED,
        'Chỉ gửi lại lên Lazada khi nhóm đơn đang ở trạng thái "packed".',
        HttpStatus.CONFLICT,
        { groupId, fulfillmentStatus: group.fulfillment_status },
      );
    }
    if (group.lazada_pack_status === 'success') {
      throw new AppException(
        ORD_GROUP_ERROR_CODES.LAZADA_PACK_NOT_ALLOWED,
        'Nhóm đơn đã báo đóng gói lên Lazada thành công, không cần gửi lại.',
        HttpStatus.CONFLICT,
        { groupId },
      );
    }
    return await this.syncGroup(groupId);
  }

  /** Không bao giờ ném lỗi — mọi kết quả (kể cả lỗi) được lưu lên nhóm đơn và trả về. */
  async syncGroup(groupId: string): Promise<LazadaPackSyncResult> {
    const attemptedAt = new Date();
    try {
      const group = await this.orderGroupModel
        .findById(groupId)
        .select('platform shop_id')
        .lean();
      if (!group) {
        return {
          status: 'failed',
          attemptedAt,
          error: 'Không tìm thấy nhóm đơn.',
          items: [],
        };
      }
      if (group.platform !== MarketplacePlatform.LAZADA) {
        return await this.save(
          groupId,
          attemptedAt,
          'skipped',
          'Nhóm đơn không thuộc Lazada.',
          [],
        );
      }

      const { entries, alreadyPacked } = await this.collectItems(group._id);

      if (entries.length === 0) {
        return alreadyPacked.length > 0
          ? await this.save(
              groupId,
              attemptedAt,
              'success',
              null,
              alreadyPacked,
            )
          : await this.save(
              groupId,
              attemptedAt,
              'skipped',
              'Không có món nào cần báo đóng gói lên Lazada (đơn đổi hàng, đơn đã hủy hoặc đã đóng gói).',
              [],
            );
      }

      if (!this.isEnabled()) {
        return await this.save(
          groupId,
          attemptedAt,
          'disabled',
          'Cầu dao LAZADA_WRITE_APIS_ENABLED đang tắt — chưa gửi lên Lazada.',
          alreadyPacked,
        );
      }

      const accessToken =
        await this.marketplaceIntegrationService.getValidAccessToken(
          group.shop_id,
          MarketplacePlatform.LAZADA,
        );

      const results: LazadaPackItemResult[] = [...alreadyPacked];
      for (let i = 0; i < entries.length; i += MAX_ORDERS_PER_PACK) {
        const chunk = entries.slice(i, i + MAX_ORDERS_PER_PACK);
        const request: LazadaPackRequest = {
          pack_order_list: chunk.map((e) => ({
            order_id: Number(e.orderId),
            order_item_list: e.itemIds.map(Number),
          })),
          delivery_type: 'dropship',
          shipping_allocate_type: this.allocateType(),
        };
        const response = await this.lazadaAdapter.packOrders(
          accessToken,
          request,
        );
        results.push(...this.readResults(chunk, response));
      }

      const okCount = results.filter((r) => r.ok).length;
      const status: LazadaPackStatus =
        okCount === results.length
          ? 'success'
          : okCount === 0
            ? 'failed'
            : 'partial';
      const failedMessages = results
        .filter((r) => !r.ok)
        .map(
          (r) =>
            `Đơn ${r.order_id} / món ${r.order_item_id}: ${r.msg ?? 'lỗi không rõ'}`,
        );
      return await this.save(
        groupId,
        attemptedAt,
        status,
        failedMessages.length > 0 ? failedMessages.join('; ') : null,
        results,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Báo đóng gói lên Lazada cho nhóm ${groupId} thất bại: ${message}`,
      );
      return this.save(groupId, attemptedAt, 'failed', message, []);
    }
  }

  private async collectItems(groupId: Types.ObjectId): Promise<{
    entries: PackOrderEntry[];
    alreadyPacked: LazadaPackItemResult[];
  }> {
    const orders = await this.orderModel
      .find({
        consolidated_group_id: groupId,
        status: { $nin: NOT_PACKABLE_ORDER_STATUSES },
      })
      .select('platform_order_id origin items')
      .lean();

    const entries: PackOrderEntry[] = [];
    const alreadyPacked: LazadaPackItemResult[] = [];
    for (const order of orders) {
      // Đơn đổi hàng do OptiPack tự tạo — không tồn tại trên Lazada.
      if (
        order.origin === 'replacement' ||
        order.platform_order_id.startsWith('EXC-')
      )
        continue;
      const itemIds: string[] = [];
      for (const item of order.items) {
        if (PACKABLE_ITEM_STATUSES.includes(item.status)) {
          itemIds.push(item.platform_order_item_id);
        } else if (ALREADY_PACKED_ITEM_STATUSES.includes(item.status)) {
          alreadyPacked.push({
            order_id: order.platform_order_id,
            order_item_id: item.platform_order_item_id,
            ok: true,
            item_err_code: null,
            msg: `Món đã ở trạng thái "${item.status}" trên Lazada — không gửi lại.`,
            package_id: null,
            tracking_number: null,
            shipment_provider: null,
          });
        }
      }
      if (itemIds.length > 0)
        entries.push({ orderId: order.platform_order_id, itemIds });
    }
    return { entries, alreadyPacked };
  }

  private readResults(
    chunk: PackOrderEntry[],
    response: LazadaPackResponse,
  ): LazadaPackItemResult[] {
    const result = response.result;
    if (!parseLazadaBoolean(result?.success)) {
      const batchError = `Lazada từ chối cả lô (${result?.error_code ?? 'không mã'}): ${result?.error_msg ?? 'không rõ lý do'}`;
      return chunk.flatMap((e) =>
        e.itemIds.map((itemId) =>
          this.failedItem(
            e.orderId,
            itemId,
            result?.error_code ?? null,
            batchError,
          ),
        ),
      );
    }

    const returned = new Map<string, LazadaPackItemResultRaw>();
    for (const order of result?.data?.pack_order_list ?? []) {
      for (const item of order.order_item_list ?? []) {
        if (item.order_item_id !== undefined)
          returned.set(String(item.order_item_id), item);
      }
    }

    return chunk.flatMap((e) =>
      e.itemIds.map((itemId): LazadaPackItemResult => {
        const raw = returned.get(itemId);
        if (!raw) {
          return this.failedItem(
            e.orderId,
            itemId,
            null,
            'Lazada không trả kết quả cho món này.',
          );
        }
        const code =
          raw.item_err_code === undefined ? null : String(raw.item_err_code);
        const ok = code === '0';
        const hint =
          code && STATE_ERROR_CODES.has(code)
            ? ' (trạng thái món trên Lazada không cho đóng gói — có thể đã đóng gói hoặc đã hủy trên Seller Center)'
            : '';
        return {
          order_id: e.orderId,
          order_item_id: itemId,
          ok,
          item_err_code: code,
          msg: ok
            ? (raw.msg ?? 'success')
            : `${raw.msg ?? 'Lazada báo lỗi'}${hint}`,
          package_id: raw.package_id ?? null,
          tracking_number: raw.tracking_number ?? null,
          shipment_provider: raw.shipment_provider ?? null,
        };
      }),
    );
  }

  private failedItem(
    orderId: string,
    itemId: string,
    code: string | null,
    msg: string,
  ): LazadaPackItemResult {
    return {
      order_id: orderId,
      order_item_id: itemId,
      ok: false,
      item_err_code: code,
      msg,
      package_id: null,
      tracking_number: null,
      shipment_provider: null,
    };
  }

  /** Ghi bằng updateOne — KHÔNG tăng __v (Rule #18), không làm hỏng expected_version của FE. */
  private async save(
    groupId: string,
    attemptedAt: Date,
    status: LazadaPackStatus,
    error: string | null,
    items: LazadaPackItemResult[],
  ): Promise<LazadaPackSyncResult> {
    try {
      await this.orderGroupModel.updateOne(
        { _id: groupId },
        {
          $set: {
            lazada_pack_status: status,
            lazada_pack_attempted_at: attemptedAt,
            lazada_pack_error: error,
            lazada_pack_items: items,
          },
        },
      );
    } catch (saveError) {
      this.logger.warn(
        `Không lưu được kết quả báo đóng gói Lazada cho nhóm ${groupId}.`,
        saveError,
      );
    }
    return { status, attemptedAt, error, items };
  }
}
