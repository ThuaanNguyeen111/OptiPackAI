import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
// (13/11/2026) Độ dày quần áo lấy từ GSM mặc định (PACKAGING_STANDARD §5.2) — số cm thứ 3 chỉ còn dùng cho hàng khác.
import { garmentThicknessCm } from '../src/modules/product-master/garment-thickness';
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
  ProductMaster,
  ProductMasterDocument,
} from '../src/modules/product-master/schemas/product-master.schema';

/**
 * Đơn mẫu cho bảng "luật chọn bao bì theo tổ hợp hàng" (13/11/2026) — mỗi trường
 * hợp 1 nhóm đã nhặt xong, tính kế hoạch ngay để xem trên màn đóng gói.
 * Chỉ đụng bản ghi của shop giả DEMO-PACK-RULES. Không sửa tồn thùng/túi, không đổi cài đặt.
 * Muốn xem nhánh túi niêm phong: chạy scripts/seed-packaging-mailers.ts trước (nhập túi THẬT vào kho).
 *
 *   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/seed-packing-rules-demo.ts          # tạo lại
 *   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/seed-packing-rules-demo.ts --clean  # chỉ xoá
 */

const SHOP_ID = 'DEMO-PACK-RULES';
const PLATFORM = MarketplacePlatform.LAZADA;

interface DemoProduct {
  name: string;
  cm: [number, number, number];
  kg: number;
  category: ProductCategory;
  fold: boolean;
  stackKg: number | null;
  fragile: boolean;
  /** Túi zip có sẵn trong kho (ZIP-M). Quần áo: cạnh thứ 3 của `cm` bị thay bằng độ dày tính từ GSM. */
  zipFolded?: boolean;
}

const PRODUCTS: Record<string, DemoProduct> = {
  'RULE-AO-THUN': { name: 'Áo thun', cm: [36, 24, 4], kg: 0.22, category: ProductCategory.T_SHIRT, fold: true, stackKg: 5, fragile: false },
  // Để trống sức chịu đè — kiểm luật quần áo trống = chịu 5 kg.
  'RULE-POLO': { name: 'Áo polo nhỏ', cm: [20, 20, 5], kg: 0.1, category: ProductCategory.T_SHIRT, fold: true, stackKg: null, fragile: false },
  // Đã vào túi zip + gập túi, vẫn được engine gập đôi thêm 1 lần.
  'RULE-POLO-ZIP': { name: 'Áo polo túi zip', cm: [20, 20, 5], kg: 0.1, category: ProductCategory.T_SHIRT, fold: true, stackKg: 5, fragile: false, zipFolded: true },
  'RULE-QUAN': { name: 'Quần jean', cm: [38, 30, 6], kg: 0.65, category: ProductCategory.TROUSERS, fold: true, stackKg: 5, fragile: false },
  'RULE-GIAY': { name: 'Giày (hộp gốc)', cm: [33, 21, 12], kg: 0.9, category: ProductCategory.SHOES, fold: false, stackKg: 5, fragile: false },
  'RULE-KINH': { name: 'Kính mát', cm: [16, 7, 5], kg: 0.15, category: ProductCategory.ACCESSORY, fold: false, stackKg: null, fragile: true },
};

