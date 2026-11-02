import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { ProductCategory } from '../src/common/enums/product-category.enum';
import { MarketplacePlatform } from '../src/modules/marketplace-integration/enums/platform.enum';
import { GroupFulfillmentStatus } from '../src/modules/order-groups/enums/group-fulfillment-status.enum';
import { OrderGroup, OrderGroupDocument } from '../src/modules/order-groups/schemas/order-group.schema';
import { PickEvent, PickEventDocument } from '../src/modules/order-groups/schemas/pick-event.schema';
import { OrderStatus } from '../src/modules/orders/enums/order-status.enum';
import { Order, OrderDocument } from '../src/modules/orders/schemas/order.schema';
import { PackingPlanService } from '../src/modules/packing/packing-plan.service';
import { PackingPlan, PackingPlanDocument } from '../src/modules/packing/schemas/packing-plan.schema';
import {
  PackagingMaterial,
  PackagingMaterialDocument,
} from '../src/modules/packaging-materials/schemas/packaging-material.schema';
import { PackagingBag, PackagingBagDocument } from '../src/modules/packaging/schemas/packaging-bag.schema';
import {
  ProductMaster,
  ProductMasterDocument,
} from '../src/modules/product-master/schemas/product-master.schema';

/**
 * Đơn demo để xem khung 3D ở màn đóng gói: 1 đơn đủ các loại hàng có model.
 * Chỉ đụng bản ghi của shop giả DEMO-3D-VIEW. Không sửa tồn thùng, không đổi cài đặt đóng gói.
 *
 *   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/seed-3d-view-demo.ts          # tạo lại
 *   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/seed-3d-view-demo.ts --clean  # chỉ xoá
 */

const SHOP_ID = 'DEMO-3D-VIEW';
const ORDER_NO = 'DEMO-3D-1';
const PLATFORM = MarketplacePlatform.LAZADA;
const ZIP_BAG = { code: 'DEMO-ZIP-L', name: 'Túi zip L 45×60 cm (mẫu)', width_mm: 450, length_mm: 600, price_vnd: 1200 };

