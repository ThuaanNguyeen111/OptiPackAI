import mongoose, { type Connection } from 'mongoose';
import {
  toOpenApiOrder,
  toOpenApiOrderItems,
  toOpenApiProducts,
  type OpenApiProduct,
  type StorefrontOrderItemLike,
  type StorefrontOrderLike,
  type StorefrontProductLike,
  type StorefrontVariantLike,
} from '../../src/modules/storefront/aurelle-open-api.mapper';
import {
  nextPublicOrderId,
  type CounterCollection,
} from '../../src/modules/storefront/storefront-counter.util';
import type {
  LazadaOrderItemRaw,
  LazadaOrderRaw,
} from '../../src/modules/marketplace-integration/adapters/lazada-protocol.client';

/**
 * Lớp đọc dữ liệu THẬT của website AURELLE cho mock Open API (cổng 4000).
 * Đọc thẳng các collection `storefront_*` trong cùng MongoDB (mock đóng vai
 * backend Open API của AURELLE nên được phép đọc dữ liệu của chính website).
 *
 * Ghi duy nhất 2 thứ: cấp bù `public_order_id` cho đơn cũ chưa có, và cập
 * nhật tồn bán được khi đối tác gọi `/product/stock/sellable/update`.
 *
 * Đơn đã vào OptiPack qua kênh nội bộ cũ (`canonical_order_id` khác null)
 * KHÔNG được trả qua Open API — chúng đã có trong OptiPack dưới shop
 * `storefront-main` (giữ làm lịch sử), trả lại sẽ thành 2 bản cùng 1 đơn.
 */

type Doc = Record<string, unknown> & { _id: mongoose.Types.ObjectId };

let connection: Connection | null = null;

export async function connectStorefrontStore(uri: string): Promise<void> {
  connection = await mongoose.createConnection(uri).asPromise();
}

function db(): Connection {
  if (!connection) throw new Error('Chưa kết nối MongoDB cho mock AURELLE.');
  return connection;
}

const OPEN_API_ORDER_FILTER = {
  $or: [{ canonical_order_id: null }, { canonical_order_id: { $exists: false } }],
};

async function ensurePublicId(order: Doc): Promise<number> {
  if (typeof order.public_order_id === 'number') return order.public_order_id;
  const assigned = await nextPublicOrderId(
    db().collection('storefront_counters') as unknown as CounterCollection,
  );
  // Chỉ ghi khi vẫn chưa có (2 request cùng lúc → 1 bên thắng, bên kia đọc lại).
  const result = await db()
    .collection('storefront_orders')
    .updateOne({ _id: order._id, public_order_id: { $in: [null] } }, { $set: { public_order_id: assigned } });
  if (result.modifiedCount === 1) return assigned;
  const fresh = await db().collection('storefront_orders').findOne({ _id: order._id });
  if (typeof fresh?.public_order_id !== 'number') throw new Error('Không cấp được public_order_id.');
  return fresh.public_order_id;
}

