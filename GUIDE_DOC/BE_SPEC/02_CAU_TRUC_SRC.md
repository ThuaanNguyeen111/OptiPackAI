# 02 — Cấu trúc mã nguồn `be/`

## 1. Cây thư mục

```
be/
├── src/                          Mã nguồn ứng dụng
│   ├── main.ts                   Khởi động app: middleware, pipe, filter, Swagger, cổng chạy
│   ├── app.module.ts             Module gốc: cấu hình, DB, throttler, cron, Redis, mọi module
│   ├── app.controller.ts         GET / (kiểm tra sống)
│   ├── app.service.ts
│   ├── common/                   Dùng chung toàn hệ thống, không chứa nghiệp vụ
│   │   ├── constants/            Thông báo tiếng Việt dùng chung
│   │   ├── enums/                UserRole
│   │   ├── exceptions/           AppException (lỗi nghiệp vụ chuẩn)
│   │   ├── filters/              GlobalExceptionFilter (chuẩn hóa mọi lỗi)
│   │   ├── interfaces/           Hợp đồng dữ liệu đóng gói
│   │   ├── redis/                Kết nối Redis + cache trạng thái xác thực
│   │   ├── schemas/              Schema dùng chung (webhook — chưa dùng)
│   │   └── utils/                requireEnv, hashToken
│   ├── config/                   Namespace cấu hình đọc từ .env (database, jwt, google, mail, redis, marketplace)
│   └── modules/                  14 module nghiệp vụ
│       ├── auth/                 Đăng nhập, JWT, MFA, Google OAuth, guard, decorator
│       ├── users/                Quản trị tài khoản
│       ├── mail/                 Gửi email
│       ├── notifications/        Thông báo trong ứng dụng
│       ├── marketplace-integration/  OAuth sàn, adapter Lazada (TikTok/Tiki: mã chết)
│       ├── orders/               Đồng bộ đơn, gộp đơn
│       ├── order-groups/         Nhóm đơn, lấy hàng, giữ chỗ tồn, phân công, báo Pack Lazada
│       ├── packaging/            Đề xuất đóng gói + duyệt
│       ├── packaging-materials/  Vật liệu đóng gói, tái sử dụng
│       ├── product-master/       Kích thước/cân sản phẩm
│       ├── warehouse/            Kho, khu, ô, tồn theo ô, sổ cái, Picking List
│       ├── categories/           Danh mục 2 cấp, thang size
│       ├── master-skus/          SKU nội bộ, màu, nối SKU sàn
│       └── shipments/            Vận đơn, trả hàng, đổi hàng, route cũ
├── scripts/                      Script chạy tay: seed Admin, migrate/backfill dữ liệu
├── test/                         Kiểm thử end-to-end
├── dist/                         Kết quả build (không commit)
├── assets/                       Tài nguyên tĩnh
├── .env / .env.example           Cấu hình môi trường
├── Dockerfile, nest-cli.json, tsconfig*.json, eslint.config.mjs, .prettierrc
└── package.json                  Script npm + thư viện
```

## 2. Quy ước bố trí trong một module

Mỗi module theo cùng một khuôn (ví dụ `order-groups/`):

```
order-groups/
├── order-groups.module.ts        Khai báo module: import module khác, đăng ký schema, controller, provider, export
├── order-groups.controller.ts    Tầng HTTP: route, guard, @Roles, Swagger, nhận DTO, gọi service, dựng response
├── order-groups.service.ts       Tầng nghiệp vụ: quy tắc, transaction, gọi service khác
├── order-groups.errors.ts        Bảng mã lỗi riêng (prefix ORD_GROUP_)
├── *.scheduler.ts                Tác vụ cron của module
├── dto/                          Kiểm tra đầu vào (class-validator) — mỗi request 1 class
├── enums/                        Giá trị hợp lệ, bảng chuyển trạng thái
├── schemas/                      Schema Mongoose = collection
├── utils/                        Hàm thuần (không phụ thuộc DI), dễ test
└── *.spec.ts                     Unit test đặt cạnh file được test
```

**Luồng gọi một chiều:** `controller → service → (model | service module khác | adapter)`. Controller không truy cập DB; service không biết HTTP. Lỗi nghiệp vụ luôn ném `AppException` với mã của module; `GlobalExceptionFilter` lo phần trả về.

**Quy ước đặt tên:** file `kebab-case`, class `PascalCase`, trường DB `snake_case`, trường response `camelCase`, collection số nhiều `snake_case`, mã lỗi `<PREFIX>_<TÊN>` viết hoa.

## 3. Cách mã nguồn chạy khi khởi động

1. `npm run start:dev` → Nest CLI biên dịch TypeScript và chạy `src/main.ts`.
2. `NestFactory.create(AppModule)` dựng cây DI: nạp `.env` → kết nối MongoDB → tạo index → kết nối Redis → khởi tạo mọi module, service, adapter (Lazada adapter đọc khóa ứng dụng, thiếu biến bắt buộc thì dừng).
3. `ScheduleModule` đăng ký 6 cron.
4. Gắn middleware, pipe, filter, Swagger → lắng nghe cổng 3000.

## 4. Chức năng từng file

Bảng dưới liệt kê **toàn bộ 251 file** trong `src/`, `scripts/`, `test/`, kèm số dòng (đối chiếu `main` `93d20bf` + nhánh `feature/viet_befe` + bản sửa ObjectId 07/10/2026). 🆕 = file mới từ 04/10/2026.

#### `scripts/`

