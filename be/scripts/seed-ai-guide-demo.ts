import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { Order, OrderDocument } from '../src/modules/orders/schemas/order.schema';
import { OrderGroup, OrderGroupDocument } from '../src/modules/order-groups/schemas/order-group.schema';
import { PickEvent, PickEventDocument } from '../src/modules/order-groups/schemas/pick-event.schema';
import {
  ProductMaster,
  ProductMasterDocument,
} from '../src/modules/product-master/schemas/product-master.schema';
import {
  PackagingRecommendationDoc,
  PackagingRecommendationDocument,
} from '../src/modules/packaging/schemas/packaging-recommendation.schema';
import { PackagingBox, PackagingBoxDocument } from '../src/modules/packaging/schemas/packaging-box.schema';
import { PackagingBag, PackagingBagDocument } from '../src/modules/packaging/schemas/packaging-bag.schema';
import { ProductCategory } from '../src/common/enums/product-category.enum';
import { PackagingService } from '../src/modules/packaging/packaging.service';
import { MarketplacePlatform } from '../src/modules/marketplace-integration/enums/platform.enum';
import { OrderStatus } from '../src/modules/orders/enums/order-status.enum';
import { GroupFulfillmentStatus } from '../src/modules/order-groups/enums/group-fulfillment-status.enum';

/**
 * ===================================================================
 * Dữ liệu mẫu để test hướng dẫn đóng gói bằng AI (21/09/2026)
 * ===================================================================
 * Tạo 4 Order Group đã LẤY HÀNG XONG (`picked`) của shop giả
 * `DEMO-AI-GUIDE`, hồ sơ SKU đã `ready`, rồi chạy engine sinh phương án
 * (group → `pending_approval`). Mở /app/packing/groups/:groupId để xem
 * animation 3D + hướng dẫn AI.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/seed-ai-guide-demo.ts          # tạo (xóa bản cũ trước)
 *   npx ts-node -r tsconfig-paths/register scripts/seed-ai-guide-demo.ts --clean  # chỉ xóa
 *
 * Chỉ đụng bản ghi có shop_id = DEMO-AI-GUIDE (và pick_events /
 * packaging_recommendations của các group đó). Thùng mẫu SAMPLE-S/M/L và
 * túi zip mẫu DEMO-ZIP-S/M/L chỉ được TẠO nếu chưa có, không bị xóa khi --clean.
 * ===================================================================
 */

const SHOP_ID = 'DEMO-AI-GUIDE';
const PLATFORM = MarketplacePlatform.LAZADA;

interface Profile {
  sku: string;
  name: string;
  cm: [number, number, number];
  kg: number;
  fragile: boolean;
  orientation: 'any' | 'upright_only';
  maxStackKg: number | null;
  price: number;
  category: ProductCategory;
  /** Túi zip + gập đôi; số đo `cm` là số đo SAU KHI đã đóng túi. */
  bag: { code: string; folded: boolean } | null;
}

