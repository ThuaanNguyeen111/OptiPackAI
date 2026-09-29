import axios from 'axios';
import {
  LazadaProtocolClient,
  type LazadaOrderItemRaw,
  type LazadaOrderRaw,
  type LazadaProductRaw,
} from '../src/modules/marketplace-integration/adapters/lazada-protocol.client';
import { mapLazadaOrder } from '../src/modules/orders/mappers/lazada-order.mapper';
import { MarketplacePlatform } from '../src/modules/marketplace-integration/enums/platform.enum';

/**
 * ===================================================================
 * KIỂM TRA TƯƠNG THÍCH AURELLE ↔ OPTIPACK (Mục 14 AURELLE_MARKETPLACE_DESIGN.md)
 * ===================================================================
 * Ký request ĐÚNG như OptiPack (dùng lại chính `LazadaProtocolClient`,
 * không tự viết lại thuật toán ký), gọi thẳng Open API của AURELLE, đối
 * chiếu từng trường/kiểu dữ liệu, rồi chạy response THẬT qua đúng hàm
 * `mapLazadaOrder()` mà `orders.service.ts` dùng — nếu hàm đó chạy
 * không lỗi, nghĩa là AURELLE đã tương thích tới mức OptiPack dùng
 * được ngay, không cần chờ code thêm.
 *
 * KHÔNG bootstrap NestJS/kết nối MongoDB — script thuần, chỉ cần Open
 * API của AURELLE đang chạy và ít nhất 1 đơn đã đặt trên storefront
 * trong khoảng AURELLE_LOOKBACK_DAYS.
 *
 * Chạy:
 *   cd be
 *   AURELLE_API_BASE_URL=http://localhost:4000/rest \
 *   AURELLE_APP_KEY=500123 AURELLE_APP_SECRET=<secret> \
 *   AURELLE_ACCESS_TOKEN=<token sau khi cấp quyền> \
 *   npx ts-node -r dotenv/config scripts/aurelle-conformance.ts
 *
 * Tùy chọn: AURELLE_AUTH_CODE (kiểm đổi token), AURELLE_REFRESH_TOKEN
 * (kiểm làm mới token), AURELLE_TEST_WRITE=true (kiểm cập nhật tồn —
 * chỉ ghi lại ĐÚNG số đang có, không đổi tồn thật), AURELLE_LOOKBACK_DAYS
 * (mặc định 30).
 *
 * Mỗi mục in PASS / WARN / FAIL. Có FAIL → exit code 1 (dùng được
 * trong CI của nhóm AURELLE nếu muốn chặn merge khi lệch hợp đồng).
 * ===================================================================
 */

type Level = 'PASS' | 'WARN' | 'FAIL';
interface CheckResult {
  level: Level;
  label: string;
  detail?: string;
}
const results: CheckResult[] = [];

