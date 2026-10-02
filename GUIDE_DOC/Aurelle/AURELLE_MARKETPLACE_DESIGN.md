# AURELLE Marketplace — Đặc tả sàn thứ 2 tương thích Lazada và tích hợp OptiPack

| Thông tin | Giá trị |
|---|---|
| Phiên bản | 2.0 — 28/09/2026 (viết lại toàn bộ; thay thế v1.x) |
| Mục đích | Đặc tả cơ sở dữ liệu, API và cách tích hợp để sàn tự xây dựng **AURELLE** hoạt động như sàn thương mại điện tử thứ hai, kết nối OptiPack **theo đúng khuôn đang dùng với Lazada** |
| Đối tượng | Nhóm phát triển AURELLE (BE + storefront), nhóm OptiPack BE, người trình diễn |
| Mã nền tảng trong OptiPack | `aurelle` |
| Phạm vi tài liệu | Thiết kế. Phần triển khai OptiPack BE thực hiện sau theo Mục 12 |

---

## 0. Quyết định đã chốt

| # | Quyết định |
|---|---|
| 1 | AURELLE là **hệ thống tách biệt**: backend và cơ sở dữ liệu riêng. OptiPack kết nối qua API, không truy cập database của sàn |
| 2 | Đơn về OptiPack bằng **webhook** (ngay khi phát sinh) **và kéo định kỳ 5 phút** (bù đơn webhook bỏ sót) |
| 3 | OptiPack **ghi ngược** lên AURELLE: **trạng thái đơn** và **tồn bán được** — khách thấy trên trang |
| 4 | **Mô hình gộp đơn:** đơn **cùng sàn** cùng người nhận → gộp **1 nhóm đơn, 1 thùng** (như hiện tại). Đơn **khác sàn** cùng người nhận → **2 nhóm đơn, 2 thùng, 2 mã vận đơn**, được **liên kết** để lấy hàng cùng lượt, đóng gói liền nhau và **giao chung 1 chuyến** |
| 5 | **Tương thích Lazada:** Open API của AURELLE dùng cùng đường dẫn, cách ký request, vỏ response và tên trường với Lazada Open Platform, để OptiPack tái dùng adapter và hàm ánh xạ đơn của Lazada |

---

## 1. Hiện trạng

Bản build của storefront AURELLE cho thấy:

```
Trình duyệt khách (Next.js storefront)
        │  NEXT_PUBLIC_API_URL = http://localhost:3000   ← cổng BE OptiPack
        ▼
BE OptiPack: /storefront/*  ·  /customer-auth/*          ← nằm ở nhánh thành viên nhóm, không có trong main
        │  ghi đơn trực tiếp vào database OptiPack
        ▼
Đơn xuất hiện ngay trong OptiPack
```

Storefront chưa có backend riêng và đơn được ghi thẳng vào OptiPack — chưa phải tích hợp giữa 2 hệ thống. Tài liệu này chuyển storefront sang một backend AURELLE độc lập.

---

## 2. Kiến trúc đích

```
Khách ──► AURELLE Storefront (Next.js, :3001)
                  │  /storefront/*, /customer-auth/*   (giữ nguyên đường dẫn)
                  ▼
          AURELLE Marketplace BE (:4000) ───── Database aurelle_marketplace
             │  ▲                       │
 Open API    │  │ Open API mở rộng       │ Webhook (Push)
 (khuôn      │  │ (ghi trạng thái, tồn)  │ order_status_changed
  Lazada)    ▼  │                       ▼
          OptiPack BE (:3000) ───── Database optipackai
```

| Thành phần | Vai trò |
|---|---|
| AURELLE Storefront | Giao diện mua hàng. Chỉ đổi địa chỉ API sang AURELLE BE |
| AURELLE Marketplace BE | Nghiệp vụ sàn: sản phẩm, giỏ, đặt hàng, tài khoản khách; **Open API** cho đối tác; phát **webhook** |
| OptiPack BE | Kết nối AURELLE như một sàn: adapter, đồng bộ đơn và sản phẩm, nhận webhook, ghi ngược trạng thái và tồn; **liên kết nhóm đơn khác sàn cùng người nhận** |

---

## 3. Nguyên tắc tương thích Lazada

| Hạng mục | Lazada (OptiPack đang dùng) | AURELLE | Kết quả cho OptiPack |
|---|---|---|---|
| Trang cấp quyền | `/oauth/authorize?response_type&force_auth&redirect_uri&client_id&state` | **Giống hệt** | Dùng lại cách tạo URL |
| Đổi / làm mới token | `POST /auth/token/create`, `/auth/token/refresh`, form-urlencoded, ký | **Giống hệt** | Dùng lại |
| Cấu trúc token | `access_token`, `refresh_token`, `expires_in`, `refresh_expires_in`, `account`, `country_user_info[].seller_id` | **Giống hệt** | Dùng lại `mapTokenResponse` |
| Ký request | Sắp xếp tham số theo alphabet, nối `path + key + value`, HMAC-SHA256(app_secret), HEX **CHỮ HOA** | **Giống hệt** | Dùng lại `generateSign` |
| Vỏ response | `{ code: "0", data, request_id }`; lỗi: `code` khác `"0"` + `message` | **Giống hệt** | Dùng lại kiểm tra lỗi |
| Danh sách đơn | `GET /orders/get?update_after&update_before&offset&limit` | **Giống hệt** | Dùng lại |
| Dòng hàng | `GET /order/items/get?order_id` | **Giống hệt** | Dùng lại |
| Sản phẩm | `GET /products/get?filter&limit&sku_seller_list` | **Giống hệt** + thêm `update_after` | Dùng lại |
| Tên trường đơn / dòng hàng / sản phẩm | `order_id`, `statuses`, `price` (chuỗi), `address_shipping.*`, `SellerSku`, `package_*` (chuỗi)… | **Giống hệt** | Dùng lại **nguyên hàm `mapLazadaOrder`** |
| Trạng thái đơn | `pending`, `packed`, `ready_to_ship`, `shipped`, `delivered`, `failed_delivery`, `returned`, `canceled`… | **Giống hệt** | Dùng lại `mapLazadaStatus` |
| Webhook | OptiPack chưa dùng (Lazada không mở cho shop hiện tại) | **Có** — khuôn Push | Mới |
| Ghi trạng thái đơn | Không dùng được với shop tự giao | **Có** — mở rộng | Mới |
| Cập nhật tồn | `UpdateSellableQuantity` (payload XML, chưa có quyền) | **Có** — cùng đường dẫn, cùng tên trường, payload JSON | Mới; dùng lại được cho Lazada khi có quyền |