| File | Dòng | Chức năng |
|---|---|---|
| `backfill-order-group-counts.ts` | 88 | Điền số đơn còn hiệu lực/đã hủy cho nhóm đơn cũ. |
| `migrate-consolidation-key.ts` | 91 | Tính lại `consolidation_key` sau khi đổi cách chuẩn hóa. |
| `migrate-notification-role-types.ts` | 74 | Điền `recipient_role` cho thông báo cũ. |
| `migrate-objectid-fields.ts` | 70 | 🆕 07/10/2026 — Chuyển id lưu dạng chuỗi sang ObjectId cho 35 trường id (chạy thử mặc định; `--apply` ghi thật; `--null-invalid` ghi null giá trị không phải id). Chạy 1 lần mỗi database. |
| `migrate-product-master-platform.ts` | 62 | Điền `platform` thiếu cho Product Master cũ. |
| `migrate-sku-bin-assignment-multibin.ts` | 43 | Chuyển index để 1 SKU nằm nhiều ô (K3). |
| `seed-admin.ts` | 46 | Tạo tài khoản Admin đầu tiên từ `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`. |
| `sync-product-master-now.ts` | 65 | Chạy đồng bộ Product Master ngay theo danh sách sản phẩm (mặc định toàn bộ, `--incremental` chỉ sản phẩm thay đổi). |

#### `src/`

| File | Dòng | Chức năng |
|---|---|---|
| `app.controller.ts` | 12 | Route `GET /` trả "Hello World!" (mẫu NestJS, dùng kiểm tra sống). |
| `app.module.ts` | 75 | Module gốc: nạp cấu hình (.env), kết nối MongoDB, Throttler (20 req/60s), ScheduleModule (cron), Redis và toàn bộ module nghiệp vụ; đăng ký `ThrottlerGuard` toàn cục. |
| `app.service.ts` | 8 | Service của route `GET /`. |
| `main.ts` | 50 | Điểm khởi động: tạo app NestJS, gắn Helmet, nén gzip, CORS, ValidationPipe toàn cục, bộ lọc lỗi toàn cục, Swagger tại `/api/docs`, lắng nghe cổng `PORT`. |

#### `src/common/constants/`

| File | Dòng | Chức năng |
|---|---|---|
| `messages.constants.ts` | 50 | Hằng số thông báo tiếng Việt dùng chung (chủ yếu cho Auth). |

#### `src/common/enums/`

| File | Dòng | Chức năng |
|---|---|---|
| `user-role.enum.ts` | 20 | Enum vai trò số 0–4 và hàm kiểm tra `isUserRole`. |

#### `src/common/exceptions/`

| File | Dòng | Chức năng |
|---|---|---|
| `app-exception.ts` | 25 | `AppException` — lớp lỗi nghiệp vụ chuẩn mang `error_code`, `message`, `details`. |

#### `src/common/filters/`

| File | Dòng | Chức năng |
|---|---|---|
| `global-exception.filter.ts` | 136 | Bộ lọc lỗi toàn cục: chuẩn hóa mọi lỗi về `{ success:false, error_code, message, details, timestamp, path }`, ẩn chi tiết lỗi 500. |

#### `src/common/interfaces/`

| File | Dòng | Chức năng |
|---|---|---|
| `packaging.interface.ts` | 34 | Hợp đồng dữ liệu giữa Order Groups và Packaging (`PackableItem`, `PackagingRecommendation`). |

#### `src/common/redis/`

| File | Dòng | Chức năng |
|---|---|---|
| `redis-cache.service.ts` | 69 | Bộ nhớ đệm trạng thái xác thực người dùng (`user:auth:<id>`, TTL 60 giây) để JwtStrategy không truy vấn DB mỗi request. |
| `redis.module.ts` | 10 | Module toàn cục cung cấp kết nối Redis (ioredis). |

#### `src/common/schemas/`

| File | Dòng | Chức năng |
|---|---|---|
| `objectid-fields.spec.ts` | 73 | 🆕 07/10/2026 — Quét mọi `*.schema.ts`: báo lỗi nếu còn trường kiểu Mixed hoặc danh sách `OBJECT_ID_FIELDS` lệch thực tế. |
| `objectid-fields.ts` | 55 | 🆕 07/10/2026 — Danh sách 35 trường id kiểu ObjectId theo collection (`OBJECT_ID_FIELDS`), dùng chung cho script chuyển dữ liệu và test bảo vệ. |
| `objectid-migration.spec.ts` | 106 | 🆕 07/10/2026 — Kiểm thử chuyển dữ liệu: chạy thử không ghi, chuỗi hex → ObjectId, chuỗi rỗng → null, giá trị không phải id. |
| `objectid-migration.ts` | 105 | 🆕 07/10/2026 — Lõi chuyển dữ liệu id chuỗi → ObjectId (kể cả trường trong mảng `return_requests.inspection[]`). |
| `processed-webhook-event.schema.ts` | 38 | Schema chống xử lý trùng webhook — **chưa được đăng ký/sử dụng**. |

#### `src/common/utils/`

| File | Dòng | Chức năng |
|---|---|---|
| `env.util.ts` | 13 | `requireEnv()` — bắt buộc biến môi trường phải có giá trị, thiếu thì dừng khởi động. |
| `hash.util.ts` | 6 | `hashToken()` — băm SHA-256 cho refresh token, token reset, token thiết bị. |

#### `src/config/`

| File | Dòng | Chức năng |
|---|---|---|
| `database.config.ts` | 5 | Namespace cấu hình `database` (`MONGODB_URI`). |
| `google.config.ts` | 7 | Namespace `google` (OAuth Google). |
| `jwt.config.ts` | 10 | Namespace `jwt`: secret, hạn access (mặc định 1 ngày), hạn refresh (mặc định 30 ngày). |
| `mail.config.ts` | 14 | Namespace `mail` (SMTP). |
| `marketplace.config.ts` | 56 | Namespace `marketplace`: khóa ứng dụng từng sàn, cầu dao `LAZADA_WRITE_APIS_ENABLED`, `LAZADA_SHIPPING_ALLOCATE_TYPE`. |
| `redis.config.ts` | 7 | Namespace `redis`. |

#### `src/modules/auth/`

