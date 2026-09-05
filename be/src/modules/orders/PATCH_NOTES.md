# PATCH NOTES — Lazada-only scope + module `orders` (28-29/08/2026)

Đọc file này TRƯỚC khi merge — giải thích ĐÃ SỬA GÌ, TẠI SAO, và VIỆC CÒN LẠI bạn phải tự làm. Toàn bộ patch đã chạy qua `npx tsc --noEmit`, `npm run lint` (ESLint strictTypeChecked), `npx nest build`, và `npx jest` (71 test cũ đều PASS) — không có lỗi nào ở cả 4 bước.

## 1. Cách merge

Giải nén zip này ĐÈ LÊN đúng thư mục `be/` hiện tại của bạn (mọi đường dẫn trong zip đã khớp cấu trúc `src/...`). Không có file nào bị xóa — chỉ sửa 5 file cũ + thêm 1 module mới (`orders/`).

```bash
cd be
npm install   # không cần nếu axios đã có sẵn (đã có sẵn trong package.json)
```

## 2. Đã sửa — `marketplace-integration` (thu hẹp về Lazada-only, tạm thời)

| File | Thay đổi |
|---|---|
| `marketplace-integration.module.ts` | Comment `TikTokShopAdapter`/`TikiAdapter` khỏi `providers` — KHÔNG xóa file 2 adapter đó. Factory `MARKETPLACE_ADAPTERS` giờ chỉ có key `LAZADA`. |
| `marketplace-integration.service.ts` | Thêm 3 hàm public: `getConnectedShop()`, `listConnectedShops()`, `markShopPolled()` — để module `orders/` dùng mà không phải tự đăng ký lại schema `MarketplaceShop`. |
| `adapters/lazada.adapter.ts` | Thêm `apiBaseUrl` + 2 method `getOrders()`/`getOrderItems()` (Order API thật, dùng lại công thức ký đã có). |
| `index.ts` | Export thêm `LazadaAdapter` — module `orders/` cần gọi trực tiếp 2 hàm nghiệp vụ trên. |
| `src/app.module.ts` | Đăng ký thêm `OrdersModule`. |

### TẠI SAO bắt buộc phải comment TikTok/Tiki (không phải chỉ "cho gọn")
Constructor của `TikTokShopAdapter`/`TikiAdapter` gọi `requireEnv()` ngay lúc Nest khởi tạo provider. Nếu vẫn để trong `providers` mà `.env` thiếu `TIKTOK_APP_KEY`/`TIKI_CLIENT_ID`..., **app crash ngay lúc `npm run start:dev`**, không chạy được gì cả — kể cả phần Lazada đã xong.

### Khôi phục lại khi làm tới TikTok/Tiki
Bỏ comment 3 chỗ trong `marketplace-integration.module.ts` (import, providers, factory/inject) + điền đủ env tương ứng. Không cần sửa gì ở service/controller — đúng tinh thần Open/Closed đã thiết kế từ đầu.

## 3. Mới thêm — module `orders/`

```
src/modules/orders/
├── schemas/order.schema.ts          # collection `orders`
├── enums/order-status.enum.ts       # OrderStatus chuẩn hóa nội bộ
├── utils/consolidation-key.util.ts  # băm SHA-256 cho bước gộp đơn
├── mappers/lazada-order.mapper.ts   # raw Lazada → hình dạng nội bộ
├── dto/
├── orders.service.ts
├── orders.controller.ts
├── orders.errors.ts                 # mã lỗi ORD_*
└── orders.module.ts
```

Đúng "Mainflow 1" (Omnichannel Sync & Order Consolidation) bạn gửi — bản polling (không webhook, vì Lazada Open Platform chưa xác nhận cơ chế push chính thức) thay vì Kafka: `GetOrders → GetOrderItems (từng đơn) → chuẩn hóa → tính consolidation_key → check gộp đơn (index, không quét toàn bảng) → upsert Mongo`.

### ⚠️ ĐIỂM DUY NHẤT CHƯA Ở MỨC "ĐÃ XÁC NHẬN 100%"
Toàn bộ phần OAuth (đã dùng từ trước) được xác nhận qua 4 nguồn cộng đồng độc lập khớp nhau. Riêng **tên field trong response `GetOrders`/`GetOrderItems`** (`interface LazadaOrderRaw`/`LazadaOrderItemRaw` trong `lazada.adapter.ts`) dựa theo cấu trúc phổ biến của LazOP REST API ghi nhận qua SDK cộng đồng — **chưa tự gọi thử bằng access_token thật để đối chiếu 1:1**. Đây là việc đầu tiên cần làm khi có access_token (xem mục 5).

Nếu response thật lệch field nào, CHỈ cần sửa đúng 2 file: `lazada.adapter.ts` (interface Raw) + `mappers/lazada-order.mapper.ts` (hàm map) — không ảnh hưởng schema Mongo, service, hay controller.

Một field cũng cần xác nhận lại: `items[].quantity` — cấu trúc phổ biến của GetOrderItems mỗi `order_item_id` ĐÃ LÀ 1 đơn vị (quantity ngầm định = 1), tạm code cứng giá trị 1. Nếu response thật có field `quantity` riêng, sửa dòng đó trong `lazada-order.mapper.ts`.

