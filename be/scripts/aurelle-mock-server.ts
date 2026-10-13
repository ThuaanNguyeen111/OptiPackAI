import express, { type Request, type Response } from 'express';
import { LazadaProtocolClient } from '../src/modules/marketplace-integration/adapters/lazada-protocol.client';
import { findDeveloperApp, mountDeveloperPortal, secretsMatch } from './aurelle-developer-portal';
import {
  connectStorefrontStore,
  getOrderItems,
  listOrders,
  listProducts,
  setSellableQuantity,
} from './aurelle-portal/storefront-store';
import { DEFAULT_AURELLE_SELLER_ID } from '../src/modules/storefront/aurelle-open-api.mapper';

/**
 * ===================================================================
 * BẢN GIẢ LẬP THAM CHIẾU CHO AURELLE OPEN API (Mục 14 AURELLE_MARKETPLACE_DESIGN.md)
 * ===================================================================
 * Bản mẫu ĐÚNG đặc tả Mục 7-8 — xem định dạng request/response THẬT
 * chạy được, không chỉ đọc trên giấy. Nhóm AURELLE dùng để so khớp khi
 * dựng BE thật; nhóm OptiPack dùng để tự kiểm `aurelle-conformance.ts`
 * và `AurelleAdapter` trước khi có AURELLE BE thật để gọi.
 *
 * ĐÃ THAY ĐỔI 04/10/2026: không còn dữ liệu mẫu cố định — đơn, dòng
 * hàng, sản phẩm và tồn đọc THẬT từ website AURELLE (các collection
 * `storefront_*` trong MongoDB của MONGODB_URI). Website đặt hàng xong bắn
 * webhook cho OptiPack; OptiPack gọi lại các API dưới đây để lấy đơn.
 * Shop duy nhất: seller_id AURELLE_SELLER_ID (mặc định 200000000101). Dùng LẠI `LazadaProtocolClient.generateSign()` để verify
 * chữ ký — cùng 1 công thức với client thật, không viết lại HMAC lần 2
 * (tránh 2 bản có thể lệch nhau nếu chỉ sửa 1 chỗ).
 *
 * Chạy:
 *   cd be
 *   npx ts-node -r dotenv/config scripts/aurelle-mock-server.ts
 *   (mặc định cổng 4000 — đổi qua AURELLE_MOCK_PORT)
 *
 * Rồi chạy conformance script nhắm vào chính server này:
 *   AURELLE_API_BASE_URL=http://localhost:4000/rest \
 *   AURELLE_APP_KEY=500123 AURELLE_APP_SECRET=mock-secret \
 *   AURELLE_ACCESS_TOKEN=mock-access-token \
 *   AURELLE_AUTH_CODE=0_500123_mock \
 *   AURELLE_REFRESH_TOKEN=mock-refresh-token \
 *   AURELLE_TEST_WRITE=true \
 *   npx ts-node -r dotenv/config scripts/aurelle-conformance.ts
 * ===================================================================
 */

const PORT = Number(process.env.AURELLE_MOCK_PORT ?? '4000');
const APP_KEY = process.env.AURELLE_MOCK_APP_KEY ?? '500123';
const APP_SECRET = process.env.AURELLE_MOCK_APP_SECRET ?? 'mock-secret';
const ACCESS_TOKEN = 'mock-access-token';
const REFRESH_TOKEN = 'mock-refresh-token';
const SELLER_ID = process.env.AURELLE_SELLER_ID ?? DEFAULT_AURELLE_SELLER_ID;

// Dùng lại ĐÚNG công thức ký của client thật — KHÔNG viết lại HMAC.
const signVerifier = new LazadaProtocolClient({
  logLabel: 'Aurelle-Mock',
  authBaseUrl: '',
  apiBaseUrl: '',
  appKey: APP_KEY,
  appSecret: APP_SECRET,
});

// ------------------------------------------------------------------
// Helper — vỏ response, verify chữ ký, verify access_token
// ------------------------------------------------------------------

function envelope<T>(data: T): { code: string; data: T; request_id: string } {
  return { code: '0', data, request_id: `mock_${String(Date.now())}` };
}

function errorEnvelope(code: string, message: string): { code: string; message: string; request_id: string } {
  return { code, message, request_id: `mock_${String(Date.now())}` };
}

/**
 * Verify chữ ký theo ĐÚNG params đã nhận (query cho GET, body cho POST
 * form-urlencoded) — loại `sign` ra trước khi tính lại, so sánh CHỮ HOA
 * với giá trị client gửi.
 */
