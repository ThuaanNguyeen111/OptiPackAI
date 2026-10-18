import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { OrderStatus, UNFULFILLED_ORDER_STATUSES } from './enums/order-status.enum';
import {
  CONSOLIDATION_KEY_FIELDS,
  NORMAL_FLOW_ORDER_STATUSES,
  OPEN_GROUP_STATUS_CHOICES,
  OrderSyncPolicy,
  SYNC_PLATFORMS,
} from './order-sync-policy';
import { OrderSyncSettingsHistoryItem, OrderSyncSettingsService } from './order-sync-settings.service';
import { UpdateOrderSyncSettingsDto } from './dto/order-sync-settings.dto';

const STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.UNPAID]: 'Chưa thanh toán',
  [OrderStatus.PENDING]: 'Chờ xử lý',
  [OrderStatus.PACKED]: 'Đã đóng gói (trên sàn)',
  [OrderStatus.READY_TO_SHIP]: 'Sẵn sàng giao',
  [OrderStatus.SHIPPED]: 'Đang giao',
  [OrderStatus.DELIVERED]: 'Đã giao',
  [OrderStatus.CANCELED]: 'Đã hủy',
  [OrderStatus.RETURNED]: 'Đã hoàn',
  [OrderStatus.FAILED]: 'Thất bại',
  [OrderStatus.TO_PACK]: 'Chờ đóng gói',
  [OrderStatus.TO_SHIP]: 'Chờ bàn giao',
  [OrderStatus.LOST]: 'Thất lạc',
  [OrderStatus.LOST_BY_3PL]: 'Đơn vị vận chuyển làm mất',
  [OrderStatus.DAMAGED_BY_3PL]: 'Đơn vị vận chuyển làm hỏng',
  [OrderStatus.FAILED_DELIVERY]: 'Giao thất bại',
  [OrderStatus.SHIPPED_BACK]: 'Đang hoàn về',
  [OrderStatus.SHIPPED_BACK_SUCCESS]: 'Hoàn về thành công',
  [OrderStatus.SHIPPED_BACK_FAILED]: 'Hoàn về thất bại',
  [OrderStatus.PACKAGE_SCRAPPED]: 'Hàng bị hủy bỏ',
};
const KEY_FIELD_LABELS: Record<string, string> = {
  phone: 'Số điện thoại',
  address_line1: 'Địa chỉ (số nhà, đường)',
  city: 'Tỉnh/thành hoặc phường',
  full_name: 'Tên người nhận',
};
const OPEN_GROUP_LABELS: Record<string, string> = {
  awaiting_packaging: 'Chờ xử lý',
  picking: 'Đang lấy hàng',
};

interface Option {
  value: string;
  label: string;
}

export interface OrderSyncSettingsResponse {
  version: number | null;
  isDefault: boolean;
  updatedBy: string | null;
  updatedAt: Date | null;
  sync: {
    platforms: { platform: string; autoSyncEnabled: boolean }[];
    intervalMinutes: number;
    firstSyncLookbackDays: number;
    syncFailedCooldownMinutes: number;
  };
  consolidation: {
    enabled: boolean;
    keyFields: string[];
    timeWindowHours: number | null;
    openGroupStatuses: string[];
  };
  statuses: { consolidatable: string[]; notPackable: string[] };
  /** Lựa chọn hợp lệ kèm nhãn tiếng Việt — FE dựng form từ đây. */
  options: {
    platforms: Option[];
    keyFields: Option[];
    openGroupStatuses: Option[];
    consolidatableStatuses: Option[];
    notPackableStatuses: Option[];
  };
}

function toResponse(p: OrderSyncPolicy): OrderSyncSettingsResponse {
  return {
    version: p.version,
    isDefault: p.version === null,
    updatedBy: p.updatedBy,
    updatedAt: p.updatedAt,
    sync: {
      platforms: SYNC_PLATFORMS.map((platform) => ({ platform, autoSyncEnabled: p.sync.autoSyncEnabled[platform] !== false })),
      intervalMinutes: p.sync.intervalMinutes,
      firstSyncLookbackDays: p.sync.firstSyncLookbackDays,
      syncFailedCooldownMinutes: p.sync.syncFailedCooldownMinutes,
    },
    consolidation: { ...p.consolidation },
    statuses: { ...p.statuses },
    options: {
      platforms: SYNC_PLATFORMS.map((v) => ({ value: v, label: v === MarketplacePlatform.LAZADA ? 'Lazada' : 'AURELLE' })),
      keyFields: CONSOLIDATION_KEY_FIELDS.map((v) => ({ value: v, label: KEY_FIELD_LABELS[v] ?? v })),
      openGroupStatuses: OPEN_GROUP_STATUS_CHOICES.map((v) => ({ value: v, label: OPEN_GROUP_LABELS[v] ?? v })),
      consolidatableStatuses: UNFULFILLED_ORDER_STATUSES.map((v) => ({ value: v, label: STATUS_LABELS[v] })),
      notPackableStatuses: Object.values(OrderStatus)
        .filter((v) => !NORMAL_FLOW_ORDER_STATUSES.includes(v))
        .map((v) => ({ value: v, label: STATUS_LABELS[v] })),
    },
  };
}

/**
 * 15/10/2026 — Admin tự cấu hình tiêu chí đồng bộ đơn và gom đơn (trước đây viết
 * cứng trong code). Đường dẫn riêng `/order-sync-settings` (không lồng dưới
 * `/orders` để không đụng route `GET /orders/:id`).
 */
@ApiTags('Orders')
@ApiBearerAuth('JWT-auth')
@Controller('order-sync-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderSyncSettingsController {
  constructor(private readonly settingsService: OrderSyncSettingsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER)
  @ApiOperation({ summary: 'Tiêu chí đồng bộ & gom đơn đang hiệu lực (kèm danh sách lựa chọn có nhãn).' })
  async get(): Promise<OrderSyncSettingsResponse> {
    return toResponse(await this.settingsService.get());
  }

  @Put()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Lưu tiêu chí mới (tạo phiên bản mới). Trường không gửi giữ nguyên. Đổi trường gom → hệ thống tự tính lại khoá gom cho đơn chưa xử lý xong.',
  })
  async update(
    @Body() dto: UpdateOrderSyncSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderSyncSettingsResponse & { recomputingKeys: boolean }> {
    const { settings, recomputingKeys } = await this.settingsService.update(dto, user.userId);
    return { ...toResponse(settings), recomputingKeys };
  }

  @Get('history')
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER)
  @ApiOperation({ summary: 'Lịch sử các phiên bản tiêu chí (ai đổi, lúc nào, ghi chú).' })
  async history(@Query('limit') limit?: string): Promise<OrderSyncSettingsHistoryItem[]> {
    return this.settingsService.history(Number(limit) || 20);
  }
}