| File | Dòng | Chức năng |
|---|---|---|
| `auth.controller.ts` | 278 | 10 route `/auth/*`. |
| `auth.module.ts` | 31 | Khai báo module NestJS: import, schema, controller, provider, export. |
| `auth.service.spec.ts` | 566 | Kiểm thử đơn vị (Jest) cho `auth.service`. |
| `auth.service.ts` | 655 | Nghiệp vụ đăng nhập (khóa sai mật khẩu, hạn 72 giờ, MFA, thiết bị tin cậy), Google OAuth (state + PKCE), đổi/quên/đặt lại mật khẩu, bật MFA, làm mới/thu hồi token, ghi nhật ký đăng nhập. |
| `token.module.ts` | 33 | Module tách riêng `TokenService` + `JwtModule` để Users và Auth cùng dùng mà không vòng phụ thuộc. |

#### `src/modules/auth/decorators/`

| File | Dòng | Chức năng |
|---|---|---|
| `current-user.decorator.ts` | 15 | Decorator `@CurrentUser()` lấy `request.user`. |
| `index.ts` | 3 | Barrel export gom các file trong thư mục. |
| `roles.decorator.ts` | 6 | Decorator `@Roles(...)`. |

#### `src/modules/auth/dto/`

| File | Dòng | Chức năng |
|---|---|---|
| `change-password.dto.ts` | 18 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `forgot-password.dto.ts` | 9 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `index.ts` | 5 | Barrel export gom các file trong thư mục. |
| `login.dto.ts` | 43 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `mfa.dto.ts` | 9 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `reset-password.dto.ts` | 18 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |

#### `src/modules/auth/exceptions/`

| File | Dòng | Chức năng |
|---|---|---|
| `google-auth.exceptions.ts` | 6 | Lỗi riêng của luồng Google OAuth. |

#### `src/modules/auth/guards/`

| File | Dòng | Chức năng |
|---|---|---|
| `force-password-change.guard.spec.ts` | 54 | Kiểm thử đơn vị (Jest) cho `force-password-change.guard`. |
| `force-password-change.guard.ts` | 21 | Guard chặn mọi route trừ đổi mật khẩu/đăng xuất khi `must_change_password=true` — **chỉ đang gắn ở UsersController**. |
| `index.ts` | 3 | Barrel export gom các file trong thư mục. |
| `jwt-auth.guard.ts` | 5 | Guard bắt buộc có access token hợp lệ. |
| `roles.guard.spec.ts` | 58 | Kiểm thử đơn vị (Jest) cho `roles.guard`. |
| `roles.guard.ts` | 31 | Guard so vai trò người dùng với `@Roles(...)` của route. |

#### `src/modules/auth/interfaces/`

| File | Dòng | Chức năng |
|---|---|---|
| `authenticated-request.interface.ts` | 13 | Kiểu `AuthenticatedUser` (userId, email, role, mustChangePassword). |

#### `src/modules/auth/schemas/`

| File | Dòng | Chức năng |
|---|---|---|
| `index.ts` | 6 | Barrel export gom các file trong thư mục. |
| `login-audit-log.schema.ts` | 45 | Schema Mongoose — định nghĩa collection, trường, index. |
| `refresh-token.schema.ts` | 56 | Schema Mongoose — định nghĩa collection, trường, index. |
| `trusted-device.schema.ts` | 36 | Schema Mongoose — định nghĩa collection, trường, index. |

#### `src/modules/auth/services/`

| File | Dòng | Chức năng |
|---|---|---|
| `mfa.service.spec.ts` | 106 | Kiểm thử đơn vị (Jest) cho `mfa.service`. |
| `mfa.service.ts` | 63 | TOTP (otplib): sinh secret, kiểm mã; sinh/kiểm 10 mã dự phòng (bcrypt). |
| `token.service.spec.ts` | 179 | Kiểm thử đơn vị (Jest) cho `token.service`. |
| `token.service.ts` | 142 | Cấp cặp access/refresh token, xoay vòng refresh (dùng lại token cũ → thu hồi toàn bộ phiên), thu hồi theo người dùng. |

#### `src/modules/auth/strategies/`

| File | Dòng | Chức năng |
|---|---|---|
| `index.ts` | 1 | Barrel export gom các file trong thư mục. |
| `jwt.strategy.spec.ts` | 104 | Kiểm thử đơn vị (Jest) cho `jwt.strategy`. |
| `jwt.strategy.ts` | 80 | Passport JWT: kiểm chữ ký HS256, đọc trạng thái người dùng (Redis → DB), chặn tài khoản vô hiệu/khóa 72 giờ, gắn `request.user`. |

#### `src/modules/categories/`

| File | Dòng | Chức năng |
|---|---|---|
| `categories.controller.ts` | 74 | 6 route `/categories/*`. |
| `categories.errors.ts` | 15 | Bảng mã lỗi nghiệp vụ của module. |
| `categories.module.ts` | 21 | Khai báo module NestJS: import, schema, controller, provider, export. |
| `categories.service.spec.ts` | 58 | Kiểm thử đơn vị (Jest) cho `categories.service`. |
| `categories.service.ts` | 141 | Danh mục 2 cấp, thang size, vòng đời (vô hiệu hóa khi không còn dùng). |

#### `src/modules/categories/dto/`

| File | Dòng | Chức năng |
|---|---|---|
| `create-category.dto.ts` | 28 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `update-category.dto.ts` | 21 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |

#### `src/modules/categories/schemas/`

| File | Dòng | Chức năng |
|---|---|---|
| `category.schema.ts` | 36 | Schema Mongoose — định nghĩa collection, trường, index. |

#### `src/modules/mail/`

| File | Dòng | Chức năng |
|---|---|---|
| `mail.module.ts` | 8 | Khai báo module NestJS: import, schema, controller, provider, export. |
| `mail.service.spec.ts` | 107 | Kiểm thử đơn vị (Jest) cho `mail.service`. |
| `mail.service.ts` | 118 | Gửi email qua Nodemailer (mật khẩu tạm, quên mật khẩu, khóa tài khoản, bật MFA, thông báo critical); lỗi gửi chỉ ghi log. |
| `mail.templates.ts` | 166 | Mẫu HTML email. |