---

## 4. Mô hình gộp đơn và giao chung chuyến

### 4.1. Quy tắc

| Trường hợp | Nhóm đơn | Thùng | Mã vận đơn | Giao |
|---|---|---|---|---|
| 2 đơn **cùng sàn**, cùng người nhận | 1 nhóm (gộp theo `consolidation_key` hiện có) | 1 | 1 | 1 chuyến |
| 2 đơn **khác sàn**, cùng người nhận | **2 nhóm**, liên kết bằng `recipient_key` | 2 | 2 | **1 chuyến chung** |

Hai đơn khác sàn không đóng chung thùng vì mỗi đơn có mã vận đơn, mã vạch và quy trình đối soát riêng của sàn. Mục tiêu tối ưu là **xử lý cùng lượt và giao cùng chuyến**.

### 4.2. Khóa nhận diện

| Khóa | Thành phần | Dùng để |
|---|---|---|
| `consolidation_key` (đã có) | `sàn + SĐT + địa chỉ + tỉnh` | Gộp đơn cùng sàn vào 1 nhóm/1 thùng |
| `recipient_key` (**mới**) | `tên + SĐT + địa chỉ + tỉnh`, **không kèm sàn** | Liên kết các nhóm đơn khác sàn cùng người nhận |

Chuẩn hóa: tên và địa chỉ bỏ dấu, chữ thường, gộp khoảng trắng; SĐT dùng hàm chuẩn hóa sẵn có. Thông tin gõ khác nhau → không liên kết (ưu tiên an toàn, không liên kết nhầm).

### 4.3. Ví dụ

Chị Lan — `0901234567`, *12 Nguyễn Văn Linh, P. Tân Phong, Q.7, TP.HCM* — đặt **1 áo trên Lazada** và **1 váy trên AURELLE**:

```
Nhóm #G1 (Lazada, 1 áo)  ─┐  cùng recipient_key
Nhóm #G2 (AURELLE, 1 váy) ─┘
   → Picking List gộp: lấy áo + váy trong 1 lượt đi kệ, mỗi món ghi rõ thuộc thùng G1 hay G2
   → Đóng gói: thùng G1 (nhãn Lazada) · thùng G2 (nhãn AURELLE)
   → Giao chung chuyến TRIP-260928-01: 2 vận đơn, 1 người giao, 1 lần tới
   → Giao xong: G1 ghi "delivered" về Lazada (theo quy trình Lazada) · G2 ghi "delivered" về AURELLE
```

---

## 5. Cơ sở dữ liệu AURELLE

Database `aurelle_marketplace` (MongoDB; có thể đặt cùng cluster Atlas với OptiPack). Tiền lưu **số nguyên VND**; khi trả qua Open API chuyển thành **chuỗi** như Lazada.

### 5.1. Sơ đồ

```
shops 1─n products 1─n skus
shops 1─n orders 1─n order_items n─1 skus
customers 1─n orders · customers 1─1 carts
apps 1─n app_authorizations n─1 shops
orders 1─n order_events · apps 1─n webhook_deliveries · skus 1─n stock_movements
counters (sinh số order_id / order_item_id)
```

### 5.2. Collection

**`shops`**
| Trường | Kiểu | Ghi chú |
|---|---|---|
| `seller_id` | string, unique | VD `200000000101`. Trả trong `country_user_info[].seller_id` → OptiPack lưu làm `shop_id` |
| `account` | string | Email/tên tài khoản người bán — trả trong `account` → OptiPack lưu làm `shop_name` |
| `short_code` | string | VD `VNAUR01` |
| `status` | `active` \| `suspended` | |

**`customers`**
| Trường | Kiểu | Ghi chú |
|---|---|---|
| `email` | string, unique | |
| `password_hash` | string | bcrypt |
| `full_name`, `phone` | string | |
| `addresses[]` | `{ recipient_name, phone, address_line, ward, district, province, is_default }` | |

**`products`** (tương đương *item* Lazada)
| Trường | Kiểu | Ghi chú |
|---|---|---|
| `item_id` | string, unique | VD `3000000456` |
| `seller_id` | string, index | |
| `slug` | string, unique | URL storefront |
| `name`, `description`, `category_name` | string | |
| `thumbnail_url`, `gallery_images[]` | string | |
| `size_chart_type`, `size_chart`, `size_guide_note` | | Giữ theo dữ liệu storefront hiện có |
| `status` | `live` \| `inactive` | Theo tên trạng thái của Lazada |
| `updated_at` | Date | |

