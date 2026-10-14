# 03 — Bảo mật

> Cập nhật 14/10/2026 theo code hiện tại (239 route, 30 controller). Ma trận phân quyền ở Mục 7 được sinh tự động từ metadata Nest (`be/backups/gen/routes.ts.txt`).

## 1. Các lớp bảo vệ

| Lớp | Cơ chế | Nằm ở | Chức năng |
|---|---|---|---|
| Truyền tải | Helmet | `main.ts` | Thêm header bảo mật (chống clickjacking, MIME sniffing, ẩn `X-Powered-By`…) |
| Nguồn gọi | CORS danh sách cố định | `main.ts` | Chỉ các domain trong `CORS_ORIGIN`; nếu trống dùng mặc định localhost (FE dev). Ngoài production luôn thêm `http://localhost:3001`. **Không còn** chế độ `origin: true` |
| Tần suất | `ThrottlerGuard` toàn cục (`APP_GUARD`) + `@Throttle` theo route | `app.module.ts`, `auth.controller.ts` | Chung **600 request/phút/IP** (`THROTTLE_LIMIT_PER_MINUTE`); `/auth/login` **5/phút**, `/auth/forgot-password` **3/phút** |
| Định danh nhân viên | JWT HS256 (`JwtAuthGuard` + `JwtStrategy`) | `auth/` | Xác minh người gọi; access token mặc định 1 ngày |
| Trạng thái tài khoản | `JwtStrategy.validate()` | `auth/strategies` | Chặn tài khoản vô hiệu hóa, vai trò sai, quá hạn đổi mật khẩu 72 giờ — kiểm **mỗi request** (cache Redis 60 giây) |
| Phân quyền | `RolesGuard` + `@Roles(...)` | `auth/guards` | Mỗi route nghiệp vụ khai báo vai trò được gọi (5 vai trò) |
| Bắt đổi mật khẩu | `ForcePasswordChangeGuard` | `auth/guards` | Khi `must_change_password=true` chỉ cho đổi mật khẩu/đăng xuất — **vẫn chỉ gắn ở `/users`** |
| Định danh khách storefront | `CustomerJwtGuard` | `storefront/` | Giỏ hàng, checkout, đơn của khách AURELLE — tách hẳn khỏi JWT nhân viên |
| Admin storefront | `StorefrontAdminOriginGuard` + `StorefrontAdminGuard` | `storefront/` | Quản lý sản phẩm/ảnh AURELLE; kiểm Origin + phiên admin riêng |
| Webhook hãng vận chuyển | Khóa bí mật `GHN_WEBHOOK_SECRET` (header `X-OptiPack-Secret`) + bảng chống trùng `carrier_webhook_events` | `shipments/carrier-webhook.controller.ts` | Chặn gọi giả; cùng một sự kiện gửi lại không xử lý 2 lần |
| Đầu vào | `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) | `main.ts` | Từ chối trường lạ, sai kiểu; chống mass-assignment |
| Lỗi | `GlobalExceptionFilter` | `common/filters` | Không lộ stack trace; lỗi 500 trả `INTERNAL_ERROR` chung |
| Dữ liệu nhạy cảm | bcrypt, SHA-256, AES-256-GCM | `auth`, `users`, `marketplace-integration` | Mật khẩu, token, token sàn không lưu dạng rõ |
| Toàn vẹn dữ liệu | Khóa phiên bản (`expected_version`/`__v`), transaction | Các service nghiệp vụ | Hai người thao tác đồng thời không ghi đè nhau |
| Tích hợp sàn | Chữ ký HMAC-SHA256 (Lazada và AURELLE), `state` OAuth một lần | `marketplace-integration` | Request không giả mạo được; callback không bị chèn |

## 2. Xác thực tài khoản

### 2.1. Mật khẩu

- Băm **bcrypt cost 12**; mật khẩu mới ≥ 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt.
- **Không có đăng ký công khai cho nhân viên.** Admin tạo tài khoản → hệ thống sinh mật khẩu tạm, gửi email, đặt `must_change_password=true` và hạn +72 giờ. Quá hạn chưa đổi → bị khóa, Admin phải đặt lại.
- **Khóa tạm khi sai nhiều lần**: sai **5 lần** → khóa **15 phút** (`locked_until`). Thêm vào đó route login bị giới hạn 5 request/phút/IP.
- **Quên mật khẩu**: luôn trả cùng một thông báo (chống dò email); token 32 byte, chỉ lưu SHA-256, hạn 30 phút; route giới hạn 3/phút.

### 2.2. Token

| Token | Hạn mặc định | Lưu ở server | Đặc điểm |
|---|---|---|---|
| Access token (JWT) | 1 ngày (`JWT_EXPIRES_IN`) | Không | Payload `{ sub, email, role }`, ký HS256 |
| Refresh token (JWT) | 30 ngày | `refresh_tokens` (SHA-256) | **Xoay vòng**; dùng lại token đã thu hồi → thu hồi toàn bộ phiên |
| Trusted device token | 30 ngày | `trusted_devices` (SHA-256) | Bỏ qua MFA trên thiết bị đã xác minh |
| Reset password token | 30 phút | `users.reset_password_token_hash` | Dùng 1 lần |
| Customer token (storefront) | theo cấu hình storefront | `customers` | Chỉ dùng cho `/storefront/*` và `/customer-auth/*` |

### 2.3. MFA

- TOTP 6 số (otplib), bật tự nguyện: `POST /auth/mfa/setup` → `otpauthUrl` → `POST /auth/mfa/verify` → bật và trả **10 mã dự phòng** (lưu bcrypt).
- Đăng nhập có MFA trả `{ mfa_required: true }`, gọi lại kèm `mfa_token` hoặc `backup_code`.
- Admin gỡ MFA cho nhân viên: `POST /users/:id/disable-mfa`.

### 2.4. Google OAuth

Chỉ đăng nhập cho email **đã được Admin tạo**. Có `state` và PKCE. Email Google chưa xác thực bị từ chối. Kết quả **vẫn trả về FE qua query string** (xem rủi ro Mục 6).

### 2.5. Nhật ký và thu hồi

- Mọi lần đăng nhập ghi `login_audit_logs` (TTL 60 ngày).
- Khi vô hiệu hóa, đổi vai trò, đặt lại mật khẩu: thu hồi refresh token và xóa cache Redis để có hiệu lực ngay.

## 3. Bảo mật tích hợp bên ngoài

### 3.1. Lazada
- **Token sàn mã hóa AES-256-GCM** bằng `TOKEN_ENCRYPTION_KEY`; không bao giờ trả token qua API hay query string.
- **Mọi request ký HMAC-SHA256** bằng `LAZADA_APP_SECRET`.
- **Callback OAuth** không dùng JWT — bảo vệ bằng `state` ngẫu nhiên trong `marketplace_oauth_states`, dùng 1 lần, hết hạn 10 phút (lỗi `MKT_OAUTH_STATE_INVALID` khi dùng lại/hết hạn).
- **Đã bỏ cầu dao `LAZADA_WRITE_APIS_ENABLED`** (10/10/2026). OptiPack hiện **không gọi API ghi trạng thái lên Lazada** (không "báo pack"), nên rủi ro ghi nhầm lên shop thật không còn.

### 3.2. AURELLE (sàn demo nội bộ)
- Dùng cùng cơ chế ký HMAC kiểu Lazada với `AURELLE_APP_KEY` / `AURELLE_APP_SECRET`; 3 base URL tách riêng (auth / api / host cấp quyền).
- BE **không khởi động** nếu thiếu biến `AURELLE_*` → phải có trong `.env`.

### 3.3. GHN (Giao Hàng Nhanh)
- Token GHN và Shop ID chỉ nằm trong `.env` (`GHN_TOKEN`, `GHN_SHOP_ID`), không trả qua API.
- Webhook `POST /carriers/ghn/webhook` công khai nhưng kiểm khóa `GHN_WEBHOOK_SECRET` (header `X-OptiPack-Secret` hoặc `?secret=`) và ShopID; mọi sự kiện (webhook, nút giả lập, đồng bộ) đi chung `processCarrierEvent` có chống trùng.
- GHN **không cho shop đổi trạng thái đơn**; nút "giả lập" chỉ đổi trạng thái trong DB OptiPack (chế độ demo).

## 4. Bảo vệ toàn vẹn nghiệp vụ

- **Khóa phiên bản lạc quan**: nhóm đơn, vận đơn, phiếu trả có `version`; ghi kèm `expected_version`, lệch → 409.
- **Transaction** cho thao tác nhiều collection (trừ tồn + sổ cái; đóng gói + trừ vật liệu; kiểm hàng hoàn + nhập lại kho; đặt vận đơn GHN + chuyển nhóm sang `shipped`).
- **Idempotency**: quét lấy hàng có `client_event_id` (index duy nhất); `pack` bấm lại không trừ vật liệu 2 lần; webhook GHN chống trùng qua `carrier_webhook_events`.
- **Khóa thao tác tay khi hãng quản lý**: vận đơn đã đặt GHN thì các nút G1 thủ công trả `SHP_MANAGED_BY_CARRIER`.
- **Tách quyền người tạo/người duyệt** phiếu trả (`RMA_SELF_APPROVAL`).
- **Sổ cái chỉ thêm**: `inventory_movements`, `packaging_movements`, `shipment_events`, `pick_events`.
- **Không xóa cứng dữ liệu nghiệp vụ** — dùng trạng thái (`cancelled`, `inactive`…).

## 5. Độ phủ guard theo controller (30 controller)

| Nhóm controller | JwtAuthGuard | RolesGuard | ForcePasswordChangeGuard | Ghi chú |
|---|---|---|---|---|
| `AppController` (health) | — | — | — | Công khai |
| `AuthController` | Từng route (change-password, mfa, logout) | — | — | login/refresh/forgot/reset/google công khai |
| `UsersController` | ✔ | ✔ | ✔ | Duy nhất có ForcePasswordChange |
| `NotificationsController` | ✔ | — | — | Mọi tài khoản đăng nhập |
| `MarketplaceIntegrationController` | Trừ callback | Trừ callback | — | Callback bảo vệ bằng `state` |
| `MarketplaceWebhooksController` | — | — | — | Chữ ký HMAC AURELLE + chống trùng `message_id` |
| `CarrierWebhookController` | — | — | — | Khóa `GHN_WEBHOOK_SECRET` |
| 5 controller storefront (`storefront`, `storefront-images`, `storefront-admin`, `storefront-admin-auth`, `customer-auth`) | — | — | — | Guard riêng: `CustomerJwtGuard`, `StorefrontAdmin*Guard`; danh mục sản phẩm công khai |
| 19 controller nghiệp vụ còn lại (orders, order-groups, stock-availability, staff-assignment, packaging-bag/box/material, packaging-materials, packing-plan, product-master, warehouse, categories, master-skus, documents, shipments, shipping, returns, legacy-fulfillment) | ✔ | ✔ | **—** | |

## 6. Lỗ hổng và rủi ro bảo mật (đánh giá 14/10/2026)

| Mức | Vấn đề | Chi tiết | Hướng khắc phục | Trạng thái |
|---|---|---|---|---|
| **Cao** | Bắt đổi mật khẩu không áp dụng toàn hệ thống | `ForcePasswordChangeGuard` chỉ ở `UsersController`; tài khoản mật khẩu tạm vẫn gọi mọi API nghiệp vụ trong 72 giờ | Đăng ký `APP_GUARD` toàn cục, bỏ qua route auth | Còn mở |
| **Cao** | `users.mfa_secret` lưu dạng rõ | Lộ DB = vượt MFA mọi tài khoản | Mã hóa AES-256-GCM như token sàn | Còn mở |
| **Trung bình** | Access token sống 1 ngày | Token lộ dùng được tới 24 giờ | Rút xuống 15–60 phút | Còn mở |
| **Trung bình** | Token Google trả qua query string | Nằm trong lịch sử trình duyệt/log proxy | Trả mã một lần rồi FE đổi qua POST | Còn mở |
| **Thấp** | Cache trạng thái tài khoản 60 giây | Đường nào quên xóa cache sẽ trễ tới 60 giây | Thêm test | Còn mở |
| **Thấp** | Webhook GHN chỉ dựa vào khóa header | GHN không ký request; khóa lộ thì giả được sự kiện | Kèm đối chiếu lại trạng thái bằng API `detail` (đã có nút sync) | Chấp nhận cho demo |
| — | ~~CORS mở khi thiếu cấu hình~~ | Đã sửa: mặc định localhost | — | **Đã sửa** |
| — | ~~Throttle chung 20/phút~~ | Đã nâng 600/phút + giới hạn riêng login/forgot | — | **Đã sửa** |
| — | ~~Cầu dao ghi Lazada~~ | Đã bỏ cùng các API ghi | — | **Đã bỏ** |

**Quy tắc vận hành:** không commit `be/.env` (đã gitignore); không đóng gói `.env` vào zip gửi đi; nếu lỡ chia sẻ phải xoay vòng `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, khóa Lazada/GHN/AURELLE.

## 7. Ma trận phân quyền đầy đủ (239 route — sinh tự động 14/10/2026)

✔ = vai trò gọi được. Route không giới hạn vai trò ghi cơ chế bảo vệ ở cột Ghi chú.

| Method | Đường dẫn | Admin | Store Owner | Warehouse | Packaging | Coordinator | Ghi chú |
|---|---|---|---|---|---|---|---|
| GET | `/` |  |  |  |  |  | Công khai (health) |
| POST | `/auth/change-password` |  |  |  |  |  | Mọi tài khoản đã đăng nhập |
| POST | `/auth/forgot-password` |  |  |  |  |  | Công khai — giới hạn 3/phút |
| GET | `/auth/google` |  |  |  |  |  | Công khai — `state` + PKCE |
| GET | `/auth/google/callback` |  |  |  |  |  | Công khai — `state` + PKCE |
| POST | `/auth/login` |  |  |  |  |  | Công khai — giới hạn 5/phút |
| POST | `/auth/logout` |  |  |  |  |  | Mọi tài khoản đã đăng nhập |
| POST | `/auth/mfa/setup` |  |  |  |  |  | Mọi tài khoản đã đăng nhập |
| POST | `/auth/mfa/verify` |  |  |  |  |  | Mọi tài khoản đã đăng nhập |
| POST | `/auth/refresh` |  |  |  |  |  | Công khai — refresh token xoay vòng |
| POST | `/auth/reset-password` |  |  |  |  |  | Công khai — token đặt lại 1 lần (30 phút) |
| GET | `/users` | ✔ | ✔ |  |  |  |  |
| POST | `/users` | ✔ |  |  |  |  |  |
| DELETE | `/users/:id` | ✔ |  |  |  |  |  |
| PATCH | `/users/:id` | ✔ |  |  |  |  |  |
| POST | `/users/:id/disable-mfa` | ✔ |  |  |  |  |  |
| POST | `/users/:id/reactivate` | ✔ |  |  |  |  |  |
| POST | `/users/:id/reset-password` | ✔ |  |  |  |  |  |
| GET | `/users/me` |  |  |  |  |  | Mọi tài khoản đã đăng nhập |
| PATCH | `/users/me` |  |  |  |  |  | Mọi tài khoản đã đăng nhập |
| GET | `/notifications` |  |  |  |  |  | Mọi tài khoản đã đăng nhập |
| PATCH | `/notifications/:id/read` |  |  |  |  |  | Mọi tài khoản đã đăng nhập |
| PATCH | `/notifications/read-all` |  |  |  |  |  | Mọi tài khoản đã đăng nhập |
| GET | `/notifications/unread-count` |  |  |  |  |  | Mọi tài khoản đã đăng nhập |
| GET | `/marketplace/:platform/callback` |  |  |  |  |  | Công khai — `state` OAuth 1 lần (10 phút) |
| GET | `/marketplace/:platform/connect` | ✔ |  |  |  |  |  |
| GET | `/marketplace/:platform/shops` | ✔ | ✔ |  |  |  |  |
| POST | `/marketplace/webhooks/:platform` |  |  |  |  |  | Công khai — chữ ký HMAC `Authorization` + chống trùng `message_id` |
| GET | `/orders` | ✔ | ✔ |  |  |  |  |
| GET | `/orders/:id` | ✔ | ✔ |  |  |  |  |
| POST | `/orders/:platform/sync` | ✔ |  |  |  |  |  |
| POST | `/orders/lazada/sync` | ✔ |  |  |  |  |  |
| GET | `/order-groups` | ✔ | ✔ | ✔ | ✔ | ✔ |  |
| GET | `/order-groups/:id` | ✔ | ✔ | ✔ | ✔ | ✔ |  |
| POST | `/order-groups/:id/assign` | ✔ |  | ✔ |  |  |  |
| POST | `/order-groups/:id/fulfillment/decide-partial` | ✔ |  |  | ✔ |  |  |
| POST | `/order-groups/:id/fulfillment/pick` | ✔ |  | ✔ |  |  |  |
| POST | `/order-groups/:id/fulfillment/pick-item` | ✔ |  | ✔ |  |  |  |
| POST | `/order-groups/:id/fulfillment/report-missing` | ✔ |  | ✔ |  |  |  |
| DELETE | `/order-groups/:id/link` | ✔ |  |  |  | ✔ |  |
| POST | `/order-groups/:id/link` | ✔ |  |  |  | ✔ |  |
| GET | `/order-groups/:id/linked` | ✔ | ✔ | ✔ | ✔ | ✔ |  |
| GET | `/order-groups/:id/picking-list` | ✔ |  | ✔ |  |  |  |
| GET | `/order-groups/:id/picking-list/:sku` | ✔ |  | ✔ |  |  |  |
| PATCH | `/order-groups/:id/priority` | ✔ | ✔ |  |  |  |  |
| GET | `/order-groups/:id/stock-reservation` | ✔ | ✔ | ✔ |  |  |  |
| POST | `/order-groups/:id/stock-reservation/recheck` | ✔ | ✔ |  |  |  |  |
| POST | `/order-groups/:id/stock-reservation/release` | ✔ |  |  |  |  |  |
| GET | `/order-groups/staff/search` | ✔ |  | ✔ | ✔ |  |  |
| GET | `/stock-availability` | ✔ | ✔ | ✔ |  |  |  |
| GET | `/warehouse/:warehouseId/picking-list` | ✔ |  | ✔ |  |  |  |
| GET | `/warehouse/:warehouseId/picking-list/:groupId` | ✔ |  | ✔ |  |  |  |
| DELETE | `/warehouse/bin-locations/:binId` | ✔ |  |  |  |  |  |
| PATCH | `/warehouse/bin-locations/:binId` | ✔ |  |  |  |  |  |
| DELETE | `/warehouse/bin-locations/:binId/permanent` | ✔ |  |  |  |  |  |
| POST | `/warehouse/bin-locations/:binId/reactivate` | ✔ |  |  |  |  |  |
| GET | `/warehouse/sku-bin-assignments/unassigned` | ✔ |  |  |  |  |  |
| GET | `/warehouse/warehouses` | ✔ |  | ✔ |  |  |  |
| POST | `/warehouse/warehouses` | ✔ |  |  |  |  |  |
| DELETE | `/warehouse/warehouses/:warehouseId` | ✔ |  |  |  |  |  |
| GET | `/warehouse/warehouses/:warehouseId` | ✔ |  | ✔ |  |  |  |
| PATCH | `/warehouse/warehouses/:warehouseId` | ✔ |  |  |  |  |  |
| GET | `/warehouse/warehouses/:warehouseId/bin-locations` | ✔ |  | ✔ |  |  |  |
| GET | `/warehouse/warehouses/:warehouseId/bin-suggestions` | ✔ |  | ✔ |  |  |  |
| DELETE | `/warehouse/warehouses/:warehouseId/permanent` | ✔ |  |  |  |  |  |
| POST | `/warehouse/warehouses/:warehouseId/reactivate` | ✔ |  |  |  |  |  |
| GET | `/warehouse/warehouses/:warehouseId/sku-bin-assignments` | ✔ |  | ✔ |  |  |  |
| POST | `/warehouse/warehouses/:warehouseId/sku-bin-assignments` | ✔ |  |  |  |  |  |
| DELETE | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId` | ✔ |  |  |  |  |  |
| PATCH | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId` | ✔ |  |  |  |  |  |
| POST | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/adjust` | ✔ |  | ✔ |  |  |  |
| GET | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/movements` | ✔ | ✔ | ✔ |  |  |  |
| POST | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock` | ✔ |  | ✔ |  |  |  |
| POST | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/transfer` | ✔ |  | ✔ |  |  |  |
| GET | `/warehouse/warehouses/:warehouseId/zones` | ✔ |  | ✔ |  |  |  |
| POST | `/warehouse/warehouses/:warehouseId/zones` | ✔ |  |  |  |  |  |
| DELETE | `/warehouse/zones/:zoneId` | ✔ |  |  |  |  |  |
| PATCH | `/warehouse/zones/:zoneId` | ✔ |  |  |  |  |  |
| GET | `/warehouse/zones/:zoneId/bin-locations` | ✔ |  |  |  |  |  |
| POST | `/warehouse/zones/:zoneId/bin-locations/generate` | ✔ |  |  |  |  |  |
| DELETE | `/warehouse/zones/:zoneId/permanent` | ✔ |  |  |  |  |  |
| POST | `/warehouse/zones/:zoneId/racks` | ✔ |  |  |  |  |  |
| DELETE | `/warehouse/zones/:zoneId/racks/permanent` | ✔ |  |  |  |  |  |
| POST | `/warehouse/zones/:zoneId/reactivate` | ✔ |  |  |  |  |  |
| GET | `/categories` | ✔ | ✔ | ✔ | ✔ |  |  |
| POST | `/categories` | ✔ |  |  |  |  |  |
| DELETE | `/categories/:code` | ✔ |  |  |  |  |  |
| GET | `/categories/:code` | ✔ | ✔ | ✔ | ✔ |  |  |
| PATCH | `/categories/:code` | ✔ |  |  |  |  |  |
| POST | `/categories/:code/reactivate` | ✔ |  |  |  |  |  |
| GET | `/colors` | ✔ | ✔ | ✔ | ✔ |  |  |
| POST | `/colors` | ✔ |  |  |  |  |  |
| DELETE | `/colors/:code` | ✔ |  |  |  |  |  |
| PATCH | `/colors/:code` | ✔ |  |  |  |  |  |
| POST | `/colors/:code/reactivate` | ✔ |  |  |  |  |  |
| GET | `/master-skus` | ✔ | ✔ | ✔ | ✔ |  |  |
| POST | `/master-skus` | ✔ |  |  |  |  |  |
| DELETE | `/master-skus/:code` | ✔ |  |  |  |  |  |
| GET | `/master-skus/:code` | ✔ | ✔ | ✔ | ✔ |  |  |
| PATCH | `/master-skus/:code` | ✔ |  |  |  |  |  |
| GET | `/master-skus/:code/mappings` | ✔ | ✔ | ✔ | ✔ |  |  |
| POST | `/master-skus/:code/mappings` | ✔ |  |  |  |  |  |
| DELETE | `/master-skus/:code/permanent` | ✔ |  |  |  |  |  |
| POST | `/master-skus/:code/reactivate` | ✔ |  |  |  |  |  |
| POST | `/master-skus/:code/replace` | ✔ |  |  |  |  |  |
| DELETE | `/master-skus/mappings/:id` | ✔ |  |  |  |  |  |
| POST | `/master-skus/sync-stock` | ✔ |  |  |  |  |  |
| GET | `/master-skus/unmapped-seller-skus` | ✔ | ✔ |  |  |  |  |
| GET | `/master-skus/unpooled-stock` | ✔ | ✔ |  |  |  |  |
| GET | `/product-master` | ✔ | ✔ | ✔ | ✔ |  |  |
| GET | `/product-master/:id` | ✔ | ✔ | ✔ | ✔ |  |  |
| PUT | `/product-master/:id/packaging-profile` | ✔ |  | ✔ |  |  |  |
| POST | `/product-master/sync` | ✔ |  |  |  |  |  |
| GET | `/order-groups/:groupId/packing-plan` | ✔ | ✔ | ✔ | ✔ | ✔ |  |
| POST | `/order-groups/:groupId/packing-plan/approve` | ✔ |  |  | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/assign` | ✔ |  |  | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/back-to-picking` | ✔ |  |  | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/finish` | ✔ |  | ✔ | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/manual` | ✔ |  |  | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/pack` | ✔ |  | ✔ | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/change-box` | ✔ |  |  | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/change-box-in-session` | ✔ |  | ✔ | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/guide` | ✔ |  | ✔ | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/move-item` | ✔ |  |  | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/review` | ✔ |  |  | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/scan` | ✔ |  | ✔ | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/seal` | ✔ |  | ✔ | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/unpack` | ✔ |  | ✔ | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/unscan` | ✔ |  | ✔ | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/unseal` | ✔ | ✔ | ✔ | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/recompute` | ✔ |  |  | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/reject` | ✔ |  |  | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/report-issue` | ✔ |  | ✔ | ✔ |  |  |
| POST | `/order-groups/:groupId/packing-plan/start` | ✔ |  | ✔ | ✔ |  |  |
| GET | `/packing-plans/summary` | ✔ | ✔ | ✔ | ✔ | ✔ |  |
| GET | `/packing/reports/feedback` | ✔ | ✔ |  |  |  |  |
| GET | `/packing/reports/summary` | ✔ | ✔ |  |  |  |  |
| GET | `/packing/settings` | ✔ | ✔ | ✔ | ✔ |  |  |
| PUT | `/packing/settings` | ✔ | ✔ |  |  |  |  |
| GET | `/packing/staff` | ✔ | ✔ |  | ✔ |  |  |
| GET | `/packaging/bags` | ✔ | ✔ | ✔ | ✔ |  |  |
| POST | `/packaging/bags` | ✔ |  |  |  |  |  |
| PATCH | `/packaging/bags/:id` | ✔ |  |  |  |  |  |
| POST | `/packaging/bags/:id/stock-in` | ✔ |  | ✔ |  |  |  |
| GET | `/packaging/boxes` | ✔ | ✔ | ✔ | ✔ |  |  |
| POST | `/packaging/boxes` | ✔ |  |  |  |  |  |
| PATCH | `/packaging/boxes/:id` | ✔ |  |  |  |  |  |
| GET | `/packaging/boxes/:id/movements` | ✔ |  | ✔ | ✔ |  |  |
| POST | `/packaging/boxes/:id/stock-in` | ✔ |  | ✔ |  |  |  |
| GET | `/packaging/materials` | ✔ | ✔ | ✔ | ✔ |  |  |
| POST | `/packaging/materials` | ✔ |  |  |  |  |  |
| PATCH | `/packaging/materials/:id` | ✔ |  |  |  |  |  |
| GET | `/packaging/materials/:id/movements` | ✔ |  | ✔ | ✔ |  |  |
| POST | `/packaging/materials/:id/stock-in` | ✔ |  | ✔ |  |  |  |
| GET | `/packaging/materials/rules` | ✔ | ✔ | ✔ | ✔ |  |  |
| PUT | `/packaging/materials/rules` | ✔ |  |  |  |  |  |
| GET | `/packaging-materials` | ✔ | ✔ | ✔ | ✔ |  |  |
| POST | `/packaging-materials` | ✔ |  |  |  |  |  |
| DELETE | `/packaging-materials/:code` | ✔ |  |  |  |  |  |
| GET | `/packaging-materials/:code` | ✔ | ✔ | ✔ | ✔ |  |  |
| PATCH | `/packaging-materials/:code` | ✔ |  |  |  |  |  |
| POST | `/packaging-materials/:code/internal-use` | ✔ |  | ✔ |  |  |  |
| POST | `/packaging-materials/:code/purchase` | ✔ |  | ✔ |  |  |  |
| POST | `/packaging-materials/:code/reactivate` | ✔ |  |  |  |  |  |
| GET | `/packaging-materials/movements` | ✔ | ✔ | ✔ | ✔ |  |  |
| GET | `/packaging-materials/savings` | ✔ | ✔ |  |  |  |  |
| GET | `/shipping/carriers` | ✔ | ✔ | ✔ |  | ✔ |  |
| POST | `/shipping/carriers` | ✔ |  |  |  |  |  |
| PATCH | `/shipping/carriers/:id` | ✔ |  |  |  |  |  |
| GET | `/shipping/packaging-options/:groupId` | ✔ | ✔ |  | ✔ | ✔ |  |
| GET | `/shipping/quote/:groupId` | ✔ | ✔ |  |  | ✔ |  |
| GET | `/shipping/settings` | ✔ | ✔ |  |  | ✔ |  |
| PUT | `/shipping/settings` | ✔ | ✔ |  |  |  |  |
| POST | `/carriers/ghn/webhook` |  |  |  |  |  | Công khai — header `X-OptiPack-Secret` (hoặc `?secret=`) + kiểm ShopID |
| POST | `/order-groups/:id/fulfillment/deliver` | ✔ |  |  |  | ✔ |  |
| POST | `/order-groups/:id/fulfillment/return` | ✔ |  | ✔ |  | ✔ |  |
| POST | `/order-groups/:id/fulfillment/ship` | ✔ |  |  |  | ✔ |  |
| GET | `/returns` | ✔ | ✔ | ✔ |  | ✔ |  |
| POST | `/returns` | ✔ |  |  |  |  |  |
| GET | `/returns/:id` | ✔ | ✔ | ✔ |  | ✔ |  |
| POST | `/returns/:id/approve` | ✔ | ✔ |  |  |  |  |
| POST | `/returns/:id/cancel` | ✔ | ✔ |  |  |  |  |
| POST | `/returns/:id/create-replacement` | ✔ | ✔ |  |  |  |  |
| POST | `/returns/:id/inspect` | ✔ |  | ✔ |  |  |  |
| POST | `/returns/:id/quarantine/:lineIndex/resolve` | ✔ |  | ✔ |  |  |  |
| POST | `/returns/:id/receive` | ✔ |  | ✔ |  |  |  |
| POST | `/returns/:id/reject` | ✔ | ✔ |  |  |  |  |
| GET | `/returns/quarantine` | ✔ | ✔ | ✔ |  |  |  |
| GET | `/returns/reason-codes` | ✔ | ✔ | ✔ |  | ✔ |  |
| GET | `/shipments` | ✔ | ✔ | ✔ |  | ✔ |  |
| POST | `/shipments` | ✔ |  |  |  | ✔ |  |
| GET | `/shipments/:id` | ✔ | ✔ | ✔ |  | ✔ |  |
| POST | `/shipments/:id/carrier/book` | ✔ |  |  |  | ✔ |  |
| POST | `/shipments/:id/carrier/cancel` | ✔ |  |  |  | ✔ |  |
| GET | `/shipments/:id/carrier/label` | ✔ |  | ✔ | ✔ | ✔ |  |
| POST | `/shipments/:id/carrier/simulate` | ✔ |  |  |  | ✔ |  |
| POST | `/shipments/:id/carrier/sync` | ✔ |  |  |  | ✔ |  |
| POST | `/shipments/:id/deliver` | ✔ |  |  |  | ✔ |  |
| GET | `/shipments/:id/events` | ✔ | ✔ | ✔ |  | ✔ |  |
| POST | `/shipments/:id/fail` | ✔ |  |  |  | ✔ |  |
| PATCH | `/shipments/:id/pickup` | ✔ |  |  |  | ✔ |  |
| POST | `/shipments/:id/receive-return` | ✔ |  | ✔ |  |  |  |
| POST | `/shipments/:id/retry` | ✔ |  |  |  | ✔ |  |
| PATCH | `/shipments/:id/to-location` | ✔ |  |  |  | ✔ |  |
| POST | `/shipments/batch` | ✔ |  |  |  | ✔ |  |
| GET | `/shipments/carrier/statuses` | ✔ | ✔ | ✔ |  | ✔ |  |
| GET | `/shipments/group/:groupId` | ✔ | ✔ | ✔ |  | ✔ |  |
| POST | `/shipments/overdue-scan` | ✔ |  |  |  |  |  |
| GET | `/shipments/reason-codes` | ✔ | ✔ | ✔ |  | ✔ |  |
| GET | `/documents/manifest/:tripCode` | ✔ | ✔ |  |  | ✔ |  |
| GET | `/documents/packing-slip/:groupId` | ✔ | ✔ | ✔ | ✔ |  |  |
| GET | `/documents/shipping-label/:groupId` | ✔ |  | ✔ |  | ✔ |  |
| POST | `/customer-auth/login` |  |  |  |  |  | Công khai (khách AURELLE) |
| POST | `/customer-auth/logout` |  |  |  |  |  | Công khai |
| GET | `/customer-auth/me` |  |  |  |  |  | Khách AURELLE (JWT khách) |
| POST | `/customer-auth/register` |  |  |  |  |  | Công khai (khách AURELLE) |
| POST | `/storefront/admin/auth/login` |  |  |  |  |  | Công khai — đăng nhập admin storefront (env) |
| POST | `/storefront/admin/auth/logout` |  |  |  |  |  | Admin storefront |
| GET | `/storefront/admin/auth/me` |  |  |  |  |  | Admin storefront |
| POST | `/storefront/admin/images` |  |  |  |  |  | Admin storefront |
| GET | `/storefront/admin/products` |  |  |  |  |  | Admin storefront |
| POST | `/storefront/admin/products` |  |  |  |  |  | Admin storefront |
| DELETE | `/storefront/admin/products/:id` |  |  |  |  |  | Admin storefront |
| GET | `/storefront/admin/products/:id` |  |  |  |  |  | Admin storefront |
| PATCH | `/storefront/admin/products/:id` |  |  |  |  |  | Admin storefront |
| DELETE | `/storefront/cart` |  |  |  |  |  | Khách AURELLE (JWT khách) |
| GET | `/storefront/cart` |  |  |  |  |  | Khách AURELLE (JWT khách) |
| POST | `/storefront/cart/items` |  |  |  |  |  | Khách AURELLE (JWT khách) |
| DELETE | `/storefront/cart/items/:variantId` |  |  |  |  |  | Khách AURELLE (JWT khách) |
| PATCH | `/storefront/cart/items/:variantId` |  |  |  |  |  | Khách AURELLE (JWT khách) |
| POST | `/storefront/cart/sync` |  |  |  |  |  | Khách AURELLE (JWT khách) |
| GET | `/storefront/categories` |  |  |  |  |  | Công khai |
| GET | `/storefront/images/:id` |  |  |  |  |  | Công khai (ảnh sản phẩm) |
| GET | `/storefront/orders` |  |  |  |  |  | Khách AURELLE (JWT khách) |
| GET | `/storefront/orders/:id` |  |  |  |  |  | Khách AURELLE (JWT khách) |
| POST | `/storefront/orders/checkout` |  |  |  |  |  | Khách AURELLE (JWT khách) |
| GET | `/storefront/products` |  |  |  |  |  | Công khai (khách xem hàng) |
| GET | `/storefront/products/:slug` |  |  |  |  |  | Công khai |
| GET | `/storefront/settings` |  |  |  |  |  | Công khai |

**Số route theo vai trò:** Admin 192, Store Owner 59, Warehouse 80, Packaging 49, Coordinator 37. Không giới hạn vai trò: 47.

