import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { OrderGroup, OrderGroupSchema } from '../order-groups/schemas/order-group.schema';
import { Shipment, ShipmentSchema } from '../shipments/schemas/shipment.schema';
import { ReturnRequest, ReturnRequestSchema } from '../shipments/schemas/return-request.schema';
import { PackingPlan, PackingPlanSchema } from '../packing/schemas/packing-plan.schema';
import {
  MarketplaceStatusOutbox,
  MarketplaceStatusOutboxSchema,
} from '../marketplace-writeback/schemas/status-outbox.schema';
import { SkuBinAssignment, SkuBinAssignmentSchema } from '../warehouse/schemas/sku-bin-assignment.schema';
import { PackagingMaterial, PackagingMaterialSchema } from '../packaging-materials/schemas/packaging-material.schema';
import { PackingModule } from '../packing/packing.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * 28/10/2026 — Bảng điều khiển. Chỉ ĐỌC: đăng ký lại schema các module khác (pattern cross-module
 * của dự án), dùng PackingReportService cho chi phí bao bì. Không module nào import ngược lại.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderGroup.name, schema: OrderGroupSchema },
      { name: Shipment.name, schema: ShipmentSchema },
      { name: ReturnRequest.name, schema: ReturnRequestSchema },
      { name: PackingPlan.name, schema: PackingPlanSchema },
      { name: MarketplaceStatusOutbox.name, schema: MarketplaceStatusOutboxSchema },
      { name: SkuBinAssignment.name, schema: SkuBinAssignmentSchema },
      { name: PackagingMaterial.name, schema: PackagingMaterialSchema },
    ]),
    PackingModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