**`skus`**
| Trường | Kiểu | Ghi chú |
|---|---|---|
| `sku_id` | string, unique | Trả là `SkuId` |
| `item_id` | string, index | |
| `seller_sku` | string | Trả là `SellerSku` — **OptiPack dùng làm SKU sàn**, nối SKU nội bộ (K4). Unique theo `seller_id` |
| `shop_sku` | string | Trả là `ShopSku` |
| `variant_name` | string | VD `Đen / M` → `variation` trên dòng hàng |
| `color`, `size` | string | |
| `price` | int VND | |
| `package_length`, `package_width`, `package_height` (cm), `package_weight` (kg) | number | **Bắt buộc** — OptiPack dùng cho gợi ý đóng gói |
| `sellable_quantity` | int ≥ 0 | Do OptiPack cập nhật (Mục 7.7) |
| `occupied_quantity` | int ≥ 0 | Đơn chưa được OptiPack xác nhận nhận (Mục 5.3) |
| `status` | `active` \| `inactive` | |
| `is_default` | boolean | |
| `updated_at` | Date | |

**`carts`**: `{ customer_id (unique), items: [{ sku_id, quantity }], updated_at }`

**`orders`**
| Trường | Kiểu | Ghi chú |
|---|---|---|
| `order_id` | **number**, unique | Sinh tăng dần từ `counters` — Lazada dùng số, OptiPack lưu `platform_order_id = String(order_id)` |
| `order_number` | string, unique | Mã hiển thị cho khách |
| `client_order_id` | string, unique | Chống đặt trùng khi bấm 2 lần |
| `seller_id`, `customer_id` | index | |
| `status` | xem Mục 6 | Trạng thái cấp đơn |
| `payment_method` | `COD` \| `BANK_TRANSFER` | |
| `payment_status` | `unpaid` \| `paid` \| `refunded` | |
| `shipping_address` | `{ recipient_name, phone, address_line, ward, district, province, post_code }` | |
| `remarks` | string | Ghi chú khách |
| `subtotal`, `shipping_fee`, `total_amount` | int VND | |
| `acknowledged_at` | Date | Thời điểm OptiPack xác nhận đã nhận đơn |
| `need_cancel_confirm`, `is_cancel_pending` | boolean | Giữ để trả đúng trường như Lazada; mặc định `false` |
| `cancel_reason`, `cancelled_at`, `cancelled_by` | | |
| `created_at`, `updated_at` | Date | Index `{ seller_id: 1, updated_at: 1 }` |

**`order_items`**
| Trường | Kiểu | Ghi chú |
|---|---|---|
| `order_item_id` | **number**, unique | Từ `counters` |
| `order_id` | number, index | |
| `sku_id`, `seller_sku`, `shop_sku`, `item_id` | string | |
| `name`, `variation` | string | Chụp lúc đặt |
| `quantity` | int | Mỗi dòng 1 đơn vị như Lazada, hoặc gộp số lượng — xem ghi chú Mục 7.4 |
| `item_price`, `paid_price` | int VND | |
| `status` | như Mục 6 | |
| `tracking_code`, `package_id` | string | Do OptiPack ghi ngược (mã vận đơn) |

**`order_events`** (chỉ ghi thêm): `{ order_id, from_status, to_status, source: customer|system|partner, note, trip_code, occurred_at }` — hiển thị hành trình cho khách.

**`apps`**: `{ app_key (unique), app_secret, name: "OptiPack", redirect_uri, push_url, push_enabled, scopes[] }`

**`app_authorizations`**: `{ app_key, seller_id (unique cặp), auth_code, auth_code_expires_at (10 phút), access_token_hash, access_token_expires_at (7 ngày), refresh_token_hash, refresh_token_expires_at (30 ngày), revoked_at }` — lưu **hash** token, không lưu bản gốc.

**`webhook_deliveries`** (outbox): `{ message_id (unique), app_key, message_type, body, status: pending|delivered|failed, attempts, next_attempt_at, last_error, created_at, delivered_at }`

**`stock_movements`**: `{ sku_id, delta, before, after, reason: order_placed|order_cancelled|partner_update|manual, ref, source, created_at }`

**`counters`**: `{ _id: "order_id" | "order_item_id", seq }` — tăng bằng `findOneAndUpdate($inc)`.

### 5.3. Quản lý tồn bán được

| Sự kiện | `sellable_quantity` | `occupied_quantity` |
|---|---|---|
| Khách đặt hàng (kiểm `sellable ≥ qty`, nguyên tử) | − qty | + qty |
| OptiPack gọi xác nhận đã nhận đơn | — | − qty (OptiPack tiếp quản bằng giữ chỗ K5) |
| OptiPack gửi tồn mới | **đặt** = giá trị gửi (đã trừ giữ chỗ) | — |
| Đơn bị hủy trước khi OptiPack nhận | + qty | − qty |

---

## 6. Trạng thái đơn

| Trạng thái | Ý nghĩa | Chuyển bởi | Khách thấy |
|---|---|---|---|
| `unpaid` | Chuyển khoản chưa thanh toán | Sàn | Chờ thanh toán |
| `pending` | Đơn mới | Sàn | Đã đặt hàng |
| `packed` | Đã đóng gói | OptiPack | Đã đóng gói |
| `ready_to_ship` | Sẵn sàng giao | OptiPack | Chờ giao |
| `shipped` | Đang giao | OptiPack | Đang giao hàng |
| `delivered` | Giao thành công | OptiPack | Đã giao |
| `failed_delivery` | Giao không thành công | OptiPack | Giao không thành công |
| `shipped_back` | Đang hoàn về người bán | OptiPack | Đang hoàn trả |
| `returned` | Người bán đã nhận lại | OptiPack | Đã hoàn trả |
| `canceled` | Đã hủy | Khách (khi `unpaid`/`pending`) hoặc người bán | Đã hủy |

