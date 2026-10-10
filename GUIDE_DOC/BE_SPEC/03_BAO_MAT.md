# 03 — Bảo mật

## 1. Các lớp bảo vệ

| Lớp | Cơ chế | Nằm ở | Chức năng |
|---|---|---|---|
| Truyền tải | Helmet | `main.ts` | Thêm header bảo mật (chống clickjacking, MIME sniffing, ẩn `X-Powered-By`…) |
| Nguồn gọi | CORS | `main.ts` | Chỉ cho phép các domain trong `CORS_ORIGIN` gọi API kèm cookie/credential |
| Tần suất | `ThrottlerGuard` toàn cục | `app.module.ts` | 20 request / 60 giây / IP; chống dò mật khẩu, spam |
| Định danh | JWT HS256 (`JwtAuthGuard` + `JwtStrategy`) | `auth/` | Xác minh người gọi; access token mặc định 1 ngày |
| Trạng thái tài khoản | `JwtStrategy.validate()` | `auth/strategies` | Chặn tài khoản vô hiệu hóa, vai trò sai, quá hạn đổi mật khẩu 72 giờ — kiểm **mỗi request** (cache Redis 60 giây) |
| Phân quyền | `RolesGuard` + `@Roles(...)` | `auth/guards` | Mỗi route khai báo vai trò được gọi |
| Bắt đổi mật khẩu | `ForcePasswordChangeGuard` | `auth/guards` | Khi `must_change_password=true`, chỉ cho đổi mật khẩu/đăng xuất — **chỉ đang gắn ở `/users`** |
| Đầu vào | `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) | `main.ts` | Từ chối trường lạ, sai kiểu; chống mass-assignment (VD tự gửi `role`) |
| Lỗi | `GlobalExceptionFilter` | `common/filters` | Không lộ stack trace; lỗi 500 trả `INTERNAL_ERROR` chung |
| Dữ liệu nhạy cảm | bcrypt, SHA-256, AES-256-GCM | `auth`, `users`, `marketplace-integration` | Mật khẩu, token, token sàn không lưu dạng rõ |
| Toàn vẹn dữ liệu | Khóa phiên bản (`expected_version`), transaction | Các service nghiệp vụ | Hai người thao tác đồng thời không ghi đè nhau; trừ tồn và ghi sổ cái cùng thành công hoặc cùng hủy |
| Tích hợp sàn | Chữ ký HMAC-SHA256, `state` OAuth một lần, cầu dao ghi | `marketplace-integration`, `order-groups` | Request tới Lazada không giả mạo được; callback không bị chèn; không vô tình ghi lên shop thật |

## 2. Xác thực tài khoản

### 2.1. Mật khẩu

- Băm **bcrypt cost 12**; mật khẩu mới phải ≥ 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt.
- **Không có đăng ký công khai.** Admin tạo tài khoản → hệ thống sinh mật khẩu tạm, gửi email, đặt `must_change_password=true` và `must_change_password_by` = +72 giờ. Quá hạn chưa đổi → bị khóa, Admin phải đặt lại.
- **Khóa tạm khi sai nhiều lần**: `failed_login_attempts` tăng mỗi lần sai; sai **5 lần** → khóa **15 phút** (`locked_until`), rồi reset bộ đếm.
- **Quên mật khẩu**: luôn trả cùng một thông báo dù email có tồn tại hay không (chống dò email); token ngẫu nhiên 32 byte, chỉ lưu SHA-256, hạn 30 phút.

### 2.2. Token

| Token | Hạn mặc định | Lưu ở server | Đặc điểm |
|---|---|---|---|
| Access token (JWT) | 1 ngày (`JWT_EXPIRES_IN`) | Không | Payload `{ sub, email, role }`, ký HS256 |
| Refresh token (JWT) | 30 ngày | `refresh_tokens` (chỉ SHA-256) | **Xoay vòng**: mỗi lần refresh cấp cặp mới, token cũ bị thu hồi; dùng lại token đã thu hồi → **thu hồi toàn bộ phiên** của người dùng (phát hiện đánh cắp) |
| Trusted device token | 30 ngày | `trusted_devices` (SHA-256) | Bỏ qua MFA trên thiết bị đã xác minh |
| Reset password token | 30 phút | `users.reset_password_token_hash` | Dùng 1 lần |

### 2.3. MFA

- TOTP 6 số (otplib), bật tự nguyện: `POST /auth/mfa/setup` → trả `otpauthUrl` (FE tự vẽ QR) → `POST /auth/mfa/verify` → bật và trả **10 mã dự phòng** (chỉ hiện 1 lần, lưu bcrypt).
- Đăng nhập có MFA trả `{ mfa_required: true }`, gọi lại kèm `mfa_token` hoặc `backup_code`.
- Admin có thể gỡ MFA cho nhân viên (`POST /users/:id/disable-mfa`).

### 2.4. Google OAuth

Chỉ đăng nhập cho email **đã được Admin tạo**, không tự tạo tài khoản. Có `state` chống giả mạo và hỗ trợ PKCE (`code_challenge`/`code_verifier`). Email Google chưa xác thực bị từ chối. Kết quả trả về FE qua query string của URL chuyển hướng.

### 2.5. Nhật ký và thu hồi

- Mọi lần đăng nhập ghi `login_audit_logs` (60 ngày): email, thành công/thất bại, lý do, IP, trình duyệt.
- Khi vô hiệu hóa, đổi vai trò, đặt lại mật khẩu: thu hồi refresh token và **xóa cache Redis** để thay đổi có hiệu lực ngay, không chờ 60 giây.

## 3. Bảo mật tích hợp Lazada

- **Token sàn mã hóa AES-256-GCM** (IV ngẫu nhiên, có tag xác thực) bằng `TOKEN_ENCRYPTION_KEY`; không bao giờ trả token qua API hay query string.
- **Mọi request ký HMAC-SHA256** bằng `LAZADA_APP_SECRET`.
- **Callback OAuth không dùng JWT** (sàn gọi về qua trình duyệt) — bảo vệ bằng `state` ngẫu nhiên lưu `marketplace_oauth_states`, dùng 1 lần, tự hết hạn 10 phút.
- **Cầu dao `LAZADA_WRITE_APIS_ENABLED`** (mặc định tắt) cho mọi thao tác ghi lên shop thật; API ghi không tự retry để tránh thao tác trùng.

## 4. Bảo vệ toàn vẹn nghiệp vụ

- **Khóa phiên bản lạc quan**: response nhóm đơn, vận đơn, phiếu trả có `version`; thao tác ghi gửi `expected_version`, lệch → 409. Cập nhật nền (số đếm, kết quả Lazada) dùng `updateOne` để **không** tăng phiên bản.
- **Transaction** cho thao tác nhiều collection (trừ tồn + ghi sổ cái; đóng gói + trừ vật liệu; kiểm hàng hoàn + nhập lại kho).
- **Idempotency**: quét lấy hàng có `client_event_id` (index duy nhất) — gửi lại do mạng chập chờn không trừ tồn 2 lần; `pack` bấm lại không trừ vật liệu 2 lần.
- **Tách quyền người tạo và người duyệt**: người tạo phiếu trả không được tự duyệt (`RMA_SELF_APPROVAL`).
- **Sổ cái bất biến**: `inventory_movements`, `packaging_movements`, `shipment_events`, `pick_events` chỉ thêm, không sửa — truy vết được ai làm gì.

## 5. Độ phủ guard theo controller

| Controller | JwtAuthGuard | RolesGuard | ForcePasswordChangeGuard |
|---|---|---|---|
| `AuthController` | Từng route (change-password, mfa, logout) | — | — |
| `UsersController` | ✔ | ✔ | ✔ |
| `NotificationsController` | ✔ | — (không cần, không có `@Roles`) | — |
| `MarketplaceIntegrationController` | Chỉ `connect` | Chỉ `connect` | — |
| 14 controller nghiệp vụ còn lại (orders, order-groups, stock, staff, packaging, packaging-materials, product-master, warehouse, categories, colors, master-skus, shipments, legacy, returns) | ✔ | ✔ | **—** |

## 6. Lỗ hổng và rủi ro bảo mật

| Mức | Vấn đề | Chi tiết | Hướng khắc phục |
|---|---|---|---|
| **Cao** | **Bắt đổi mật khẩu không được áp dụng toàn hệ thống** | `ForcePasswordChangeGuard` chỉ gắn ở `UsersController`. Tài khoản mới (mật khẩu tạm gửi qua email) vẫn gọi được **mọi API nghiệp vụ** trong 72 giờ mà chưa đổi mật khẩu. Tài liệu `INTEGRATION_GUIDE.md` lại ghi "mọi API khác trả 403" — không khớp thực tế | Đăng ký guard **toàn cục** (`APP_GUARD`) hoặc gắn vào mọi controller; viết test e2e |
| **Cao** | **Khóa bí mật MFA lưu dạng rõ** | `users.mfa_secret` là chuỗi gốc. Lộ DB = vượt được MFA của mọi tài khoản | Mã hóa bằng AES-256-GCM như token sàn |
| **Trung bình** | **CORS mở khi thiếu cấu hình** | `CORS_ORIGIN` trống → `origin: true` (cho mọi domain) kèm `credentials: true` | Bắt buộc cấu hình, không có mặc định mở |
| **Trung bình** | **Access token sống 1 ngày** | Token bị lộ dùng được tới 24 giờ (dù có kiểm trạng thái tài khoản mỗi request) | Rút xuống 15–60 phút, dựa vào refresh token |
| **Trung bình** | **Throttle chung 20/phút/IP cho mọi route** | Quá chặt cho vận hành (quét mã liên tục, nhiều nhân viên chung IP văn phòng) nhưng lại không chặt riêng cho `/auth/login` | Giới hạn riêng: chặt cho auth, nới cho nghiệp vụ (`@Throttle` theo route) |
| **Trung bình** | **Token Google trả qua query string** | `access_token`/`refresh_token` nằm trên URL chuyển hướng về FE → lưu trong lịch sử trình duyệt, log proxy | Trả mã một lần (code) rồi FE đổi lấy token qua POST |
| **Thấp** | Kiểm trạng thái tài khoản cache 60 giây | Nếu một đường đổi trạng thái quên xóa cache, có độ trễ tới 60 giây | Đã xóa cache ở các đường chính; thêm test |
| **Thấp** | Bản `be.zip` gửi đi có kèm file `.env` thật | Lộ secret JWT, khóa mã hóa, khóa Lazada nếu zip bị chia sẻ | Không đóng gói `.env`; xoay vòng secret nếu đã chia sẻ |
| **Thấp** | Callback marketplace không giới hạn riêng | Dựa vào `state` một lần là đủ, nhưng lỗi trả về lộ mã lỗi nội bộ trên URL | Chấp nhận được; ghi log đầy đủ |


## 7. Ma trận phân quyền đầy đủ (141 endpoint)

✔ = được gọi · — = bị chặn 403 · 🌐 = công khai · 👤 = mọi người đã đăng nhập

| Method | Path | Admin | Store Owner | Warehouse | Packaging | Shipping | Guard |
|---|---|---|---|---|---|---|---|
| `GET` | `/` | 🌐 | 🌐 | 🌐 | 🌐 | 🌐 | — |
| `POST` | `/auth/login` | 🌐 | 🌐 | 🌐 | 🌐 | 🌐 | — |
| `POST` | `/auth/forgot-password` | 🌐 | 🌐 | 🌐 | 🌐 | 🌐 | — |
| `POST` | `/auth/reset-password` | 🌐 | 🌐 | 🌐 | 🌐 | 🌐 | — |
| `POST` | `/auth/change-password` | 👤 | 👤 | 👤 | 👤 | 👤 | JWT |
| `POST` | `/auth/mfa/setup` | 👤 | 👤 | 👤 | 👤 | 👤 | JWT |
| `POST` | `/auth/mfa/verify` | 👤 | 👤 | 👤 | 👤 | 👤 | JWT |
| `POST` | `/auth/refresh` | 🌐 | 🌐 | 🌐 | 🌐 | 🌐 | — |
| `POST` | `/auth/logout` | 👤 | 👤 | 👤 | 👤 | 👤 | JWT |
| `GET` | `/auth/google` | 🌐 | 🌐 | 🌐 | 🌐 | 🌐 | — |
| `GET` | `/auth/google/callback` | 🌐 | 🌐 | 🌐 | 🌐 | 🌐 | — |
| `GET` | `/categories` | ✔ | ✔ | ✔ | ✔ | — | JWT, Roles |
| `GET` | `/categories/:code` | ✔ | ✔ | ✔ | ✔ | — | JWT, Roles |
| `POST` | `/categories` | ✔ | — | — | — | — | JWT, Roles |
| `PATCH` | `/categories/:code` | ✔ | — | — | — | — | JWT, Roles |
| `DELETE` | `/categories/:code` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/categories/:code/reactivate` | ✔ | — | — | — | — | JWT, Roles |
| `GET` | `/marketplace/:platform/connect` | ✔ | — | — | — | — | JWT, Roles |
| `GET` | `/marketplace/:platform/callback` | 🌐 | 🌐 | 🌐 | 🌐 | 🌐 | — |
| `GET` | `/colors` | ✔ | ✔ | ✔ | ✔ | — | JWT, Roles |
| `POST` | `/colors` | ✔ | — | — | — | — | JWT, Roles |
| `PATCH` | `/colors/:code` | ✔ | — | — | — | — | JWT, Roles |
| `DELETE` | `/colors/:code` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/colors/:code/reactivate` | ✔ | — | — | — | — | JWT, Roles |
| `GET` | `/master-skus/unmapped-seller-skus` | ✔ | ✔ | — | — | — | JWT, Roles |
| `GET` | `/master-skus/unpooled-stock` | ✔ | ✔ | — | — | — | JWT, Roles |
| `POST` | `/master-skus/sync-stock` | ✔ | — | — | — | — | JWT, Roles |
| `DELETE` | `/master-skus/mappings/:id` | ✔ | — | — | — | — | JWT, Roles |
| `GET` | `/master-skus` | ✔ | ✔ | ✔ | ✔ | — | JWT, Roles |
| `GET` | `/master-skus/:code` | ✔ | ✔ | ✔ | ✔ | — | JWT, Roles |
| `POST` | `/master-skus` | ✔ | — | — | — | — | JWT, Roles |
| `PATCH` | `/master-skus/:code` | ✔ | — | — | — | — | JWT, Roles |
| `DELETE` | `/master-skus/:code` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/master-skus/:code/reactivate` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/master-skus/:code/replace` | ✔ | — | — | — | — | JWT, Roles |
| `GET` | `/master-skus/:code/mappings` | ✔ | ✔ | ✔ | ✔ | — | JWT, Roles |
| `POST` | `/master-skus/:code/mappings` | ✔ | — | — | — | — | JWT, Roles |
| `GET` | `/notifications` | 👤 | 👤 | 👤 | 👤 | 👤 | JWT |
| `GET` | `/notifications/unread-count` | 👤 | 👤 | 👤 | 👤 | 👤 | JWT |
| `PATCH` | `/notifications/:id/read` | 👤 | 👤 | 👤 | 👤 | 👤 | JWT |
| `GET` | `/order-groups` | ✔ | ✔ | ✔ | ✔ | ✔ | JWT, Roles |
| `GET` | `/order-groups/:id` | ✔ | ✔ | ✔ | ✔ | ✔ | JWT, Roles |
| `GET` | `/order-groups/:id/picking-list` | ✔ | — | ✔ | — | — | JWT, Roles |
| `GET` | `/order-groups/:id/picking-list/:sku` | ✔ | — | ✔ | — | — | JWT, Roles |
| `POST` | `/order-groups/:id/fulfillment/pick-item` | ✔ | — | ✔ | — | — | JWT, Roles |
| `POST` | `/order-groups/:id/fulfillment/report-missing` | ✔ | — | ✔ | — | — | JWT, Roles |
| `POST` | `/order-groups/:id/fulfillment/decide-partial` | ✔ | — | — | ✔ | — | JWT, Roles |
| `POST` | `/order-groups/:id/fulfillment/pick` | ✔ | — | ✔ | — | — | JWT, Roles |
| `POST` | `/order-groups/:id/fulfillment/pack` | ✔ | — | ✔ | ✔ | — | JWT, Roles |
| ~~`POST`~~ | ~~`/order-groups/:id/lazada-pack/retry`~~ | — | — | — | — | — | ĐÃ BỎ 10/10/2026 |
| `PATCH` | `/order-groups/:id/priority` | ✔ | ✔ | — | — | — | JWT, Roles |
| `POST` | `/order-groups/:id/assign` | ✔ | — | ✔ | — | — | JWT, Roles |
| `GET` | `/order-groups/staff/search` | ✔ | — | ✔ | ✔ | — | JWT, Roles |
| `GET` | `/stock-availability` | ✔ | ✔ | ✔ | — | — | JWT, Roles |
| `GET` | `/order-groups/:id/stock-reservation` | ✔ | ✔ | ✔ | — | — | JWT, Roles |
| `POST` | `/order-groups/:id/stock-reservation/recheck` | ✔ | ✔ | — | — | — | JWT, Roles |
| `POST` | `/order-groups/:id/stock-reservation/release` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/orders/lazada/sync` | ✔ | — | — | — | — | JWT, Roles |
| `GET` | `/orders` | ✔ | ✔ | — | — | — | JWT, Roles |
| `GET` | `/orders/:id` | ✔ | ✔ | — | — | — | JWT, Roles |
| `GET` | `/packaging-materials` | ✔ | ✔ | ✔ | ✔ | — | JWT, Roles |
| `GET` | `/packaging-materials/savings` | ✔ | ✔ | — | — | — | JWT, Roles |
| `GET` | `/packaging-materials/movements` | ✔ | ✔ | ✔ | ✔ | — | JWT, Roles |
| `GET` | `/packaging-materials/:code` | ✔ | ✔ | ✔ | ✔ | — | JWT, Roles |
| `POST` | `/packaging-materials` | ✔ | — | — | — | — | JWT, Roles |
| `PATCH` | `/packaging-materials/:code` | ✔ | — | — | — | — | JWT, Roles |
| `DELETE` | `/packaging-materials/:code` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/packaging-materials/:code/reactivate` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/packaging-materials/:code/purchase` | ✔ | — | ✔ | — | — | JWT, Roles |
| `POST` | `/packaging-materials/:code/internal-use` | ✔ | — | ✔ | — | — | JWT, Roles |
| `GET` | `/order-groups/:groupId/packaging` | ✔ | — | ✔ | ✔ | ✔ | JWT, Roles |
| `POST` | `/order-groups/:groupId/packaging/generate` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/order-groups/:groupId/packaging/approve` | ✔ | — | — | ✔ | — | JWT, Roles |
| `POST` | `/order-groups/:groupId/packaging/adjust` | ✔ | — | — | ✔ | — | JWT, Roles |
| `POST` | `/order-groups/:groupId/packaging/reject` | ✔ | — | — | ✔ | — | JWT, Roles |
| `GET` | `/product-master` | ✔ | ✔ | — | ✔ | — | JWT, Roles |
| `GET` | `/product-master/:id` | ✔ | ✔ | — | ✔ | — | JWT, Roles |
| `PATCH` | `/product-master/:id` | ✔ | ✔ | — | — | — | JWT, Roles |
| `DELETE` | `/product-master/:id/manual-override` | ✔ | ✔ | — | — | — | JWT, Roles |
| `POST` | `/product-master/sync` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/order-groups/:id/fulfillment/ship` | ✔ | — | — | — | ✔ | JWT, Roles |
| `POST` | `/order-groups/:id/fulfillment/deliver` | ✔ | — | — | — | ✔ | JWT, Roles |
| `POST` | `/order-groups/:id/fulfillment/return` | ✔ | — | ✔ | — | ✔ | JWT, Roles |
| `GET` | `/returns/reason-codes` | ✔ | ✔ | ✔ | — | ✔ | JWT, Roles |
| `GET` | `/returns` | ✔ | ✔ | ✔ | — | ✔ | JWT, Roles |
| `GET` | `/returns/quarantine` | ✔ | ✔ | ✔ | — | — | JWT, Roles |
| `POST` | `/returns/:id/quarantine/:lineIndex/resolve` | ✔ | — | ✔ | — | — | JWT, Roles |
| `POST` | `/returns/:id/create-replacement` | ✔ | ✔ | — | — | — | JWT, Roles |
| `GET` | `/returns/:id` | ✔ | ✔ | ✔ | — | ✔ | JWT, Roles |
| `POST` | `/returns` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/returns/:id/approve` | ✔ | ✔ | — | — | — | JWT, Roles |
| `POST` | `/returns/:id/reject` | ✔ | ✔ | — | — | — | JWT, Roles |
| `POST` | `/returns/:id/receive` | ✔ | — | ✔ | — | — | JWT, Roles |
| `POST` | `/returns/:id/inspect` | ✔ | — | ✔ | — | — | JWT, Roles |
| `GET` | `/shipments/reason-codes` | ✔ | ✔ | ✔ | — | ✔ | JWT, Roles |
| `GET` | `/shipments` | ✔ | ✔ | ✔ | — | ✔ | JWT, Roles |
| `POST` | `/shipments/overdue-scan` | ✔ | — | — | — | — | JWT, Roles |
| `GET` | `/shipments/:id` | ✔ | ✔ | ✔ | — | ✔ | JWT, Roles |
| `GET` | `/shipments/:id/events` | ✔ | ✔ | ✔ | — | ✔ | JWT, Roles |
| `POST` | `/shipments` | ✔ | — | — | — | ✔ | JWT, Roles |
| `POST` | `/shipments/:id/deliver` | ✔ | — | — | — | ✔ | JWT, Roles |
| `POST` | `/shipments/:id/fail` | ✔ | — | — | — | ✔ | JWT, Roles |
| `POST` | `/shipments/:id/retry` | ✔ | — | — | — | ✔ | JWT, Roles |
| `POST` | `/shipments/:id/receive-return` | ✔ | — | ✔ | — | — | JWT, Roles |
| `POST` | `/users` | ✔ | — | — | — | — | JWT, Roles, ForcePwd |
| `GET` | `/users` | ✔ | ✔ | — | — | — | JWT, Roles, ForcePwd |
| `GET` | `/users/me` | 👤 | 👤 | 👤 | 👤 | 👤 | JWT, Roles, ForcePwd |
| `PATCH` | `/users/me` | 👤 | 👤 | 👤 | 👤 | 👤 | JWT, Roles, ForcePwd |
| `POST` | `/users/:id/reset-password` | ✔ | — | — | — | — | JWT, Roles, ForcePwd |
| `POST` | `/users/:id/disable-mfa` | ✔ | — | — | — | — | JWT, Roles, ForcePwd |
| `POST` | `/users/:id/reactivate` | ✔ | — | — | — | — | JWT, Roles, ForcePwd |
| `PATCH` | `/users/:id` | ✔ | — | — | — | — | JWT, Roles, ForcePwd |
| `DELETE` | `/users/:id` | ✔ | — | — | — | — | JWT, Roles, ForcePwd |
| `POST` | `/warehouse/warehouses` | ✔ | — | — | — | — | JWT, Roles |
| `GET` | `/warehouse/warehouses` | ✔ | — | ✔ | — | — | JWT, Roles |
| `POST` | `/warehouse/warehouses/:warehouseId/zones` | ✔ | — | — | — | — | JWT, Roles |
| `GET` | `/warehouse/warehouses/:warehouseId/zones` | ✔ | — | ✔ | — | — | JWT, Roles |
| `GET` | `/warehouse/zones/:zoneId/bin-locations` | ✔ | — | — | — | — | JWT, Roles |
| `GET` | `/warehouse/warehouses/:warehouseId/bin-locations` | ✔ | — | ✔ | — | — | JWT, Roles |
| `GET` | `/warehouse/warehouses/:warehouseId/sku-bin-assignments` | ✔ | — | ✔ | — | — | JWT, Roles |
| `POST` | `/warehouse/zones/:zoneId/bin-locations/generate` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/warehouse/warehouses/:warehouseId/sku-bin-assignments` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock` | ✔ | — | ✔ | — | — | JWT, Roles |
| `GET` | `/warehouse/sku-bin-assignments/unassigned` | ✔ | — | — | — | — | JWT, Roles |
| `GET` | `/warehouse/:warehouseId/picking-list/:groupId` | ✔ | — | ✔ | — | — | JWT, Roles |
| `GET` | `/warehouse/warehouses/:warehouseId` | ✔ | — | ✔ | — | — | JWT, Roles |
| `PATCH` | `/warehouse/warehouses/:warehouseId` | ✔ | — | — | — | — | JWT, Roles |
| `DELETE` | `/warehouse/warehouses/:warehouseId` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/warehouse/warehouses/:warehouseId/reactivate` | ✔ | — | — | — | — | JWT, Roles |
| `PATCH` | `/warehouse/zones/:zoneId` | ✔ | — | — | — | — | JWT, Roles |
| `DELETE` | `/warehouse/zones/:zoneId` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/warehouse/zones/:zoneId/reactivate` | ✔ | — | — | — | — | JWT, Roles |
| `DELETE` | `/warehouse/bin-locations/:binId` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/warehouse/bin-locations/:binId/reactivate` | ✔ | — | — | — | — | JWT, Roles |
| `POST` | `/warehouse/zones/:zoneId/racks` | ✔ | — | — | — | — | JWT, Roles |
| `PATCH` | `/warehouse/bin-locations/:binId` | ✔ | — | — | — | — | JWT, Roles |
| `GET` | `/warehouse/warehouses/:warehouseId/bin-suggestions` | ✔ | — | ✔ | — | — | JWT, Roles |
| `POST` | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/adjust` | ✔ | — | ✔ | — | — | JWT, Roles |
| `POST` | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/transfer` | ✔ | — | ✔ | — | — | JWT, Roles |
| `DELETE` | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId` | ✔ | — | — | — | — | JWT, Roles |
| `GET` | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/movements` | ✔ | ✔ | ✔ | — | — | JWT, Roles |
