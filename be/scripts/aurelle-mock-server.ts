import express, { type Request, type Response } from 'express';
import { LazadaProtocolClient } from '../src/modules/marketplace-integration/adapters/lazada-protocol.client';
import { findDeveloperApp, mountDeveloperPortal, secretsMatch } from './aurelle-developer-portal';

/**
 * ===================================================================
 * BẢN GIẢ LẬP THAM CHIẾU CHO AURELLE OPEN API (Mục 14 AURELLE_MARKETPLACE_DESIGN.md)
 * ===================================================================
 * Bản mẫu ĐÚNG đặc tả Mục 7-8 — xem định dạng request/response THẬT
 * chạy được, không chỉ đọc trên giấy. Nhóm AURELLE dùng để so khớp khi
 * dựng BE thật; nhóm OptiPack dùng để tự kiểm `aurelle-conformance.ts`
 * và `AurelleAdapter` trước khi có AURELLE BE thật để gọi.
 *
 * KHÔNG PHẢI AURELLE BE thật — chỉ có 1 shop/1 đơn/1 sản phẩm cố định
 * trong bộ nhớ (mất khi restart), đủ để chạy hết `aurelle-conformance.ts`
 * với 0 FAIL. Dùng LẠI `LazadaProtocolClient.generateSign()` để verify
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
const SELLER_ID = '200000000101';

// Dùng lại ĐÚNG công thức ký của client thật — KHÔNG viết lại HMAC.
const signVerifier = new LazadaProtocolClient({
  logLabel: 'Aurelle-Mock',
  authBaseUrl: '',
  apiBaseUrl: '',
  appKey: APP_KEY,
  appSecret: APP_SECRET,
});

// ------------------------------------------------------------------
// Dữ liệu mẫu cố định — 1 đơn, 2 dòng hàng (đúng "1 dòng = 1 đơn vị"),
// 1 sản phẩm khớp SellerSku của dòng hàng.
// ------------------------------------------------------------------

const SAMPLE_ORDER = {
  order_id: 710000017,
  order_number: 'AUR260928017',
  statuses: ['pending'],
  created_at: '2026-09-28T09:14:05+07:00',
  updated_at: '2026-09-28T09:14:05+07:00',
  price: '400000.00',
  items_count: 2,
  payment_method: 'COD',
  remarks: 'Giao giờ hành chính',
  address_shipping: {
    first_name: 'Nguyễn Thị Lan',
    last_name: '',
    phone: '0901234567',
    address1: '12 Nguyễn Văn Linh, Phường Tân Phong, Quận 7',
    address3: 'TP. Hồ Chí Minh',
    address4: 'Quận 7',
    address5: 'Phường Tân Phong',
    city: 'TP. Hồ Chí Minh',
    country: 'Vietnam',
    post_code: '',
  },
  need_cancel_confirm: 'false',
  is_cancel_pending: 'false',
};

const SAMPLE_ITEMS = [
  {
    order_item_id: 810000051,
    order_id: 710000017,
    sku: 'ATD-M-01',
    shop_sku: '3000000456_VNAMZ-00123',
    name: 'Áo thun basic',
    variation: 'Màu: Đen, Size: M',
    item_price: '200000.00',
    paid_price: '200000.00',
    status: 'pending',
    shipping_type: 'Seller Own Fleet',
    tracking_code: '',
    package_id: '',
  },
  {
    order_item_id: 810000052,
    order_id: 710000017,
    sku: 'ATD-M-01',
    shop_sku: '3000000456_VNAMZ-00123',
    name: 'Áo thun basic',
    variation: 'Màu: Đen, Size: M',
    item_price: '200000.00',
    paid_price: '200000.00',
    status: 'pending',
    shipping_type: 'Seller Own Fleet',
    tracking_code: '',
    package_id: '',
  },
];

let sampleSellableQuantity = 11;
const SAMPLE_PRODUCT = {
  item_id: '3000000456',
  status: 'live',
  attributes: { name: 'Áo thun basic', brand: 'AURELLE' },
  skus: [
    {
      SkuId: '12000456',
      SellerSku: 'ATD-M-01',
      ShopSku: '3000000456_VNAMZ-00123',
      Status: 'active',
      price: '200000.00',
      quantity: 12,
      get sellableQuantity(): number {
        return sampleSellableQuantity;
      },
      package_length: '25',
      package_width: '20',
      package_height: '3',
      package_weight: '0.2',
      color_family: 'Đen',
      size: 'M',
    },
  ],
};

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

app.get('/rest/orders/get', (req: Request, res: Response) => {
  if (!requireValidSignature(req, res)) return;
  if (!requireValidAccessToken(req, res)) return;
  res.json(envelope({ count: 1, countTotal: 1, orders: [SAMPLE_ORDER] }));
});

app.get('/rest/order/items/get', (req: Request, res: Response) => {
  if (!requireValidSignature(req, res)) return;
  if (!requireValidAccessToken(req, res)) return;
  const orderIdRaw = req.query.order_id;
  const orderIdLabel = typeof orderIdRaw === 'string' ? orderIdRaw : '(không hợp lệ)';
  const orderId = Number(orderIdRaw);
  if (orderId !== SAMPLE_ORDER.order_id) {
    res.status(404).json(errorEnvelope('ResourceNotFound', `Không có đơn "${orderIdLabel}".`));
    return;
  }
  res.json(envelope(SAMPLE_ITEMS));
});

app.get('/rest/products/get', (req: Request, res: Response) => {
  if (!requireValidSignature(req, res)) return;
  if (!requireValidAccessToken(req, res)) return;
  res.json(envelope({ total_products: '1', products: [SAMPLE_PRODUCT] }));
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

app.post('/rest/product/stock/sellable/update', (req: Request, res: Response) => {
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

  const results = skus.map((sku) => {
    if (sku.SellerSku === SAMPLE_PRODUCT.skus[0]?.SellerSku && typeof sku.SellableQuantity === 'number') {
      sampleSellableQuantity = sku.SellableQuantity;
    }
    return { SkuId: sku.SkuId, SellerSku: sku.SellerSku, success: true, SellableQuantity: sku.SellableQuantity };
  });
  res.json(envelope({ results }));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`AURELLE mock server (tham chiếu Mục 7-8) chạy tại http://localhost:${String(PORT)}`);
  console.log(`Developer Console: http://localhost:${String(PORT)}/developer`);
});