/** [mã đơn, mô tả, { sku: số lượng }, kết quả mong đợi khi kho KHÔNG có túi / CÓ túi]. */
const SCENARIOS: [string, string, Record<string, number>, string][] = [
  ['RULE-01', '1 áo', { 'RULE-AO-THUN': 1 }, 'M (thùng không túi) / túi 32×45'],
  ['RULE-02', '2 áo', { 'RULE-AO-THUN': 2 }, 'M / túi'],
  ['RULE-03', '3 áo', { 'RULE-AO-THUN': 3 }, 'M / túi (3 × 1 cm gập < 8 cm)'],
  ['RULE-04', '1 polo nhỏ', { 'RULE-POLO': 1 }, 'S / túi'],
  ['RULE-05', '2 polo trống chịu đè', { 'RULE-POLO': 2 }, 'S'],
  ['RULE-06', '1 quần', { 'RULE-QUAN': 1 }, 'M / túi'],
  ['RULE-07', '2 áo + 2 quần', { 'RULE-AO-THUN': 2, 'RULE-QUAN': 2 }, 'M (1 kiện)'],
  ['RULE-08', '1 giày', { 'RULE-GIAY': 1 }, 'M'],
  ['RULE-09', '1 áo + 1 giày', { 'RULE-AO-THUN': 1, 'RULE-GIAY': 1 }, 'M chung'],
  ['RULE-10', '2 giày', { 'RULE-GIAY': 2 }, 'LT'],
  ['RULE-11', '2 kính', { 'RULE-KINH': 2 }, 'S'],
  ['RULE-12', '1 áo + 1 kính', { 'RULE-AO-THUN': 1, 'RULE-KINH': 1 }, 'M'],
  ['RULE-13', '1 polo túi zip đã gập', { 'RULE-POLO-ZIP': 1 }, 'S, gập thêm 1 lần'],
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

  const oldIds = (await groupModel.find({ shop_id: SHOP_ID }).select('_id').lean()).map((g) => g._id);
  await pickModel.deleteMany({ order_group_id: { $in: oldIds } });
  await planModel.deleteMany({ order_group_id: { $in: oldIds } });
  await groupModel.deleteMany({ shop_id: SHOP_ID });
  await orderModel.deleteMany({ shop_id: SHOP_ID });
  await productModel.deleteMany({ shop_id: SHOP_ID });
  console.log(`Đã xoá dữ liệu mẫu cũ: ${String(oldIds.length)} nhóm.`);
  if (process.argv.includes('--clean')) {
    await app.close();
    process.exit(0);
  }

  const now = new Date();
  await productModel.insertMany(
    Object.entries(PRODUCTS).map(([sku, p]) => ({
      platform: PLATFORM,
      shop_id: SHOP_ID,
      seller_sku: sku,
      dimension: { package_length_cm: p.cm[0], package_width_cm: p.cm[1], package_height_cm: garmentThicknessCm(p.category, null) ?? p.cm[2], package_weight_kg: p.kg },
      is_fragile: p.fragile,
      packaging_profile_status: 'ready',
      orientation_rule: 'any',
      max_stack_load_kg: p.stackKg,
      product_category: p.category,
      zip_bag_code: p.zipFolded === true ? 'ZIP-M' : null,
      zip_bag_folded: p.zipFolded === true,
      can_fold_in_half: p.fold,
      profile_confirmed_at: now,
      last_synced_at: now,
    })),
  );

  const service = app.get(PackingPlanService);
  for (const [orderNo, label, lines, expected] of SCENARIOS) {
    const group = await groupModel.create({
      platform: PLATFORM,
      shop_id: SHOP_ID,
      order_count: 1,
      fulfillment_status: GroupFulfillmentStatus.PICKED,
      shop_name_snapshot: 'Shop mẫu luật đóng gói',
      pick_round: 0,
      last_picked_at: now,
    });
    const items = Object.entries(lines).map(([sku, quantity], i) => ({
      platform_order_item_id: `${orderNo}-${String(i + 1)}`,
      sku,
      name: PRODUCTS[sku]?.name ?? sku,
      quantity,
      unit_price: 100000,
      status: OrderStatus.PENDING,
    }));
    await orderModel.create({
      platform: PLATFORM,
      shop_id: SHOP_ID,
      platform_order_id: orderNo,
      status: OrderStatus.PENDING,
      recipient: {
        full_name: `Khách mẫu ${label}`,
        phone: '0900000401',
        address_line1: '123 Đường Demo',
        city: 'TP. Hồ Chí Minh',
        country: 'VN',
      },
      consolidation_key: `demo-pack-rules-${orderNo}`,
      items,
      total_amount: items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0),
      currency: 'VND',
      is_consolidated: false,
      consolidated_group_id: group._id,
      synced_at: now,
    });
    await pickModel.insertMany(
      items.map((i) => ({
        order_group_id: group._id,
        seller_sku: i.sku,
        scanned_quantity: i.quantity,
        scan_method: 'manual',
        remaining_stock_after: 99,
        pick_round: 0,
      })),
    );

    try {
      await service.compute(group._id.toString());
    } catch (error: unknown) {
      // Server BE đang chạy có thể tính trước (nhóm vừa PICKED) — dùng luôn kế hoạch của nó.
      console.log(`${orderNo} compute: ${error instanceof Error ? error.message : String(error)}`);
    }
    const plan = await service.getActivePlan(group._id.toString());
    const got = (plan?.parcels ?? [])
      .map((p) => `${p.box.code}${p.box.cut_from_inner_height_mm ? `(cắt ${String(p.box.inner_mm.height_mm / 10)} cm)` : ''}[${p.placements.map((q) => `${q.sku.replace('RULE-', '')}${q.folded ? '↺' : ''}`).join(',')}]`)
      .join(' + ');
    console.log(`${orderNo} ${label.padEnd(22)} → ${got !== '' ? got : (plan?.status ?? 'không có kế hoạch')}   (mong đợi: ${expected})`);
    for (const note of plan?.orders.flatMap((o) => o.explanation).filter((e) => e.includes('< 80%')) ?? []) {
      console.log(`         ⚠ ${note}`);
    }
  }
  await app.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