#### `src/modules/marketplace-integration/`

| File | Dòng | Chức năng |
|---|---|---|
| `SETUP_NOTES.md` | 36 | Ghi chú cài đặt kết nối sàn (tài liệu nằm lẫn trong `src`). |
| `index.ts` | 7 | Barrel export của module. |
| `marketplace-integration.controller.ts` | 108 | 2 route: `connect` (Admin) và `callback` (sàn gọi về, chuyển hướng FE). |
| `marketplace-integration.errors.ts` | 25 | Bảng mã lỗi nghiệp vụ của module. |
| `marketplace-integration.module.ts` | 41 | Khai báo module NestJS: import, schema, controller, provider, export. |
| `marketplace-integration.service.ts` | 351 | Tạo URL OAuth + lưu state, xử lý callback (đổi code, mã hóa token, upsert shop), cấp access token còn hạn (tự refresh), liệt kê shop. |

#### `src/modules/marketplace-integration/adapters/`

| File | Dòng | Chức năng |
|---|---|---|
| `lazada.adapter.catalog.spec.ts` | 114 | 🆕 Kiểm thử `listProductsPage` (GetProducts theo danh sách sản phẩm, định dạng ngày `+0000`). |
| `lazada.adapter.pack.spec.ts` | 100 | Kiểm thử đơn vị (Jest) cho `lazada.adapter.pack`. |
| `lazada.adapter.ts` | 709 | Adapter Lazada: ký HMAC-SHA256, OAuth token, GetOrders/GetOrderItems/GetProducts (GET đã ký, có retry), Pack (POST đã ký, không retry). |
| `tiki.adapter.ts` | 166 | Adapter Tiki — **không được đăng ký** (Tiki đã dừng) → mã chết. |
| `tiktok-shop.adapter.ts` | 236 | Adapter TikTok Shop — **không được đăng ký** → mã chết. |

#### `src/modules/marketplace-integration/common/utils/`

| File | Dòng | Chức năng |
|---|---|---|
| `token-encryption.util.ts` | 77 | Mã hóa/giải mã token sàn AES-256-GCM bằng `TOKEN_ENCRYPTION_KEY`. |

#### `src/modules/marketplace-integration/dto/`

| File | Dòng | Chức năng |
|---|---|---|
| `oauth-callback-query.dto.ts` | 29 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |

#### `src/modules/marketplace-integration/enums/`

| File | Dòng | Chức năng |
|---|---|---|
| `platform.enum.ts` | 5 | Enum/hằng số giá trị hợp lệ. |

#### `src/modules/marketplace-integration/interfaces/`

| File | Dòng | Chức năng |
|---|---|---|
| `marketplace-adapter.interface.ts` | 78 | Hợp đồng chung mọi adapter sàn (OAuth, token, thông tin shop). |

#### `src/modules/marketplace-integration/schemas/`

| File | Dòng | Chức năng |
|---|---|---|
| `marketplace-oauth-state.schema.ts` | 32 | Schema Mongoose — định nghĩa collection, trường, index. |
| `marketplace-shop.schema.ts` | 107 | Schema Mongoose — định nghĩa collection, trường, index. |

#### `src/modules/master-skus/`

| File | Dòng | Chức năng |
|---|---|---|
| `master-skus.controller.ts` | 124 | 2 controller trong 1 file: `/colors` (5 route) và `/master-skus` (13 route). |
| `master-skus.errors.ts` | 17 | Bảng mã lỗi nghiệp vụ của module. |
| `master-skus.module.ts` | 30 | Khai báo module NestJS: import, schema, controller, provider, export. |
| `master-skus.service.spec.ts` | 145 | Kiểm thử đơn vị (Jest) cho `master-skus.service`. |
| `master-skus.service.ts` | 368 | Màu chuẩn, SKU nội bộ, thay mã, nối/bỏ nối SKU sàn, gộp tồn theo SKU nội bộ, báo cáo SKU chưa nối. |
| `stock-key.util.spec.ts` | 60 | 🆕 Kiểm thử bộ lọc tồn: khớp không phân biệt hoa thường, nhánh dòng chưa gắn nhãn, bộ lọc upsert khớp chính xác. |
| `stock-key.util.ts` | 145 | Tra SKU sàn → SKU nội bộ; bộ lọc tồn (`stockFilterFor`, `stockAssignmentOrBranches` — có nhánh dòng chưa gắn nhãn, khớp không phân biệt hoa thường); bộ lọc upsert khớp chính xác `stockUpsertFilterFor`; khóa giữ chỗ `stockKeyOf`. |

#### `src/modules/master-skus/dto/`

| File | Dòng | Chức năng |
|---|---|---|
| `master-sku.dto.ts` | 50 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |

#### `src/modules/master-skus/schemas/`

| File | Dòng | Chức năng |
|---|---|---|
| `color.schema.ts` | 13 | Schema Mongoose — định nghĩa collection, trường, index. |
| `marketplace-sku-mapping.schema.ts` | 23 | Schema Mongoose — định nghĩa collection, trường, index. |
| `master-sku.schema.ts` | 32 | Schema Mongoose — định nghĩa collection, trường, index. |

#### `src/modules/notifications/`

| File | Dòng | Chức năng |
|---|---|---|
| `notifications.controller.ts` | 71 | 3 route `/notifications/*`. |
| `notifications.errors.ts` | 4 | Bảng mã lỗi nghiệp vụ của module. |
| `notifications.module.ts` | 21 | Khai báo module NestJS: import, schema, controller, provider, export. |
| `notifications.service.spec.ts` | 221 | Kiểm thử đơn vị (Jest) cho `notifications.service`. |
| `notifications.service.ts` | 271 | Tạo thông báo theo người/vai trò, gửi email cho mức critical, danh sách, đếm chưa đọc, đánh dấu đã đọc; hàm dựng nội dung. |

