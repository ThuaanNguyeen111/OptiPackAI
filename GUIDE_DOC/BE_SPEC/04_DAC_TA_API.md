# 04 — Đặc tả API

> Tài liệu sinh từ mã nguồn (`*.controller.ts`, DTO `class-validator`) và đối chiếu thủ công. Tổng cộng **141 endpoint** trong **18 controller**. Đối chiếu mã `main` commit `93d20bf` + bản sửa của nhánh `feature/viet_befe` + bản sửa ObjectId ngày 07/10/2026. Swagger UI tại `/api/docs` là nguồn tham chiếu request/response trực tiếp.

## Quy ước chung

| Mục | Quy ước |
|---|---|
| Base URL | `http://localhost:3000` (không có tiền tố `/api/v1`) |
| Xác thực | Header `Authorization: Bearer <access_token>` cho mọi route trừ các route ghi "Công khai" |
| Định dạng | JSON; body bị kiểm tra bởi `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`: gửi trường lạ → 400) |
| Lỗi | HTTP status đúng loại lỗi; body luôn là `{ success: false, error_code, message, details, timestamp, path }` (xem `common/filters/global-exception.filter.ts`). Lỗi nghiệp vụ mang mã riêng của module (VD `WH_BIN_OVER_CAPACITY`); lỗi validate mang `VALIDATION_ERROR`; lỗi không lường trước mang `INTERNAL_ERROR` và không lộ chi tiết |
| Vai trò | `role` dạng số: 0 Store Owner · 1 Warehouse Staff · 2 Packaging Staff · 3 Shipping Coordinator · 4 Admin |
| Giới hạn tần suất | Toàn cục 20 request / 60 giây / IP (`ThrottlerGuard`) → vượt trả 429 `RATE_LIMITED` |
| Khóa phiên bản | Các thao tác ghi trên nhóm đơn / vận đơn / phiếu trả nhận `expected_version` (= `version` đọc được gần nhất); lệch → 409 `*_STATE_CONFLICT` |
| ID trong request | Mọi id (path, body) là chuỗi 24 ký tự hex. BE đổi sang ObjectId trước khi truy vấn. 🔄 **07/10/2026:** trước ngày này 35 trường id trong schema bị Mongoose hiểu là kiểu Mixed nên một số truy vấn dùng chuỗi id ra 0 dòng (Picking List, quét hàng, nhập thêm hàng) — đã sửa ở BE, FE không phải đổi gì |

## Mục lục module

