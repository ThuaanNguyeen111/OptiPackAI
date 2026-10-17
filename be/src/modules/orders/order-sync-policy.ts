import {
  NOT_PACKABLE_ORDER_STATUSES,
  OrderStatus,
  UNFULFILLED_ORDER_STATUSES,
} from './enums/order-status.enum';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

/**
 * ===================================================================
 * TIÊU CHÍ ĐỒNG BỘ & GOM ĐƠN — Admin cấu hình (15/10/2026)
 * ===================================================================
 * Trước đây các giá trị dưới đây viết cứng trong code. Nay lưu ở
 * `order_sync_settings` (nhiều phiên bản), Admin sửa qua
 * `PUT /order-sync-settings`. MẶC ĐỊNH = đúng giá trị cũ → chưa ai lưu thì
 * hệ thống chạy y hệt trước.
 *
 * Bản đang hiệu lực được giữ ở biến cấp module dưới đây (OrderSyncSettingsService
 * nạp lúc khởi động, sau mỗi lần lưu và định kỳ 30 giây). Các module khác
 * (order-groups, packing, documents, shipping) đọc qua hàm `orderSyncPolicy()`
 * — không phải inject service, không vòng phụ thuộc module.
 * ===================================================================
 */

export const CONSOLIDATION_KEY_FIELDS = ['phone', 'address_line1', 'city', 'full_name'] as const;
export type ConsolidationKeyField = (typeof CONSOLIDATION_KEY_FIELDS)[number];

/** Trạng thái nhóm được phép nhận thêm đơn gộp đến muộn. */
export const OPEN_GROUP_STATUS_CHOICES = ['awaiting_packaging', 'picking'] as const;
export type OpenGroupStatus = (typeof OPEN_GROUP_STATUS_CHOICES)[number];

/** Trạng thái thuộc luồng giao hàng bình thường — không được coi là "không đóng gói được". */
export const NORMAL_FLOW_ORDER_STATUSES: OrderStatus[] = [
  ...UNFULFILLED_ORDER_STATUSES,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

export const SYNC_PLATFORMS = [MarketplacePlatform.LAZADA, MarketplacePlatform.AURELLE] as const;

export interface OrderSyncPolicy {
  /** null = đang dùng mặc định trong code (chưa ai lưu). */
  version: number | null;
  sync: {
    autoSyncEnabled: Record<string, boolean>;
    intervalMinutes: number;
    firstSyncLookbackDays: number;
    syncFailedCooldownMinutes: number;
  };
  consolidation: {
    enabled: boolean;
    keyFields: ConsolidationKeyField[];
    timeWindowHours: number | null;
    openGroupStatuses: OpenGroupStatus[];
  };
  statuses: {
    consolidatable: OrderStatus[];
    notPackable: OrderStatus[];
  };
  updatedBy: string | null;
  updatedAt: Date | null;
}

export const DEFAULT_ORDER_SYNC_POLICY: OrderSyncPolicy = {
  version: null,
  sync: {
    autoSyncEnabled: { [MarketplacePlatform.LAZADA]: true, [MarketplacePlatform.AURELLE]: true },
    intervalMinutes: 5,
    firstSyncLookbackDays: 30,
    syncFailedCooldownMinutes: 20,
  },
  consolidation: {
    enabled: true,
    keyFields: ['phone', 'address_line1', 'city'],
    timeWindowHours: null,
    openGroupStatuses: ['awaiting_packaging', 'picking'],
  },
  statuses: {
    consolidatable: [...UNFULFILLED_ORDER_STATUSES],
    notPackable: [...NOT_PACKABLE_ORDER_STATUSES],
  },
  updatedBy: null,
  updatedAt: null,
};

let current: OrderSyncPolicy = DEFAULT_ORDER_SYNC_POLICY;

/** Bản tiêu chí đang hiệu lực (đồng bộ, không gọi DB). */
export function orderSyncPolicy(): OrderSyncPolicy {
  return current;
}

/** Trạng thái đơn KHÔNG còn lấy hàng / đóng gói (hủy, thất lạc, hư hỏng...). */
export function notPackableStatuses(): OrderStatus[] {
  return current.statuses.notPackable;
}

/** Chỉ OrderSyncSettingsService gọi (và test). */
export function setOrderSyncPolicy(policy: OrderSyncPolicy): void {
  current = policy;
}