#### `src/modules/notifications/enums/`

| File | Dòng | Chức năng |
|---|---|---|
| `notification-type.enum.ts` | 26 | Enum/hằng số giá trị hợp lệ. |

#### `src/modules/notifications/schemas/`

| File | Dòng | Chức năng |
|---|---|---|
| `notification.schema.ts` | 67 | Schema Mongoose — định nghĩa collection, trường, index. |

#### `src/modules/order-groups/`

| File | Dòng | Chức năng |
|---|---|---|
| `express-order-sla.scheduler.ts` | 95 | Cron 10 phút: gắn cờ quá hạn đóng gói cho đơn hỏa tốc + thông báo. |
| ~~`lazada-pack-sync.service.ts` / `.spec.ts`~~ | — | **ĐÃ XOÁ 10/10/2026** — bỏ báo "đã đóng gói" lên Lazada. |
| `order-group-backfill.scheduler.ts` | 71 | Cron 5 phút: lưới an toàn tạo nhóm cho đơn chưa có nhóm. |
| `order-groups.controller.ts` | 440 | 11 route `/order-groups/*` + định nghĩa `OrderGroupResponse` và hàm dựng response. |
| `order-groups.errors.ts` | 25 | Bảng mã lỗi nghiệp vụ của module. |
| `order-groups.module.ts` | 79 | Khai báo module NestJS: import, schema, controller, provider, export. |
| `order-groups.service.getOrderCountsForGroups.spec.ts` | 263 | Kiểm thử đơn vị (Jest) cho `order-groups.service.getOrderCountsForGroups`. |
| `order-groups.service.getPackableItemsForGroup.spec.ts` | 145 | Kiểm thử đơn vị (Jest) cho `order-groups.service.getPackableItemsForGroup`. |
| `order-groups.service.pickItem.spec.ts` | 169 | Kiểm thử đơn vị (Jest) cho `order-groups.service.pickItem`. |
| `order-groups.service.ts` | 981 | Lõi vận hành: tạo/lấy nhóm đơn, bắt đầu lấy hàng (phân công + giữ chỗ), hàng cần lấy/đã lấy, chuyển trạng thái có khóa phiên bản, quét lấy hàng, báo thiếu, quyết định thiếu hàng, ưu tiên hỏa tốc, số đếm đơn hủy. |
| `staff-assignment.controller.ts` | 55 | 2 route phân công. |
| `staff-assignment.errors.ts` | 5 | Bảng mã lỗi nghiệp vụ của module. |
| `staff-assignment.service.ts` | 172 | Phân công Least-Busy và gán tay, tìm nhân viên kèm khối lượng việc. |
| `stock-availability.controller.ts` | 61 | 4 route tồn khả dụng/giữ chỗ. |
| `stock-reservation.service.spec.ts` | 95 | Kiểm thử đơn vị (Jest) cho `stock-reservation.service`. |
| `stock-reservation.service.ts` | 158 | Giữ chỗ tồn (reconcile), tiêu thụ khi lấy hàng, giải phóng, tính tồn khả dụng. |

#### `src/modules/order-groups/dto/`

| File | Dòng | Chức năng |
|---|---|---|
| `assign-staff.dto.ts` | 13 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `decide-partial.dto.ts` | 19 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `list-order-groups-query.dto.ts` | 28 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `pack-order-group.dto.ts` | 15 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `pick-item.dto.ts` | 42 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `report-missing.dto.ts` | 32 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `set-priority.dto.ts` | 19 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `transition-order-group.dto.ts` | 19 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |

#### `src/modules/order-groups/enums/`

| File | Dòng | Chức năng |
|---|---|---|
| `allowed-status-transitions.spec.ts` | 113 | Kiểm thử đơn vị (Jest) cho `allowed-status-transitions`. |
| `allowed-status-transitions.ts` | 67 | Bảng chuyển trạng thái hợp lệ của nhóm đơn. |
| `group-fulfillment-status.enum.ts` | 35 | Enum/hằng số giá trị hợp lệ. |

#### `src/modules/order-groups/schemas/`

| File | Dòng | Chức năng |
|---|---|---|
| `order-group.schema.ts` | 215 | Schema Mongoose — định nghĩa collection, trường, index. |
| `pick-event.schema.ts` | 58 | Schema Mongoose — định nghĩa collection, trường, index. |
| `stock-reservation.schema.ts` | 41 | Schema Mongoose — định nghĩa collection, trường, index. |

#### `src/modules/order-groups/utils/`

| File | Dòng | Chức năng |
|---|---|---|
| `add-business-hours.util.spec.ts` | 59 | Kiểm thử đơn vị (Jest) cho `add-business-hours.util`. |
| `add-business-hours.util.ts` | 57 | Cộng giờ làm việc (bỏ ngoài giờ/cuối tuần) để tính hạn. |

#### `src/modules/orders/`

| File | Dòng | Chức năng |
|---|---|---|
| `PATCH_NOTES.md` | 104 | Ghi chú lịch sử sửa module (tài liệu nằm lẫn trong `src`). |
| `lazada-order-sync.scheduler.spec.ts` | 85 | Kiểm thử đơn vị (Jest) cho `lazada-order-sync.scheduler`. |
| `lazada-order-sync.scheduler.ts` | 152 | Cron 5 phút: đồng bộ đơn cho mọi shop Lazada đang kết nối; chống chạy chồng; lỗi 1 shop không chặn shop khác. |
| `orders.controller.ts` | 157 | 3 route `/orders/*`. |
| `orders.errors.ts` | 14 | Bảng mã lỗi nghiệp vụ của module. |
| `orders.module.ts` | 42 | Khai báo module NestJS: import, schema, controller, provider, export. |
| `orders.service.ts` | 381 | Đồng bộ đơn Lazada (phân trang theo thời gian, upsert, chuẩn hóa), gộp đơn theo `consolidation_key`, gọi tạo nhóm đơn; danh sách (cursor) và chi tiết đơn. |