const PRODUCTS: Profile[] = [
  { sku: 'DEMO-GIAY-NIKE-42', name: 'Giày Nike Air Force 1 size 42 (hộp)', cm: [33, 21, 12], kg: 0.9, fragile: false, orientation: 'upright_only', maxStackKg: 3, price: 2500000, category: ProductCategory.SHOES, bag: null },
  { sku: 'DEMO-GIAY-ADIDAS-40', name: 'Giày Adidas Ultraboost size 40 (hộp)', cm: [32, 20, 11], kg: 0.8, fragile: false, orientation: 'upright_only', maxStackKg: 3, price: 3200000, category: ProductCategory.SHOES, bag: null },
  { sku: 'DEMO-SANDAL-39', name: 'Sandal quai ngang size 39', cm: [28, 12, 7], kg: 0.36, fragile: false, orientation: 'any', maxStackKg: 2, price: 350000, category: ProductCategory.SANDALS, bag: { code: 'DEMO-ZIP-S', folded: false } },
  { sku: 'DEMO-AO-THUN-M', name: 'Áo thun cotton trắng size M', cm: [36, 24, 4], kg: 0.22, fragile: false, orientation: 'any', maxStackKg: 2, price: 199000, category: ProductCategory.T_SHIRT, bag: { code: 'DEMO-ZIP-M', folded: true } },
  { sku: 'DEMO-SO-MI-L', name: 'Áo sơ mi trắng size L', cm: [36, 26, 5], kg: 0.3, fragile: false, orientation: 'any', maxStackKg: 2, price: 450000, category: ProductCategory.SHIRT, bag: { code: 'DEMO-ZIP-M', folded: true } },
  { sku: 'DEMO-QUAN-JEAN-32', name: 'Quần jean slim size 32', cm: [38, 30, 6], kg: 0.65, fragile: false, orientation: 'any', maxStackKg: 3, price: 590000, category: ProductCategory.TROUSERS, bag: { code: 'DEMO-ZIP-L', folded: true } },
  { sku: 'DEMO-QUAN-SHORT-M', name: 'Quần short kaki size M', cm: [30, 24, 4], kg: 0.3, fragile: false, orientation: 'any', maxStackKg: 2, price: 280000, category: ProductCategory.SHORTS, bag: { code: 'DEMO-ZIP-M', folded: false } },
  { sku: 'DEMO-KINH-MAT', name: 'Kính mát kèm hộp cứng', cm: [16, 7, 5], kg: 0.15, fragile: true, orientation: 'upright_only', maxStackKg: null, price: 450000, category: ProductCategory.ACCESSORY, bag: null },
];

const SAMPLE_BAGS = [
  { code: 'DEMO-ZIP-S', name: 'Túi zip S 25×35 cm (mẫu)', width_mm: 250, length_mm: 350, price_vnd: 500 },
  { code: 'DEMO-ZIP-M', name: 'Túi zip M 35×45 cm (mẫu)', width_mm: 350, length_mm: 450, price_vnd: 800 },
  { code: 'DEMO-ZIP-L', name: 'Túi zip L 45×60 cm (mẫu)', width_mm: 450, length_mm: 600, price_vnd: 1200 },
];

/** Mỗi group: danh sách đơn, mỗi đơn là [sku, số lượng][]. */
const GROUPS: { label: string; customer: string; orders: [string, number][][] }[] = [
  {
    // (22/09/2026) Chạy ĐẦU TIÊN: quần jean 38×30×6 cm không vừa thùng M nếu để
    // nguyên, gập đôi (19×30×12 cm) thì vừa → engine gập và giữ chỗ thùng M
    // duy nhất; các group sau thấy M đã hết.
    label: 'Đơn 1 quần jean — gập đôi để vừa thùng nhỏ hơn',
    customer: 'Phạm Thu Dung',
    orders: [[['DEMO-QUAN-JEAN-32', 1]]],
  },
  {
    label: 'Đơn giày + áo + kính mát (có món dễ vỡ)',
    customer: 'Nguyễn Văn An',
    orders: [[['DEMO-GIAY-NIKE-42', 2], ['DEMO-AO-THUN-M', 1], ['DEMO-KINH-MAT', 1]]],
  },
  {
    label: '2 đơn cùng khách, lấy hàng chung 1 lượt',
    customer: 'Trần Thị Bình',
    orders: [
      [['DEMO-QUAN-JEAN-32', 1], ['DEMO-SO-MI-L', 2]],
      [['DEMO-SANDAL-39', 1], ['DEMO-GIAY-ADIDAS-40', 1]],
    ],
  },
  {
    label: 'Đơn quần áo nhiều món (đều đóng túi zip)',
    customer: 'Lê Minh Cường',
    orders: [[['DEMO-QUAN-JEAN-32', 1], ['DEMO-QUAN-SHORT-M', 1], ['DEMO-AO-THUN-M', 2], ['DEMO-SO-MI-L', 1]]],
  },
];