function record(level: Level, label: string, detail?: string): void {
  results.push({ level, label, detail });
  const icon = level === 'PASS' ? '✅' : level === 'WARN' ? '⚠️ ' : '❌';
  console.log(`${icon} [${level}] ${label}${detail ? ` — ${detail}` : ''}`);
}
function pass(label: string, detail?: string): void {
  record('PASS', label, detail);
}
function warn(label: string, detail?: string): void {
  record('WARN', label, detail);
}
function fail(label: string, detail?: string): void {
  record('FAIL', label, detail);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body: unknown = error.response?.data;
    return `HTTP ${status ? String(status) : '(không có response)'} — ${error.message}${
      body ? ` — ${JSON.stringify(body)}` : ''
    }`;
  }
  return error instanceof Error ? error.message : String(error);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Thiếu biến môi trường bắt buộc: ${name}`);
    process.exit(1);
  }
  return value;
}

const apiBaseUrl = requireEnv('AURELLE_API_BASE_URL');
const appKey = requireEnv('AURELLE_APP_KEY');
const appSecret = requireEnv('AURELLE_APP_SECRET');
const accessToken = requireEnv('AURELLE_ACCESS_TOKEN');
const authCode = process.env.AURELLE_AUTH_CODE;
const refreshTokenInput = process.env.AURELLE_REFRESH_TOKEN;
const testWrite = process.env.AURELLE_TEST_WRITE === 'true';
const lookbackDays = Number(process.env.AURELLE_LOOKBACK_DAYS ?? '30');

// ------------------------------------------------------------------
// 1. Token — chỉ chạy nếu có AURELLE_AUTH_CODE / AURELLE_REFRESH_TOKEN
// ------------------------------------------------------------------

function inspectTokenResponse(raw: unknown, label: string): void {
  if (!isRecord(raw)) {
    fail(`${label}: response`, 'không phải object JSON');
    return;
  }
  if (raw.code !== '0') {
    fail(`${label}: code`, `mong chuỗi "0", nhận ${JSON.stringify(raw.code)}`);
    return;
  }
  pass(`${label}: code là CHUỖI "0"`);

  for (const field of ['access_token', 'refresh_token', 'account'] as const) {
    if (typeof raw[field] !== 'string' || raw[field] === '') {
      fail(`${label}: ${field}`, 'thiếu hoặc rỗng');
    } else {
      pass(`${label}: có ${field}`);
    }
  }

  if (typeof raw.expires_in !== 'number') {
    fail(`${label}: expires_in`, `phải là SỐ (giây), nhận ${JSON.stringify(raw.expires_in)}`);
  } else {
    pass(`${label}: expires_in là số`);
  }

  // `Array.isArray` narrows `unknown` thành `any[]` (đặc thù kiểu của
  // TS) — ép qua `unknown[]` tường minh để tránh unsafe-assignment.
  const infoList: unknown[] = Array.isArray(raw.country_user_info) ? (raw.country_user_info as unknown[]) : [];
  const info: unknown = infoList[0];
  if (!isRecord(info) || typeof info.seller_id !== 'string' || info.seller_id === '') {
    fail(`${label}: country_user_info[0].seller_id`, 'thiếu — không xác định được shop');
  } else {
    pass(`${label}: có country_user_info[0].seller_id`, info.seller_id);
  }
}

async function checkToken(client: LazadaProtocolClient): Promise<void> {
  if (authCode) {
    try {
      const raw = await client.callSignedPost<unknown>('/auth/token/create', {
        app_key: appKey,
        code: authCode,
        sign_method: 'sha256',
        timestamp: Date.now(),
      });
      inspectTokenResponse(raw, 'auth/token/create');
    } catch (error) {
      fail('auth/token/create: gọi API', describeError(error));
    }
  } else {
    warn('auth/token/create', 'bỏ qua — không có AURELLE_AUTH_CODE');
  }

  if (refreshTokenInput) {
    try {
      const raw = await client.callSignedPost<unknown>('/auth/token/refresh', {
        app_key: appKey,
        refresh_token: refreshTokenInput,
        sign_method: 'sha256',
        timestamp: Date.now(),
      });
      inspectTokenResponse(raw, 'auth/token/refresh');
    } catch (error) {
      fail('auth/token/refresh: gọi API', describeError(error));
    }
  } else {
    warn('auth/token/refresh', 'bỏ qua — không có AURELLE_REFRESH_TOKEN');
  }
}

// ------------------------------------------------------------------
// 2. Chữ ký sai PHẢI bị từ chối
// ------------------------------------------------------------------

async function checkBadSignatureRejected(): Promise<void> {
  const badClient = new LazadaProtocolClient({
    logLabel: 'Aurelle-BadSign',
    authBaseUrl: apiBaseUrl,
    apiBaseUrl,
    appKey,
    appSecret: `${appSecret}-wrong`, // cố ý sai để chữ ký tính ra khác
  });
  try {
    const orders = await badClient.getOrders(accessToken, {
      updatedAfter: new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000),
    });
    fail(
      'Chữ ký: request ký SAI phải bị từ chối',
      `AURELLE vẫn trả về ${String(orders.length)} đơn dù chữ ký sai — kiểm tra lại bước xác thực sign`,
    );
  } catch (error) {
    pass('Chữ ký: request ký sai bị từ chối', describeError(error));
  }
}

// ------------------------------------------------------------------
// 3. GET /orders/get
// ------------------------------------------------------------------

async function checkOrders(client: LazadaProtocolClient): Promise<LazadaOrderRaw[]> {
  const updatedAfter = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  let orders: LazadaOrderRaw[];
  try {
    orders = await client.getOrders(accessToken, { updatedAfter, limit: 100 });
  } catch (error) {
    fail('/orders/get: gọi API', describeError(error));
    return [];
  }
  pass('/orders/get: vỏ response hợp lệ (code "0", data.orders là mảng)');

  if (orders.length === 0) {
    warn(
      '/orders/get: data.orders rỗng',
      `không có đơn nào trong ${String(lookbackDays)} ngày qua — cần ít nhất 1 đơn đặt trên storefront để kiểm đầy đủ các mục còn lại`,
    );
    return [];
  }
  pass(`/orders/get: nhận ${String(orders.length)} đơn`);

  let sortedOk = true;
  let prevUpdatedAt: string | null = null;

  for (const order of orders) {
    const raw = order as unknown as Record<string, unknown>;
    const ctx = `order_id=${String(raw.order_id)}`;

    if (typeof raw.order_id !== 'number') fail(`/orders/get: order_id (${ctx})`, 'phải là SỐ, không phải chuỗi');
    if (!Array.isArray(raw.statuses) || raw.statuses.length === 0) {
      fail(`/orders/get: statuses (${ctx})`, 'phải là mảng khác rỗng');
    }
    if (typeof raw.created_at !== 'string' || Number.isNaN(Date.parse(raw.created_at))) {
      fail(`/orders/get: created_at (${ctx})`, `không phải ISO 8601 hợp lệ: ${JSON.stringify(raw.created_at)}`);
    }
    if (typeof raw.updated_at !== 'string' || Number.isNaN(Date.parse(raw.updated_at))) {
      fail(`/orders/get: updated_at (${ctx})`, `không phải ISO 8601 hợp lệ: ${JSON.stringify(raw.updated_at)}`);
    } else {
      if (prevUpdatedAt !== null && raw.updated_at < prevUpdatedAt) sortedOk = false;
      prevUpdatedAt = raw.updated_at;
    }
    if (typeof raw.price !== 'string' || Number.isNaN(parseFloat(raw.price))) {
      fail(`/orders/get: price (${ctx})`, `phải là CHUỖI số, nhận ${JSON.stringify(raw.price)}`);
    }
    for (const flag of ['need_cancel_confirm', 'is_cancel_pending'] as const) {
      const value = raw[flag];
      if (value !== undefined && value !== 'true' && value !== 'false') {
        fail(`/orders/get: ${flag} (${ctx})`, `phải là chuỗi "true"/"false", nhận ${JSON.stringify(value)}`);
      }
    }

    const addr = raw.address_shipping;
    if (!isRecord(addr)) {
      fail(`/orders/get: address_shipping (${ctx})`, 'thiếu');
    } else {
      if (typeof addr.first_name !== 'string' || addr.first_name === '') {
        fail(`/orders/get: address_shipping.first_name (${ctx})`, 'thiếu');
      }
      if (typeof addr.phone !== 'string' || addr.phone === '') {
        fail(`/orders/get: address_shipping.phone (${ctx})`, 'thiếu');
      }
      if (typeof addr.address1 !== 'string' || addr.address1 === '') {
        fail(`/orders/get: address_shipping.address1 (${ctx})`, 'thiếu');
      } else if (!/phường|xã|quận|huyện|p\.|q\./i.test(addr.address1)) {
        warn(
          `/orders/get: address1 (${ctx})`,
          `có vẻ CHƯA gồm phường/quận: "${addr.address1}" — đối chiếu quy tắc điền địa chỉ Mục 7.3, nếu thiếu có thể gộp nhầm 2 địa chỉ khác nhau`,
        );
      }
      if (typeof addr.city !== 'string' || addr.city === '') {
        fail(`/orders/get: address_shipping.city (${ctx})`, 'thiếu');
      }
    }
  }

  if (sortedOk) pass('/orders/get: sắp xếp theo updated_at tăng dần');
  else fail('/orders/get: sắp xếp theo updated_at', 'thứ tự KHÔNG tăng dần — mặc định phải là ASC (Mục 7.3)');

  return orders;
}

// ------------------------------------------------------------------
// 4. GET /order/items/get + chạy qua mapLazadaOrder() thật
// ------------------------------------------------------------------

async function checkOrderItemsAndMapper(
  client: LazadaProtocolClient,
  orders: LazadaOrderRaw[],
): Promise<{ skus: string[]; products: LazadaProductRaw[] }> {
  // Chỉ kiểm 5 đơn đầu — đủ để phát hiện lệch hợp đồng, không cần quét hết.
  const sample = orders.slice(0, 5);
  const skus = new Set<string>();

  for (const order of sample) {
    const orderRaw = order as unknown as Record<string, unknown>;
    const ctx = `order_id=${String(orderRaw.order_id)}`;
    let items: LazadaOrderItemRaw[];
    try {
      items = await client.getOrderItems(accessToken, order.order_id);
    } catch (error) {
      fail(`/order/items/get: gọi API (${ctx})`, describeError(error));
      continue;
    }
    if (!Array.isArray(items)) {
      fail(`/order/items/get: data (${ctx})`, 'phải là mảng');
      continue;
    }
    pass(`/order/items/get: data là mảng (${ctx})`, `${String(items.length)} dòng`);

    const seenIds = new Set<number>();
    let duplicated = false;
    let groupedIntoOneLine = false;

    for (const item of items) {
      const itemRaw = item as unknown as Record<string, unknown>;
      if (typeof itemRaw.sku === 'string' && itemRaw.sku !== '') skus.add(itemRaw.sku);

      if (typeof itemRaw.order_item_id !== 'number') {
        fail(`/order/items/get: order_item_id (${ctx})`, 'phải là SỐ');
      } else {
        if (seenIds.has(itemRaw.order_item_id)) duplicated = true;
        else seenIds.add(itemRaw.order_item_id);
      }
      if (typeof itemRaw.item_price !== 'string' || Number.isNaN(parseFloat(itemRaw.item_price))) {
        fail(`/order/items/get: item_price (${ctx})`, `phải là CHUỖI số, nhận ${JSON.stringify(itemRaw.item_price)}`);
      }
      // Mục 7.4 — MỖI ĐƠN VỊ phải là 1 dòng riêng. Nếu response có field
      // "quantity" > 1 trên 1 dòng, nghĩa là đã gộp nhiều đơn vị vào 1
      // dòng — sai hợp đồng, mapLazadaOrder() sẽ đếm THIẾU số lượng thật.
      if (typeof itemRaw.quantity === 'number' && itemRaw.quantity !== 1) {
        groupedIntoOneLine = true;
      }
    }

    if (duplicated) fail(`/order/items/get: order_item_id trùng (${ctx})`);
    else pass(`/order/items/get: order_item_id không trùng (${ctx})`);

    if (groupedIntoOneLine) {
      fail(
        `/order/items/get: 1 dòng = 1 đơn vị (${ctx})`,
        'có dòng mang "quantity" > 1 — phải tách thành nhiều dòng, mỗi dòng đúng 1 đơn vị (Mục 7.4)',
      );
    } else {
      pass(`/order/items/get: mỗi dòng là 1 đơn vị (${ctx})`);
    }

    if (typeof orderRaw.items_count === 'number' && orderRaw.items_count !== items.length) {
      fail(
        `/order/items/get: items_count khớp số dòng (${ctx})`,
        `order.items_count=${String(orderRaw.items_count)}, số dòng thật=${String(items.length)}`,
      );
    } else {
      pass(`/order/items/get: items_count khớp số dòng (${ctx})`);
    }

    try {
      const mapped = mapLazadaOrder(order, items, MarketplacePlatform.AURELLE);
      pass(
        `mapLazadaOrder() chạy KHÔNG lỗi (${ctx})`,
        `tổng ${String(mapped.total_amount)} ${mapped.currency}, ${String(mapped.items.length)} dòng đã map`,
      );
    } catch (error) {
      fail(`mapLazadaOrder() (${ctx})`, describeError(error));
    }
  }

  return { skus: [...skus].filter((s) => s !== ''), products: [] };
}

// ------------------------------------------------------------------
// 5. GET /products/get
// ------------------------------------------------------------------

async function checkProducts(client: LazadaProtocolClient, sellerSkus: string[]): Promise<LazadaProductRaw[]> {
  if (sellerSkus.length === 0) {
    warn('/products/get: bỏ qua', 'không có SKU nào để tra (chưa lấy được dòng hàng nào ở bước trước)');
    return [];
  }
  const batch = sellerSkus.slice(0, 50);

  let products: LazadaProductRaw[];
  try {
    products = await client.getProducts(accessToken, batch);
  } catch (error) {
    fail('/products/get: gọi API', describeError(error));
    return [];
  }
  pass(`/products/get: vỏ response hợp lệ, nhận ${String(products.length)} sản phẩm`);

  const returnedSkus = new Set(products.flatMap((p) => p.skus.map((s) => s.SellerSku)));
  const missing = batch.filter((sku) => !returnedSkus.has(sku));
  if (missing.length > 0) {
    warn(
      '/products/get: thiếu SKU đã hỏi',
      `${String(missing.length)}/${String(batch.length)} SKU không có trong response: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`,
    );
  } else {
    pass('/products/get: trả đủ mọi SKU đã hỏi trong sku_seller_list');
  }

  for (const product of products) {
    for (const sku of product.skus) {
      const skuRaw = sku as unknown as Record<string, unknown>;
      const ctx = `SellerSku=${sku.SellerSku}`;
      if (typeof skuRaw.SkuId !== 'string' || skuRaw.SkuId === '') {
        fail(`/products/get: SkuId (${ctx})`, 'thiếu');
      }
      for (const field of ['package_length', 'package_width', 'package_height'] as const) {
        const value = skuRaw[field];
        if (typeof value !== 'string') {
          fail(`/products/get: ${field} (${ctx})`, `phải là CHUỖI, nhận ${JSON.stringify(value)}`);
        } else if (!(parseFloat(value) > 0)) {
          fail(`/products/get: ${field} (${ctx})`, `phải là chuỗi số > 0, nhận "${value}"`);
        }
      }
    }
  }
  if (products.length > 0) pass('/products/get: package_* là chuỗi số > 0, có SkuId trên mọi SKU đã kiểm');

  return products;
}

// ------------------------------------------------------------------
// 6. POST /product/stock/sellable/update (tùy chọn, AURELLE_TEST_WRITE=true)
// ------------------------------------------------------------------

async function checkStockUpdate(client: LazadaProtocolClient, products: LazadaProductRaw[]): Promise<void> {
  if (!testWrite) {
    warn('Cập nhật tồn bán được', 'bỏ qua — chỉ chạy khi AURELLE_TEST_WRITE=true');
    return;
  }
  const product = products[0];
  const sku = product?.skus[0];
  if (!product || !sku) {
    warn('Cập nhật tồn bán được', 'bỏ qua — không có sản phẩm nào để test ghi (chạy sau khi /products/get có dữ liệu)');
    return;
  }

  // Đọc `sellableQuantity` (field mẫu response Mục 7.5, KHÔNG có trong
  // LazadaProductSkuRaw gốc vì Lazada thật không trả field này) — chỉ
  // dùng ở đúng chỗ chẩn đoán này, không đưa vào type dùng chung.
  // `SkuId` KHÔNG có trên `LazadaProductSkuRaw` (Lazada thật không trả
  // field này, giống `sellableQuantity` — xem giải thích ở trên) — đọc
  // qua view Record<string, unknown> thay vì thêm vào type dùng chung.
  const skuRaw = sku as unknown as Record<string, unknown>;
  const currentQty =
    typeof skuRaw.sellableQuantity === 'number'
      ? skuRaw.sellableQuantity
      : typeof skuRaw.quantity === 'number'
        ? skuRaw.quantity
        : 0;
  const skuId = typeof skuRaw.SkuId === 'string' ? skuRaw.SkuId : '';

  const payload = JSON.stringify({
    Request: {
      Product: {
        Skus: {
          Sku: [{ ItemId: product.item_id, SkuId: skuId, SellerSku: sku.SellerSku, SellableQuantity: currentQty }],
        },
      },
    },
  });

  try {
    const data = await client.callSignedApiPost<unknown>('/product/stock/sellable/update', {
      access_token: accessToken,
      payload,
    });
    if (isRecord(data) && data.code === '0') {
      pass('Cập nhật tồn bán được: response code "0"', `đặt lại đúng số hiện có (${String(currentQty)}) cho SellerSku=${sku.SellerSku}`);
    } else {
      fail('Cập nhật tồn bán được: response code', `mong "0", nhận ${JSON.stringify(isRecord(data) ? data.code : data)}`);
    }
  } catch (error) {
    fail('Cập nhật tồn bán được: gọi API', describeError(error));
  }
}

// ------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== AURELLE — kiểm tra tương thích Open API (AURELLE_MARKETPLACE_DESIGN.md Mục 14) ===\n');

  const client = new LazadaProtocolClient({
    logLabel: 'Aurelle-Conformance',
    authBaseUrl: apiBaseUrl,
    apiBaseUrl,
    appKey,
    appSecret,
  });

  await checkToken(client);
  await checkBadSignatureRejected();
  const orders = await checkOrders(client);
  const { skus } = await checkOrderItemsAndMapper(client, orders);
  const products = await checkProducts(client, skus);
  await checkStockUpdate(client, products);

  const passCount = results.filter((r) => r.level === 'PASS').length;
  const warnCount = results.filter((r) => r.level === 'WARN').length;
  const failCount = results.filter((r) => r.level === 'FAIL').length;

  console.log(`\n=== Kết quả: ${String(passCount)} PASS · ${String(warnCount)} WARN · ${String(failCount)} FAIL ===`);
  if (failCount > 0) {
    console.log('❌ Còn FAIL — sửa phía AURELLE trước khi OptiPack tích hợp thật.');
    process.exit(1);
  }
  console.log('✅ 0 FAIL — phần đọc dữ liệu (OAuth, đơn, dòng hàng, sản phẩm) sẵn sàng để OptiPack tích hợp.');
}

main().catch((error: unknown) => {
  console.error('❌ Script thất bại:', error);
  process.exit(1);
});