#### `src/modules/orders/dto/`

| File | Dòng | Chức năng |
|---|---|---|
| `list-orders-query.dto.ts` | 39 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `sync-lazada-orders-query.dto.ts` | 12 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |

#### `src/modules/orders/enums/`

| File | Dòng | Chức năng |
|---|---|---|
| `order-status.enum.ts` | 71 | Enum/hằng số giá trị hợp lệ. |

#### `src/modules/orders/mappers/`

| File | Dòng | Chức năng |
|---|---|---|
| `lazada-order.mapper.spec.ts` | 74 | Kiểm thử đơn vị (Jest) cho `lazada-order.mapper`. |
| `lazada-order.mapper.ts` | 257 | Dịch dữ liệu đơn Lazada → `Order` (trạng thái, người nhận, món hàng). |

#### `src/modules/orders/schemas/`

| File | Dòng | Chức năng |
|---|---|---|
| `order.schema.ts` | 265 | Schema Mongoose — định nghĩa collection, trường, index. |

#### `src/modules/orders/utils/`

| File | Dòng | Chức năng |
|---|---|---|
| `aggregate-order-items.util.ts` | 95 | Cộng dồn số lượng theo SKU từ nhiều đơn. |
| `consolidation-key.util.ts` | 90 | Chuẩn hóa tên/SĐT/địa chỉ người nhận rồi băm SHA-256 → khóa gộp đơn. |

#### `src/modules/packaging/`

| File | Dòng | Chức năng |
|---|---|---|
| `packaging.controller.ts` | 145 | 5 route `/order-groups/:groupId/packaging/*`. |
| `packaging.errors.ts` | 7 | Bảng mã lỗi nghiệp vụ của module. |
| `packaging.module.ts` | 30 | Khai báo module NestJS: import, schema, controller, provider, export. |
| `packaging.service.spec.ts` | 330 | Kiểm thử đơn vị (Jest) cho `packaging.service`. |
| `packaging.service.ts` | 416 | Sinh gợi ý (thuật toán dự phòng), duyệt/điều chỉnh/từ chối trong transaction, phát hiện lệch cân > 20%. |

#### `src/modules/packaging-materials/`

| File | Dòng | Chức năng |
|---|---|---|
| `packaging-materials.controller.ts` | 102 | 10 route `/packaging-materials/*`. |
| `packaging-materials.errors.ts` | 11 | Bảng mã lỗi nghiệp vụ của module. |
| `packaging-materials.module.ts` | 23 | Khai báo module NestJS: import, schema, controller, provider, export. |
| `packaging-materials.service.spec.ts` | 150 | Kiểm thử đơn vị (Jest) cho `packaging-materials.service`. |
| `packaging-materials.service.ts` | 346 | Danh mục vật liệu, nhập, xuất nội bộ, trừ khi đóng gói (trong transaction của pack), thu hồi khi hoàn, thống kê tiết kiệm. |

#### `src/modules/packaging-materials/dto/`

| File | Dòng | Chức năng |
|---|---|---|
| `packaging-material.dto.ts` | 59 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |

#### `src/modules/packaging-materials/schemas/`

| File | Dòng | Chức năng |
|---|---|---|
| `packaging-material.schema.ts` | 40 | Schema Mongoose — định nghĩa collection, trường, index. |
| `packaging-movement.schema.ts` | 25 | Schema Mongoose — định nghĩa collection, trường, index. |

#### `src/modules/packaging/dto/`

| File | Dòng | Chức năng |
|---|---|---|
| `adjust-packaging.dto.ts` | 51 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `approve-packaging.dto.ts` | 20 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `reject-packaging.dto.ts` | 25 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |

#### `src/modules/packaging/enums/`

| File | Dòng | Chức năng |
|---|---|---|
| `packaging-approval-status.enum.ts` | 9 | Enum/hằng số giá trị hợp lệ. |

#### `src/modules/packaging/schemas/`

| File | Dòng | Chức năng |
|---|---|---|
| `packaging-recommendation.schema.ts` | 121 | Schema Mongoose — định nghĩa collection, trường, index. |

#### `src/modules/packaging/utils/`

| File | Dòng | Chức năng |
|---|---|---|
| `fallback-packaging.util.spec.ts` | 76 | Kiểm thử đơn vị (Jest) cho `fallback-packaging.util`. |
| `fallback-packaging.util.ts` | 69 | Thuật toán chọn 1 trong 3 thùng chuẩn theo thể tích +10%, Bubble Wrap cho hàng dễ vỡ. |

#### `src/modules/product-master/`

| File | Dòng | Chức năng |
|---|---|---|
| `product-master-sync.scheduler.ts` | 56 | Cron mỗi giờ (sản phẩm thay đổi) và 3:00 sáng (toàn bộ): đồng bộ Product Master theo danh sách sản phẩm của mọi shop Lazada. |
| `product-master.catalog-sync.spec.ts` | 228 | 🆕 Kiểm thử đồng bộ Product Master theo danh sách sản phẩm (tăng dần, toàn bộ, giới hạn offset, lỗi 1 shop). |
| `product-master.controller.ts` | 198 | 5 route `/product-master/*` (gồm `POST /product-master/sync`). |
| `product-master.errors.ts` | 5 | Bảng mã lỗi nghiệp vụ của module. |
| `product-master.module.ts` | 22 | Khai báo module NestJS: import, schema, controller, provider, export. |
| `product-master.service.spec.ts` | 73 | Kiểm thử đơn vị (Jest) cho `product-master.service`. |
| `product-master.service.ts` | 401 | Đồng bộ danh sách sản phẩm Lazada (`syncCatalogForShop`, `syncCatalogAllShops`), danh sách, sửa tay, gỡ sửa tay. |

#### `src/modules/product-master/dto/`