Luật chuyển (sàn kiểm tra, sai → lỗi `InvalidStatusTransition`):
```
unpaid → pending | canceled         pending → packed | canceled
packed → ready_to_ship | shipped    ready_to_ship → shipped
shipped → delivered | failed_delivery
failed_delivery → shipped | shipped_back        shipped_back → returned
```
Trường `statuses` (mảng) trong response lấy **tập trạng thái khác nhau của các dòng hàng** — giống Lazada; OptiPack chọn trạng thái đại diện bằng `pickRepresentativeStatus` sẵn có. Đơn `unpaid` không phát webhook và không trả trong `/orders/get` khi lọc mặc định.

---

## 7. Open API cho đối tác

Host API: `http://localhost:4000/rest` · Host cấp quyền: `http://localhost:4000` (tương ứng `api.lazada.vn/rest` và `auth.lazada.com`).

### 7.1. Tham số chung và cách ký — giống Lazada

| Tham số | Ghi chú |
|---|---|
| `app_key` | Khóa ứng dụng OptiPack |
| `timestamp` | Unix **mili giây**; lệch quá 7200 giây → `IncompleteSignature` |
| `sign_method` | `sha256` |
| `access_token` | Bắt buộc với API nghiệp vụ; không dùng ở API token |
| `sign` | Chữ ký |

**Thuật toán ký**
1. Lấy mọi tham số (query/form, **trừ** `sign`), sắp xếp theo tên (alphabet).
2. Nối chuỗi: `API_PATH` + `key1value1key2value2…` (không dấu phân cách).
3. `sign = UPPER(HEX(HMAC_SHA256(app_secret, chuỗi)))`.

Ví dụ `GET /orders/get`: chuỗi ký = `/orders/getaccess_tokenAT_xxxapp_key500123limit100offset0sign_methodsha256timestamp1790555645000update_after2026-09-28T00:00:00.000Z`.

**Vỏ response**
```json
{ "code": "0", "request_id": "0ba2887315178178017221014", "data": { } }
```
**Lỗi**
```json
{ "code": "IllegalAccessToken", "message": "The specified access token is invalid or expired", "request_id": "..." }
```

| `code` | HTTP | Khi nào |
|---|---|---|
| `IncompleteSignature` | 400 | Chữ ký sai / thiếu tham số chung / timestamp lệch |
| `IllegalAccessToken` | 401 | Token sai hoặc hết hạn |
| `InsufficientPermission` | 403 | Shop chưa cấp quyền cho app |
| `InvalidParameter` | 400 | Tham số sai |
| `ResourceNotFound` | 404 | Đơn/SKU không tồn tại |
| `InvalidStatusTransition` | 409 | Chuyển trạng thái sai luật (API mở rộng) |
| `ApiCallLimit` | 429 | Vượt 20 request/giây/app |

OptiPack xác định thành công bằng `code === "0"` — đúng như đang làm với Lazada.

### 7.2. Cấp quyền

**Trang cấp quyền**
```
GET /oauth/authorize?response_type=code&force_auth=true&redirect_uri=<OptiPack callback>&client_id=<app_key>&state=<state>
```
Người bán đăng nhập AURELLE → *Cho phép* → chuyển hướng:
```
http://localhost:3000/marketplace/aurelle/callback?code=0_500123_xxx&state=<state>
```
⚠️ Chỉ trả `code`, `state` (có thể thêm `shop_id`). Callback OptiPack **từ chối tham số lạ** — thêm tham số khác sẽ lỗi 400.

**Đổi mã lấy token**
```
POST /rest/auth/token/create        Content-Type: application/x-www-form-urlencoded
app_key=500123&code=0_500123_xxx&sign_method=sha256&timestamp=1790555645000&sign=ABC...
```
```json
{
  "code": "0",
  "access_token": "50000601c30atpedfgu3LVvik87Ixlsvle3mSoB7701ceb156fPunYZ43GBg",
  "refresh_token": "500016000300bwa2WteaQyfwBMnPxurcA0mXGhQdTt18356663CfcDTYpWoi",
  "expires_in": 604800,
  "refresh_expires_in": 2592000,
  "account": "aurelle.official@aurelle.vn",
  "country": "vn",
  "account_platform": "seller_center",
  "country_user_info": [
    { "country": "vn", "user_id": "100000101", "seller_id": "200000000101", "short_code": "VNAUR01" }
  ],
  "request_id": "..."
}
```

**Làm mới token**
```
POST /rest/auth/token/refresh       app_key, refresh_token, sign_method, timestamp, sign
```
Response cùng cấu trúc; `refresh_token` cũ hết hiệu lực.

### 7.3. Danh sách đơn — `GET /rest/orders/get`

| Tham số | Bắt buộc | Ghi chú |
|---|---|---|
| `update_after` | Có | ISO 8601 — đơn có `updated_at` **sau** mốc này |
| `update_before` | Không | |
| `status` | Không | Lọc 1 trạng thái |
| `offset` | Không | Mặc định 0 |
| `limit` | Không | Tối đa 100, mặc định 100 |
| `sort_by` / `sort_direction` | Không | Mặc định `updated_at` / `ASC` |