const SAMPLE_BOXES = [
  { code: 'SAMPLE-S', name: 'Thùng mẫu S (số giả lập)', inner: [200, 150, 100], outer: [206, 156, 106], tare_g: 90, max_load_g: 5000, price_vnd: 2500 },
  { code: 'SAMPLE-M', name: 'Thùng mẫu M (số giả lập)', inner: [350, 250, 200], outer: [356, 256, 206], tare_g: 200, max_load_g: 10000, price_vnd: 4500 },
  { code: 'SAMPLE-L', name: 'Thùng mẫu L (số giả lập)', inner: [500, 400, 350], outer: [506, 406, 356], tare_g: 380, max_load_g: 20000, price_vnd: 8000 },
] as const;

/**
 * Tồn thùng mẫu cho demo (22/09/2026): M = 1 — group gập đôi (chạy đầu tiên)
 * giữ chỗ chiếc M duy nhất, các group sau thấy M hết nên engine chuyển sang
 * thùng còn hàng + ghi "thùng vừa hơn đã hết"; L = 11 để đóng 1 kiện L là
 * chạm mức cảnh báo 10 (thông báo sắp hết thùng).
 */
const DEMO_BOX_STOCK: Record<(typeof SAMPLE_BOXES)[number]['code'], number> = {
  'SAMPLE-S': 20,
  'SAMPLE-M': 1,
  'SAMPLE-L': 11,
};

function mm(values: readonly number[]): { length_mm: number; width_mm: number; height_mm: number } {
  const [length_mm = 0, width_mm = 0, height_mm = 0] = values;
  return { length_mm, width_mm, height_mm };
}