| File | Dòng | Chức năng |
|---|---|---|
| `update-product-master.dto.ts` | 24 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |

#### `src/modules/product-master/schemas/`

| File | Dòng | Chức năng |
|---|---|---|
| `product-master.schema.ts` | 75 | Schema Mongoose — định nghĩa collection, trường, index. |

#### `src/modules/shipments/`

| File | Dòng | Chức năng |
|---|---|---|
| `legacy-fulfillment.controller.ts` | 106 | 3 route cũ `ship/deliver/return` giữ tương thích FE. |
| `returns.controller.ts` | 156 | 11 route `/returns/*`. |
| `returns.errors.ts` | 20 | Bảng mã lỗi nghiệp vụ của module. |
| `returns.service.spec.ts` | 237 | Kiểm thử đơn vị (Jest) cho `returns.service`. |
| `returns.service.ts` | 434 | Phiếu trả/đổi: tạo (giả lập hoặc do giao thất bại), duyệt, nhận, kiểm hàng, cách ly, tạo đơn thay thế. |
| `shipment-config.ts` | 19 | Đọc `SHIPMENT_MIN_RETRY_GAP_MINUTES`, `SHIPMENT_DUE_BUSINESS_HOURS`. |
| `shipment-sla.scheduler.ts` | 21 | Cron 15 phút: quét vận đơn quá hạn giao. |
| `shipment-transitions.ts` | 16 | Bảng chuyển trạng thái vận đơn, tối đa 2 lần giao. |
| `shipments.controller.ts` | 169 | 10 route `/shipments/*`. |
| `shipments.errors.ts` | 11 | Bảng mã lỗi nghiệp vụ của module. |
| `shipments.module.ts` | 43 | Khai báo module NestJS: import, schema, controller, provider, export. |
| `shipments.service.b.spec.ts` | 83 | Kiểm thử đơn vị (Jest) cho `shipments.service.b`. |
| `shipments.service.spec.ts` | 157 | Kiểm thử đơn vị (Jest) cho `shipments.service`. |
| `shipments.service.ts` | 430 | Vận đơn: bắt đầu giao, giao thành công/thất bại/giao lại, nhận hàng hoàn, quét quá hạn, ghi sự kiện, bản cũ cho legacy. |

#### `src/modules/shipments/dto/`

| File | Dòng | Chức năng |
|---|---|---|
| `return.dto.ts` | 71 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `shipment-action.dto.ts` | 40 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |

#### `src/modules/shipments/enums/`

| File | Dòng | Chức năng |
|---|---|---|
| `delivery-failure-reason.enum.ts` | 22 | Enum/hằng số giá trị hợp lệ. |
| `return.enums.ts` | 46 | Enum/hằng số giá trị hợp lệ. |
| `shipment-event-type.enum.ts` | 10 | Enum/hằng số giá trị hợp lệ. |
| `shipment-status.enum.ts` | 16 | Enum/hằng số giá trị hợp lệ. |

#### `src/modules/shipments/schemas/`

| File | Dòng | Chức năng |
|---|---|---|
| `return-request.schema.ts` | 78 | Schema Mongoose — định nghĩa collection, trường, index. |
| `shipment-event.schema.ts` | 49 | Schema Mongoose — định nghĩa collection, trường, index. |
| `shipment.schema.ts` | 62 | Schema Mongoose — định nghĩa collection, trường, index. |

#### `src/modules/users/`

| File | Dòng | Chức năng |
|---|---|---|
| `users.controller.ts` | 170 | 9 route `/users/*` (Admin quản trị, người dùng xem/sửa hồ sơ mình). |
| `users.module.ts` | 20 | Khai báo module NestJS: import, schema, controller, provider, export. |

#### `src/modules/users/dto/`

| File | Dòng | Chức năng |
|---|---|---|
| `admin-update-user.dto.ts` | 44 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `create-user.dto.ts` | 20 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `index.ts` | 3 | Barrel export gom các file trong thư mục. |
| `update-profile.dto.ts` | 21 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |

#### `src/modules/users/schemas/`

| File | Dòng | Chức năng |
|---|---|---|
| `index.ts` | 2 | Barrel export gom các file trong thư mục. |
| `user.schema.ts` | 102 | Schema Mongoose — định nghĩa collection, trường, index. |

#### `src/modules/users/services/`

| File | Dòng | Chức năng |
|---|---|---|
| `users.service.spec.ts` | 251 | Kiểm thử đơn vị (Jest) cho `users.service`. |
| `users.service.ts` | 415 | Tạo tài khoản (mật khẩu tạm + email), tìm/danh sách, đổi/đặt lại mật khẩu, khóa sai mật khẩu, MFA, hồ sơ, xóa mềm/kích hoạt lại; vô hiệu cache Redis khi trạng thái đổi. |

#### `src/modules/warehouse/`

| File | Dòng | Chức năng |
|---|---|---|
| `warehouse-layout.spec.ts` | 33 | Kiểm thử đơn vị (Jest) cho `warehouse-layout`. |
| `warehouse-layout.ts` | 56 | Quy tắc mã ô 5 phần, giới hạn bố cục, tính `pick_sequence` zigzag. |
| `warehouse.controller.ts` | 618 | 28 route `/warehouse/*`. |
| `warehouse.errors.ts` | 34 | Bảng mã lỗi nghiệp vụ của module. |
| `warehouse.module.ts` | 33 | Khai báo module NestJS: import, schema, controller, provider, export. |
| `warehouse.service.k2-review.spec.ts` | 83 | Kiểm thử đơn vị (Jest) cho `warehouse.service.k2-review`. |
| `warehouse.service.k2.spec.ts` | 120 | Kiểm thử đơn vị (Jest) cho `warehouse.service.k2`. |
| `warehouse.service.k3.spec.ts` | 117 | Kiểm thử đơn vị (Jest) cho `warehouse.service.k3`. |
| `warehouse.service.k4b.spec.ts` | 173 | Kiểm thử đơn vị (Jest) cho `warehouse.service.k4b`. |
| `warehouse.service.lifecycle.spec.ts` | 143 | Kiểm thử đơn vị (Jest) cho `warehouse.service.lifecycle`. |
| `warehouse.service.ts` | 1221 | Toàn bộ nghiệp vụ kho: kho/khu/kệ/ô, gán SKU vào ô, nhập, kiểm kê, chuyển ô, bỏ gán, gợi ý ô, Picking List, sổ cái, nhập lại hàng hoàn. |