function verifySignature(req: Request): boolean {
  const source: Record<string, unknown> = req.method === 'GET' ? req.query : (req.body as Record<string, unknown>);
  const sign = typeof source.sign === 'string' ? source.sign : '';
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'sign') continue;
    // `payload` (stock update) có thể chứa ký tự JSON đặc biệt — vẫn
    // tham gia ký NGUYÊN VĂN như mọi tham số khác (Mục 7.7).
    params[key] = typeof value === 'number' ? value : String(value);
  }
  const key = String(source.app_key ?? '');
  const registered = findDeveloperApp(key);
  if (!registered && key !== APP_KEY) return false;
  if (registered && registered.status === 'revoked') return false;
  const verifier = registered ? new LazadaProtocolClient({
    logLabel: 'Aurelle-Local', authBaseUrl: '', apiBaseUrl: '',
    appKey: registered.app_key, appSecret: registered.app_secret,
  }) : signVerifier;
  const expected = verifier.generateSign(req.path.replace(/^\/rest/, ''), params);
  return secretsMatch(expected, sign);
}

function requireValidSignature(req: Request, res: Response): boolean {
  if (!verifySignature(req)) {
    res.status(400).json(errorEnvelope('IncompleteSignature', 'Chữ ký không hợp lệ hoặc thiếu tham số.'));
    return false;
  }
  return true;
}

function requireValidAccessToken(req: Request, res: Response): boolean {
  const source: Record<string, unknown> = req.method === 'GET' ? req.query : (req.body as Record<string, unknown>);
  if (source.access_token !== ACCESS_TOKEN) {
    res.status(401).json(errorEnvelope('IllegalAccessToken', 'Token không hợp lệ hoặc đã hết hạn.'));
    return false;
  }
  return true;
}

// ------------------------------------------------------------------
// App
// ------------------------------------------------------------------

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
mountDeveloperPortal(app);