```json
{
  "code": "0",
  "data": {
    "count": 1,
    "countTotal": 1,
    "orders": [
      {
        "order_id": 710000017,
        "order_number": "AUR260928017",
        "statuses": ["pending"],
        "created_at": "2026-09-28T09:14:05+07:00",
        "updated_at": "2026-09-28T09:14:05+07:00",
        "price": "400000.00",
        "items_count": 2,
        "payment_method": "COD",
        "remarks": "Giao giờ hành chính",
        "address_shipping": {
          "first_name": "Nguyễn Thị Lan",
          "last_name": "",
          "phone": "0901234567",
          "address1": "12 Nguyễn Văn Linh, Phường Tân Phong, Quận 7",
          "address3": "TP. Hồ Chí Minh",
          "address4": "Quận 7",
          "address5": "Phường Tân Phong",
          "city": "TP. Hồ Chí Minh",
          "country": "Vietnam",
          "post_code": ""
        },
        "need_cancel_confirm": "false",
        "is_cancel_pending": "false"
      }
    ]
  },
  "request_id": "..."
}
```

**Quy tắc điền địa chỉ** (bắt buộc để gộp đơn và liên kết người nhận chính xác):
| Trường | Giá trị |
|---|---|
| `first_name` | Họ tên đầy đủ người nhận; `last_name` để rỗng |
| `address1` | **Số nhà, đường + phường + quận** — OptiPack dùng `address1` làm `address_line1` trong khóa gộp; thiếu phường/quận thì 2 địa chỉ cùng tên đường có thể bị gộp nhầm |
| `address3` / `address4` / `address5` | Tỉnh / quận / phường (dạng có cấu trúc, để hiển thị) |
| `city` | Tỉnh/thành |
| Kiểu dữ liệu | `price` là **chuỗi**; `need_cancel_confirm`, `is_cancel_pending` là chuỗi `"true"`/`"false"` — đúng như Lazada |

### 7.4. Dòng hàng — `GET /rest/order/items/get?order_id=710000017`

```json
{
  "code": "0",
  "data": [
    {
      "order_item_id": 810000051,
      "order_id": 710000017,
      "sku": "ATD-M-01",
      "shop_sku": "3000000456_VNAMZ-00123",
      "name": "Áo thun basic",
      "variation": "Màu: Đen, Size: M",
      "item_price": "190000.00",
      "paid_price": "190000.00",
      "status": "pending",
      "shipping_type": "Seller Own Fleet",
      "tracking_code": "",
      "package_id": ""
    },
    { "order_item_id": 810000052, "order_id": 710000017, "sku": "ATD-M-01", "...": "..." }
  ],
  "request_id": "..."
}
```
- `sku` = `SellerSku` — OptiPack lấy trường này làm SKU sàn.
- **Mỗi đơn vị hàng là 1 dòng** (mua 2 cái → 2 dòng cùng `sku`) — đúng cách Lazada trả và đúng cách OptiPack đang gom số lượng theo SKU.

Mở rộng (không bắt buộc): `GET /rest/orders/items/get?order_ids=[710000017,710000018]` — lấy dòng hàng nhiều đơn một lần (≤ 50 đơn), tương đương `GetMultipleOrderItems` của Lazada.

### 7.5. Sản phẩm — `GET /rest/products/get`

| Tham số | Ghi chú |
|---|---|
| `filter` | `all` \| `live` |
| `sku_seller_list` | Mảng JSON `SellerSku`, ≤ 50 — OptiPack đang gọi Lazada theo cách này |
| `update_after` | Lấy sản phẩm thay đổi (mở rộng) |
| `offset`, `limit` | `limit` ≤ 50 |

```json
{
  "code": "0",
  "data": {
    "total_products": "1",
    "products": [
      {
        "item_id": "3000000456",
        "status": "live",
        "attributes": { "name": "Áo thun basic", "brand": "AURELLE" },
        "skus": [
          {
            "SkuId": "12000456",
            "SellerSku": "ATD-M-01",
            "ShopSku": "3000000456_VNAMZ-00123",
            "Status": "active",
            "price": "190000.00",
            "quantity": 12,
            "sellableQuantity": 11,
            "package_length": "25",
            "package_width": "20",
            "package_height": "3",
            "package_weight": "0.2",
            "color_family": "Đen",
            "size": "M"
          }
        ]
      }
    ]
  },
  "request_id": "..."
}
```
Các trường `package_*` là **chuỗi** và **bắt buộc có giá trị**.

### 7.6. Xác nhận đã nhận đơn (mở rộng) — `POST /rest/order/acknowledge`

| Tham số | Ghi chú |
|---|---|
| `order_id` | |
| `partner_reference` | Mã nhóm đơn trong OptiPack |

OptiPack gọi sau khi lưu đơn thành công; sàn chuyển `occupied_quantity` của đơn sang cho OptiPack (Mục 5.3). Gọi lại nhiều lần an toàn.

### 7.7. Cập nhật tồn bán được — `POST /rest/product/stock/sellable/update`

Cùng đường dẫn và tên trường với `UpdateSellableQuantity` của Lazada; tham số `payload` là **JSON** (Lazada dùng XML):
```
payload={"Request":{"Product":{"Skus":{"Sku":[
  {"ItemId":"3000000456","SkuId":"12000456","SellerSku":"ATD-M-01","SellableQuantity":9}
]}}}}
```
```json
{ "code": "0", "data": { "results": [ { "SkuId": "12000456", "SellerSku": "ATD-M-01", "success": true, "SellableQuantity": 9 } ] }, "request_id": "..." }
```
- ≤ 50 SKU/lần; mỗi SKU có kết quả riêng.
- **Đặt giá trị tuyệt đối**, không nhận số âm; ghi `stock_movements` (`partner_update`).

### 7.8. Cập nhật trạng thái đơn (mở rộng) — `POST /rest/order/status/update`

