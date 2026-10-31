import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './schemas/order.schema';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { LazadaOrderSyncScheduler } from './lazada-order-sync.scheduler';
import { MarketplaceIntegrationModule } from '../marketplace-integration/marketplace-integration.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrderGroupsModule } from '../order-groups/order-groups.module';
import { OrderSyncSettings, OrderSyncSettingsSchema } from './schemas/order-sync-settings.schema';
import { OrderSyncSettingsService } from './order-sync-settings.service';
import { OrderSyncSettingsController } from './order-sync-settings.controller';
import { ConsolidationRulesService } from './consolidation-rules.service';
import { ConsolidationRulesController } from './consolidation-rules.controller';

/**
 * ===================================================================
 * MODULE `orders` — ĐỒNG BỘ + CHUẨN HÓA + GỘP ĐƠN (Mainflow 1)
 * ===================================================================
 * Import MarketplaceIntegrationModule (không phải MongooseModule cho
 * marketplace_shops) — đúng ranh giới đã thiết lập: mọi truy cập dữ
 * liệu shop đi qua MarketplaceIntegrationService/LazadaAdapter đã được
 * export, KHÔNG tự đăng ký lại schema MarketplaceShop ở đây (2 module
 * cùng đăng ký 1 schema là dấu hiệu ranh giới module bị vi phạm).
 *
 * KHÔNG import ScheduleModule ở đây — @Cron() (dùng trong
 * LazadaOrderSyncScheduler) chỉ hoạt động khi ScheduleModule.forRoot()
 * được gọi Ở GỐC APP (app.module.ts), gọi lại ở module con không có
 * tác dụng gì thêm và dễ gây hiểu nhầm "mỗi module tự có lịch riêng".
 * ===================================================================
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderSyncSettings.name, schema: OrderSyncSettingsSchema }, // 15/10/2026 — tiêu chí đồng bộ & gom đơn
    ]),
    MarketplaceIntegrationModule,
    NotificationsModule,
    // BỔ SUNG (21/09/2026, báo cáo thật từ FE) — tạo OrderGroup ngay
    // sau sync (xem hook trong orders.service.ts). AN TOÀN, không
    // circular — OrderGroupsModule chủ động KHÔNG import OrdersModule
    // ngược lại (đã dự đoán trước, xem comment trong order-groups.module.ts).
    OrderGroupsModule,
  ],
  controllers: [OrdersController, OrderSyncSettingsController, ConsolidationRulesController],
  providers: [OrdersService, LazadaOrderSyncScheduler, OrderSyncSettingsService, ConsolidationRulesService],
  exports: [OrdersService],
})
export class OrdersModule {}
