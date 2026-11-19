import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ShipmentsService } from './shipments.service';

/** Mỗi 15 phút: gắn cờ + gửi thông báo các vận đơn quá hạn giao. */
@Injectable()
export class ShipmentSlaScheduler {
  private readonly logger = new Logger(ShipmentSlaScheduler.name);

  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Cron('*/15 * * * *')
  async run(): Promise<void> {
    try {
      const flagged = await this.shipmentsService.flagOverdueShipments();
      if (flagged > 0) this.logger.warn(`Gắn cờ quá hạn giao cho ${String(flagged)} vận đơn.`);
    } catch (error) {
      this.logger.error('Quét vận đơn quá hạn thất bại.', error);
    }
  }

  /** AOFP-324 — mỗi 30 phút: hỏi lại hãng các vận đơn chưa kết thúc, im lặng ≥ 6 giờ (mất webhook). */
  @Cron('*/30 * * * *')
  async syncStaleCarrier(): Promise<void> {
    try {
      const { synced, failed } = await this.shipmentsService.syncStaleCarrierShipments();
      if (synced + failed > 0) this.logger.log(`Đồng bộ hãng: ${String(synced)} vận đơn, ${String(failed)} lỗi.`);
    } catch (error) {
      this.logger.error('Đồng bộ vận đơn hãng thất bại.', error);
    }
  }
}