| Tham số | Bắt buộc | Ghi chú |
|---|---|---|
| `order_id` | Có | |
| `status` | Có | `packed`, `ready_to_ship`, `shipped`, `delivered`, `failed_delivery`, `shipped_back`, `returned` |
| `event_time` | Có | ISO 8601 |
| `tracking_code` | Không | Mã vận đơn OptiPack (VD `SHP-260928-8F3A1C`) → ghi vào dòng hàng |
| `trip_code` | Không | Mã chuyến giao chung (Mục 4) — hiển thị cho khách "giao cùng đơn khác của bạn" nếu muốn |
| `reason` | Khi `failed_delivery` | Lý do giao thất bại |
| `idempotency_key` | Có | Gửi lại cùng khóa → trả kết quả cũ |

```json
{ "code": "0", "data": { "order_id": 710000017, "status": "shipped", "updated_at": "2026-09-28T14:30:00+07:00" }, "request_id": "..." }
```
Cập nhật mọi dòng hàng của đơn sang trạng thái mới, ghi `order_events` (`source: partner`). Tương ứng Lazada: `packed`/`ready_to_ship` ~ *SetStatusToPackedByMarketplace / ReadyToShip*; `delivered`/`failed_delivery` ~ *ConfirmDeliveryForDBS / FailedDeliveryForDBS* — các API Lazada chỉ mở cho mô hình giao hàng khác.

---

## 8. Webhook (khuôn Push)

### 8.1. Định dạng

```
POST http://localhost:3000/marketplace/webhooks/aurelle
Content-Type: application/json
Authorization: <UPPER(HEX(HMAC_SHA256(app_secret, app_key + RAW_BODY)))>

{
  "message_id": "msg_01J9ZK6F2Q",
  "seller_id": "200000000101",
  "message_type": "order_status_changed",
  "timestamp": 1790555645000,
  "data": {
    "trade_order_id": "710000017",
    "order_status": "pending",
    "status_update_time": 1790555645
  }
}
```

| `message_type` | Khi nào |
|---|---|
| `order_status_changed` | Đơn chuyển `pending` (đặt COD / đã thanh toán), hoặc đổi trạng thái do phía sàn (khách hủy) |
| `order_updated` | Sàn sửa thông tin đơn trước khi đóng gói (địa chỉ, ghi chú) |
| `authorization_revoked` | Người bán thu hồi quyền của OptiPack |

- Chữ ký tính trên **toàn bộ body gốc**, ghép `app_key` ở đầu → khớp `verifyWebhookSignature(rawBody, headerSignature)` của `MarketplaceAdapter`.
- Chống phát lại: `timestamp` nằm trong body (được chữ ký bảo vệ), lệch quá 5 phút → từ chối; `message_id` đã xử lý → bỏ qua.
- **Không** phát webhook cho thay đổi do OptiPack ghi ngược (tránh vòng lặp).
- Payload chỉ có mã đơn; OptiPack gọi `/orders/get` + `/order/items/get` để lấy chi tiết — **một luồng xử lý chung với kéo định kỳ**.

### 8.2. Gửi lại

| Lần | Sau |
|---|---|
| 1 → 5 | 1 phút · 5 phút · 15 phút · 1 giờ · 6 giờ |

OptiPack trả `2xx` trong 5 giây là thành công. Sau 5 lần lỗi → `failed`, hiển thị ở trang quản trị AURELLE kèm nút gửi lại. Kéo định kỳ 5 phút bù mọi đơn bị sót.

---

## 9. Phía OptiPack — thiết kế tích hợp

### 9.1. Adapter

Tách phần giao thức Lazada đang nằm trong `LazadaAdapter` (ký request, gọi GET có ký, kiểm `code`, đổi/làm mới token, `mapTokenResponse`) thành lớp dùng chung **`LazadaProtocolClient`** nhận tham số `apiBaseUrl`, `authBaseUrl`, `appKey`, `appSecret`, `redirectUri`.

| Adapter | Cấu hình | Phần riêng |
|---|---|---|
| `LazadaAdapter` | URL và khóa Lazada | `verifyWebhookSignature` trả `false` như hiện tại |
| `AurelleAdapter` (**mới**) | `AURELLE_API_BASE_URL`, `AURELLE_AUTH_BASE_URL`, `AURELLE_APP_KEY`, `AURELLE_APP_SECRET` | `verifyWebhookSignature` (Mục 8.1); `acknowledgeOrder`, `updateOrderStatus`, `updateSellableQuantity` |

`getOrders`, `getOrderItems`, `getProducts` **dùng chung** cho cả 2 sàn.

### 9.2. Ánh xạ đơn

Dùng lại **nguyên `mapLazadaOrder(rawOrder, rawItems)`** — hàm không gắn cứng tên sàn; tên sàn do tầng đồng bộ gán khi lưu.

| `Order` (OptiPack) | Nguồn |
|---|---|
| `platform` | `aurelle` (tầng đồng bộ gán) |
| `shop_id` | `seller_id` |
| `marketplace_shop` | `_id` shop AURELLE trong `marketplace_shops` |
| `platform_order_id` / `platform_order_number` | `order_id` / `order_number` |
| `status`, `raw_statuses` | `statuses` qua `mapLazadaStatus` + `pickRepresentativeStatus` |
| `recipient.full_name` / `phone` | `address_shipping.first_name` / `phone` |
| `recipient.address_line1` | `address_shipping.address1` (đã gồm phường, quận) |
| `recipient.city` / `country` | `address_shipping.city` / `country` |
| `items[]` | `/order/items/get` — `sku`, `name`, `variation`, `item_price`, `paid_price`, `status` |
| `consolidation_key` | `computeConsolidationKey('aurelle', phone, address1, city)` — gộp đơn AURELLE cùng người nhận |