const PRODUCTS: { sku: string; name: string; cm: [number, number, number]; kg: number; category: ProductCategory; zip: boolean }[] = [
  { sku: 'DEMO3D-SO-MI', name: 'Áo sơ mi dài tay', cm: [36, 26, 5], kg: 0.3, category: ProductCategory.SHIRT, zip: true },
  { sku: 'DEMO3D-AO-THUN', name: 'Áo thun cổ tròn', cm: [36, 24, 4], kg: 0.22, category: ProductCategory.T_SHIRT, zip: true },
  { sku: 'DEMO3D-QUAN-DAI', name: 'Quần dài', cm: [38, 30, 6], kg: 0.65, category: ProductCategory.TROUSERS, zip: true },
  { sku: 'DEMO3D-QUAN-SHORT', name: 'Quần short', cm: [30, 24, 4], kg: 0.3, category: ProductCategory.SHORTS, zip: true },
  { sku: 'DEMO3D-VAY', name: 'Váy đầm', cm: [32, 25, 3], kg: 0.25, category: ProductCategory.DRESS, zip: false },
  { sku: 'DEMO3D-AO-KHOAC', name: 'Áo khoác bomber', cm: [35, 30, 6], kg: 0.7, category: ProductCategory.JACKET, zip: true },
  { sku: 'DEMO3D-GIAY', name: 'Giày (hộp gốc)', cm: [33, 21, 12], kg: 0.9, category: ProductCategory.SHOES, zip: false },
  { sku: 'DEMO3D-TUI-XACH', name: 'Túi xách', cm: [30, 24, 12], kg: 0.6, category: ProductCategory.BAG, zip: false },
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  // Script chỉ tạo dữ liệu: tắt mọi cron trong tiến trình này để không chạy đồng bộ, không tính trùng.
  const scheduler = app.get(SchedulerRegistry);
  for (const job of scheduler.getCronJobs().values()) void job.stop();

  const orderModel = app.get<Model<OrderDocument>>(getModelToken(Order.name));
  const groupModel = app.get<Model<OrderGroupDocument>>(getModelToken(OrderGroup.name));
  const pickModel = app.get<Model<PickEventDocument>>(getModelToken(PickEvent.name));
  const productModel = app.get<Model<ProductMasterDocument>>(getModelToken(ProductMaster.name));
  const planModel = app.get<Model<PackingPlanDocument>>(getModelToken(PackingPlan.name));
  const bagModel = app.get<Model<PackagingBagDocument>>(getModelToken(PackagingBag.name));
  const materialModel = app.get<Model<PackagingMaterialDocument>>(getModelToken(PackagingMaterial.name));

  const oldIds = (await groupModel.find({ shop_id: SHOP_ID }).select('_id').lean()).map((g) => g._id);
  await pickModel.deleteMany({ order_group_id: { $in: oldIds } });
  await planModel.deleteMany({ order_group_id: { $in: oldIds } });
  await groupModel.deleteMany({ shop_id: SHOP_ID });
  await orderModel.deleteMany({ shop_id: SHOP_ID });
  await productModel.deleteMany({ shop_id: SHOP_ID });
  console.log(`Đã xoá dữ liệu demo cũ: ${String(oldIds.length)} nhóm.`);
  if (process.argv.includes('--clean')) {
    await app.close();
    return;
  }

  const boxes = await materialModel
    .find({ kind: 'box', is_active: { $ne: false } })
    .select('code qty_new qty_reused')
    .lean();
  console.log('Thùng đang dùng:', boxes.map((b) => `${b.code}=${String((b.qty_new ?? 0) + (b.qty_reused ?? 0))}`).join(', '));

  await bagModel.updateOne(
    { code: ZIP_BAG.code },
    { $setOnInsert: { ...ZIP_BAG, is_active: true, is_sample: true, quantity_on_hand: 100 } },
    { upsert: true },
  );

  const now = new Date();
  await productModel.insertMany(
    PRODUCTS.map((p) => ({
      platform: PLATFORM,
      shop_id: SHOP_ID,
      seller_sku: p.sku,
      dimension: { package_length_cm: p.cm[0], package_width_cm: p.cm[1], package_height_cm: p.cm[2], package_weight_kg: p.kg },
      is_fragile: false,
      packaging_profile_status: 'ready',
      orientation_rule: 'any',
      max_stack_load_kg: 5,
      product_category: p.category,
      zip_bag_code: p.zip ? ZIP_BAG.code : null,
      zip_bag_folded: false,
      can_fold_in_half: false,
      profile_confirmed_at: now,
      last_synced_at: now,
    })),
  );

  const group = await groupModel.create({
    platform: PLATFORM,
    shop_id: SHOP_ID,
    order_count: 1,
    fulfillment_status: GroupFulfillmentStatus.PICKED,
    shop_name_snapshot: 'Shop demo 3D (dữ liệu mẫu)',
    pick_round: 0,
    last_picked_at: now,
  });
  const items = PRODUCTS.map((p, i) => ({
    platform_order_item_id: `${ORDER_NO}-${String(i + 1)}`,
    sku: p.sku,
    name: p.name,
    quantity: 1,
    unit_price: 100000,
    status: OrderStatus.PENDING,
  }));
  await orderModel.create({
    platform: PLATFORM,
    shop_id: SHOP_ID,
    platform_order_id: ORDER_NO,
    status: OrderStatus.PENDING,
    recipient: {
      full_name: 'Khách demo 3D',
      phone: '0900000301',
      address_line1: '123 Đường Demo',
      city: 'TP. Hồ Chí Minh',
      country: 'VN',
    },
    consolidation_key: 'demo-3d-view',
    items,
    total_amount: items.reduce((sum, i) => sum + i.unit_price, 0),
    currency: 'VND',
    is_consolidated: false,
    consolidated_group_id: group._id,
    synced_at: now,
  });
  await pickModel.insertMany(
    PRODUCTS.map((p) => ({
      order_group_id: group._id,
      seller_sku: p.sku,
      scanned_quantity: 1,
      scan_method: 'manual',
      remaining_stock_after: 99,
      pick_round: 0,
    })),
  );

  const service = app.get(PackingPlanService);
  await service.compute(group._id.toString());
  const plan = await service.getActivePlan(group._id.toString());
  console.log(`Nhóm: ${group._id.toString()} · đơn ${ORDER_NO} · trạng thái kế hoạch: ${plan?.status ?? 'không có'}`);
  for (const order of plan?.orders ?? []) {
    console.log(`Đơn ${order.platform_order_id ?? '?'}: ${order.status} ${order.unplaced.map((u) => `${u.item_key}:${u.code}`).join(', ')}`);
  }
  for (const parcel of plan?.parcels ?? []) {
    console.log(`Kiện ${String(parcel.parcel_no)}: ${parcel.box.code} · ${parcel.placements.map((p) => p.sku).join(', ')}`);
  }
  await app.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