- [Xác thực (Auth)](#xác-thực-auth) — 10 endpoint
- [Người dùng (Users)](#người-dùng-users) — 9 endpoint
- [Kết nối sàn (Marketplace Integration)](#kết-nối-sàn-marketplace-integration) — 2 endpoint
- [Đơn hàng (Orders)](#đơn-hàng-orders) — 3 endpoint
- [Nhóm đơn & Fulfillment (Order Groups)](#nhóm-đơn--fulfillment-order-groups) — 11 endpoint
- [Giữ chỗ tồn kho (Stock Reservation)](#giữ-chỗ-tồn-kho-stock-reservation) — 4 endpoint
- [Phân công nhân viên (Staff Assignment)](#phân-công-nhân-viên-staff-assignment) — 2 endpoint
- [Đề xuất đóng gói (Packaging)](#đề-xuất-đóng-gói-packaging) — 5 endpoint
- [Vật liệu đóng gói (Packaging Materials)](#vật-liệu-đóng-gói-packaging-materials) — 10 endpoint
- [Thông số sản phẩm (Product Master)](#thông-số-sản-phẩm-product-master) — 5 endpoint
- [Kho hàng (Warehouse)](#kho-hàng-warehouse) — 28 endpoint
- [Danh mục sản phẩm (Categories)](#danh-mục-sản-phẩm-categories) — 6 endpoint
- [SKU nội bộ & Màu (Master SKUs / Colors)](#sku-nội-bộ--màu-master-skus--colors) — 18 endpoint
- [Giao hàng (Shipments)](#giao-hàng-shipments) — 10 endpoint
- [Fulfillment cũ (Legacy — giữ tương thích)](#fulfillment-cũ-legacy--giữ-tương-thích) — 3 endpoint
- [Trả hàng & Đổi hàng (Returns)](#trả-hàng--đổi-hàng-returns) — 11 endpoint
- [Thông báo (Notifications)](#thông-báo-notifications) — 3 endpoint
- [Ứng dụng gốc](#ứng-dụng-gốc) — 1 endpoint

---

## Xác thực (Auth)

Nguồn: `src/modules/auth/auth.controller.ts`

Đăng nhập, phiên làm việc và bảo mật tài khoản. Các route `login`, `refresh`, `forgot-password`, `reset-password`, `google` **không cần token** (công khai, chịu giới hạn tần suất toàn cục). Các route còn lại cần `Authorization: Bearer <access_token>`.

**Các trường hợp chính của `POST /auth/login`:**
1. Sai email/mật khẩu → 401, tăng `failed_login_attempts`; đủ ngưỡng thì khóa tạm (`locked_until`).
2. Tài khoản bị khóa tạm hoặc quá hạn 72 giờ chưa đổi mật khẩu → 401/403 với thông báo riêng.
3. Tài khoản chưa bật MFA → trả `access_token`, `refresh_token`, `role`, `must_change_password`.
4. Tài khoản bật MFA, chưa gửi `mfa_token`/`backup_code`, thiết bị chưa tin cậy → trả `{ mfa_required: true }`.
5. Gửi kèm `mfa_token` (TOTP 6 số) hoặc `backup_code` đúng → cấp token + `trusted_device_token` (30 ngày).
6. Gửi `device_token` còn hạn → bỏ qua bước MFA.
Mọi lần đăng nhập (thành công/thất bại) được ghi `login_audit_logs`.

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `POST` | `/auth/login` | Công khai | Đăng nhập vào hệ thống (tài khoản do Admin tạo sẵn) |
| 2 | `POST` | `/auth/forgot-password` | Công khai | Gửi email hướng dẫn đặt lại mật khẩu |
| 3 | `POST` | `/auth/reset-password` | Công khai | Đặt lại mật khẩu bằng token nhận được qua email |
| 4 | `POST` | `/auth/change-password` | Mọi người dùng đã đăng nhập | Đổi mật khẩu (bắt buộc nếu must_change_password = true) |
| 5 | `POST` | `/auth/mfa/setup` | Mọi người dùng đã đăng nhập | Bước 1: Sinh QR code MFA cho tài khoản hiện tại |
| 6 | `POST` | `/auth/mfa/verify` | Mọi người dùng đã đăng nhập | Bước 2: Xác thực mã TOTP để kích hoạt MFA |
| 7 | `POST` | `/auth/refresh` | Công khai | Làm mới access token bằng refresh token |
| 8 | `POST` | `/auth/logout` | Mọi người dùng đã đăng nhập | Đăng xuất khỏi hệ thống (thu hồi refresh token) |
| 9 | `GET` | `/auth/google` | Công khai | Khởi tạo đăng nhập Google OAuth |
| 10 | `GET` | `/auth/google/callback` | Công khai | Google OAuth Callback (được Google tự động gọi) |

### Chi tiết từng endpoint

#### `POST /auth/login`

- **Hàm xử lý:** `login()` · **Guard:** không · **Quyền:** Công khai (không cần token)
- **HTTP code thành công:** HttpStatus.OK
- **Mô tả:** Đăng nhập vào hệ thống (tài khoản do Admin tạo sẵn)

**Body** (`LoginDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `email` | `string` | Có | @IsEmail() @IsNotEmpty() |
| `password` | `string` | Có | @IsString() @IsNotEmpty() @MinLength(6) |
| `mfa_token` | `string` | Không | @IsString() |
| `device_token` | `string` | Không | @IsString() |
| `backup_code` | `string` | Không | @IsString() |

#### `POST /auth/forgot-password`

- **Hàm xử lý:** `forgotPassword()` · **Guard:** không · **Quyền:** Công khai (không cần token)
- **HTTP code thành công:** HttpStatus.OK
- **Mô tả:** Gửi email hướng dẫn đặt lại mật khẩu

**Body** (`ForgotPasswordDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `email` | `string` | Có | @IsEmail() @IsNotEmpty() |

#### `POST /auth/reset-password`

- **Hàm xử lý:** `resetPassword()` · **Guard:** không · **Quyền:** Công khai (không cần token)
- **HTTP code thành công:** HttpStatus.OK
- **Mô tả:** Đặt lại mật khẩu bằng token nhận được qua email

**Body** (`ResetPasswordDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `token` | `string` | Có | @IsString() @IsNotEmpty() |
| `new_password` | `string` | Có | @IsNotEmpty() @IsString() @MinLength(8) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/) |

#### `POST /auth/change-password`

- **Hàm xử lý:** `changePassword()` · **Guard:** JwtAuthGuard · **Quyền:** Mọi người dùng đã đăng nhập
- **HTTP code thành công:** HttpStatus.OK
- **Mô tả:** Đổi mật khẩu (bắt buộc nếu must_change_password = true)

**Body** (`ChangePasswordDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `current_password` | `string` | Có | @IsString() @IsNotEmpty() |
| `new_password` | `string` | Có | @IsNotEmpty() @IsString() @MinLength(8) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/) |

#### `POST /auth/mfa/setup`

- **Hàm xử lý:** `setupMfa()` · **Guard:** JwtAuthGuard · **Quyền:** Mọi người dùng đã đăng nhập
- **Mô tả:** Bước 1: Sinh QR code MFA cho tài khoản hiện tại

#### `POST /auth/mfa/verify`

- **Hàm xử lý:** `verifyMfaSetup()` · **Guard:** JwtAuthGuard · **Quyền:** Mọi người dùng đã đăng nhập
- **HTTP code thành công:** HttpStatus.OK
- **Mô tả:** Bước 2: Xác thực mã TOTP để kích hoạt MFA

**Body** (`VerifyMfaSetupDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `token` | `string` | Có | @IsNotEmpty() @IsString() |

#### `POST /auth/refresh`

- **Hàm xử lý:** `refresh()` · **Guard:** không · **Quyền:** Công khai (không cần token)
- **HTTP code thành công:** HttpStatus.OK
- **Mô tả:** Làm mới access token bằng refresh token

**Body:** `{ "refresh_token": "<chuỗi>" }`

#### `POST /auth/logout`

- **Hàm xử lý:** `logout()` · **Guard:** JwtAuthGuard · **Quyền:** Mọi người dùng đã đăng nhập
- **HTTP code thành công:** HttpStatus.OK
- **Mô tả:** Đăng xuất khỏi hệ thống (thu hồi refresh token)

**Body:** `{ "refresh_token": "<chuỗi>" }`

#### `GET /auth/google`

- **Hàm xử lý:** `googleAuth()` · **Guard:** không · **Quyền:** Công khai (không cần token)
- **Phản hồi:** chuyển hướng (HTTP 302) về FE, không trả JSON
- **Mô tả:** Khởi tạo đăng nhập Google OAuth

**Query:** `code_challenge`

#### `GET /auth/google/callback`

- **Hàm xử lý:** `googleAuthCallback()` · **Guard:** không · **Quyền:** Công khai (không cần token)
- **Phản hồi:** chuyển hướng (HTTP 302) về FE, không trả JSON
- **Mô tả:** Google OAuth Callback (được Google tự động gọi)

**Query:** `code`, `state`, `code_verifier`

---

## Người dùng (Users)

Nguồn: `src/modules/users/users.controller.ts`

Quản trị tài khoản nội bộ. **Không có đăng ký công khai** — chỉ Admin tạo tài khoản (`POST /users`), hệ thống sinh mật khẩu tạm, gửi email và bắt đổi mật khẩu trong 72 giờ. Controller này là nơi DUY NHẤT gắn `ForcePasswordChangeGuard`.

**Trường hợp:** tạo trùng email đang hoạt động → 409; xóa là **xóa mềm** (`is_active=false`) và thu hồi mọi refresh token; `reactivate` mở lại; `reset-password` sinh mật khẩu tạm mới + đặt lại hạn 72 giờ; `disable-mfa` gỡ MFA khi nhân viên mất điện thoại.

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `POST` | `/users` | Admin | Admin tạo tài khoản nhân viên mới |
| 2 | `GET` | `/users` | Admin, Store Owner | Danh sách nhân viên trong hệ thống (có phân trang) |
| 3 | `GET` | `/users/me` | Mọi người dùng đã đăng nhập | Xem hồ sơ cá nhân của chính mình |
| 4 | `PATCH` | `/users/me` | Mọi người dùng đã đăng nhập | Cập nhật hồ sơ cá nhân (SĐT, địa chỉ, avatar) |
| 5 | `POST` | `/users/:id/reset-password` | Admin | Admin reset mật khẩu hộ nhân viên (sinh mật khẩu tạm mới, cũng dùng để MỞ KHÓA tài khoản bị khóa do quá hạn 72h) |
| 6 | `POST` | `/users/:id/disable-mfa` | Admin | Admin tắt MFA hộ nhân viên bị khóa (mất điện thoại, hết mã dự phòng) |
| 7 | `POST` | `/users/:id/reactivate` | Admin | Admin kích hoạt lại tài khoản đã xóa mềm |
| 8 | `PATCH` | `/users/:id` | Admin | Admin sửa thông tin 1 nhân viên (tên, role, SĐT, địa chỉ, mã NV, phòng ban) |
| 9 | `DELETE` | `/users/:id` | Admin | Vô hiệu hóa tài khoản nhân viên (xóa mềm) |

### Chi tiết từng endpoint

#### `POST /users`

- **Hàm xử lý:** `create()` · **Guard:** JwtAuthGuard, RolesGuard, ForcePasswordChangeGuard · **Quyền:** Admin
- **Mô tả:** Admin tạo tài khoản nhân viên mới

**Body** (`CreateUserDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `name` | `string` | Có | @IsNotEmpty() @IsString() |
| `email` | `string` | Có | @IsNotEmpty() @IsEmail() |
| `role` | `UserRole` | Có | @IsNotEmpty() @IsEnum(UserRole) |

#### `GET /users`

- **Hàm xử lý:** `findAll()` · **Guard:** JwtAuthGuard, RolesGuard, ForcePasswordChangeGuard · **Quyền:** Admin, Store Owner
- **Mô tả:** Danh sách nhân viên trong hệ thống (có phân trang)

**Query:** `role`, `page`, `limit`

#### `GET /users/me`

- **Hàm xử lý:** `getMyProfile()` · **Guard:** JwtAuthGuard, RolesGuard, ForcePasswordChangeGuard · **Quyền:** Mọi người dùng đã đăng nhập
- **Mô tả:** Xem hồ sơ cá nhân của chính mình

#### `PATCH /users/me`

- **Hàm xử lý:** `updateMyProfile()` · **Guard:** JwtAuthGuard, RolesGuard, ForcePasswordChangeGuard · **Quyền:** Mọi người dùng đã đăng nhập
- **Mô tả:** Cập nhật hồ sơ cá nhân (SĐT, địa chỉ, avatar)

**Body** (`UpdateProfileDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `phone` | `string` | Không | @IsString() @MaxLength(20) |
| `address` | `string` | Không | @IsString() @MaxLength(255) |
| `avatar` | `string` | Không | @IsString() |

#### `POST /users/:id/reset-password`

- **Hàm xử lý:** `resetPassword()` · **Guard:** JwtAuthGuard, RolesGuard, ForcePasswordChangeGuard · **Quyền:** Admin
- **Path params:** `id`
- **Mô tả:** Admin reset mật khẩu hộ nhân viên (sinh mật khẩu tạm mới, cũng dùng để MỞ KHÓA tài khoản bị khóa do quá hạn 72h)

#### `POST /users/:id/disable-mfa`

- **Hàm xử lý:** `disableMfa()` · **Guard:** JwtAuthGuard, RolesGuard, ForcePasswordChangeGuard · **Quyền:** Admin
- **Path params:** `id`
- **Mô tả:** Admin tắt MFA hộ nhân viên bị khóa (mất điện thoại, hết mã dự phòng)

#### `POST /users/:id/reactivate`

- **Hàm xử lý:** `reactivate()` · **Guard:** JwtAuthGuard, RolesGuard, ForcePasswordChangeGuard · **Quyền:** Admin
- **Path params:** `id`
- **Mô tả:** Admin kích hoạt lại tài khoản đã xóa mềm

#### `PATCH /users/:id`

- **Hàm xử lý:** `adminUpdate()` · **Guard:** JwtAuthGuard, RolesGuard, ForcePasswordChangeGuard · **Quyền:** Admin
- **Path params:** `id`
- **Mô tả:** Admin sửa thông tin 1 nhân viên (tên, role, SĐT, địa chỉ, mã NV, phòng ban)

**Body** (`AdminUpdateUserDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `name` | `string` | Không | @IsString() |
| `role` | `UserRole` | Không | @IsEnum(UserRole) |
| `phone` | `string` | Không | @IsString() @MaxLength(20) |
| `address` | `string` | Không | @IsString() @MaxLength(255) |
| `employee_code` | `string` | Không | @IsString() @MaxLength(20) |
| `department` | `string` | Không | @IsString() @MaxLength(100) |

#### `DELETE /users/:id`

- **Hàm xử lý:** `deactivate()` · **Guard:** JwtAuthGuard, RolesGuard, ForcePasswordChangeGuard · **Quyền:** Admin
- **Path params:** `id`
- **Mô tả:** Vô hiệu hóa tài khoản nhân viên (xóa mềm)

---

## Kết nối sàn (Marketplace Integration)

Nguồn: `src/modules/marketplace-integration/marketplace-integration.controller.ts`

Kết nối shop Lazada qua OAuth 2.0. Luồng: Admin gọi `connect` → nhận `authUrl` → trình duyệt sang Lazada đăng nhập/cấp quyền → Lazada chuyển hướng về `callback` (qua ngrok khi chạy local) → BE đổi `code` lấy token, **mã hóa AES-256-GCM** rồi lưu `marketplace_shops` → chuyển hướng về FE kèm `shopId`, `shopName`, `connected=true` hoặc `error=<mã lỗi>`.

**Trường hợp:** `state` sai/đã dùng/quá 10 phút → `MKT_OAUTH_STATE_INVALID`; sàn chưa có adapter (TikTok/Tiki) → `MKT_ADAPTER_NOT_REGISTERED`; Lazada từ chối code → `MKT_TOKEN_EXCHANGE_FAILED`. Callback **không dùng JWT** — bảo vệ bằng `state` một-lần-dùng.

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `GET` | `/marketplace/:platform/connect` | Admin | Tạo URL OAuth để Admin kết nối shop trên 1 sàn (tiktok \| lazada \| tiki) |
| 2 | `GET` | `/marketplace/:platform/callback` | Công khai | Endpoint sàn TỰ ĐỘNG gọi lại sau khi seller Authorize — do trình duyệt điều hướng tới, KHÔNG mang Bearer token, nên KHÔNG đặt JwtAuthGuard ở |

### Chi tiết từng endpoint

#### `GET /marketplace/:platform/connect`

- **Hàm xử lý:** `connect()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `platform`
- **Mô tả:** Tạo URL OAuth để Admin kết nối shop trên 1 sàn (tiktok \| lazada \| tiki)

#### `GET /marketplace/:platform/callback`

- **Hàm xử lý:** `callback()` · **Guard:** không · **Quyền:** Công khai (không cần token)
- **Phản hồi:** chuyển hướng (HTTP 302) về FE, không trả JSON
- **Path params:** `platform`
- **Mô tả:** Endpoint sàn TỰ ĐỘNG gọi lại sau khi seller Authorize — do trình duyệt điều hướng tới, KHÔNG mang Bearer token, nên KHÔNG đặt JwtAuthGuard ở đây (xem giải thích ở JSDoc class phía trên). Bảo mật dựa vào state một-lần-dùng. Redirect thẳng về FE (không trả JSON) — đúng spec FE đã chốt: thành công kèm shopId/shopName/connected=true, thất bại kèm error=<code>.

**Query** (`OAuthCallbackQueryDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `code` | `string` | Có | @IsString() @IsNotEmpty() |
| `state` | `string` | Có | @IsString() @IsNotEmpty() |
| `shop_id` | `string` | Không | @IsString() |

### Mã lỗi của module

| Mã | Ý nghĩa |
|---|---|
| `MKT_OAUTH_STATE_INVALID` | state OAuth không tồn tại / đã dùng / hết hạn (10 phút) |
| `MKT_ADAPTER_NOT_REGISTERED` | Sàn chưa có adapter (chỉ Lazada được đăng ký) |
| `MKT_SHOP_NOT_CONNECTED` | Shop chưa kết nối hoặc đã ngắt |
| `MKT_TOKEN_EXCHANGE_FAILED` | Đổi code lấy token thất bại |
| `MKT_TOKEN_REFRESH_FAILED` | Làm mới token sàn thất bại |
| `MKT_TOKEN_DECRYPT_FAILED` | (Khai báo nhưng chưa dùng) Giải mã token thất bại |
| `MKT_WEBHOOK_SIGNATURE_INVALID` | (Khai báo nhưng chưa dùng) Chữ ký webhook sai |
| `MKT_SHOP_LOOKUP_FAILED` | (Khai báo nhưng chưa dùng) |
| `MKT_SERVER_ERROR` | Lỗi không xác định trong callback OAuth |

---

## Đơn hàng (Orders)

Nguồn: `src/modules/orders/orders.controller.ts`

Đồng bộ và tra cứu đơn hàng sàn. Đồng bộ chạy **tự động 5 phút/lần** (`LazadaOrderSyncScheduler`) hoặc **thủ công** (`POST /orders/lazada/sync`). Mỗi đơn được upsert theo khóa `(platform, shop_id, platform_order_id)`, chuẩn hóa trạng thái, tính `consolidation_key` (băm thông tin người nhận) rồi **gộp vào nhóm đơn** ngay trong lượt đồng bộ.

**Trường hợp:** shop chưa kết nối → `MKT_SHOP_NOT_CONNECTED`; token sắp hết hạn → tự làm mới trước khi gọi; Lazada lỗi → `ORD_SYNC_FAILED`; danh sách đơn phân trang **cursor** (`before`, `limit` ≤ 100).

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `POST` | `/orders/lazada/sync` | Admin | Kích hoạt tay 1 lần đồng bộ đơn từ Lazada cho 1 shop đã kết nối — dùng để demo Mainflow 1 (GetOrders → GetOrderItems → chuẩn hóa → check gộp |
| 2 | `GET` | `/orders` | Admin, Store Owner | Danh sách đơn đã đồng bộ, phân trang kiểu cursor theo created_at |
| 3 | `GET` | `/orders/:id` | Admin, Store Owner | Chi tiết 1 đơn hàng, bao gồm sản phẩm (đã gộp theo SKU+trạng thái) và địa chỉ đầy đủ — dùng cho màn hình chi tiết đơn của FE |

### Chi tiết từng endpoint

#### `POST /orders/lazada/sync`

- **Hàm xử lý:** `syncLazada()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Mô tả:** Kích hoạt tay 1 lần đồng bộ đơn từ Lazada cho 1 shop đã kết nối — dùng để demo Mainflow 1 (GetOrders → GetOrderItems → chuẩn hóa → check gộp đơn → lưu Mongo)

**Query** (`SyncLazadaOrdersQueryDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `shop_id` | `string` | Có | @IsString() @IsNotEmpty() |

#### `GET /orders`

- **Hàm xử lý:** `list()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner
- **Mô tả:** Danh sách đơn đã đồng bộ, phân trang kiểu cursor theo created_at

**Query** (`ListOrdersQueryDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `shop_id` | `string` | Không | @IsString() |
| `status` | `OrderStatus` | Không | @IsEnum(OrderStatus) |
| `consolidated_group_id` | `string` | Không | @IsMongoId() |
| `before` | `string` | Không | @IsDateString() |
| `limit` | `number` | Không | @IsInt() @Min(1) @Max(100) |

#### `GET /orders/:id`

- **Hàm xử lý:** `findOne()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner
- **Path params:** `id`
- **Mô tả:** Chi tiết 1 đơn hàng, bao gồm sản phẩm (đã gộp theo SKU+trạng thái) và địa chỉ đầy đủ — dùng cho màn hình chi tiết đơn của FE

### Mã lỗi của module

| Mã | Ý nghĩa |
|---|---|
| `ORD_SYNC_FAILED` | Gọi Lazada GetOrders thất bại |
| `ORD_UNSUPPORTED_PLATFORM` | (Khai báo nhưng chưa dùng) |
| `ORD_INVALID_ORDER_ID` | ID đơn sai định dạng |
| `ORD_ORDER_NOT_FOUND` | Không tìm thấy đơn |

---

## Nhóm đơn & Fulfillment (Order Groups)

Nguồn: `src/modules/order-groups/order-groups.controller.ts`

Trung tâm vận hành kho. Mỗi nhóm đơn = các đơn cùng sàn, cùng người nhận → **1 thùng, 1 lần giao**. Mọi thao tác ghi đều yêu cầu `expected_version` (khóa phiên bản lạc quan) để hai nhân viên không ghi đè nhau → sai phiên bản trả `ORD_GROUP_STATE_CONFLICT` (409).

**Vòng đời:** `awaiting_packaging` (vừa tạo) → `picking` (tự chuyển ngay khi tạo, kèm tự phân công + giữ chỗ tồn) → `picked` → `pending_approval` (đã có gợi ý đóng gói) → `approved_for_packing` → `packed` → `shipped` → `delivered` / `returned`. Nhánh phụ: `picking` → `partial_needs_review` (báo thiếu hàng) → duyệt tiếp (`picked`) hoặc lấy lại (`awaiting_packaging`).

**Trường hợp quan trọng:** quét lấy vượt tồn ô → `ORD_GROUP_INSUFFICIENT_STOCK`; quét trùng `client_event_id` → bỏ qua (idempotent); nhóm hủy hết → `pack` trả `ORD_GROUP_ALL_ORDERS_CANCELED`; sau `pack`, BE báo "đã đóng gói" lên Lazada nếu cầu dao `LAZADA_WRITE_APIS_ENABLED=true`.

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `GET` | `/order-groups` | Warehouse Staff, Packaging Staff, Shipping Coordinator, Store Owner, Admin | Danh sách Order Group — lọc theo fulfillment_status để mỗi role thấy đúng hàng đợi của mình (VD Warehouse Staff lọc approved_for_packing để  |
| 2 | `GET` | `/order-groups/:id` | Warehouse Staff, Packaging Staff, Shipping Coordinator, Store Owner, Admin | Chi tiết 1 Order Group — đọc field "version" để dùng cho 5 API chuyển trạng thái bên dưới |
| 3 | `GET` | `/order-groups/:id/picking-list` | Warehouse Staff, Admin | Danh sách sản phẩm cần lấy cho 1 Order Group, kèm kích thước (đã cache từ Product Master) — dùng cho màn hình Warehouse Picking (Mobile App) |
| 4 | `GET` | `/order-groups/:id/picking-list/:sku` | Warehouse Staff, Admin | Chi tiết 1 món hàng riêng lẻ trong Order Group — dùng cho màn hình Stepper số lượng/confirm từng item trước khi quét. |
| 5 | `POST` | `/order-groups/:id/fulfillment/pick-item` | Warehouse Staff, Admin | Quét/nhập tay 1 SKU khi lấy hàng — trừ tồn kho ngay (atomic). |
| 6 | `POST` | `/order-groups/:id/fulfillment/report-missing` | Warehouse Staff, Admin | Báo thiếu hàng khi lấy (UC-07 Alt Flow) — group chuyển "partial_needs_review", DỪNG LẠI chờ Packaging Staff/Admin quyết định (Hướng Y), thôn |
| 7 | `POST` | `/order-groups/:id/fulfillment/decide-partial` | Packaging Staff, Admin | Quyết định group đang "partial_needs_review" — approve=true: tiếp tục với phần có sẵn (picked); approve=false: hủy, quay lại awaiting_packag |
| 8 | `POST` | `/order-groups/:id/fulfillment/pick` | Warehouse Staff, Admin | Xác nhận ĐÃ LẤY XONG toàn bộ hàng trong Order Group (approved_for_packing -> picked). |
| 9 | `POST` | `/order-groups/:id/fulfillment/pack` | Packaging Staff, Warehouse Staff, Admin | Xác nhận ĐÃ ĐÓNG GÓI xong (approved_for_packing -> packed). |
| 10 | ~~`POST`~~ | ~~`/order-groups/:id/lazada-pack/retry`~~ **ĐÃ BỎ 10/10/2026** | Packaging Staff, Warehouse Staff, Admin | 02/10/2026 — Gửi lại "đã đóng gói" lên Lazada cho nhóm đơn đang "packed" mà lần trước chưa thành công (failed / partial / disabled / chưa gử |
| 11 | `PATCH` | `/order-groups/:id/priority` | Store Owner, Admin | Đánh dấu đơn Hỏa Tốc/Bình thường — Lazada KHÔNG cung cấp tín hiệu tự động (đã xác minh bằng doc thật), Store Owner/Admin tự tay quyết định. |

### Chi tiết từng endpoint

#### `GET /order-groups`

- **Hàm xử lý:** `list()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Warehouse Staff, Packaging Staff, Shipping Coordinator, Store Owner, Admin
- **Mô tả:** Danh sách Order Group — lọc theo fulfillment_status để mỗi role thấy đúng hàng đợi của mình (VD Warehouse Staff lọc approved_for_packing để biết cần lấy hàng gì)

**Query** (`ListOrderGroupsQueryDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `fulfillment_status` | `GroupFulfillmentStatus` | Không | @IsEnum(GroupFulfillmentStatus) |
| `platform` | `MarketplacePlatform` | Không | @IsEnum(MarketplacePlatform) |
| `order_priority` | `'normal' \| 'express'` | Không | @IsIn(['normal', 'express']) |

#### `GET /order-groups/:id`

- **Hàm xử lý:** `findOne()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Warehouse Staff, Packaging Staff, Shipping Coordinator, Store Owner, Admin
- **Path params:** `id`
- **Mô tả:** Chi tiết 1 Order Group — đọc field "version" để dùng cho 5 API chuyển trạng thái bên dưới

#### `GET /order-groups/:id/picking-list`

- **Hàm xử lý:** `pickingList()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Warehouse Staff, Admin
- **Path params:** `id`
- **Mô tả:** Danh sách sản phẩm cần lấy cho 1 Order Group (đã bỏ đơn hủy/sự cố), kèm kích thước từ Product Master. Bản này **không có vị trí ô**; bản có ô và lộ trình là `GET /warehouse/:warehouseId/picking-list/:groupId`.

#### `GET /order-groups/:id/picking-list/:sku`

- **Hàm xử lý:** `pickingListItemDetail()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Warehouse Staff, Admin
- **Path params:** `id`, `sku`
- **Mô tả:** Chi tiết 1 món hàng riêng lẻ trong Order Group — dùng cho màn hình Stepper số lượng/confirm từng item trước khi quét.

#### `POST /order-groups/:id/fulfillment/pick-item`

- **Hàm xử lý:** `pickItem()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Warehouse Staff, Admin
- **Path params:** `id`
- **Mô tả:** Quét/nhập tay 1 SKU khi lấy hàng — trừ tồn kho ngay (atomic, trong 1 transaction cùng sổ cái `pick`, `pick_events` và tiêu giữ chỗ K5). Gọi NHIỀU LẦN, mỗi lần 1 SKU, TRƯỚC KHI bấm "pick" (xác nhận xong cả nhóm). Dùng `client_event_id` khi Mobile App offline-sync retry (chống trừ trùng).
- **Cách tìm dòng tồn để trừ:** cùng kho (`warehouse_id` đổi sang ObjectId) + đúng ô nếu gửi `bin_location_id` + đủ số lượng + một trong hai: (a) SKU đã nối → dòng gộp theo `master_sku`, **hoặc** dòng chưa gắn nhãn (`master_sku: null`) cùng sàn/shop có `seller_sku` trùng (không phân biệt hoa thường); (b) SKU chưa nối → dòng chưa gắn nhãn cùng sàn/shop có `seller_sku` trùng (không phân biệt hoa thường).
- 🔄 **07/10/2026:** (1) trước đây lọc `warehouse_id` bằng chuỗi nên luôn 409 `ORD_GROUP_INSUFFICIENT_STOCK` dù còn hàng — đã sửa (bản sửa của nhánh `feature/viet_befe`); (2) `pick_events.order_group_id` nay lưu ObjectId (trước lưu chuỗi khiến gợi ý đóng gói không đọc được số đã quét).

**Body** (`PickItemDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `sku` | `string` | Có | @IsString() |
| `scanned_quantity` | `number` | Có | @IsInt() @Min(1) |
| `scan_method` | `(typeof SCAN_METHODS)[number]` | Có | @IsIn(SCAN_METHODS) |
| `warehouse_id` | `string` | Có | @IsMongoId() |
| `client_event_id` | `string` | Không | @IsString() |
| `bin_location_id` | `string` | Không | @IsMongoId() |

#### `POST /order-groups/:id/fulfillment/report-missing`

- **Hàm xử lý:** `reportMissing()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Warehouse Staff, Admin
- **Path params:** `id`
- **Mô tả:** Báo thiếu hàng khi lấy (UC-07 Alt Flow) — group chuyển "partial_needs_review", DỪNG LẠI chờ Packaging Staff/Admin quyết định (Hướng Y), thông báo Store Owner ngay.

**Body** (`ReportMissingDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `sku` | `string` | Có | @IsString() |
| `missing_quantity` | `number` | Có | @IsInt() @Min(1) |
| `warehouse_id` | `string` | Có | @IsMongoId() |
| `note` | `string` | Không | @IsString() |
| `expected_version` | `number` | Có | @IsInt() @Min(0) |

#### `POST /order-groups/:id/fulfillment/decide-partial`

- **Hàm xử lý:** `decidePartial()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Packaging Staff, Admin
- **Path params:** `id`
- **Mô tả:** Quyết định group đang "partial_needs_review" — approve=true: tiếp tục với phần có sẵn (picked); approve=false: hủy, quay lại awaiting_packaging.

**Body** (`DecidePartialDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `approve` | `boolean` | Có | @IsBoolean() |
| `expected_version` | `number` | Có | @IsInt() @Min(0) |

#### `POST /order-groups/:id/fulfillment/pick`

- **Hàm xử lý:** `pick()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Warehouse Staff, Admin
- **Path params:** `id`
- **Mô tả:** Xác nhận ĐÃ LẤY XONG toàn bộ hàng trong Order Group (approved_for_packing -> picked). Warehouse Staff bấm sau khi soạn xong theo picking-list.

**Body** (`TransitionOrderGroupDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `expected_version` | `number` | Có | @IsInt() @Min(0) |

#### `POST /order-groups/:id/fulfillment/pack`

- **Hàm xử lý:** `pack()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Packaging Staff, Warehouse Staff, Admin
- **Path params:** `id`
- **Mô tả:** Xác nhận ĐÃ ĐÓNG GÓI xong (approved_for_packing -> packed). 🔄 (21/09/2026) mở thêm PACKAGING_STAFF — trước đây chỉ Warehouse+Admin, Packaging Staff bị 403 dù đúng người thực hiện đóng gói vật lý.

**Body** (`PackOrderGroupDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `expected_version` | `number` | Có | @IsInt() @Min(0) |
| `materials_used` | `MaterialUsedDto[]` | Không | @IsArray() @ArrayMaxSize(20) |

Trong đó `MaterialUsedDto`:

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `material_code` | `string` | Có | @IsString() @MaxLength(20) |
| `quantity` | `number` | Có | @IsInt() @Min(1) @Max(100) |
| `condition` | `'new' \| 'reused'` | Có | @IsIn(['new', 'reused']) |

#### ~~`POST /order-groups/:id/lazada-pack/retry`~~ — ĐÃ BỎ 10/10/2026 (OptiPack không ghi ngược lên Lazada)

- **Hàm xử lý:** `retryLazadaPack()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Packaging Staff, Warehouse Staff, Admin
- **Path params:** `id`
- **Mô tả:** 02/10/2026 — Gửi lại "đã đóng gói" lên Lazada cho nhóm đơn đang "packed" mà lần trước chưa thành công (failed / partial / disabled / chưa gửi). Không đổi trạng thái OptiPack.

#### `PATCH /order-groups/:id/priority`

- **Hàm xử lý:** `setPriority()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Store Owner, Admin
- **Path params:** `id`
- **Mô tả:** Đánh dấu đơn Hỏa Tốc/Bình thường — Lazada KHÔNG cung cấp tín hiệu tự động (đã xác minh bằng doc thật), Store Owner/Admin tự tay quyết định. Tự tính packaging_deadline theo giờ hành chính (8h-17h, tính cả Thứ 7).

**Body** (`SetPriorityDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `order_priority` | `(typeof PRIORITIES)[number]` | Có | @IsIn(PRIORITIES) |
| `deadline_hours` | `number` | Không | @IsInt() @Min(1) |

### Mã lỗi của module

| Mã | Ý nghĩa |
|---|---|
| `ORD_GROUP_INVALID_ID` | ID sai định dạng ObjectId |
| `ORD_GROUP_NOT_FOUND` | Không tìm thấy bản ghi |
| `ORD_GROUP_STATE_CONFLICT` | Rule #18 optimistic concurrency — version không khớp |
| `ORD_GROUP_INVALID_TRANSITION` | MỚI — chuyển trạng thái không hợp lệ theo allowed-status-transitions.ts |
| `ORD_GROUP_INSUFFICIENT_STOCK` | quantity_on_hand không đủ — FE nên gợi ý report-missing |
| `ORD_GROUP_ITEM_NOT_IN_GROUP` | SKU truyền vào không thuộc group này |
| `ORD_GROUP_ALL_ORDERS_CANCELED` | toàn bộ đơn trong group đã bị hủy, không còn gì để đóng gói/lấy hàng |
| `ORD_GROUP_LAZADA_PACK_NOT_ALLOWED` | Gửi lại Pack khi nhóm chưa packed hoặc đã gửi thành công |

---

## Giữ chỗ tồn kho (Stock Reservation)

Nguồn: `src/modules/order-groups/stock-availability.controller.ts`

Tồn khả dụng = `on_hand` (tổng tồn các ô) − `reserved` (đang giữ cho nhóm đơn chưa lấy). Khóa tồn (`stock_key`) là SKU nội bộ nếu SKU sàn đã nối, ngược lại là `platform:shop:seller_sku`. Nhóm thiếu hàng ngay khi giữ chỗ được gắn `stock_shortage` và gửi thông báo.

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `GET` | `/stock-availability` | Admin, Store Owner, Warehouse Staff | Tồn thực / đã giữ / khả dụng của 1 SKU sàn (tự tra SKU nội bộ nếu đã nối). |
| 2 | `GET` | `/order-groups/:id/stock-reservation` | Admin, Store Owner, Warehouse Staff | Chi tiết giữ chỗ của nhóm đơn theo từng SKU. |
| 3 | `POST` | `/order-groups/:id/stock-reservation/recheck` | Admin, Store Owner | Tính lại giữ chỗ (VD vừa nhập thêm hàng cho nhóm đơn đang thiếu). |
| 4 | `POST` | `/order-groups/:id/stock-reservation/release` | Admin | Nhả toàn bộ giữ chỗ của nhóm đơn (VD nhóm đơn bị hủy/treo). |

### Chi tiết từng endpoint

#### `GET /stock-availability`

- **Hàm xử lý:** `availability()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff
- **Mô tả:** Tồn thực / đã giữ / khả dụng của 1 SKU sàn (tự tra SKU nội bộ nếu đã nối). ?platform&shop_id&seller_sku

**Query:** `platform`, `shop_id`, `seller_sku`

#### `GET /order-groups/:id/stock-reservation`

- **Hàm xử lý:** `list()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff
- **Path params:** `id`
- **Mô tả:** Chi tiết giữ chỗ của nhóm đơn theo từng SKU.

#### `POST /order-groups/:id/stock-reservation/recheck`

- **Hàm xử lý:** `recheck()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner
- **Path params:** `id`
- **Mô tả:** Tính lại giữ chỗ (VD vừa nhập thêm hàng cho nhóm đơn đang thiếu).

#### `POST /order-groups/:id/stock-reservation/release`

- **Hàm xử lý:** `release()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `id`
- **Mô tả:** Nhả toàn bộ giữ chỗ của nhóm đơn (VD nhóm đơn bị hủy/treo).

---

## Phân công nhân viên (Staff Assignment)

Nguồn: `src/modules/order-groups/staff-assignment.controller.ts`

Tự động phân công **Least-Busy**: chọn Warehouse Staff đang có ít nhóm đơn chưa hoàn tất nhất; hòa thì chọn người được giao lâu nhất. Gán tay qua `POST /order-groups/:id/assign` (không truyền `staff_id` = tự động).

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `POST` | `/order-groups/:id/assign` | Admin, Warehouse Staff | Phân công Warehouse Staff cho 1 Order Group. |
| 2 | `GET` | `/order-groups/staff/search` | Admin, Warehouse Staff, Packaging Staff | Danh sách Warehouse Staff kèm số việc đang xử lý (workload real-time) — dùng cho màn hình chọn tay khi Admin/Warehouse Staff muốn đổi phân c |

### Chi tiết từng endpoint

#### `POST /order-groups/:id/assign`

- **Hàm xử lý:** `assign()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Warehouse Staff
- **Path params:** `id`
- **Mô tả:** Phân công Warehouse Staff cho 1 Order Group. Không truyền staff_id = tự động (Least-Busy, ít việc nhất). Truyền staff_id = đổi tay, ghi đè kết quả auto bất kỳ lúc nào.

**Body** (`AssignStaffDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `staff_id` | `string` | Không | @IsMongoId() |

#### `GET /order-groups/staff/search`

- **Hàm xử lý:** `searchStaff()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Warehouse Staff, Packaging Staff
- **Mô tả:** Danh sách Warehouse Staff kèm số việc đang xử lý (workload real-time) — dùng cho màn hình chọn tay khi Admin/Warehouse Staff muốn đổi phân công.

**Query:** `q`

### Mã lỗi của module

| Mã | Ý nghĩa |
|---|---|
| `ORD_GROUP_NO_STAFF_AVAILABLE` | Không có nhân viên đúng vai trò đang hoạt động |
| `ORD_GROUP_STAFF_NOT_FOUND` | Không tìm thấy nhân viên |
| `ORD_GROUP_STAFF_INACTIVE` | Nhân viên đã bị vô hiệu hóa / sai vai trò |

---

## Đề xuất đóng gói (Packaging)

Nguồn: `src/modules/packaging/packaging.controller.ts`

Sinh và duyệt gợi ý đóng gói cho nhóm đã lấy hàng (`picked`). Thuật toán hiện tại (`fallback-packaging.util.ts`): cộng thể tích × 1,1 (đệm an toàn 10%), chọn thùng nhỏ nhất trong 3 cỡ chuẩn (20×15×10, 35×25×20, 50×40×35 cm) chứa vừa; có hàng dễ vỡ → vật liệu `Bubble Wrap` ×2; phí ước tính = cân nặng × 15.000đ/kg.

**Trường hợp:** duyệt/điều chỉnh có cân thực tế lệch > 20% so với ước tính → gắn `is_abnormal` (hiện chưa gửi thông báo); từ chối → nhóm quay về `picked` và có thể sinh gợi ý mới; mỗi nhóm chỉ có **1 gợi ý đang hiệu lực** (index duy nhất có điều kiện).

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `GET` | `/order-groups/:groupId/packaging` | Packaging Staff, Warehouse Staff, Shipping Coordinator, Admin | Chi tiết PackagingRecommendation hiện tại của group (dù đã Approve/Adjust hay còn Pending) — trả null nếu chưa từng generate. |
| 2 | `POST` | `/order-groups/:groupId/packaging/generate` | Admin | [TẠM — chỉ Admin] Tạo PackagingRecommendation bằng thuật toán fallback, dùng để test UC-04 khi chưa có AI thật (Package 3). |
| 3 | `POST` | `/order-groups/:groupId/packaging/approve` | Packaging Staff, Admin | Duyệt gợi ý đóng gói đang chờ, kèm cân nặng THẬT đo được (UC-04 Approve). |
| 4 | `POST` | `/order-groups/:groupId/packaging/adjust` | Packaging Staff, Admin | Điều chỉnh gợi ý đóng gói (đổi box_size/material_type) rồi duyệt (UC-04 Adjust). |
| 5 | `POST` | `/order-groups/:groupId/packaging/reject` | Packaging Staff, Admin | Từ chối hoàn toàn gợi ý — Order Group quay lại chờ tính toán lại (UC-04 Reject). |

### Chi tiết từng endpoint

#### `GET /order-groups/:groupId/packaging`

- **Hàm xử lý:** `getCurrent()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Packaging Staff, Warehouse Staff, Shipping Coordinator, Admin
- **Path params:** `groupId`
- **Mô tả:** Chi tiết PackagingRecommendation hiện tại của group (dù đã Approve/Adjust hay còn Pending) — trả null nếu chưa từng generate.

#### `POST /order-groups/:groupId/packaging/generate`

- **Hàm xử lý:** `generate()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `groupId`
- **Mô tả:** [TẠM — chỉ Admin] Tạo PackagingRecommendation bằng thuật toán fallback, dùng để test UC-04 khi chưa có AI thật (Package 3).

#### `POST /order-groups/:groupId/packaging/approve`

- **Hàm xử lý:** `approve()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Packaging Staff, Admin
- **Path params:** `groupId`
- **Mô tả:** Duyệt gợi ý đóng gói đang chờ, kèm cân nặng THẬT đo được (UC-04 Approve).

**Body** (`ApprovePackagingDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `actual_measured_weight_kg` | `number` | Có | @IsNumber() @Min(0) |
| `expected_group_version` | `number` | Có | @IsNumber() @Min(0) |

#### `POST /order-groups/:groupId/packaging/adjust`

- **Hàm xử lý:** `adjust()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Packaging Staff, Admin
- **Path params:** `groupId`
- **Mô tả:** Điều chỉnh gợi ý đóng gói (đổi box_size/material_type) rồi duyệt (UC-04 Adjust).

**Body** (`AdjustPackagingDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `box_size` | `BoxSizeDto` | Có |  |
| `material_type` | `string` | Có | @IsString() |
| `adjustment_reason` | `(typeof ADJUSTMENT_REASONS)[number]` | Có | @IsIn(ADJUSTMENT_REASONS) |
| `adjustment_note` | `string` | Không | @IsString() |
| `actual_measured_weight_kg` | `number` | Có | @IsNumber() @Min(0) |
| `expected_group_version` | `number` | Có | @IsNumber() @Min(0) |

Trong đó `BoxSizeDto`:

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `length_cm` | `number` | Có | @IsNumber() @Min(1) |
| `width_cm` | `number` | Có | @IsNumber() @Min(1) |
| `height_cm` | `number` | Có | @IsNumber() @Min(1) |

#### `POST /order-groups/:groupId/packaging/reject`

- **Hàm xử lý:** `reject()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Packaging Staff, Admin
- **Path params:** `groupId`
- **Mô tả:** Từ chối hoàn toàn gợi ý — Order Group quay lại chờ tính toán lại (UC-04 Reject).

**Body** (`RejectPackagingDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `expected_group_version` | `number` | Có | @IsNumber() @Min(0) |
| `rejection_reason` | `string` | Có | @IsString() @MinLength(3) @MaxLength(500) |

### Mã lỗi của module

| Mã | Ý nghĩa |
|---|---|
| `PKG_INVALID_RECOMMENDATION_ID` | ID gợi ý sai định dạng |
| `PKG_RECOMMENDATION_NOT_FOUND` | Không tìm thấy gợi ý |
| `PKG_NO_ACTIVE_RECOMMENDATION` | group chưa có recommendation nào (chưa generate) |
| `PKG_ALREADY_DECIDED` | recommendation đã Approve/Adjust/Reject trước đó, không cho quyết định lại |
| `PKG_GROUP_NOT_PENDING_APPROVAL` | group không ở đúng trạng thái pending_approval khi Approve/Adjust/Reject |

---

## Vật liệu đóng gói (Packaging Materials)

Nguồn: `src/modules/packaging-materials/packaging-materials.controller.ts`

Danh mục thùng/vật liệu đệm có đơn giá; tồn tách 3 ngăn: **mới** (`qty_new`), **tái sử dụng** (`qty_reused`), **nội bộ** (`qty_internal`). Tự trừ khi `pack` (ưu tiên tái sử dụng, hàng dễ vỡ chỉ dùng thùng mới), tự thu hồi khi kiểm hàng hoàn (hạng A/B/C), mọi biến động ghi `packaging_movements`.

**Trường hợp:** thùng thiếu kích thước / đệm thiếu `match_material_type` → `PKG_MATERIAL_INVALID_DEFINITION`; vô hiệu hóa khi còn tồn → `PKG_MATERIAL_HAS_STOCK`; thu hồi hạng A chưa gỡ nhãn cũ → `PKG_OLD_LABEL_NOT_REMOVED`; xuất nội bộ vượt tồn → `PKG_INSUFFICIENT_INTERNAL`.

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `GET` | `/packaging-materials` | Admin, Store Owner, Warehouse Staff, Packaging Staff | Danh mục vật liệu kèm tồn MỚI / TÁI SỬ DỤNG. |
| 2 | `GET` | `/packaging-materials/savings` | Admin, Store Owner | Tổng tiền tiết kiệm nhờ tái sử dụng + tỷ lệ dùng lại (cho Dashboard). |
| 3 | `GET` | `/packaging-materials/movements` | Admin, Store Owner, Warehouse Staff, Packaging Staff | Sổ cái vật liệu (mới -> cũ). |
| 4 | `GET` | `/packaging-materials/:code` | Admin, Store Owner, Warehouse Staff, Packaging Staff | Chi tiết 1 vật liệu kèm tồn mới/tái sử dụng/nội bộ. |
| 5 | `POST` | `/packaging-materials` | Admin | Khai vật liệu. |
| 6 | `PATCH` | `/packaging-materials/:code` | Admin | Sửa tên / đơn giá / tái sử dụng / số lần tối đa. |
| 7 | `DELETE` | `/packaging-materials/:code` | Admin | Vô hiệu hóa (chặn nếu còn tồn). |
| 8 | `POST` | `/packaging-materials/:code/reactivate` | Admin | Kích hoạt lại vật liệu. |
| 9 | `POST` | `/packaging-materials/:code/purchase` | Admin, Warehouse Staff | Nhập vật liệu MỚI (ghi sổ cái). |
| 10 | `POST` | `/packaging-materials/:code/internal-use` | Admin, Warehouse Staff | Xuất vật liệu hạng B để dùng nội bộ (ghi sổ cái kèm mục đích). |

### Chi tiết từng endpoint

#### `GET /packaging-materials`

- **Hàm xử lý:** `list()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff, Packaging Staff
- **Mô tả:** Danh mục vật liệu kèm tồn MỚI / TÁI SỬ DỤNG. ?include_inactive=true

**Query:** `include_inactive`

#### `GET /packaging-materials/savings`

- **Hàm xử lý:** `savings()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner
- **Mô tả:** Tổng tiền tiết kiệm nhờ tái sử dụng + tỷ lệ dùng lại (cho Dashboard).

#### `GET /packaging-materials/movements`

- **Hàm xử lý:** `movements()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff, Packaging Staff
- **Mô tả:** Sổ cái vật liệu (mới -> cũ). ?material_code=BOX-M&limit=100

**Query:** `material_code`, `limit`

#### `GET /packaging-materials/:code`

- **Hàm xử lý:** `get()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff, Packaging Staff
- **Path params:** `code`
- **Mô tả:** Chi tiết 1 vật liệu kèm tồn mới/tái sử dụng/nội bộ.

#### `POST /packaging-materials`

- **Hàm xử lý:** `create()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Mô tả:** Khai vật liệu. Thùng: đủ 3 cạnh (khớp gợi ý đóng gói). Đệm: match_material_type.

**Body** (`CreatePackagingMaterialDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `code` | `string` | Có | @Matches(/^[A-Z0-9-]{2,20}$/) |
| `name` | `string` | Có | @IsString() @MinLength(2) @MaxLength(120) |
| `kind` | `'box' \| 'cushioning'` | Có | @IsIn(['box', 'cushioning']) |
| `length_cm` | `number` | Không | @IsNumber() @Min(1) @Max(500) |
| `width_cm` | `number` | Không | @IsNumber() @Min(1) @Max(500) |
| `height_cm` | `number` | Không | @IsNumber() @Min(1) @Max(500) |
| `match_material_type` | `string` | Không | @IsString() @MaxLength(60) |
| `unit_cost_vnd` | `number` | Có | @IsInt() @Min(0) @Max(10_000_000) |
| `reusable` | `boolean` | Không | @IsBoolean() |
| `max_reuse_cycles` | `number` | Không | @IsInt() @Min(1) @Max(20) |

#### `PATCH /packaging-materials/:code`

- **Hàm xử lý:** `update()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `code`
- **Mô tả:** Sửa tên / đơn giá / tái sử dụng / số lần tối đa. KHÔNG sửa mã, loại, kích thước.

**Body** (`UpdatePackagingMaterialDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `name` | `string` | Không | @IsString() @MinLength(2) @MaxLength(120) |
| `unit_cost_vnd` | `number` | Không | @IsInt() @Min(0) @Max(10_000_000) |
| `reusable` | `boolean` | Không | @IsBoolean() |
| `max_reuse_cycles` | `number` | Không | @IsInt() @Min(1) @Max(20) |

#### `DELETE /packaging-materials/:code`

- **Hàm xử lý:** `deactivate()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `code`
- **Mô tả:** Vô hiệu hóa (chặn nếu còn tồn).

#### `POST /packaging-materials/:code/reactivate`

- **Hàm xử lý:** `reactivate()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `code`
- **Mô tả:** Kích hoạt lại vật liệu.

#### `POST /packaging-materials/:code/purchase`

- **Hàm xử lý:** `purchase()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Warehouse Staff
- **Path params:** `code`
- **Mô tả:** Nhập vật liệu MỚI (ghi sổ cái).

**Body** (`PurchasePackagingDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `quantity` | `number` | Có | @IsInt() @Min(1) @Max(1_000_000) |
| `note` | `string` | Không | @IsString() @MaxLength(500) |

#### `POST /packaging-materials/:code/internal-use`

- **Hàm xử lý:** `internalUse()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Warehouse Staff
- **Path params:** `code`
- **Mô tả:** Xuất vật liệu hạng B để dùng nội bộ (ghi sổ cái kèm mục đích).

**Body** (`InternalUseDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `quantity` | `number` | Có | @IsInt() @Min(1) @Max(100000) |
| `purpose` | `string` | Có | @IsString() @MinLength(3) @MaxLength(300) |

### Mã lỗi của module

| Mã | Ý nghĩa |
|---|---|
| `PKG_MATERIAL_NOT_FOUND` | Không tìm thấy bản ghi |
| `PKG_MATERIAL_CODE_IN_USE` | Mã đã tồn tại |
| `PKG_MATERIAL_INVALID_DEFINITION` | thùng thiếu kích thước / đệm thiếu match_material_type |
| `PKG_MATERIAL_INACTIVE` | Bản ghi đã bị vô hiệu hóa |
| `PKG_MATERIAL_NOTHING_TO_UPDATE` | Body không có trường nào để cập nhật |
| `PKG_MATERIAL_HAS_STOCK` | vô hiệu hóa khi còn tồn |
| `PKG_OLD_LABEL_NOT_REMOVED` | xếp hạng A mà chưa gỡ nhãn cũ |
| `PKG_MATERIAL_NOT_REUSABLE` | xếp hạng A cho vật liệu không tái sử dụng được |
| `PKG_INSUFFICIENT_INTERNAL` | xuất dùng nội bộ vượt tồn hạng B |

---

## Thông số sản phẩm (Product Master)

Nguồn: `src/modules/product-master/product-master.controller.ts`

Kích thước/cân nặng đóng gói của từng SKU sàn — đầu vào của thuật toán đóng gói. 🔄 **Từ 04/10/2026** đồng bộ theo **danh sách sản phẩm của shop** (Lazada `GetProducts`, `filter=all`), không còn chỉ theo SKU đã có trong đơn: cron **mỗi giờ** lấy sản phẩm thay đổi từ mốc `marketplace_shops.last_product_synced_at` (trừ lùi 10 phút), cron **3:00 sáng** lấy toàn bộ; Admin gọi đồng bộ ngay bằng `POST /product-master/sync`. SKU cũ không bị xóa. Admin/Store Owner có thể sửa tay (`manual_override=true` → lần đồng bộ sau không ghi đè) và gỡ sửa tay để quay về dữ liệu sàn.

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `GET` | `/product-master` | Admin, Store Owner, Packaging Staff | 🆕 K1 — Danh sách sản phẩm (kích thước/cân nặng dùng cho gợi ý đóng gói). |
| 2 | `GET` | `/product-master/:id` | Admin, Store Owner, Packaging Staff | 🆕 K1 — Chi tiết 1 sản phẩm. |
| 3 | `PATCH` | `/product-master/:id` | Admin, Store Owner | 🆕 K1 — Sửa tay kích thước/cân nặng/dễ vỡ. |
| 4 | `DELETE` | `/product-master/:id/manual-override` | Admin, Store Owner | 🆕 K2 — Bỏ sửa tay: lần đồng bộ kế tiếp sẽ lấy lại số liệu Lazada. |
| 5 | `POST` | `/product-master/sync` | Admin | 🆕 04/10/2026 — Đồng bộ ngay danh sách sản phẩm từ Lazada (`?shop_id`, `?full=true`). |

### Chi tiết từng endpoint

#### `GET /product-master`

- **Hàm xử lý:** `list()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Packaging Staff
- **Mô tả:** 🆕 K1 — Danh sách sản phẩm (kích thước/cân nặng dùng cho gợi ý đóng gói).

**Query:** `shop_id`, `search`, `manual_only`, `page`, `limit`

#### `GET /product-master/:id`

- **Hàm xử lý:** `get()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Packaging Staff
- **Path params:** `id`
- **Mô tả:** 🆕 K1 — Chi tiết 1 sản phẩm.

#### `PATCH /product-master/:id`

- **Hàm xử lý:** `update()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner
- **Path params:** `id`
- **Mô tả:** 🆕 K1 — Sửa tay kích thước/cân nặng/dễ vỡ. Sau khi sửa, cron đồng bộ KHÔNG ghi đè nữa (manualOverride=true).

**Body** (`UpdateProductMasterDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `package_length_cm` | `number` | Không | @IsNumber() @Min(0.1) @Max(500) |
| `package_width_cm` | `number` | Không | @IsNumber() @Min(0.1) @Max(500) |
| `package_height_cm` | `number` | Không | @IsNumber() @Min(0.1) @Max(500) |
| `package_weight_kg` | `number` | Không | @IsNumber() @Min(0.001) @Max(200) |
| `is_fragile` | `boolean` | Không | @IsBoolean() |

#### `DELETE /product-master/:id/manual-override`

- **Hàm xử lý:** `clearManualOverride()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner
- **Path params:** `id`
- **Mô tả:** 🆕 K2 — Bỏ sửa tay: lần đồng bộ kế tiếp sẽ lấy lại số liệu Lazada. Số hiện tại giữ nguyên tới lúc đó.

#### `POST /product-master/sync`

- **Hàm xử lý:** `syncNow()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Mô tả:** 🆕 04/10/2026 — Đồng bộ NGAY danh sách sản phẩm từ Lazada vào Product Master (không chờ cron mỗi giờ). Dùng sau khi thêm sản phẩm hoặc đổi mã SKU trên Seller Center. Mặc định chỉ lấy sản phẩm thay đổi từ lần đồng bộ trước (lần đầu của shop lấy toàn bộ); `full=true` lấy toàn bộ. Bỏ `shop_id` = mọi shop Lazada đang kết nối (lỗi 1 shop không chặn shop khác). Lấy theo trang 50, dừng ở giới hạn offset 10.000 của Lazada; chưa quét hết thì không ghi mốc để lần sau quét lại.

**Query:** `shop_id` (không bắt buộc), `full` (`true` = toàn bộ)

**Response 201:**
```json
{ "results": [ { "ok": true, "shopId": "201171264532", "mode": "incremental", "since": "2026-10-04T08:50:00.000Z", "products": 12, "synced": 15, "complete": true } ] }
```
Shop lỗi: `{ "ok": false, "shopId": "...", "error": "..." }`. Ngày gửi Lazada định dạng `YYYY-MM-DDTHH:mm:ss+0000` (GetProducts không nhận dạng `toISOString()` — lỗi `E017 Invalid Date Format` đã gặp thật 04/10).

### Mã lỗi của module

| Mã | Ý nghĩa |
|---|---|
| `PM_NOT_FOUND` | Không tìm thấy Product Master |
| `PM_INVALID_ID` | ID sai định dạng |
| `PM_NOTHING_TO_UPDATE` | Không có trường để cập nhật |

---

## Kho hàng (Warehouse)

Nguồn: `src/modules/warehouse/warehouse.controller.ts`

Cấu trúc kho **Kho → Khu → Kệ/Ô** và tồn kho theo ô. Mã ô 5 phần `KA-D1-P02-T03-1` (Khu–Dãy–Mặt+Kệ–Tầng–Ô). Một SKU có thể nằm nhiều ô (`sku_bin_assignments`). Mọi thay đổi tồn ghi **sổ cái bất biến** `inventory_movements` (`receive`, `adjust`, `transfer_out/in`, `pick`, `return_restock`...).

**Phân quyền:** route **cấu hình** (tạo/sửa/tắt kho, khu, kệ, gán SKU) chỉ Admin; route **vận hành** (xem ô, tồn theo ô, nhập hàng, kiểm kê, chuyển ô, gợi ý ô, Picking List) mở thêm Warehouse Staff.

**Trường hợp:** vượt sức chứa ô → `WH_BIN_OVER_CAPACITY` (gửi lại `force: true` để chấp nhận); kiểm kê lệch cần ghi chú → `WH_NOTE_REQUIRED`; tắt kho/khu/ô còn hàng → `WH_HAS_STOCK`; tồn bị thay đổi song song → `WH_STOCK_CHANGED`.

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `POST` | `/warehouse/warehouses` | Admin | Tạo kho mới (bước 1/4 trong luồng "add kho") |
| 2 | `GET` | `/warehouse/warehouses` | Admin, Warehouse Staff | Danh sách kho. |
| 3 | `POST` | `/warehouse/warehouses/:warehouseId/zones` | Admin | Tạo khu trong 1 kho (bước 2/4) |
| 4 | `GET` | `/warehouse/warehouses/:warehouseId/zones` | Admin, Warehouse Staff | Danh sách khu trong 1 kho |
| 5 | `GET` | `/warehouse/zones/:zoneId/bin-locations` | Admin | BỔ SUNG (16/09/2026, báo cáo Hải Phượng) — Danh sách kệ đã tạo trong 1 khu. |
| 6 | `GET` | `/warehouse/warehouses/:warehouseId/bin-locations` | Admin, Warehouse Staff | BỔ SUNG (16/09/2026) — Danh sách TOÀN BỘ kệ trong 1 kho (mọi khu gộp lại). |
| 7 | `GET` | `/warehouse/warehouses/:warehouseId/sku-bin-assignments` | Admin, Warehouse Staff | BỔ SUNG (16/09/2026, báo cáo Hải Phượng) — Danh sách SKU đã gán vị trí trong 1 kho, để Admin xem lại/đối chiếu sau khi gán (trước đây chỉ GE |
| 8 | `POST` | `/warehouse/zones/:zoneId/bin-locations/generate` | Admin | Tạo HÀNG LOẠT kệ trong 1 khu theo dãy (bước 3/4) — VD aisle=03, rack 1-10, level 1-4 -> tự sinh 40 kệ, không cần tạo tay từng cái. |
| 9 | `POST` | `/warehouse/warehouses/:warehouseId/sku-bin-assignments` | Admin | Gán 1 SKU vào 1 kệ cụ thể (bước 4/4) |
| 10 | `POST` | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock` | Admin, Warehouse Staff | Nhập thêm hàng vào 1 vị trí đã gán (cộng dồn quantity_on_hand, không reset về giá trị mới). |
| 11 | `GET` | `/warehouse/sku-bin-assignments/unassigned` | Admin | Danh sách SKU đã có trong Product Master nhưng CHƯA được gán vị trí kệ — Admin chỉ cần mở đúng màn hình này mỗi khi có sản phẩm mới, không p |
| 12 | `GET` | `/warehouse/:warehouseId/picking-list/:groupId` | Warehouse Staff, Admin | Picking List CÓ vị trí kệ thật, đã sắp xếp theo lộ trình vật lý trong kho (wave picking) — dùng cho màn hình Warehouse Picking (Mobile App). |
| 13 | `GET` | `/warehouse/warehouses/:warehouseId` | Admin, Warehouse Staff | 🆕 K1 — Chi tiết 1 kho (kể cả đã vô hiệu hóa). |
| 14 | `PATCH` | `/warehouse/warehouses/:warehouseId` | Admin | 🆕 K1 — Sửa tên/địa chỉ kho. |
| 15 | `DELETE` | `/warehouse/warehouses/:warehouseId` | Admin | 🆕 K1 — Vô hiệu hóa kho (xóa mềm). |
| 16 | `POST` | `/warehouse/warehouses/:warehouseId/reactivate` | Admin | 🆕 K1 — Kích hoạt lại kho. |
| 17 | `PATCH` | `/warehouse/zones/:zoneId` | Admin | 🆕 K1 — Sửa tên/mô tả khu. |
| 18 | `DELETE` | `/warehouse/zones/:zoneId` | Admin | 🆕 K1 — Vô hiệu hóa khu + toàn bộ kệ trong khu. |
| 19 | `POST` | `/warehouse/zones/:zoneId/reactivate` | Admin | 🆕 K1 — Kích hoạt lại khu + toàn bộ kệ trong khu. |
| 20 | `DELETE` | `/warehouse/bin-locations/:binId` | Admin | 🆕 K1 — Vô hiệu hóa 1 kệ. |
| 21 | `POST` | `/warehouse/bin-locations/:binId/reactivate` | Admin | 🆕 K1 — Kích hoạt lại 1 kệ. |
| 22 | `POST` | `/warehouse/zones/:zoneId/racks` | Admin | 🆕 K2 — Tạo 1 kệ chuẩn mới (mã KA-D1-P02-T03-1) + toàn bộ ô, mỗi tầng 1 size, mỗi ô 1 màu. |
| 23 | `PATCH` | `/warehouse/bin-locations/:binId` | Admin | 🆕 K2 — Sửa sức chứa + danh mục/size/màu đăng ký của 1 ô. |
| 24 | `GET` | `/warehouse/warehouses/:warehouseId/bin-suggestions` | Admin, Warehouse Staff | 🆕 K2 — Gợi ý ô xếp hàng theo danh mục (bắt buộc), size, màu. |
| 25 | `POST` | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/adjust` | Admin, Warehouse Staff | 🆕 K3 — Kiểm kê: nhập số đếm thực tế, hệ thống tự tính chênh lệch + ghi sổ cái (bắt buộc lý do). |
| 26 | `POST` | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/transfer` | Admin, Warehouse Staff | 🆕 K3 — Chuyển hàng sang ô khác cùng kho (trừ nguồn + cộng đích + 2 dòng sổ cái, 1 transaction). |
| 27 | `DELETE` | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId` | Admin | 🆕 K3 — Bỏ gán SKU khỏi ô (chỉ khi tồn = 0). |
| 28 | `GET` | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/movements` | Admin, Warehouse Staff, Store Owner | 🆕 K3 — Sổ cái của 1 SKU trên 1 ô (mới -> cũ): nhập, lấy, kiểm kê, chuyển, hoàn. |

### Chi tiết từng endpoint

#### `POST /warehouse/warehouses`

- **Hàm xử lý:** `createWarehouse()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Mô tả:** Tạo kho mới (bước 1/4 trong luồng "add kho")

**Body** (`CreateWarehouseDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `warehouse_code` | `string` | Có | @IsString() @MinLength(1) |
| `warehouse_name` | `string` | Có | @IsString() @MinLength(1) |
| `address` | `string` | Có | @IsString() @MinLength(1) |

#### `GET /warehouse/warehouses`

- **Hàm xử lý:** `listWarehouses()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Warehouse Staff
- **Mô tả:** Danh sách kho. 🔄 SỬA (19/09/2026, báo cáo Hải Phượng) — mở thêm cho Warehouse Staff: trước đây CHỈ Admin xem được, nhưng picking-list/pick-item/report-missing đều BẮT BUỘC warehouse_id — Warehouse Staff không có cách nào (qua API) biết warehouse_id nào để dùng nếu route này vẫn khóa Admin-only.

**Query:** `include_inactive`

#### `POST /warehouse/warehouses/:warehouseId/zones`

- **Hàm xử lý:** `createZone()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `warehouseId`
- **Mô tả:** Tạo khu trong 1 kho (bước 2/4)

**Body** (`CreateZoneDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `zone_code` | `string` | Có | @Matches(/^K[A-Z]$/) |
| `zone_name` | `string` | Có | @IsString() @MinLength(1) |
| `description` | `string` | Không | @IsString() |

#### `GET /warehouse/warehouses/:warehouseId/zones`

- **Hàm xử lý:** `listZones()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Warehouse Staff
- **Path params:** `warehouseId`
- **Mô tả:** Danh sách khu trong 1 kho

**Query:** `include_inactive`

#### `GET /warehouse/zones/:zoneId/bin-locations`

- **Hàm xử lý:** `listBinLocationsByZone()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `zoneId`
- **Mô tả:** BỔ SUNG (16/09/2026, báo cáo Hải Phượng) — Danh sách kệ đã tạo trong 1 khu. Trước đây chỉ có POST .../generate để TẠO, không có cách XEM LẠI.

**Query:** `include_inactive`

#### `GET /warehouse/warehouses/:warehouseId/bin-locations`

- **Hàm xử lý:** `listBinLocationsByWarehouse()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Warehouse Staff
- **Path params:** `warehouseId`
- **Mô tả:** BỔ SUNG (16/09/2026) — Danh sách TOÀN BỘ kệ trong 1 kho (mọi khu gộp lại).

**Query:** `include_inactive`

#### `GET /warehouse/warehouses/:warehouseId/sku-bin-assignments`

- **Hàm xử lý:** `listSkuBinAssignmentsByWarehouse()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Warehouse Staff
- **Path params:** `warehouseId`
- **Mô tả:** BỔ SUNG (16/09/2026, báo cáo Hải Phượng) — Danh sách SKU đã gán vị trí trong 1 kho, để Admin xem lại/đối chiếu sau khi gán (trước đây chỉ GET được danh sách CHƯA gán, không GET được danh sách ĐÃ gán).

#### `POST /warehouse/zones/:zoneId/bin-locations/generate`

- **Hàm xử lý:** `generateBinLocations()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `zoneId`
- **Mô tả:** Tạo HÀNG LOẠT kệ trong 1 khu theo dãy (bước 3/4) — VD aisle=03, rack 1-10, level 1-4 -> tự sinh 40 kệ, không cần tạo tay từng cái.

**Body** (`GenerateBinLocationsDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `aisle` | `string` | Có | @IsString() |
| `rack_from` | `number` | Có | @IsInt() @Min(1) |
| `rack_to` | `number` | Có | @IsInt() @Min(1) |
| `level_from` | `number` | Có | @IsInt() @Min(1) |
| `level_to` | `number` | Có | @IsInt() @Min(1) |

#### `POST /warehouse/warehouses/:warehouseId/sku-bin-assignments`

- **Hàm xử lý:** `assignSkuToBin()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `warehouseId`
- **Mô tả:** Gán 1 SKU vào 1 kệ cụ thể (bước 4/4)

**Body** (`AssignSkuBinDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `platform` | `MarketplacePlatform` | Có | @IsEnum(MarketplacePlatform) |
| `shop_id` | `string` | Có | @IsString() |
| `seller_sku` | `string` | Có | @IsString() |
| `bin_location_id` | `string` | Có | @IsMongoId() |
| `initial_quantity` | `number` | Không | @IsInt() @Min(0) |
| `force` | `boolean` | Không | @IsBoolean() |

#### `POST /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock`

- **Hàm xử lý:** `restockSku()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Warehouse Staff
- **Path params:** `warehouseId`, `assignmentId`
- **Mô tả:** Nhập thêm hàng vào 1 vị trí đã gán (cộng dồn quantity_on_hand, không reset về giá trị mới). Kiểm tra sức chứa ô (vượt → 409 `WH_BIN_OVER_CAPACITY`, gửi lại kèm `force: true`); cộng tồn + ghi sổ cái `receive` trong 1 transaction.
- 🔄 **07/10/2026 — SỬA LỖI:** trước đây truy vấn dòng tồn bằng `warehouse_id` dạng chuỗi nên **luôn trả 404** "Không tìm thấy sku_bin_assignment" dù dòng tồn có thật. Nay tìm đúng. Request/response không đổi.

**Body** (`RestockSkuDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `quantity` | `number` | Có | @IsInt() @Min(1) |
| `force` | `boolean` | Không | @IsBoolean() |

#### `GET /warehouse/sku-bin-assignments/unassigned`

- **Hàm xử lý:** `findUnassignedSkus()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Mô tả:** Danh sách SKU đã có trong Product Master nhưng CHƯA được gán vị trí kệ — Admin chỉ cần mở đúng màn hình này mỗi khi có sản phẩm mới, không phải dò tay.

#### `GET /warehouse/:warehouseId/picking-list/:groupId`

- **Hàm xử lý:** `pickingList()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Warehouse Staff, Admin
- **Path params:** `warehouseId`, `groupId`
- **Mô tả:** Picking List CÓ vị trí kệ thật, đã sắp xếp theo lộ trình vật lý trong kho (wave picking) — dùng cho màn hình Warehouse Picking (Mobile App). Mỗi dòng: `sku`, `quantity`, `master_sku`, `bin_code`, `bin_location_id`, `other_bins` (các ô khác còn hàng). Không tìm được dòng tồn → `bin_code: "CHƯA GÁN VỊ TRÍ"`, `bin_location_id: null`.
- **Cách tìm dòng tồn:** cùng kho; SKU chưa nối → dòng chưa gắn nhãn cùng sàn/shop, `seller_sku` trùng (không phân biệt hoa thường); SKU đã nối → ưu tiên dòng gộp theo `master_sku`, nếu không có thì dùng dòng chưa gắn nhãn cùng sàn/shop (trường hợp Admin nhập tồn trước khi chạy `POST /master-skus/sync-stock`).
- 🔄 **07/10/2026:** trước đây truy vấn `warehouse_id` dạng chuỗi nên trả "CHƯA GÁN VỊ TRÍ" dù dữ liệu đúng — đã sửa (nhánh `feature/viet_befe`). Phần tìm thêm dòng chưa gắn nhãn và bỏ phân biệt hoa thường cũng từ nhánh này.

#### `GET /warehouse/warehouses/:warehouseId`

- **Hàm xử lý:** `getWarehouse()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Warehouse Staff
- **Path params:** `warehouseId`
- **Mô tả:** 🆕 K1 — Chi tiết 1 kho (kể cả đã vô hiệu hóa).

#### `PATCH /warehouse/warehouses/:warehouseId`

- **Hàm xử lý:** `updateWarehouse()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `warehouseId`
- **Mô tả:** 🆕 K1 — Sửa tên/địa chỉ kho. KHÔNG sửa được warehouse_code.

**Body** (`UpdateWarehouseDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `warehouse_name` | `string` | Không | @IsString() @MinLength(2) @MaxLength(120) |
| `address` | `string` | Không | @IsString() @MinLength(5) @MaxLength(255) |

#### `DELETE /warehouse/warehouses/:warehouseId`

- **Hàm xử lý:** `deactivateWarehouse()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `warehouseId`
- **Mô tả:** 🆕 K1 — Vô hiệu hóa kho (xóa mềm). Chặn 409 WH_HAS_STOCK nếu còn hàng. Tự vô hiệu hóa toàn bộ khu + kệ bên trong.

#### `POST /warehouse/warehouses/:warehouseId/reactivate`

- **Hàm xử lý:** `reactivateWarehouse()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `warehouseId`
- **Mô tả:** 🆕 K1 — Kích hoạt lại kho. CHỈ kho — các khu vẫn tắt, Admin bật lại từng khu.

#### `PATCH /warehouse/zones/:zoneId`

- **Hàm xử lý:** `updateZone()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `zoneId`
- **Mô tả:** 🆕 K1 — Sửa tên/mô tả khu. KHÔNG sửa được zone_code (đã nằm trong mã kệ in trên nhãn).

**Body** (`UpdateZoneDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `zone_name` | `string` | Không | @IsString() @MinLength(2) @MaxLength(120) |
| `description` | `string` | Không | @IsString() @MaxLength(500) |

#### `DELETE /warehouse/zones/:zoneId`

- **Hàm xử lý:** `deactivateZone()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `zoneId`
- **Mô tả:** 🆕 K1 — Vô hiệu hóa khu + toàn bộ kệ trong khu. Chặn 409 nếu còn hàng.

#### `POST /warehouse/zones/:zoneId/reactivate`

- **Hàm xử lý:** `reactivateZone()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `zoneId`
- **Mô tả:** 🆕 K1 — Kích hoạt lại khu + toàn bộ kệ trong khu. Kho phải đang hoạt động.

#### `DELETE /warehouse/bin-locations/:binId`

- **Hàm xử lý:** `deactivateBin()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `binId`
- **Mô tả:** 🆕 K1 — Vô hiệu hóa 1 kệ. Chặn 409 nếu kệ còn hàng.

#### `POST /warehouse/bin-locations/:binId/reactivate`

- **Hàm xử lý:** `reactivateBin()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `binId`
- **Mô tả:** 🆕 K1 — Kích hoạt lại 1 kệ. Khu chứa kệ phải đang hoạt động.

#### `POST /warehouse/zones/:zoneId/racks`

- **Hàm xử lý:** `createRack()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `zoneId`
- **Mô tả:** 🆕 K2 — Tạo 1 kệ chuẩn mới (mã KA-D1-P02-T03-1) + toàn bộ ô, mỗi tầng 1 size, mỗi ô 1 màu. Thay thế dần endpoint generate cũ.

**Body** (`CreateRackDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `aisle` | `string` | Có | @Matches(/^D([1-9][0-9]?)$/) |
| `side` | `'T' \| 'P'` | Có | @IsIn(SIDE_VALUES) |
| `bay` | `number` | Có | @IsInt() @Min(1) @Max(LAYOUT_LIMITS.MAX_BAY) |
| `category_code` | `string` | Có | @Matches(/^[A-Z0-9]{2,12}$/) |
| `tiers` | `RackTierDto[]` | Có | @IsArray() @ArrayMinSize(1) @ArrayMaxSize(LAYOUT_LIMITS.MAX_TIER) |
| `cells_per_tier` | `number` | Có | @IsInt() @Min(1) @Max(LAYOUT_LIMITS.MAX_CELL) |
| `cell_colors` | `string[]` | Không | @IsArray() @ArrayMaxSize(LAYOUT_LIMITS.MAX_CELL) @Matches(/^[A-Z0-9]{2,10}$/, { each: true }) |
| `capacity_per_cell` | `number` | Không | @IsInt() @Min(1) @Max(100000) |

Trong đó `RackTierDto`:

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `tier` | `number` | Có | @IsInt() @Min(1) @Max(LAYOUT_LIMITS.MAX_TIER) |
| `size` | `string` | Có | @IsString() |

#### `PATCH /warehouse/bin-locations/:binId`

- **Hàm xử lý:** `updateBin()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `binId`
- **Mô tả:** 🆕 K2 — Sửa sức chứa + danh mục/size/màu đăng ký của 1 ô. KHÔNG sửa được mã ô.

**Body** (`UpdateBinDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `capacity` | `number \| null` | Không | @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(100000) |
| `designated_category_code` | `string` | Không | @Matches(/^[A-Z0-9]{2,12}$/) |
| `designated_size` | `string` | Không | @IsString() |
| `designated_color_code` | `string \| null` | Không | @ValidateIf((_o, v) => v !== null) @Matches(/^[A-Z0-9]{2,10}$/) |

#### `GET /warehouse/warehouses/:warehouseId/bin-suggestions`

- **Hàm xử lý:** `suggestBins()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Warehouse Staff
- **Path params:** `warehouseId`
- **Mô tả:** 🆕 K2 — Gợi ý ô xếp hàng theo danh mục (bắt buộc), size, màu. Chỉ gợi ý ô còn chỗ.

**Query:** `category_code`, `size`, `color_code`

#### `POST /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/adjust`

- **Hàm xử lý:** `adjustStock()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Warehouse Staff
- **Path params:** `warehouseId`, `assignmentId`
- **Mô tả:** 🆕 K3 — Kiểm kê: nhập số đếm thực tế, hệ thống tự tính chênh lệch + ghi sổ cái (bắt buộc lý do).

**Body** (`AdjustStockDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `counted_quantity` | `number` | Có | @IsInt() @Min(0) @Max(1000000) |
| `reason_code` | `StockAdjustReason` | Có | @IsEnum(StockAdjustReason) |
| `note` | `string` | Không | @IsString() @MaxLength(500) |

#### `POST /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/transfer`

- **Hàm xử lý:** `transferStock()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Warehouse Staff
- **Path params:** `warehouseId`, `assignmentId`
- **Mô tả:** 🆕 K3 — Chuyển hàng sang ô khác cùng kho (trừ nguồn + cộng đích + 2 dòng sổ cái, 1 transaction).

**Body** (`TransferStockDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `to_bin_location_id` | `string` | Có | @IsMongoId() |
| `quantity` | `number` | Có | @IsInt() @Min(1) @Max(1000000) |
| `force` | `boolean` | Không | @IsBoolean() |
| `note` | `string` | Không | @IsString() @MaxLength(500) |

#### `DELETE /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId`

- **Hàm xử lý:** `unassign()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `warehouseId`, `assignmentId`
- **Mô tả:** 🆕 K3 — Bỏ gán SKU khỏi ô (chỉ khi tồn = 0). Sổ cái cũ giữ nguyên.

#### `GET /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/movements`

- **Hàm xử lý:** `listMovements()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Warehouse Staff, Store Owner
- **Path params:** `warehouseId`, `assignmentId`
- **Mô tả:** 🆕 K3 — Sổ cái của 1 SKU trên 1 ô (mới -> cũ): nhập, lấy, kiểm kê, chuyển, hoàn.

**Query:** `limit`

### Mã lỗi của module

| Mã | Ý nghĩa |
|---|---|
| `WH_WAREHOUSE_NOT_FOUND` | Không tìm thấy bản ghi |
| `WH_ZONE_NOT_FOUND` | Không tìm thấy bản ghi |
| `WH_INVALID_BIN_RANGE` | wh invalid bin range |
| `WH_WAREHOUSE_CODE_IN_USE` | Mã đã tồn tại |
| `WH_ZONE_CODE_IN_USE` | Mã đã tồn tại |
| `WH_WAREHOUSE_INACTIVE` | thao tác trên kho đã vô hiệu hóa |
| `WH_ZONE_INACTIVE` | Bản ghi đã bị vô hiệu hóa |
| `WH_BIN_NOT_FOUND` | Không tìm thấy bản ghi |
| `WH_BIN_INACTIVE` | Bản ghi đã bị vô hiệu hóa |
| `WH_BIN_NOT_IN_WAREHOUSE` | gán SKU vào kệ của kho KHÁC |
| `WH_HAS_STOCK` | chặn vô hiệu hóa khi còn hàng tồn |
| `WH_NOTHING_TO_UPDATE` | Body không có trường nào để cập nhật |
| `WH_ZONE_LEGACY_FORMAT` | tạo kệ chuẩn mới trong khu mã cũ (VD "A") |
| `WH_RACK_EXISTS` | kệ (dãy+bên+số kệ) đã tồn tại |
| `WH_INVALID_RACK_LAYOUT` | tầng trùng, số màu != số ô... |
| `WH_SIZE_NOT_IN_SCALE` | size không thuộc thang size của danh mục |
| `WH_BIN_OVER_CAPACITY` | vượt sức chứa ô (gửi force=true để bỏ qua) |
| `WH_ZONE_V2_USE_RACKS` | gọi generate kiểu cũ trong khu chuẩn mới |
| `WH_BIN_HAS_STOCK_DESIGNATION` | đổi danh mục/size/màu của ô đang có hàng |
| `WH_ASSIGNMENT_NOT_FOUND` | Không tìm thấy bản ghi |
| `WH_ASSIGNMENT_HAS_STOCK` | bỏ gán khi ô còn hàng |
| `WH_STOCK_CHANGED` | tồn vừa bị người khác đổi trong lúc kiểm kê |
| `WH_INSUFFICIENT_STOCK` | chuyển nhiều hơn số đang có |
| `WH_SAME_BIN` | chuyển sang chính ô đang đứng |
| `WH_NOTE_REQUIRED` | lý do "other" phải có ghi chú |

---

## Danh mục sản phẩm (Categories)

Nguồn: `src/modules/categories/categories.controller.ts`

Danh mục **2 cấp** (VD Áo → Áo thun), danh mục cấp 2 có **thang size**. Dùng để quy định ô kệ chứa loại hàng gì và để tạo SKU nội bộ. Định danh bằng `code` (VD `ATHUN`).

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `GET` | `/categories` | Admin, Store Owner, Warehouse Staff, Packaging Staff | 🆕 K2 — Cây danh mục (cấp 1 kèm danh sách cấp 2). |
| 2 | `GET` | `/categories/:code` | Admin, Store Owner, Warehouse Staff, Packaging Staff | 🆕 K2 — Chi tiết 1 danh mục. |
| 3 | `POST` | `/categories` | Admin | 🆕 K2 — Tạo danh mục. |
| 4 | `PATCH` | `/categories/:code` | Admin | 🆕 K2 — Sửa tên/thang size. |
| 5 | `DELETE` | `/categories/:code` | Admin | 🆕 K2 — Vô hiệu hóa. |
| 6 | `POST` | `/categories/:code/reactivate` | Admin | 🆕 K2 — Kích hoạt lại (danh mục cha phải đang bật). |

### Chi tiết từng endpoint

#### `GET /categories`

- **Hàm xử lý:** `listTree()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff, Packaging Staff
- **Mô tả:** 🆕 K2 — Cây danh mục (cấp 1 kèm danh sách cấp 2). ?include_inactive=true để thấy cả mục đã tắt.

**Query:** `include_inactive`

#### `GET /categories/:code`

- **Hàm xử lý:** `get()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff, Packaging Staff
- **Path params:** `code`
- **Mô tả:** 🆕 K2 — Chi tiết 1 danh mục.

#### `POST /categories`

- **Hàm xử lý:** `create()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Mô tả:** 🆕 K2 — Tạo danh mục. Không có parent_code = cấp 1; có = cấp 2 (bắt buộc size_scale).

**Body** (`CreateCategoryDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `code` | `string` | Có | @Matches(/^[A-Z0-9]{2,12}$/) |
| `name` | `string` | Có | @IsString() @MinLength(2) @MaxLength(80) |
| `parent_code` | `string` | Không | @Matches(/^[A-Z0-9]{2,12}$/) |
| `size_scale` | `string[]` | Không | @IsArray() @ArrayUnique() @ArrayMaxSize(30) @IsString({ each: true }) @Matches(/^[A-Z0-9.]{1,6}$/, { each: true, message: 'mỗi size 1-6 ký tự chữ hoa/số/dấu chấm (VD S, XL, 38, 36.5)' }) |

#### `PATCH /categories/:code`

- **Hàm xử lý:** `update()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `code`
- **Mô tả:** 🆕 K2 — Sửa tên/thang size. Bỏ size đang được kệ dùng -> 409 CAT_SIZE_IN_USE.

**Body** (`UpdateCategoryDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `name` | `string` | Không | @IsString() @MinLength(2) @MaxLength(80) |
| `size_scale` | `string[]` | Không | @IsArray() @ArrayUnique() @ArrayMaxSize(30) @IsString({ each: true }) @Matches(/^[A-Z0-9.]{1,6}$/, { each: true }) |

#### `DELETE /categories/:code`

- **Hàm xử lý:** `deactivate()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `code`
- **Mô tả:** 🆕 K2 — Vô hiệu hóa. Chặn nếu còn danh mục con đang bật hoặc ô kệ đang đăng ký.

#### `POST /categories/:code/reactivate`

- **Hàm xử lý:** `reactivate()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `code`
- **Mô tả:** 🆕 K2 — Kích hoạt lại (danh mục cha phải đang bật).

### Mã lỗi của module

| Mã | Ý nghĩa |
|---|---|
| `CAT_NOT_FOUND` | Không tìm thấy bản ghi |
| `CAT_CODE_IN_USE` | Mã đã tồn tại |
| `CAT_PARENT_NOT_FOUND` | Không tìm thấy bản ghi |
| `CAT_PARENT_NOT_LEVEL_1` | chỉ cho 2 cấp — cha phải là cấp 1 |
| `CAT_PARENT_INACTIVE` | Bản ghi đã bị vô hiệu hóa |
| `CAT_SIZE_SCALE_REQUIRED` | cấp 2 bắt buộc có thang size |
| `CAT_SIZE_SCALE_NOT_ALLOWED` | cấp 1 không có thang size |
| `CAT_SIZE_IN_USE` | bỏ size mà kệ đang đăng ký dùng |
| `CAT_HAS_ACTIVE_CHILDREN` | cat has active children |
| `CAT_IN_USE` | kệ đang đăng ký danh mục này |
| `CAT_INACTIVE` | Bản ghi đã bị vô hiệu hóa |
| `CAT_NOT_LEVEL_2` | kệ/sản phẩm chỉ gắn được danh mục cấp 2 |
| `CAT_NOTHING_TO_UPDATE` | Body không có trường nào để cập nhật |

---

## SKU nội bộ & Màu (Master SKUs / Colors)

Nguồn: `src/modules/master-skus/master-skus.controller.ts`

**SKU nội bộ** = 1 sản phẩm thật, mã dạng `<DANHMUC>-<MẪU>-<MÀU>-<SIZE>` (VD `ATHUN-005-DEN-M`). Nối nhiều SKU sàn về 1 SKU nội bộ để **gộp tồn** giữa các sàn. Danh mục **màu chuẩn** tránh trùng kiểu "DEN"/"DENN".

**Trường hợp:** mã/thuộc tính SKU nội bộ bị khóa sau khi tạo — sai thì dùng `replace` (tạo mã mới, chuyển mapping và tồn); xóa mapping khi tồn đã gộp → `MAP_HAS_POOLED_STOCK`; size không có trong thang size danh mục → `MSKU_SIZE_NOT_IN_SCALE`.

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `GET` | `/colors` | Admin, Store Owner, Warehouse Staff, Packaging Staff | 🆕 K4a — Danh mục màu chuẩn (dropdown). |
| 2 | `POST` | `/colors` | Admin | 🆕 K4a — Khai màu (mã 2-10 chữ hoa, khóa sau khi tạo). |
| 3 | `PATCH` | `/colors/:code` | Admin | Sửa tên/mã hex của màu. |
| 4 | `DELETE` | `/colors/:code` | Admin | Vô hiệu hóa (chặn nếu còn SKU nội bộ dùng). |
| 5 | `POST` | `/colors/:code/reactivate` | Admin | Kích hoạt lại màu đã vô hiệu hóa. |
| 6 | `GET` | `/master-skus/unmapped-seller-skus` | Admin, Store Owner | 🆕 K4a — SKU sàn đã đồng bộ về nhưng chưa nối SKU nội bộ (việc cần làm). |
| 7 | `GET` | `/master-skus/unpooled-stock` | Admin, Store Owner | 🆕 K4b — Dòng tồn > 0 CHƯA tính theo SKU nội bộ: notMapped (cần nối) + mappedNotSynced (cần bấm đồng bộ). |
| 8 | `POST` | `/master-skus/sync-stock` | Admin | 🆕 K4b — Gắn nhãn/gộp tồn cho MỌI liên kết (liên kết tạo trước K4b). |
| 9 | `DELETE` | `/master-skus/mappings/:id` | Admin | Bỏ nối 1 SKU sàn. |
| 10 | `GET` | `/master-skus` | Admin, Store Owner, Warehouse Staff, Packaging Staff | 🆕 K4a — Danh sách SKU nội bộ. |
| 11 | `GET` | `/master-skus/:code` | Admin, Store Owner, Warehouse Staff, Packaging Staff | Chi tiết 1 SKU nội bộ. |
| 12 | `POST` | `/master-skus` | Admin | 🆕 K4a — Tạo SKU nội bộ: hệ thống tự ghép mã {danh mục}-{mẫu}-{màu}-{size}, VD ATHUN-005-DEN-M. |
| 13 | `PATCH` | `/master-skus/:code` | Admin | Sửa tên/giới tính/kích thước/dễ vỡ. |
| 14 | `DELETE` | `/master-skus/:code` | Admin | Vô hiệu hóa (chặn nếu còn SKU sàn nối vào). |
| 15 | `POST` | `/master-skus/:code/reactivate` | Admin | Kích hoạt lại SKU nội bộ. |
| 16 | `POST` | `/master-skus/:code/replace` | Admin | 🆕 K4a — THAY THẾ SKU đặt sai: tạo SKU mới + chuyển liên kết sàn + khóa SKU cũ (replaced_by), 1 transaction. |
| 17 | `GET` | `/master-skus/:code/mappings` | Admin, Store Owner, Warehouse Staff, Packaging Staff | Danh sách SKU sàn đã nối vào SKU nội bộ này. |
| 18 | `POST` | `/master-skus/:code/mappings` | Admin | 🆕 K4a — Nối 1 SKU sàn (phải đã đồng bộ về) vào SKU nội bộ này. |

### Chi tiết từng endpoint

#### `GET /colors`

- **Hàm xử lý:** `list()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff, Packaging Staff
- **Mô tả:** 🆕 K4a — Danh mục màu chuẩn (dropdown). ?include_inactive=true

**Query:** `include_inactive`

#### `POST /colors`

- **Hàm xử lý:** `create()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Mô tả:** 🆕 K4a — Khai màu (mã 2-10 chữ hoa, khóa sau khi tạo).

**Body** (`CreateColorDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `code` | `string` | Có | @Matches(/^[A-Z]{2,10}$/) |
| `name` | `string` | Có | @IsString() @MinLength(1) @MaxLength(40) |
| `hex` | `string` | Không | @Matches(/^#[0-9A-Fa-f]{6}$/) |

#### `PATCH /colors/:code`

- **Hàm xử lý:** `update()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `code`
- **Mô tả:** Sửa tên/mã hex của màu.

**Body** (`UpdateColorDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `name` | `string` | Không | @IsString() @MinLength(1) @MaxLength(40) |
| `hex` | `string` | Không | @Matches(/^#[0-9A-Fa-f]{6}$/) |

#### `DELETE /colors/:code`

- **Hàm xử lý:** `deactivate()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `code`
- **Mô tả:** Vô hiệu hóa (chặn nếu còn SKU nội bộ dùng).

#### `POST /colors/:code/reactivate`

- **Hàm xử lý:** `reactivate()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `code`
- **Mô tả:** Kích hoạt lại màu đã vô hiệu hóa.

#### `GET /master-skus/unmapped-seller-skus`

- **Hàm xử lý:** `unmapped()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner
- **Mô tả:** 🆕 K4a — SKU sàn đã đồng bộ về nhưng chưa nối SKU nội bộ (việc cần làm).

#### `GET /master-skus/unpooled-stock`

- **Hàm xử lý:** `unpooled()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner
- **Mô tả:** 🆕 K4b — Dòng tồn > 0 CHƯA tính theo SKU nội bộ: notMapped (cần nối) + mappedNotSynced (cần bấm đồng bộ).

#### `POST /master-skus/sync-stock`

- **Hàm xử lý:** `syncStock()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Mô tả:** 🆕 K4b — Gắn nhãn/gộp tồn cho MỌI liên kết (liên kết tạo trước K4b). Chạy lại nhiều lần an toàn.

#### `DELETE /master-skus/mappings/:id`

- **Hàm xử lý:** `deleteMapping()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `id`
- **Mô tả:** Bỏ nối 1 SKU sàn. 🔄 K4b: chặn nếu SKU nội bộ còn tồn gộp chung (MAP_HAS_POOLED_STOCK).

#### `GET /master-skus`

- **Hàm xử lý:** `list()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff, Packaging Staff
- **Mô tả:** 🆕 K4a — Danh sách SKU nội bộ. ?category_code&color_code&search&include_inactive&page&limit

**Query:** `category_code`, `color_code`, `search`, `include_inactive`, `page`, `limit`

#### `GET /master-skus/:code`

- **Hàm xử lý:** `get()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff, Packaging Staff
- **Path params:** `code`
- **Mô tả:** Chi tiết 1 SKU nội bộ.

#### `POST /master-skus`

- **Hàm xử lý:** `create()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Mô tả:** 🆕 K4a — Tạo SKU nội bộ: hệ thống tự ghép mã {danh mục}-{mẫu}-{màu}-{size}, VD ATHUN-005-DEN-M.

**Body** (`CreateMasterSkuDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `name` | `string` | Không | @IsString() @MinLength(2) @MaxLength(150) |
| `gender` | `'nam' \| 'nu' \| 'unisex'` | Không | @IsIn(['nam', 'nu', 'unisex']) |
| `length_cm` | `number` | Không | @IsNumber() @Min(0.1) @Max(500) |
| `width_cm` | `number` | Không | @IsNumber() @Min(0.1) @Max(500) |
| `height_cm` | `number` | Không | @IsNumber() @Min(0.1) @Max(500) |
| `weight_kg` | `number` | Không | @IsNumber() @Min(0.001) @Max(200) |
| `is_fragile` | `boolean` | Không | @IsBoolean() |
| `category_code` | `string` | Có | @Matches(/^[A-Z0-9]{2,12}$/) |
| `model_no` | `number` | Có | @IsInt() @Min(1) @Max(999) |
| `color_code` | `string` | Có | @Matches(/^[A-Z]{2,10}$/) |
| `size` | `string` | Có | @Matches(/^[A-Z0-9.]{1,6}$/) |

#### `PATCH /master-skus/:code`

- **Hàm xử lý:** `update()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `code`
- **Mô tả:** Sửa tên/giới tính/kích thước/dễ vỡ. KHÔNG sửa mã và danh mục-mẫu-màu-size (dùng Thay thế).

**Body** (`UpdateMasterSkuDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `name` | `string` | Không | @IsString() @MinLength(2) @MaxLength(150) |
| `gender` | `'nam' \| 'nu' \| 'unisex'` | Không | @IsIn(['nam', 'nu', 'unisex']) |
| `length_cm` | `number` | Không | @IsNumber() @Min(0.1) @Max(500) |
| `width_cm` | `number` | Không | @IsNumber() @Min(0.1) @Max(500) |
| `height_cm` | `number` | Không | @IsNumber() @Min(0.1) @Max(500) |
| `weight_kg` | `number` | Không | @IsNumber() @Min(0.001) @Max(200) |
| `is_fragile` | `boolean` | Không | @IsBoolean() |

#### `DELETE /master-skus/:code`

- **Hàm xử lý:** `deactivate()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `code`
- **Mô tả:** Vô hiệu hóa (chặn nếu còn SKU sàn nối vào).

#### `POST /master-skus/:code/reactivate`

- **Hàm xử lý:** `reactivate()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `code`
- **Mô tả:** Kích hoạt lại SKU nội bộ.

#### `POST /master-skus/:code/replace`

- **Hàm xử lý:** `replace()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `code`
- **Mô tả:** 🆕 K4a — THAY THẾ SKU đặt sai: tạo SKU mới + chuyển liên kết sàn + khóa SKU cũ (replaced_by), 1 transaction.

**Body** (`ReplaceMasterSkuDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `category_code` | `string` | Không | @Matches(/^[A-Z0-9]{2,12}$/) |
| `model_no` | `number` | Không | @IsInt() @Min(1) @Max(999) |
| `color_code` | `string` | Không | @Matches(/^[A-Z]{2,10}$/) |
| `size` | `string` | Không | @Matches(/^[A-Z0-9.]{1,6}$/) |
| `reason` | `string` | Có | @IsString() @MinLength(3) @MaxLength(300) |

#### `GET /master-skus/:code/mappings`

- **Hàm xử lý:** `listMappings()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff, Packaging Staff
- **Path params:** `code`
- **Mô tả:** Danh sách SKU sàn đã nối vào SKU nội bộ này.

#### `POST /master-skus/:code/mappings`

- **Hàm xử lý:** `createMapping()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Path params:** `code`
- **Mô tả:** 🆕 K4a — Nối 1 SKU sàn (phải đã đồng bộ về) vào SKU nội bộ này.

**Body** (`CreateMappingDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `platform` | `MarketplacePlatform` | Có | @IsEnum(MarketplacePlatform) |
| `shop_id` | `string` | Có | @IsString() @MaxLength(60) |
| `seller_sku` | `string` | Có | @IsString() @MinLength(1) @MaxLength(100) |

### Mã lỗi của module

| Mã | Ý nghĩa |
|---|---|
| `MSKU_NOT_FOUND` | Không tìm thấy bản ghi |
| `MSKU_ALREADY_EXISTS` | Đã tồn tại |
| `MSKU_INACTIVE` | Bản ghi đã bị vô hiệu hóa |
| `MSKU_SIZE_NOT_IN_SCALE` | msku size not in scale |
| `MSKU_NOTHING_TO_UPDATE` | Body không có trường nào để cập nhật |
| `MSKU_HAS_MAPPINGS` | vô hiệu hóa khi còn SKU sàn nối vào |
| `MSKU_REPLACE_SAME` | thay thế mà không đổi thành phần nào |
| `COLOR_NOT_FOUND` | Không tìm thấy bản ghi |
| `COLOR_INACTIVE` | Bản ghi đã bị vô hiệu hóa |
| `COLOR_CODE_IN_USE` | Mã đã tồn tại |
| `COLOR_IN_USE` | tắt màu đang có SKU dùng |
| `MAP_SELLER_SKU_UNKNOWN` | SKU sàn chưa từng đồng bộ về (gõ sai?) |
| `MAP_ALREADY_MAPPED` | SKU sàn đã nối SKU nội bộ khác |
| `MAP_NOT_FOUND` | Không tìm thấy bản ghi |
| `MAP_HAS_POOLED_STOCK` | K4b — bỏ nối khi tồn đang gộp chung |

---

## Giao hàng (Shipments)

Nguồn: `src/modules/shipments/shipments.controller.ts`

Vận đơn tự giao cho nhóm đã `packed`. Trạng thái: `out_for_delivery` → `delivered` | `delivery_failed` → (giao lại) `out_for_delivery` | `returning_to_warehouse` → `returned_to_warehouse`. Tối đa **2 lần giao**; lần thất bại thứ 2 hoặc khách từ chối → tự hoàn về kho. Khoảng cách tối thiểu giữa 2 lần giao (`SHIPMENT_MIN_RETRY_GAP_MINUTES`, mặc định 120 phút) và hạn giao (`SHIPMENT_DUE_BUSINESS_HOURS`, mặc định 40 giờ làm việc); quét quá hạn 15 phút/lần. Mọi bước ghi `shipment_events`.

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `GET` | `/shipments/reason-codes` | Admin, Shipping Coordinator, Store Owner, Warehouse Staff | Danh sách lý do giao thất bại (dùng cho dropdown). |
| 2 | `GET` | `/shipments` | Admin, Shipping Coordinator, Store Owner, Warehouse Staff | Danh sách vận đơn (lọc theo trạng thái / nhóm đơn). |
| 3 | `POST` | `/shipments/overdue-scan` | Admin | Quét vận đơn quá hạn giao NGAY (cùng logic cron 15 phút/lần) — dùng khi vận hành/demo. |
| 4 | `GET` | `/shipments/:id` | Admin, Shipping Coordinator, Store Owner, Warehouse Staff | Chi tiết vận đơn. |
| 5 | `GET` | `/shipments/:id/events` | Admin, Shipping Coordinator, Store Owner, Warehouse Staff | Lịch sử vận đơn (tracking dạng dòng thời gian), cũ -> mới. |
| 6 | `POST` | `/shipments` | Shipping Coordinator, Admin | [Bắt đầu giao] Tạo vận đơn cho nhóm đơn đã đóng gói (packed) -> out_for_delivery; nhóm đơn -> shipped. |
| 7 | `POST` | `/shipments/:id/deliver` | Shipping Coordinator, Admin | [Giao thành công] out_for_delivery -> delivered; nhóm đơn -> delivered. |
| 8 | `POST` | `/shipments/:id/fail` | Shipping Coordinator, Admin | [Giao thất bại] Chọn lý do. |
| 9 | `POST` | `/shipments/:id/retry` | Shipping Coordinator, Admin | [Giao lại] delivery_failed -> out_for_delivery. |
| 10 | `POST` | `/shipments/:id/receive-return` | Warehouse Staff, Admin | [Kho nhận hàng hoàn] returning_to_warehouse -> returned_to_warehouse; nhóm đơn -> returned. |

### Chi tiết từng endpoint

#### `GET /shipments/reason-codes`

- **Hàm xử lý:** `reasonCodes()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Shipping Coordinator, Store Owner, Warehouse Staff
- **Mô tả:** Danh sách lý do giao thất bại (dùng cho dropdown).

#### `GET /shipments`

- **Hàm xử lý:** `list()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Shipping Coordinator, Store Owner, Warehouse Staff
- **Mô tả:** Danh sách vận đơn (lọc theo trạng thái / nhóm đơn).

**Query:** `status`, `order_group_id`, `overdue`, `page`, `limit`

#### `POST /shipments/overdue-scan`

- **Hàm xử lý:** `overdueScan()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Mô tả:** Quét vận đơn quá hạn giao NGAY (cùng logic cron 15 phút/lần) — dùng khi vận hành/demo.

#### `GET /shipments/:id`

- **Hàm xử lý:** `get()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Shipping Coordinator, Store Owner, Warehouse Staff
- **Path params:** `id`
- **Mô tả:** Chi tiết vận đơn.

#### `GET /shipments/:id/events`

- **Hàm xử lý:** `events()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Shipping Coordinator, Store Owner, Warehouse Staff
- **Path params:** `id`
- **Mô tả:** Lịch sử vận đơn (tracking dạng dòng thời gian), cũ -> mới.

#### `POST /shipments`

- **Hàm xử lý:** `start()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Shipping Coordinator, Admin
- **Mô tả:** [Bắt đầu giao] Tạo vận đơn cho nhóm đơn đã đóng gói (packed) -> out_for_delivery; nhóm đơn -> shipped.

**Body** (`StartShipmentDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `order_group_id` | `string` | Có | @IsMongoId() |
| `note` | `string` | Không | @IsString() @MaxLength(500) |

#### `POST /shipments/:id/deliver`

- **Hàm xử lý:** `deliver()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Shipping Coordinator, Admin
- **Path params:** `id`
- **Mô tả:** [Giao thành công] out_for_delivery -> delivered; nhóm đơn -> delivered.

**Body** (`ShipmentActionDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `expected_version` | `number` | Có | @IsInt() @Min(0) |
| `note` | `string` | Không | @IsString() @MaxLength(500) |

#### `POST /shipments/:id/fail`

- **Hàm xử lý:** `fail()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Shipping Coordinator, Admin
- **Path params:** `id`
- **Mô tả:** [Giao thất bại] Chọn lý do. Lần 2 hoặc "khách từ chối" -> hệ thống TỰ chuyển hoàn về kho.

**Body** (`FailShipmentDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `expected_version` | `number` | Có | @IsInt() @Min(0) |
| `note` | `string` | Không | @IsString() @MaxLength(500) |
| `reason_code` | `DeliveryFailureReason` | Có | @IsEnum(DeliveryFailureReason) |
| `reschedule_at` | `string` | Không | @IsDateString() |

#### `POST /shipments/:id/retry`

- **Hàm xử lý:** `retry()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Shipping Coordinator, Admin
- **Path params:** `id`
- **Mô tả:** [Giao lại] delivery_failed -> out_for_delivery. Trước giờ cho phép (nextAttemptNotBefore) phải gửi override_reason.

**Body** (`RetryShipmentDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `expected_version` | `number` | Có | @IsInt() @Min(0) |
| `note` | `string` | Không | @IsString() @MaxLength(500) |
| `override_reason` | `string` | Không | @IsString() @MinLength(3) @MaxLength(300) |

#### `POST /shipments/:id/receive-return`

- **Hàm xử lý:** `receiveReturn()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Warehouse Staff, Admin
- **Path params:** `id`
- **Mô tả:** [Kho nhận hàng hoàn] returning_to_warehouse -> returned_to_warehouse; nhóm đơn -> returned.

**Body** (`ShipmentActionDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `expected_version` | `number` | Có | @IsInt() @Min(0) |
| `note` | `string` | Không | @IsString() @MaxLength(500) |

### Mã lỗi của module

| Mã | Ý nghĩa |
|---|---|
| `SHP_NOT_FOUND` | Không tìm thấy bản ghi |
| `SHP_INVALID_ID` | ID sai định dạng ObjectId |
| `SHP_ALREADY_EXISTS` | nhóm đơn đã có vận đơn |
| `SHP_GROUP_NOT_READY` | nhóm đơn chưa đóng gói xong |
| `SHP_INVALID_TRANSITION` | Chuyển trạng thái không hợp lệ theo bảng chuyển trạng thái |
| `SHP_STATE_CONFLICT` | version không khớp |
| `SHP_NOTE_REQUIRED` | lý do "other" phải có ghi chú |
| `SHP_RETRY_TOO_EARLY` | giao lại trước giờ cho phép mà không nêu lý do |
| `SHP_INVALID_RESCHEDULE` | giờ hẹn giao lại ở quá khứ |

---

## Fulfillment cũ (Legacy — giữ tương thích)

Nguồn: `src/modules/shipments/legacy-fulfillment.controller.ts`

3 route cũ `ship/deliver/return` của nhóm đơn, giữ nguyên URL/body để FE cũ không gãy. Bên trong đã chuyển sang dùng `ShipmentsService`. **Trùng chức năng** với `/shipments` — xem đánh giá ở tài liệu 07.

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `POST` | `/order-groups/:id/fulfillment/ship` | Shipping Coordinator, Admin | (Cũ) packed -> shipped. |
| 2 | `POST` | `/order-groups/:id/fulfillment/deliver` | Shipping Coordinator, Admin | (Cũ) shipped -> delivered. |
| 3 | `POST` | `/order-groups/:id/fulfillment/return` | Shipping Coordinator, Warehouse Staff, Admin | (Cũ) shipped/delivered -> returned. |

### Chi tiết từng endpoint

#### `POST /order-groups/:id/fulfillment/ship`

- **Hàm xử lý:** `ship()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Shipping Coordinator, Admin
- **Path params:** `id`
- **Mô tả:** (Cũ) packed -> shipped. Nay tạo vận đơn out_for_delivery. Dùng POST /shipments.

**Body** (`TransitionOrderGroupDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `expected_version` | `number` | Có | @IsInt() @Min(0) |

#### `POST /order-groups/:id/fulfillment/deliver`

- **Hàm xử lý:** `deliver()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Shipping Coordinator, Admin
- **Path params:** `id`
- **Mô tả:** (Cũ) shipped -> delivered. Nay đi qua vận đơn. Dùng POST /shipments/:id/deliver.

**Body** (`TransitionOrderGroupDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `expected_version` | `number` | Có | @IsInt() @Min(0) |

#### `POST /order-groups/:id/fulfillment/return`

- **Hàm xử lý:** `returnGroup()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Shipping Coordinator, Warehouse Staff, Admin
- **Path params:** `id`
- **Mô tả:** (Cũ) shipped/delivered -> returned. Nay ghi lịch sử vận đơn. Dùng luồng /shipments.

**Body** (`TransitionOrderGroupDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `expected_version` | `number` | Có | @IsInt() @Min(0) |

---

## Trả hàng & Đổi hàng (Returns)

Nguồn: `src/modules/shipments/returns.controller.ts`

Phiếu trả hàng (RMA): `requested` → `awaiting_receipt` → `received` → `closed` (hoặc `rejected`). Loại: `return_refund`, `refund_only`, `exchange` (do Admin giả lập khách) và `failed_delivery` (hệ thống tự tạo khi kho nhận lại kiện giao thất bại). Kiểm hàng từng dòng: `restock` (nhập lại ô), `quarantine` (cách ly chờ kiểm lại), `discard` (loại bỏ). Đổi hàng tự tạo đơn thay thế `EXC-<mã RMA>`.

**Trường hợp:** nhóm chưa giao → `RMA_ORDER_NOT_DELIVERED`; quá 15 ngày → `RMA_WINDOW_EXPIRED`; đã có phiếu mở → `RMA_OPEN_EXISTS`; người tạo tự duyệt → `RMA_SELF_APPROVAL`; tổng dòng kiểm hàng không khớp số trả → `RMA_INSPECTION_MISMATCH`.

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `GET` | `/returns/reason-codes` | Admin, Store Owner, Warehouse Staff, Shipping Coordinator | Danh sách lý do trả hàng (dropdown). |
| 2 | `GET` | `/returns` | Admin, Store Owner, Warehouse Staff, Shipping Coordinator | Danh sách phiếu trả hàng, lọc theo `status`, `order_group_id`, phân trang `page`/`limit`. |
| 3 | `GET` | `/returns/quarantine` | Admin, Store Owner, Warehouse Staff | Hàng đang cách ly chờ xử lý (mọi phiếu), cũ nhất trước. |
| 4 | `POST` | `/returns/:id/quarantine/:lineIndex/resolve` | Warehouse Staff, Admin | Xử lý 1 dòng cách ly: restock (nhập lại ô bán, ghi sổ cái) hoặc discard (loại bỏ). |
| 5 | `POST` | `/returns/:id/create-replacement` | Store Owner, Admin | Tạo lại đơn thay thế cho phiếu đổi hàng (khi lần tạo tự động bị lỗi). |
| 6 | `GET` | `/returns/:id` | Admin, Store Owner, Warehouse Staff, Shipping Coordinator | Chi tiết 1 phiếu trả hàng kèm dòng kiểm hàng. |
| 7 | `POST` | `/returns` | Admin | [Giả lập khách] Yêu cầu trả hàng / hoàn tiền cho nhóm đơn đã giao (trong 15 ngày). |
| 8 | `POST` | `/returns/:id/approve` | Store Owner, Admin | [Duyệt] Hoàn tiền không trả hàng -> đóng luôn; trả hàng -> chờ hàng về kho. |
| 9 | `POST` | `/returns/:id/reject` | Store Owner, Admin | [Từ chối] Bắt buộc ghi lý do. |
| 10 | `POST` | `/returns/:id/receive` | Warehouse Staff, Admin | [Kho] Hàng khách trả đã về kho. |
| 11 | `POST` | `/returns/:id/inspect` | Warehouse Staff, Admin | [Kho] Kiểm hàng: restock (nhập lại ô, ghi sổ cái) / quarantine (cách ly) / discard (loại bỏ). |

### Chi tiết từng endpoint

#### `GET /returns/reason-codes`

- **Hàm xử lý:** `reasonCodes()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff, Shipping Coordinator
- **Mô tả:** Danh sách lý do trả hàng (dropdown).

#### `GET /returns`

- **Hàm xử lý:** `list()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff, Shipping Coordinator
- **Mô tả:** Danh sách phiếu trả hàng, lọc theo `status`, `order_group_id`, phân trang `page`/`limit`.

**Query:** `status`, `order_group_id`, `page`, `limit`

#### `GET /returns/quarantine`

- **Hàm xử lý:** `quarantine()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff
- **Mô tả:** Hàng đang cách ly chờ xử lý (mọi phiếu), cũ nhất trước.

#### `POST /returns/:id/quarantine/:lineIndex/resolve`

- **Hàm xử lý:** `resolveQuarantine()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Warehouse Staff, Admin
- **Path params:** `id`, `lineIndex`
- **Mô tả:** Xử lý 1 dòng cách ly: restock (nhập lại ô bán, ghi sổ cái) hoặc discard (loại bỏ).

**Body** (`ResolveQuarantineDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `action` | `'restock' \| 'discard'` | Có | @IsIn(['restock', 'discard']) |
| `warehouse_id` | `string` | Không | @IsMongoId() |
| `bin_location_id` | `string` | Không | @IsMongoId() |
| `note` | `string` | Không | @IsString() @MaxLength(500) |

#### `POST /returns/:id/create-replacement`

- **Hàm xử lý:** `createReplacement()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Store Owner, Admin
- **Path params:** `id`
- **Mô tả:** Tạo lại đơn thay thế cho phiếu đổi hàng (khi lần tạo tự động bị lỗi).

#### `GET /returns/:id`

- **Hàm xử lý:** `get()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin, Store Owner, Warehouse Staff, Shipping Coordinator
- **Path params:** `id`
- **Mô tả:** Chi tiết 1 phiếu trả hàng kèm dòng kiểm hàng.

#### `POST /returns`

- **Hàm xử lý:** `create()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Admin
- **Mô tả:** [Giả lập khách] Yêu cầu trả hàng / hoàn tiền cho nhóm đơn đã giao (trong 15 ngày).

**Body** (`CreateReturnDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `order_group_id` | `string` | Có | @IsMongoId() |
| `type` | `ReturnType.RETURN_REFUND \| ReturnType.REFUND_ONLY \| ReturnType.EXCHANGE` | Có | @IsIn([ReturnType.RETURN_REFUND, ReturnType.REFUND_ONLY, ReturnType.EXCHANGE]) |
| `exchange_items` | `ExchangeItemDto[]` | Không | @IsArray() @ArrayMaxSize(50) |
| `items` | `ReturnItemDto[]` | Có | @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) |
| `customer_note` | `string` | Không | @IsString() @MaxLength(1000) |

Trong đó `ExchangeItemDto`:

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `seller_sku` | `string` | Có | @IsString() @MaxLength(100) |
| `quantity` | `number` | Có | @IsInt() @Min(1) |

Trong đó `ReturnItemDto`:

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `seller_sku` | `string` | Có | @IsString() @MaxLength(100) |
| `quantity` | `number` | Có | @IsInt() @Min(1) |
| `reason_code` | `ReturnReason` | Có | @IsEnum(ReturnReason) |

#### `POST /returns/:id/approve`

- **Hàm xử lý:** `approve()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Store Owner, Admin
- **Path params:** `id`
- **Mô tả:** [Duyệt] Hoàn tiền không trả hàng -> đóng luôn; trả hàng -> chờ hàng về kho. Người tạo phiếu không được tự duyệt.

**Body** (`ReturnActionDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `expected_version` | `number` | Có | @IsInt() @Min(0) |
| `note` | `string` | Không | @IsString() @MaxLength(1000) |

#### `POST /returns/:id/reject`

- **Hàm xử lý:** `reject()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Store Owner, Admin
- **Path params:** `id`
- **Mô tả:** [Từ chối] Bắt buộc ghi lý do.

**Body** (`ReturnActionDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `expected_version` | `number` | Có | @IsInt() @Min(0) |
| `note` | `string` | Không | @IsString() @MaxLength(1000) |

#### `POST /returns/:id/receive`

- **Hàm xử lý:** `receive()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Warehouse Staff, Admin
- **Path params:** `id`
- **Mô tả:** [Kho] Hàng khách trả đã về kho. Trả toàn bộ -> nhóm đơn -> returned.

**Body** (`ReturnActionDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `expected_version` | `number` | Có | @IsInt() @Min(0) |
| `note` | `string` | Không | @IsString() @MaxLength(1000) |

#### `POST /returns/:id/inspect`

- **Hàm xử lý:** `inspect()` · **Guard:** JwtAuthGuard, RolesGuard · **Quyền:** Warehouse Staff, Admin
- **Path params:** `id`
- **Mô tả:** [Kho] Kiểm hàng: restock (nhập lại ô, ghi sổ cái) / quarantine (cách ly) / discard (loại bỏ). Tổng mỗi SKU phải khớp số trả.
- 🔄 **07/10/2026:** dòng `restock` khi ô chưa có dòng tồn của SKU: hệ thống tạo dòng mới bằng bộ lọc khớp chính xác (`stockUpsertFilterFor`) — SKU đã nối → dòng mang `master_sku`; SKU chưa nối → dòng mang đủ `platform`, `shop_id`, `seller_sku`. Áp dụng cho cả `POST /returns/:id/quarantine/:lineIndex/resolve` (`action: restock`).

**Body** (`InspectReturnDto`):

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `expected_version` | `number` | Có | @IsInt() @Min(0) |
| `lines` | `InspectionLineDto[]` | Có | @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) |
| `packaging` | `PackagingInspectionLineDto[]` | Không | @IsArray() @ArrayMaxSize(20) |

Trong đó `InspectionLineDto`:

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `seller_sku` | `string` | Có | @IsString() @MaxLength(100) |
| `quantity` | `number` | Có | @IsInt() @Min(1) |
| `result` | `InspectionResult` | Có | @IsEnum(InspectionResult) |
| `warehouse_id` | `string` | Không | @IsMongoId() |
| `bin_location_id` | `string` | Không | @IsMongoId() |
| `note` | `string` | Không | @IsString() @MaxLength(500) |

Trong đó `PackagingInspectionLineDto`:

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `material_code` | `string` | Có | @IsString() @MaxLength(20) |
| `quantity` | `number` | Có | @IsInt() @Min(1) @Max(1000) |
| `grade` | `'A' \| 'B' \| 'C'` | Có | @IsIn(['A', 'B', 'C']) |
| `reuse_cycle_seen` | `number` | Không | @IsInt() @Min(0) @Max(50) |
| `old_label_removed` | `boolean` | Không | @IsBoolean() |

### Mã lỗi của module

| Mã | Ý nghĩa |
|---|---|
| `RMA_NOT_FOUND` | Không tìm thấy bản ghi |
| `RMA_INVALID_ID` | ID sai định dạng ObjectId |
| `RMA_ORDER_NOT_DELIVERED` | chỉ trả hàng khi nhóm đơn đã giao thành công |
| `RMA_OPEN_EXISTS` | nhóm đơn đang có phiếu trả chưa đóng |
| `RMA_WINDOW_EXPIRED` | quá hạn trả hàng |
| `RMA_INVALID_ITEMS` | SKU không thuộc nhóm đơn / vượt số lượng đã mua / trùng dòng |
| `RMA_INVALID_STATUS` | bấm nút sai thứ tự |
| `RMA_STATE_CONFLICT` | version không khớp |
| `RMA_SELF_APPROVAL` | người tạo phiếu không được tự duyệt |
| `RMA_NOTE_REQUIRED` | từ chối phải có lý do |
| `RMA_INSPECTION_MISMATCH` | tổng kiểm hàng != số lượng trả |
| `RMA_BIN_REQUIRED` | nhập lại kho phải chọn ô |
| `RMA_EXCHANGE_ITEMS_REQUIRED` | phiếu đổi hàng phải khai hàng đổi sang |
| `RMA_INVALID_EXCHANGE_ITEMS` | hàng đổi sang không có trong danh mục sản phẩm của shop |
| `RMA_NOT_EXCHANGE` | tạo đơn thay thế cho phiếu không phải đổi hàng / chưa kiểm hàng xong |
| `RMA_REPLACEMENT_EXISTS` | đã tạo đơn thay thế rồi |
| `RMA_QUARANTINE_LINE_NOT_FOUND` | Không tìm thấy bản ghi |
| `RMA_QUARANTINE_ALREADY_RESOLVED` | rma quarantine already resolved |

---

## Thông báo (Notifications)

Nguồn: `src/modules/notifications/notifications.controller.ts`

Thông báo trong ứng dụng. Gửi theo **người** (`recipient_user_id`) hoặc theo **vai trò** (`recipient_role`). `relatedEntityType` + `relatedEntityId` dùng để điều hướng khi bấm; `relatedEntityId` luôn là ObjectId của đối tượng hoặc `null`. 🔄 **07/10/2026:** thông báo `sync_failed` có `relatedEntityType: "marketplace_shop"` nay mang id document shop đã kết nối (trước là mã shop Lazada, ví dụ `201171264532`); mã shop Lazada vẫn có trong `title`. Thông báo `sync_failed` cũ đang lưu mã shop Lazada sẽ trả `relatedEntityId: null` (mã đó không phải ObjectId). Mọi thông báo đều được gửi thêm email tới người nhận (hoặc mọi người đang hoạt động thuộc vai trò nhận); lỗi gửi email chỉ ghi log. Người dùng chỉ thấy thông báo của mình hoặc của vai trò mình. Controller chỉ gắn `JwtAuthGuard`.

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `GET` | `/notifications` | Mọi người dùng đã đăng nhập | Danh sách thông báo của user hiện tại (đích danh + theo role), tối đa 50 gần nhất. |
| 2 | `GET` | `/notifications/unread-count` | Mọi người dùng đã đăng nhập | Số thông báo chưa đọc — FE gọi định kỳ (polling) để cập nhật chuông thông báo. |
| 3 | `PATCH` | `/notifications/:id/read` | Mọi người dùng đã đăng nhập | Đánh dấu 1 thông báo đã đọc (chỉ thông báo của chính mình). |

### Chi tiết từng endpoint

#### `GET /notifications`

- **Hàm xử lý:** `list()` · **Guard:** JwtAuthGuard · **Quyền:** Mọi người dùng đã đăng nhập
- **Mô tả:** Danh sách thông báo của user hiện tại (đích danh + theo role), tối đa 50 gần nhất.

**Query:** `is_read`

#### `GET /notifications/unread-count`

- **Hàm xử lý:** `unreadCount()` · **Guard:** JwtAuthGuard · **Quyền:** Mọi người dùng đã đăng nhập
- **Mô tả:** Số thông báo chưa đọc — FE gọi định kỳ (polling) để cập nhật chuông thông báo.

#### `PATCH /notifications/:id/read`

- **Hàm xử lý:** `markAsRead()` · **Guard:** JwtAuthGuard · **Quyền:** Mọi người dùng đã đăng nhập
- **Path params:** `id`
- **Mô tả:** Đánh dấu 1 thông báo đã đọc (chỉ thông báo của chính mình).

### Mã lỗi của module

| Mã | Ý nghĩa |
|---|---|
| `NOTI_INVALID_ID` | ID thông báo sai định dạng |
| `NOTI_NOT_FOUND` | Không tìm thấy thông báo hoặc không thuộc người dùng |

---

## Ứng dụng gốc

Nguồn: `src/app.controller.ts`

Route kiểm tra sống `GET /` trả `Hello World!` (mẫu mặc định của NestJS).

### Bảng tổng hợp

| # | Method | Path | Quyền | Mô tả ngắn |
|---|---|---|---|---|
| 1 | `GET` | `/` | Công khai | Kiểm tra BE đang chạy. |

### Chi tiết từng endpoint

#### `GET /`

- **Hàm xử lý:** `getHello()` · **Guard:** không · **Quyền:** Công khai (không cần token)
- **Mô tả:** Kiểm tra BE đang chạy.