### 9.3. Các phần cần sửa / bổ sung

| # | File / vị trí | Việc cần làm |
|---|---|---|
| 1 | `platform.enum.ts` | Thêm `AURELLE = 'aurelle'` |
| 2 | `marketplace-integration.module.ts` | Đăng ký `AurelleAdapter` vào bảng adapter |
| 3 | `marketplace-integration.service.ts` → `isSandboxEnvironment` | Thêm nhánh `aurelle` + cấu hình `marketplace.aurelle.sandbox` |
| 4 | `lazada.adapter.ts` | Tách `LazadaProtocolClient` (Mục 9.1) |
| 5 | `orders.service.ts` | Tổng quát `syncLazadaOrders` thành `syncShopOrders(platform, shopId)` (bỏ 5 chỗ gắn cứng Lazada); thêm `syncSingleOrder(platform, shopId, orderId)` cho webhook; gọi `acknowledgeOrder` với AURELLE |
| 6 | `lazada-order-sync.scheduler.ts` | Quét shop của cả `lazada` và `aurelle` |
| 7 | `product-master.service.ts`, `product-master-sync.scheduler.ts` | Đồng bộ sản phẩm theo nền tảng (bỏ 3 chỗ gắn cứng) — **bắt buộc** để có kích thước đóng gói và nối SKU nội bộ |
| 8 | `main.ts` | `NestFactory.create(AppModule, { rawBody: true })` — cần body gốc để kiểm chữ ký webhook |
| 9 | Controller webhook mới | `POST /marketplace/webhooks/:platform`: không JWT, `@SkipThrottle()`, đọc `req.rawBody`, lưu `message_id` đã xử lý (collection mới, index duy nhất), gọi `syncSingleOrder`, trả 200 ngay |
| 10 | Hàng đợi ghi ngược | Outbox chung mọi sàn: trạng thái (Mục 9.4) và tồn khả dụng (K5) theo lô ≤ 20 SKU; đối soát hằng đêm |
| 11 | **Liên kết cùng người nhận** | Mục 9.5 |

### 9.4. Ghi ngược trạng thái

| Sự kiện OptiPack | Trạng thái gửi AURELLE |
|---|---|
| Nhóm đơn `packed` | `packed` |
| Bắt đầu giao (vận đơn tạo) | `shipped` + `tracking_code` (+ `trip_code` nếu giao chung chuyến) |
| Giao thành công | `delivered` |
| Giao thất bại | `failed_delivery` + `reason` |
| Giao lại | `shipped` |
| Tự hoàn về kho | `shipped_back` |
| Kho nhận hàng hoàn | `returned` |

Nhóm đơn gộp nhiều đơn AURELLE → gửi cho **từng đơn**. Đơn Lazada trong cùng chuyến không ghi ngược (Lazada chưa có quyền) — giữ như hiện tại.

### 9.5. Liên kết cùng người nhận và giao chung chuyến

| # | Thành phần | Thiết kế |
|---|---|---|
| 1 | `order_groups.recipient_key` | Tính khi tạo nhóm đơn (Mục 4.2), index; script tính bù cho nhóm đơn cũ |
| 2 | `GET /order-groups/:id/linked` | Các nhóm cùng `recipient_key`, chưa giao xong. Response nhóm đơn thêm `linkedGroupCount` |
| 3 | `GET /warehouse/:warehouseId/picking-list?group_ids=G1,G2` | Picking List gộp theo lộ trình kệ; mỗi dòng có `order_group_id` (thùng nào). Quét hàng vẫn theo từng nhóm |
| 4 | `shipments.delivery_trip_id` + `POST /shipments/batch` | Body `{ order_group_ids: [G1, G2], note }`; chỉ nhận nhóm đã `packed` và cùng `recipient_key`; tạo các vận đơn trong 1 giao dịch, chung mã chuyến `TRIP-yymmdd-xxxx`. Nút giao thành công/thất bại vẫn theo từng vận đơn |
| 5 | Cảnh báo lệch nhịp | Bắt đầu giao 1 nhóm khi còn nhóm liên kết chưa `packed` → response kèm `linkedPending[]`, không chặn |

Phần này **không** đổi cách tính tồn, giữ chỗ, lấy hàng, trả hàng.

### 9.6. Phụ thuộc cần xử lý

| Phụ thuộc | Lý do |
|---|---|
| Trạng thái hủy cho nhóm đơn (điểm N1 — `SYSTEM_AUDIT_REPORT.md`) | Khách AURELLE tự hủy được trên trang → webhook hủy đơn; nhóm đơn cần trạng thái hủy để nhả giữ chỗ và không treo |
| Giới hạn request toàn cục (điểm N2) | Webhook đã bỏ qua giới hạn; các API khác vẫn nên nâng giới hạn |

---

## 10. Storefront