#### `src/modules/warehouse/dto/`

| File | Dòng | Chức năng |
|---|---|---|
| `assign-sku-bin.dto.ts` | 38 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `create-rack.dto.ts` | 57 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `create-warehouse.dto.ts` | 19 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `create-zone.dto.ts` | 18 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `generate-bin-locations.dto.ts` | 33 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `restock-sku.dto.ts` | 16 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `stock-operations.dto.ts` | 37 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `update-bin.dto.ts` | 25 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `update-warehouse.dto.ts` | 23 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |
| `update-zone.dto.ts` | 22 | DTO — khai báo và kiểm tra dữ liệu đầu vào (class-validator). |

#### `src/modules/warehouse/schemas/`

| File | Dòng | Chức năng |
|---|---|---|
| `bin-location.schema.ts` | 74 | Schema Mongoose — định nghĩa collection, trường, index. |
| `inventory-movement.schema.ts` | 66 | Schema Mongoose — định nghĩa collection, trường, index. |
| `sku-bin-assignment.schema.ts` | 61 | Schema Mongoose — định nghĩa collection, trường, index. |
| `warehouse-zone.schema.ts` | 36 | Schema Mongoose — định nghĩa collection, trường, index. |
| `warehouse.schema.ts` | 35 | Schema Mongoose — định nghĩa collection, trường, index. |

#### `test/`

| File | Dòng | Chức năng |
|---|---|---|
| `app.e2e-spec.ts` | 25 | Kiểm thử end-to-end route gốc. |
| `auth.e2e-spec.ts` | 92 | Kiểm thử end-to-end luồng đăng nhập. |
| `jest-e2e.json` | 9 | Cấu hình Jest e2e. |

## 5. Đánh giá cách bố trí

### Điểm tốt

- **Khuôn module đồng nhất** (module/controller/service/errors/dto/schemas/enums/utils): đọc một module là đọc được mọi module.
- **Tách tầng rõ**: controller mỏng, nghiệp vụ nằm ở service, thuật toán thuần nằm ở `utils/` (dễ test, ví dụ `fallback-packaging.util.ts`, `consolidation-key.util.ts`, `add-business-hours.util.ts`, `warehouse-layout.ts`).
- **Mã lỗi theo module có prefix** (`WH_`, `RMA_`, `SHP_`…): FE xử lý lỗi theo mã, không phải theo chuỗi thông báo.
- **Test đặt cạnh mã**, scheduler tách riêng khỏi service (test được service mà không chạy cron).
- **Lớp adapter sàn** (`marketplace-adapter.interface.ts`) cho phép thêm sàn mà không sửa luồng đơn hàng.

### Điểm chưa tối ưu

| Vấn đề | Ví dụ | Hệ quả | Đề xuất |
|---|---|---|---|
| **Service quá lớn** | `warehouse.service.ts` 1.179 dòng, `order-groups.service.ts` 973 dòng | Khó đọc, dễ xung đột khi nhiều người cùng sửa | Tách theo nhóm chức năng: `warehouse-layout.service`, `stock-operations.service`, `picking-list.service`; `picking.service`, `group-lifecycle.service` |
| **Module đọc/ghi thẳng collection của module khác** | `shipments` đăng ký `Order`, `OrderGroup`, `InventoryMovement`; `master-skus` đăng ký `SkuBinAssignment`, `InventoryMovement` | Quy tắc của một collection (VD ghi sổ cái) nằm rải nhiều nơi, dễ lệch | Chỉ module sở hữu được ghi; module khác gọi service export ra |
| **Tên module không đúng nội dung** | `shipments/` chứa cả trả hàng, đổi hàng, route cũ; `master-skus/` chứa cả màu | Khó tìm | Tách `returns/`; đổi tên hoặc tách `colors/` |
| **2 controller trong 1 file** | `master-skus.controller.ts` chứa `ColorsController` và `MasterSkusController` | Khó tìm route | Tách file |
| **Mã chết** | `tiki.adapter.ts`, `tiktok-shop.adapter.ts` (không đăng ký), `processed-webhook-event.schema.ts` (không đăng ký), thư mục rỗng `mail/templates/`, biến `TIKTOK_*`/`TIKI_*`, `app.controller` "Hello World" | Gây nhiễu, người mới tưởng đang dùng | Xóa hoặc chuyển sang nhánh lưu trữ |
| **Tài liệu nằm lẫn trong `src/`** | `orders/PATCH_NOTES.md`, `marketplace-integration/SETUP_NOTES.md` | Lẫn với mã | Chuyển về `GUIDE_DOC/` |
| **Barrel `index.ts` không đồng đều** | Có ở `auth/`, `users/`, `marketplace-integration/`; module khác không có | Kiểu import không thống nhất | Chọn một quy ước |
| **Comment lịch sử dày đặc trong mã** | Nhiều đoạn "SỬA GẤP (21/09)…", "BỔ SUNG…" | Mã khó đọc; lịch sử đã có trong Git và CLAUDE.md | Giữ comment giải thích *vì sao*, bỏ nhật ký thay đổi |
| **Hằng số nghiệp vụ nằm rải trong code** | Ngưỡng lệch cân 20%, 3 cỡ thùng, 15.000đ/kg, 15 ngày đổi trả, 2 lần giao | Muốn đổi phải sửa mã | Gom vào `config/` hoặc collection cấu hình |