async function itemsOf(orderIds: mongoose.Types.ObjectId[]): Promise<Map<string, StorefrontOrderItemLike[]>> {
  const rows = (await db()
    .collection('storefront_order_items')
    .find({ order_id: { $in: orderIds } })
    .sort({ _id: 1 })
    .toArray()) as unknown as (StorefrontOrderItemLike & { order_id: mongoose.Types.ObjectId })[];
  const map = new Map<string, StorefrontOrderItemLike[]>();
  for (const row of rows) {
    const key = row.order_id.toString();
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

export interface ListOrdersQuery {
  updateAfter: Date;
  updateBefore?: Date;
  offset: number;
  limit: number;
}

export async function listOrders(
  query: ListOrdersQuery,
): Promise<{ count: number; countTotal: number; orders: LazadaOrderRaw[] }> {
  const updatedAt: Record<string, Date> = { $gte: query.updateAfter };
  if (query.updateBefore) updatedAt.$lte = query.updateBefore;
  const filter = { ...OPEN_API_ORDER_FILTER, updated_at: updatedAt };
  const collection = db().collection('storefront_orders');
  const [countTotal, docs] = await Promise.all([
    collection.countDocuments(filter),
    collection
      .find(filter)
      .sort({ updated_at: 1, _id: 1 })
      .skip(query.offset)
      .limit(query.limit)
      .toArray() as unknown as Promise<Doc[]>,
  ]);
  const items = await itemsOf(docs.map((d) => d._id));
  const orders: LazadaOrderRaw[] = [];
  for (const doc of docs) {
    const publicOrderId = await ensurePublicId(doc);
    const lines = items.get(doc._id.toString()) ?? [];
    const unitCount = lines.reduce((sum, line) => sum + line.quantity, 0);
    orders.push(toOpenApiOrder({ ...(doc as unknown as StorefrontOrderLike), public_order_id: publicOrderId }, unitCount));
  }
  return { count: orders.length, countTotal, orders };
}

export async function getOrderItems(publicOrderId: number): Promise<LazadaOrderItemRaw[] | null> {
  const doc: Doc | null = await db()
    .collection('storefront_orders')
    .findOne({ ...OPEN_API_ORDER_FILTER, public_order_id: publicOrderId });
  if (!doc) return null;
  const lines = (await itemsOf([doc._id])).get(doc._id.toString()) ?? [];
  return toOpenApiOrderItems(
    { ...(doc as unknown as StorefrontOrderLike), public_order_id: publicOrderId },
    lines,
  );
}

async function stockByVariant(
  variantIds: mongoose.Types.ObjectId[],
): Promise<{ sellable: Map<string, number>; onHand: Map<string, number> }> {
  const rows = (await db()
    .collection('storefront_inventory_stocks')
    .find({ variant_id: { $in: variantIds } })
    .toArray()) as unknown as { variant_id: mongoose.Types.ObjectId; quantity_on_hand: number; reserved_quantity: number }[];
  const sellable = new Map<string, number>();
  const onHand = new Map<string, number>();
  for (const row of rows) {
    const key = row.variant_id.toString();
    onHand.set(key, (onHand.get(key) ?? 0) + row.quantity_on_hand);
    sellable.set(key, (sellable.get(key) ?? 0) + row.quantity_on_hand - row.reserved_quantity);
  }
  return { sellable, onHand };
}

/** `sku_seller_list` rỗng/thiếu = trả toàn bộ danh mục (có offset/limit). */
export async function listProducts(
  sellerSkus: string[] | null,
  offset: number,
  limit: number,
): Promise<{ total_products: string; products: OpenApiProduct[] }> {
  const variantFilter = sellerSkus && sellerSkus.length > 0
    ? { sku: { $in: sellerSkus.map((sku) => sku.toUpperCase()) } }
    : {};
  const allVariants = (await db()
    .collection('storefront_product_variants')
    .find(variantFilter)
    .toArray()) as unknown as StorefrontVariantLike[];
  const productIds = [...new Set(allVariants.map((v) => v.product_id.toString()))]
    .map((id) => new mongoose.Types.ObjectId(id));
  const productCollection = db().collection('storefront_products');
  const total = productIds.length;
  const products = (await productCollection
    .find({ _id: { $in: productIds } })
    .sort({ _id: 1 })
    .skip(offset)
    .limit(limit)
    .toArray()) as unknown as StorefrontProductLike[];
  const pageIds = new Set(products.map((p) => p._id.toString()));
  const variants = allVariants.filter((v) => pageIds.has(v.product_id.toString()));
  const { sellable, onHand } = await stockByVariant(
    variants.map((v) => new mongoose.Types.ObjectId(v._id.toString())),
  );
  return {
    total_products: String(total),
    products: toOpenApiProducts(products, variants, sellable, onHand),
  };
}

/** Đặt tồn bán được = SellableQuantity (quantity_on_hand = mới + đang giữ chỗ). */
export async function setSellableQuantity(sellerSku: string, sellable: number): Promise<boolean> {
  const variant: Doc | null = await db()
    .collection('storefront_product_variants')
    .findOne({ sku: sellerSku.toUpperCase() });
  if (!variant) return false;
  const stock = await db().collection('storefront_inventory_stocks').findOne({ variant_id: variant._id });
  const reserved = typeof stock?.reserved_quantity === 'number' ? stock.reserved_quantity : 0;
  await db().collection('storefront_inventory_stocks').updateOne(
    { variant_id: variant._id, warehouse_id: stock?.warehouse_id ?? null },
    {
      $set: { quantity_on_hand: Math.max(0, sellable) + reserved, updated_at: new Date() },
      $setOnInsert: { reserved_quantity: 0, reorder_level: 0, created_at: new Date() },
    },
    { upsert: true },
  );
  return true;
}