async function main(): Promise<void> {
  const cleanOnly = process.argv.includes('--clean');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const orderModel = app.get<Model<OrderDocument>>(getModelToken(Order.name));
  const groupModel = app.get<Model<OrderGroupDocument>>(getModelToken(OrderGroup.name));
  const pickModel = app.get<Model<PickEventDocument>>(getModelToken(PickEvent.name));
  const productModel = app.get<Model<ProductMasterDocument>>(getModelToken(ProductMaster.name));
  const recModel = app.get<Model<PackagingRecommendationDocument>>(getModelToken(PackagingRecommendationDoc.name));
  const boxModel = app.get<Model<PackagingBoxDocument>>(getModelToken(PackagingBox.name));
  const bagModel = app.get<Model<PackagingBagDocument>>(getModelToken(PackagingBag.name));

  // ---- Xóa dữ liệu demo cũ ----
  const oldGroupIds = (await groupModel.find({ shop_id: SHOP_ID }).select('_id').lean()).map((g) => g._id);
  await pickModel.deleteMany({ order_group_id: { $in: oldGroupIds } });
  await recModel.deleteMany({ order_group_id: { $in: oldGroupIds } });
  await groupModel.deleteMany({ shop_id: SHOP_ID });
  await orderModel.deleteMany({ shop_id: SHOP_ID });
  await productModel.deleteMany({ shop_id: SHOP_ID });
  console.log(`Đã xóa dữ liệu demo cũ (${String(oldGroupIds.length)} group).`);
  if (cleanOnly) {
    await app.close();
    return;
  }

  // ---- Thùng mẫu (chỉ tạo nếu thiếu) ----
  for (const box of SAMPLE_BOXES) {
    await boxModel.updateOne(
      { code: box.code },
      {
        $setOnInsert: {
          code: box.code,
          name: box.name,
          inner: mm(box.inner),
          outer: mm(box.outer),
          tare_g: box.tare_g,
          max_load_g: box.max_load_g,
          price_vnd: box.price_vnd,
          is_active: true,
          is_sample: true,
        },
      },
      { upsert: true },
    );
    // Đặt lại tồn cho demo (22/09/2026) — gán thẳng, CHỈ dùng cho thùng mẫu
    // trong script demo; tồn thật luôn đổi qua stock-in/pack (có dòng sổ).
    await boxModel.updateOne(
      { code: box.code },
      { $set: { quantity_on_hand: DEMO_BOX_STOCK[box.code], reorder_level: 10 } },
    );
  }

  // ---- Túi zip mẫu (chỉ tạo nếu thiếu) ----
  for (const bag of SAMPLE_BAGS) {
    await bagModel.updateOne(
      { code: bag.code },
      { $setOnInsert: { ...bag, is_active: true, is_sample: true } },
      { upsert: true },
    );
  }

  // ---- Hồ sơ SKU đã được kho xác nhận ----
  const now = new Date();
  await productModel.insertMany(
    PRODUCTS.map((p) => ({
      platform: PLATFORM,
      shop_id: SHOP_ID,
      seller_sku: p.sku,
      dimension: { package_length_cm: p.cm[0], package_width_cm: p.cm[1], package_height_cm: p.cm[2], package_weight_kg: p.kg },
      is_fragile: p.fragile,
      packaging_profile_status: 'ready',
      orientation_rule: p.orientation,
      max_stack_load_kg: p.maxStackKg,
      product_category: p.category,
      zip_bag_code: p.bag?.code ?? null,
      zip_bag_folded: p.bag?.folded ?? false,
      // (22/09/2026) Hàng mềm trong túi zip gập đôi thêm được; giày/kính (hộp cứng) thì không.
      can_fold_in_half: p.bag !== null,
      profile_confirmed_at: now,
      last_synced_at: now,
    })),
  );

  const productBySku = new Map(PRODUCTS.map((p) => [p.sku, p]));
  const packagingService = app.get(PackagingService);

  for (const [gi, spec] of GROUPS.entries()) {
    const group = await groupModel.create({
      platform: PLATFORM,
      shop_id: SHOP_ID,
      order_count: spec.orders.length,
      fulfillment_status: GroupFulfillmentStatus.PICKED,
      shop_name_snapshot: 'Shop demo AI (dữ liệu mẫu)',
      pick_round: 0,
      last_picked_at: now,
    });

    const picked = new Map<string, number>();
    for (const [oi, lines] of spec.orders.entries()) {
      const orderNo = `DEMO-AI-${String(gi + 1)}${String(oi + 1)}`;
      let unit = 0;
      const items = lines.flatMap(([sku, qty]) =>
        Array.from({ length: qty }, () => {
          unit += 1;
          const product = productBySku.get(sku);
          return {
            platform_order_item_id: `${orderNo}-${String(unit)}`,
            sku,
            name: product?.name ?? sku,
            quantity: 1,
            unit_price: product?.price ?? 0,
            status: OrderStatus.PENDING,
          };
        }),
      );
      for (const [sku, qty] of lines) picked.set(sku, (picked.get(sku) ?? 0) + qty);
      await orderModel.create({
        platform: PLATFORM,
        shop_id: SHOP_ID,
        platform_order_id: orderNo,
        status: OrderStatus.PENDING,
        recipient: {
          full_name: spec.customer,
          phone: `09000000${String(gi + 1)}${String(oi + 1)}`,
          address_line1: '123 Đường Demo',
          city: 'TP. Hồ Chí Minh',
          country: 'VN',
        },
        consolidation_key: `demo-ai-guide-${String(gi + 1)}`,
        items,
        total_amount: items.reduce((sum, i) => sum + i.unit_price, 0),
        currency: 'VND',
        is_consolidated: spec.orders.length > 1,
        consolidated_group_id: group._id,
        synced_at: now,
      });
    }

    await pickModel.insertMany(
      [...picked].map(([sku, qty]) => ({
        order_group_id: group._id,
        seller_sku: sku,
        scanned_quantity: qty,
        scan_method: 'manual',
        remaining_stock_after: 99,
        pick_round: 0,
      })),
    );

    const recs = await packagingService.generateRecommendations(group._id.toString());
    const summary = recs.map((r) => {
      const box = r.solution_status === 'ok' ? (r.box_code ?? '?') : 'no_fit';
      const note = r.preferred_box_out_of_stock ? ` (${r.preferred_box_out_of_stock} vừa hơn nhưng hết hàng)` : '';
      return `${r.platform_order_id ?? '?'} → ${box}${note}`;
    });
    console.log(`\nGroup ${String(gi + 1)}: ${spec.label}`);
    console.log(`  id: ${group._id.toString()}`);
    console.log(`  phương án: ${summary.join(', ')}`);
    console.log(`  mở: /app/packing/groups/${group._id.toString()}`);
  }

  await app.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});