### 10.1. API nội bộ AURELLE (storefront gọi) — giữ nguyên đường dẫn

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/customer-auth/register` · `/login` · `/logout` | Tài khoản khách |
| GET | `/customer-auth/me` | Thông tin khách |
| GET | `/storefront/products` | Danh sách sản phẩm (`slug`, `name`, `thumbnailUrl`, `categoryName`, giá thấp nhất) |
| GET | `/storefront/products/:slug` | Chi tiết + `variants[]` (`id`=`sku_id`, `variantName`, `price`, `availableQuantity`=`sellable_quantity`, `isDefault`), bảng size |
| GET | `/storefront/cart` | Giỏ hàng |
| POST · PATCH · DELETE | `/storefront/cart/items` · `/storefront/cart/items/:variantId` | Thêm / sửa số lượng / xóa |
| POST | `/storefront/cart/sync` | Đồng bộ giỏ từ trình duyệt khi đăng nhập |
| POST | `/storefront/orders/checkout` | `{ items, shipping_address{recipient_name, phone, address_line, province, district, ward}, payment_method: cod\|bank_transfer, customer_note, client_order_id }` |
| GET | `/storefront/orders` · `/storefront/orders/:orderNumber` | Đơn của tôi: `orderNumber`, `status` (Mục 6), `totalAmount`, `createdAt`, hành trình `events[]` |
| POST | `/storefront/orders/:orderNumber/cancel` (**mới**) | Hủy khi `unpaid`/`pending` |
| POST | `/storefront/orders/:orderNumber/mark-paid` (**mới**, giả lập) | Chuyển khoản: `unpaid → pending` |

### 10.2. Thay đổi giao diện

| Hạng mục | Thay đổi |
|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` |
| Trang "Đơn của tôi" | Hiển thị `status` và hành trình của sàn thay cho `fulfillmentStatus` của OptiPack |
| Nút hủy / "Tôi đã thanh toán" | Theo 2 API mới |
| Cổng chạy | 3001 |

---

## 11. Chạy và trình diễn

### 11.1. Cổng và cấu hình

| Thành phần | Cổng | Database |
|---|---|---|
| OptiPack BE / FE | 3000 / 5173 | `optipackai` |
| AURELLE BE / Storefront | 4000 / 3001 | `aurelle_marketplace` |

Chạy toàn bộ trên 1 máy là đủ; chỉ cần URL công khai (ngrok) khi các thành phần ở máy khác nhau.

```
# AURELLE BE
PORT=4000
MONGODB_URI=.../aurelle_marketplace
JWT_SECRET=...
OPTIPACK_APP_KEY=500123
OPTIPACK_APP_SECRET=...
OPTIPACK_REDIRECT_URI=http://localhost:3000/marketplace/aurelle/callback
OPTIPACK_PUSH_URL=http://localhost:3000/marketplace/webhooks/aurelle

# OptiPack BE (bổ sung)
AURELLE_API_BASE_URL=http://localhost:4000/rest
AURELLE_AUTH_BASE_URL=http://localhost:4000
AURELLE_APP_KEY=500123
AURELLE_APP_SECRET=...            # trùng giá trị phía AURELLE
```

Seed AURELLE: 1 shop, 1 app OptiPack, 10–20 sản phẩm đủ kích thước đóng gói, 2 tài khoản khách.

### 11.2. Kịch bản trình diễn

| # | Thao tác | Kết quả cần thấy |
|---|---|---|
| 1 | OptiPack → Kết nối sàn → AURELLE → Cho phép | Shop AURELLE hiện cạnh shop Lazada |
| 2 | Storefront: khách đặt 1 đơn COD | Vài giây sau đơn hiện ở OptiPack (nền tảng `aurelle`) — nhờ webhook |
| 3 | Tắt OptiPack, đặt thêm 1 đơn, bật lại | Đơn vẫn về ở lượt kéo định kỳ |
| 4 | Khách đặt 2 đơn AURELLE liên tiếp, cùng người nhận | Gộp **1 nhóm đơn, 1 thùng** |
| 5 | Cùng người nhận có 1 đơn Lazada đang chờ | 2 nhóm (Lazada, AURELLE) mang nhãn **"Đi cùng: 1 kiện"** |
| 6 | Mở Picking List gộp 2 nhóm | 1 lượt đi kệ, mỗi món ghi rõ thùng |
| 7 | Đóng gói 2 thùng → "Giao chung chuyến" | 2 vận đơn, 1 mã chuyến; trang khách AURELLE: **Đã đóng gói → Đang giao** |
| 8 | Giao thành công cả 2 | Khách AURELLE thấy **Đã giao** |
| 9 | Kiểm kê SKU về 0 | Trang sản phẩm AURELLE hiện **hết hàng** |
| 10 | Khách hủy 1 đơn `pending` trên trang | Đơn chuyển hủy ở OptiPack, giữ chỗ được nhả |

---

## 12. Kế hoạch triển khai

| Giai đoạn | AURELLE | OptiPack |
|---|---|---|
| 1 | Dựng BE + DB; chuyển `/storefront/*`, `/customer-auth/*`; seed | — |
| 2 | OAuth + Open API đọc (Mục 7.1–7.5) | Tách `LazadaProtocolClient`, `AurelleAdapter`, đồng bộ đơn/sản phẩm theo nền tảng |
| 3 | Webhook + outbox | Endpoint webhook, `rawBody`, lưu `message_id` |
| 4 | API ghi trạng thái + tồn, hành trình cho khách | Outbox ghi ngược, đối soát |
| 5 | — | Liên kết cùng người nhận + giao chung chuyến (Mục 9.5); trạng thái hủy nhóm đơn (N1) |

Giai đoạn 5 phía OptiPack **độc lập** với AURELLE — có thể làm song song và kiểm thử bằng 2 shop Lazada.

## 13. Điểm cần nhóm xác nhận

| # | Nội dung | Đề xuất mặc định |
|---|---|---|
| 1 | Công nghệ AURELLE BE | NestJS + MongoDB |
| 2 | Mã nguồn `/storefront/*` hiện có | Cung cấp nhánh chứa code để chuyển sang AURELLE BE |
| 3 | Thanh toán chuyển khoản | Giả lập bằng nút "Tôi đã thanh toán" |
| 4 | Trả hàng do khách khởi tạo trên sàn | Sau khi luồng chính ổn định |
