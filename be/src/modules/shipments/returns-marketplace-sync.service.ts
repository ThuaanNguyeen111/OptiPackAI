import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MarketplaceIntegrationService } from '../marketplace-integration/marketplace-integration.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import {
  MARKETPLACE_ADAPTERS,
  MarketplaceAdapter,
} from '../marketplace-integration/interfaces/marketplace-adapter.interface';
import { ReturnsService } from './returns.service';

const PAGE_SIZE = 50;
const MAX_PAGES = 5;

export interface ReturnsSyncResult {
  pulled: number;
  created: number;
  rejected: number;
  pending: number;
}

/**
 * 20/10/2026 — Kéo yêu cầu trả hàng của khách từ sàn (AURELLE) về thành phiếu RMA.
 * Kích hoạt bởi webhook `return_requested` (gần như tức thì) và cron 2 phút làm lưới an toàn.
 * Idempotent: phiếu đã tạo (`external_ref`) bị bỏ qua nên chạy trùng/lặp đều an toàn. Yêu cầu không
 * thể hợp lệ (quá hạn, sai món, chưa giao) được báo TỪ CHỐI ngược cho khách kèm lý do thay vì treo mãi.
 */
@Injectable()
export class ReturnsMarketplaceSyncService {
  private readonly logger = new Logger(ReturnsMarketplaceSyncService.name);
  private isRunning = false;

  constructor(
    @Inject(MARKETPLACE_ADAPTERS)
    private readonly adapters: Partial<Record<MarketplacePlatform, MarketplaceAdapter>>,
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
    private readonly returnsService: ReturnsService,
  ) {}

  async syncShop(platform: MarketplacePlatform, shopId: string): Promise<ReturnsSyncResult> {
    const result: ReturnsSyncResult = { pulled: 0, created: 0, rejected: 0, pending: 0 };
    const adapter = this.adapters[platform];
    if (!adapter?.listReturns) return result;

    const token = await this.marketplaceIntegrationService.getValidAccessToken(shopId, platform);
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const { returns } = await adapter.listReturns(token, { status: 'requested', offset, limit: PAGE_SIZE });
      if (returns.length === 0) break;

      let removedFromQueue = 0; // phiếu bị từ chối khỏi danh sách "requested" → không cộng vào offset
      for (const raw of returns) {
        result.pulled += 1;
        const outcome = await this.returnsService.createFromMarketplace(platform, shopId, raw);
        switch (outcome.outcome) {
          case 'created':
            result.created += 1;
            break;
          case 'rejected':
            result.rejected += 1;
            removedFromQueue += 1;
            await this.rejectOnMarketplace(adapter, token, raw.return_id, outcome.reason);
            break;
          case 'busy':
          case 'order_not_ready':
            result.pending += 1; // còn "requested" bên sàn, lượt sau thử lại
            break;
          case 'exists':
            break;
        }
      }
      if (returns.length < PAGE_SIZE) break;
      offset += returns.length - removedFromQueue;
    }
    return result;
  }

  /** Cron 2 phút: quét mọi shop AURELLE đã kết nối. Lỗi 1 shop không chặn shop khác. */
  @Cron('0 */2 * * * *', { name: 'marketplace-returns-sync' })
  async syncAllShops(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const shops = await this.marketplaceIntegrationService.listConnectedShops(MarketplacePlatform.AURELLE);
      for (const shop of shops) {
        try {
          const result = await this.syncShop(MarketplacePlatform.AURELLE, shop.shop_id);
          if (result.created > 0 || result.rejected > 0) {
            this.logger.log(
              `Trả hàng ${shop.shop_id}: ${String(result.created)} phiếu mới, ${String(result.rejected)} bị từ chối, ${String(result.pending)} chờ thử lại.`,
            );
          }
        } catch (error: unknown) {
          this.logger.warn(`Đồng bộ trả hàng shop ${shop.shop_id} lỗi: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async rejectOnMarketplace(
    adapter: MarketplaceAdapter,
    token: string,
    returnId: string,
    reason: string,
  ): Promise<void> {
    try {
      await adapter.updateReturnStatus?.(token, {
        returnId,
        status: 'rejected',
        eventTime: new Date(),
        decisionNote: reason,
        idempotencyKey: `autoreject:${returnId}`,
      });
    } catch (error: unknown) {
      // Không từ chối được bên sàn thì lượt sau gặp lại phiếu vẫn "requested" và thử lại.
      this.logger.warn(`Báo từ chối yêu cầu trả hàng ${returnId} thất bại: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