## 4. Thiết kế DB — các quyết định chính (để bạn trình bày lại cho cô nếu cần giải thích)

- **`consolidation_key`**: băm SHA-256 từ (SĐT chuẩn hóa + địa chỉ dòng 1 chuẩn hóa + thành phố chuẩn hóa). Biến bước "match khách hàng" từ so khớp mờ toàn bảng (chậm dần theo dữ liệu) thành 1 lần tra index (không đổi tốc độ dù dữ liệu lớn tới đâu).
- **Partial index** trên `consolidation_key`: chỉ index đơn ở trạng thái CHƯA fulfill (`UNFULFILLED_ORDER_STATUSES`) — đơn đã giao/hủy không bao giờ là ứng viên gộp, loại khỏi index để index nhỏ hơn.
- **Compound index `(shop_id, status, created_at)`**: theo đúng nguyên tắc ESR (Equality → Sort → Range) của MongoDB — truy vấn dashboard phổ biến nhất ("đơn của shop X, lọc trạng thái, mới nhất trước") dùng ĐÚNG 1 index cho cả lọc lẫn sắp xếp.
- **Phân trang kiểu cursor** (`created_at < before`), không dùng `skip/limit` — `skip(N)` chậm dần tuyến tính theo N, cursor thì không.
- **Embed vs Reference**: `recipient` và `items` EMBED (luôn đọc/ghi cùng đơn cha); `marketplace_shop` THAM CHIẾU (ObjectId, vòng đời độc lập) — nhưng vẫn denormalize thêm `platform`+`shop_id` ngay trên `Order` để lọc theo shop không cần `$lookup`.
- **Trạng thái đơn tách 2 lớp**: `status` (enum nội bộ, dùng cho mọi business logic) và `raw_statuses` (nguyên văn từ Lazada, chỉ để audit) — thêm sàn mới không phải sửa lại business logic, chỉ cần viết 1 hàm map mới.

## 5. Các bước tiếp theo để DEMO cho cô — làm tuần tự

1. Điền `.env` (mục 6 dưới đây).
2. `npm run start:dev` — xác nhận app KHÔNG crash (nếu crash vì thiếu env khác, đọc kỹ thông báo lỗi, đó là `requireEnv()` báo thiếu biến nào).
3. Mở Swagger `http://localhost:3000/api/docs`, đăng nhập lấy access_token (Admin).
4. Gọi `GET /marketplace/lazada/connect` (Bearer token Admin) → nhận `authUrl`.
5. Mở `authUrl` trên trình duyệt → chọn Site Vietnam → Use Seller Login → đăng nhập seller `i7Yix2IJ` (đã whitelist) → Authorize.
6. Trình duyệt redirect về callback → backend TỰ ĐỘNG xử lý, lưu shop vào `marketplace_shops`. Đây là điểm demo đầu tiên: cho cô xem document mới trong Mongo (Compass hoặc Atlas UI).
7. Gọi `POST /orders/lazada/sync?shop_id=201171264532` (Admin) — kích hoạt đồng bộ đơn. Nếu shop test chưa có đơn thật nào, xem mục "Process of Creating Test Order" trong doc Lazada để tạo đơn test trước.
8. Gọi `GET /orders` — xem danh sách đơn đã chuẩn hóa, có `isConsolidated`/`consolidatedGroupId` nếu tạo 2 đơn test cùng SĐT+địa chỉ để demo trực quan bước gộp đơn.

## 6. `.env` cần điền (dựa đúng dữ liệu app OptiPack AI của bạn trên ISV Console)

```bash
# App Key đã có sẵn, lấy từ ISV Console → App Overview
LAZADA_APP_KEY=141553

# Bấm "View" cạnh App Secret trên ISV Console → App Overview → copy vào đây
LAZADA_APP_SECRET=<dán App Secret thật vào đây>

# PHẢI khớp CHÍNH XÁC với Callback URL đã khai trên ISV Console.
# Đang là domain mẫu (optipackai.example.com) — phải sửa CẢ 2 nơi cùng lúc:
#   (a) ISV Console → Edit → Callback URL
#   (b) .env dòng này
# Nếu chạy local: dùng ngrok (`ngrok http 3000`) rồi dùng URL ngrok, hoặc
# domain thật nếu đã deploy.
LAZADA_REDIRECT_URI=https://<domain-thật-hoặc-ngrok>/marketplace/lazada/callback

LAZADA_SANDBOX=false
# Để trống — adapter tự dùng https://api.lazada.vn/rest
LAZADA_API_BASE_URL=

# Generate 1 lần bằng lệnh dưới, dán kết quả vào đây (KHÔNG commit vào git)
TOKEN_ENCRYPTION_KEY=
```

Generate `TOKEN_ENCRYPTION_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`TIKTOK_*`/`TIKI_*` trong `.env.example`: **để trống, không cần điền** — vì 2 adapter đó đã comment khỏi `providers`, không có constructor nào đọc tới các biến này lúc này.