// Mục 7.2 — trang authorize (giả lập "người bán bấm Cho phép" luôn
// thành công, redirect thẳng kèm code+state).
app.get('/oauth/authorize', (req: Request, res: Response) => {
  const redirectUri = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const key = typeof req.query.client_id === 'string' ? req.query.client_id : '';
  const registered = findDeveloperApp(key);
  if (registered && registered.status === 'revoked') {
    res.status(403).send('Khóa ứng dụng này đã bị thu hồi (revoked). Vui lòng kích hoạt lại trong Cổng nhà phát triển.');
    return;
  }
  if ((!registered && key !== APP_KEY) || (registered && registered.redirect_uri !== redirectUri)) {
    res.status(400).send('Ứng dụng hoặc callback chưa được đăng ký.');
    return;
  }
  if (!redirectUri) {
    res.status(400).send('Thiếu redirect_uri.');
    return;
  }
  let url: URL;
  try {
    url = new URL(redirectUri);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid callback');
  } catch {
    res.status(400).send('Callback không hợp lệ.');
    return;
  }
  url.searchParams.set('code', `0_${key}_mock`);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

app.post('/rest/auth/token/create', (req: Request, res: Response) => {
  if (!requireValidSignature(req, res)) return;
  res.json(
    envelope({
      code: '0',
      access_token: ACCESS_TOKEN,
      refresh_token: REFRESH_TOKEN,
      expires_in: 604800,
      refresh_expires_in: 2592000,
      account: 'aurelle.official@aurelle.vn',
      country: 'vn',
      account_platform: 'seller_center',
      country_user_info: [{ country: 'vn', user_id: '100000101', seller_id: SELLER_ID, short_code: 'VNAUR01' }],
    }).data,
  );
});

app.post('/rest/auth/token/refresh', (req: Request, res: Response) => {
  if (!requireValidSignature(req, res)) return;
  res.json(
    envelope({
      code: '0',
      access_token: ACCESS_TOKEN,
      refresh_token: REFRESH_TOKEN,
      expires_in: 604800,
      refresh_expires_in: 2592000,
      account: 'aurelle.official@aurelle.vn',
      country: 'vn',
      account_platform: 'seller_center',
      country_user_info: [{ country: 'vn', user_id: '100000101', seller_id: SELLER_ID, short_code: 'VNAUR01' }],
    }).data,
  );
});

function queryString(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function queryInt(req: Request, key: string, fallback: number, max: number): number {
  const parsed = Number(queryString(req, key));
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

function sendServerError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error('AURELLE mock lỗi:', message);
  res.status(500).json(errorEnvelope('InternalError', message));
}

app.get('/rest/orders/get', async (req: Request, res: Response) => {
  if (!requireValidSignature(req, res)) return;
  if (!requireValidAccessToken(req, res)) return;
  const after = queryString(req, 'update_after') ?? queryString(req, 'created_after');
  if (!after || Number.isNaN(Date.parse(after))) {
    res.status(400).json(errorEnvelope('MissingParameter', 'Thiếu hoặc sai update_after (ISO 8601).'));
    return;
  }
  const before = queryString(req, 'update_before');
  try {
    const data = await listOrders({
      updateAfter: new Date(after),
      updateBefore: before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined,
      offset: queryInt(req, 'offset', 0, Number.MAX_SAFE_INTEGER),
      limit: queryInt(req, 'limit', 100, 100) || 100,
    });
    res.json(envelope(data));
  } catch (error) {
    sendServerError(res, error);
  }
});

app.get('/rest/order/items/get', async (req: Request, res: Response) => {
  if (!requireValidSignature(req, res)) return;
  if (!requireValidAccessToken(req, res)) return;
  const orderIdLabel = queryString(req, 'order_id') ?? '(không hợp lệ)';
  const orderId = Number(orderIdLabel);
  if (!Number.isInteger(orderId)) {
    res.status(400).json(errorEnvelope('InvalidParameter', `order_id "${orderIdLabel}" không hợp lệ.`));
    return;
  }
  try {
    const items = await getOrderItems(orderId);
    if (!items) {
      res.status(404).json(errorEnvelope('ResourceNotFound', `Không có đơn "${orderIdLabel}".`));
      return;
    }
    res.json(envelope(items));
  } catch (error) {
    sendServerError(res, error);
  }
});

app.get('/rest/products/get', async (req: Request, res: Response) => {
  if (!requireValidSignature(req, res)) return;
  if (!requireValidAccessToken(req, res)) return;
  let skus: string[] | null = null;
  const rawList = queryString(req, 'sku_seller_list');
  if (rawList) {
    try {
      const parsed: unknown = JSON.parse(rawList);
      if (!Array.isArray(parsed)) throw new Error('not array');
      skus = parsed.filter((sku): sku is string => typeof sku === 'string');
    } catch {
      res.status(400).json(errorEnvelope('InvalidParameter', 'sku_seller_list phải là mảng JSON.'));
      return;
    }
  }
  try {
    res.json(envelope(await listProducts(skus, queryInt(req, 'offset', 0, Number.MAX_SAFE_INTEGER), queryInt(req, 'limit', 50, 50) || 50)));
  } catch (error) {
    sendServerError(res, error);
  }
});

app.post('/rest/order/acknowledge', (req: Request, res: Response) => {
  if (!requireValidSignature(req, res)) return;
  if (!requireValidAccessToken(req, res)) return;
  const body = req.body as Record<string, unknown>;
  res.json(envelope({ order_id: Number(body.order_id) }));
});

app.post('/rest/order/status/update', (req: Request, res: Response) => {
  if (!requireValidSignature(req, res)) return;
  if (!requireValidAccessToken(req, res)) return;
  const body = req.body as Record<string, unknown>;
  res.json(envelope({ order_id: Number(body.order_id), status: String(body.status), updated_at: new Date().toISOString() }));
});

app.post('/rest/product/stock/sellable/update', async (req: Request, res: Response) => {
  if (!requireValidSignature(req, res)) return;
  if (!requireValidAccessToken(req, res)) return;
  const body = req.body as Record<string, unknown>;
  const payloadRaw = typeof body.payload === 'string' ? body.payload : '{}';
  let skus: { SkuId?: string; SellerSku?: string; SellableQuantity?: number }[] = [];
  try {
    const parsed: unknown = JSON.parse(payloadRaw);
    if (typeof parsed === 'object' && parsed !== null && 'Request' in parsed) {
      const request = (parsed as { Request?: { Product?: { Skus?: { Sku?: unknown } } } }).Request;
      const list = request?.Product?.Skus?.Sku;
      if (Array.isArray(list)) skus = list as typeof skus;
    }
  } catch {
    res.status(400).json(errorEnvelope('InvalidParameter', 'payload không phải JSON hợp lệ.'));
    return;
  }

  try {
    const results = [];
    for (const sku of skus) {
      const ok = typeof sku.SellerSku === 'string' && typeof sku.SellableQuantity === 'number'
        ? await setSellableQuantity(sku.SellerSku, sku.SellableQuantity)
        : false;
      results.push({ SkuId: sku.SkuId, SellerSku: sku.SellerSku, success: ok, SellableQuantity: sku.SellableQuantity });
    }
    res.json(envelope({ results }));
  } catch (error) {
    sendServerError(res, error);
  }
});

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('Thiếu MONGODB_URI — mock AURELLE cần đọc dữ liệu website từ MongoDB.');
  process.exit(1);
}

void connectStorefrontStore(mongoUri).then(() => app.listen(PORT, '127.0.0.1', () => {
  console.log(`AURELLE mock server (tham chiếu Mục 7-8) chạy tại http://localhost:${String(PORT)}`);
  console.log(`Developer Console: http://localhost:${String(PORT)}/developer`);
}));
