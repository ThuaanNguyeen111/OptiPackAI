# 02 — Cấu trúc mã nguồn `be/`

> Cập nhật 14/10/2026. Mục 4 **sinh tự động** (liệt kê mọi file `.ts` không phải test trong `be/src`, kèm dòng chú thích đầu file). Quy mô: 316 file mã + 85 file test trong `src/`, 33 script; ~42.600 dòng mã nguồn (không tính test), ~62.300 dòng gồm test + script.

## 1. Cây thư mục

```
be/
├── src/
│   ├── main.ts                   Khởi động: Helmet, compression, CORS (mặc định localhost:5173 + 3001 khi dev), ValidationPipe, filter, Swagger /api/docs, cổng 3000
│   ├── app.module.ts             Module gốc: ConfigModule (global), MongoDB, Throttler 600/phút (APP_GUARD), ScheduleModule, Redis, 20 module
│   ├── common/                   Dùng chung, không chứa nghiệp vụ
│   │   ├── constants/ enums/ exceptions/ filters/ interfaces/ utils/
│   │   ├── redis/                Cache trạng thái xác thực (60 s)
│   │   └── schemas/              processed_webhook_events (chống trùng webhook AURELLE) + danh sách/migration field ObjectId
│   ├── config/                   Namespace cấu hình: database, jwt, google, mail, redis, marketplace, storefront, ai, packer, carrier
│   └── modules/                  20 module
│       ├── auth/ users/ mail/ notifications/
│       ├── marketplace-integration/   OAuth sàn, adapter Lazada + AURELLE (Lazada-protocol client)
│       ├── marketplace-webhooks/      Webhook AURELLE (HMAC, chống trùng)
│       ├── orders/                    Đồng bộ đơn (cron 5 phút), gom đơn
│       ├── order-groups/              Nhóm đơn, lấy hàng, giữ chỗ tồn, phân công, liên kết tay
│       ├── warehouse/ categories/ master-skus/ product-master/   Kho K1–K5, danh mục, SKU nội bộ, catalog sàn
│       ├── packing/                   Kế hoạch đóng gói (BRKGA + CP-SAT), phiên quét/niêm phong, báo cáo
│       ├── packaging/                 Danh mục thùng, túi zip, vật tư chèn, AI hướng dẫn đóng gói, engine 3D
│       ├── packaging-materials/       Kho vật liệu dùng chung (mới / tái sử dụng / nội bộ), sổ vật liệu
│       ├── shipping/                  Hãng vận chuyển (bảng cước + GHN live), báo giá theo kiện, so phương án đóng gói
│       ├── carriers/                  Adapter GHN + mock (CARRIER_ADAPTER)
│       ├── shipments/                 Vận đơn G1 + GHN (webhook, mô phỏng), chuyến, trả hàng/đổi hàng
│       ├── documents/                 PDF: phiếu đóng gói, nhãn, bảng kê chuyến
│       └── storefront/                Website AURELLE: catalog, khách, giỏ, đặt hàng, admin sản phẩm, ảnh
├── scripts/                      33 script: seed (admin, thùng, vật liệu, hãng mẫu, GHN), migrate/backfill, benchmark, GHN test, mock AURELLE (cổng 4000)
├── test/                         e2e
└── .env.example, Dockerfile, tsconfig*.json, eslint.config.mjs, package.json
packer/ (thư mục gốc repo)        Service Python FastAPI + OR-Tools CP-SAT (cổng 8000) — kiểm chứng tối ưu đóng gói
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

1. `npm run start:dev` (trong `be/`) → Nest CLI biên dịch và chạy `src/main.ts`.
2. `NestFactory.create(AppModule)` dựng cây DI: nạp `.env` → kết nối MongoDB → Mongoose tạo index → kết nối Redis → khởi tạo module/service/adapter. Thiếu biến bắt buộc (`requireEnv`, VD `LAZADA_APP_KEY`, `AURELLE_APP_KEY`, `JWT_ACCESS_SECRET`, `MAIL_*`) → dừng ngay với thông báo "Thiếu biến môi trường bắt buộc".
3. `CarriersModule` chọn adapter theo `CARRIER_MODE` (GHN hoặc mock).
4. `ScheduleModule` đăng ký 9 cron (xem 01 mục 6).
5. Gắn middleware, pipe, filter, Swagger → lắng nghe cổng 3000.

## 4. Chức năng từng file

### `common` — 13 file mã, 3 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `common/constants/messages.constants.ts` | — |
| `common/enums/product-category.enum.ts` | Loại sản phẩm (21/09/2026) — kho chọn khi xác nhận hồ sơ SKU. Dùng cho |
| `common/enums/user-role.enum.ts` | — |
| `common/exceptions/app-exception.ts` | 1. APP EXCEPTION — MỌI LỖI NGHIỆP VỤ TRONG PROJECT PHẢI DÙNG CÁI NÀY |
| `common/filters/global-exception.filter.ts` | 2. GLOBAL EXCEPTION FILTER — MỌI RESPONSE LỖI ĐI QUA ĐÂY |
| `common/interfaces/packaging.interface.ts` | Hợp đồng interface CỐ ĐỊNH giữa Product Master/Order Groups (Thuận) |
| `common/redis/redis-cache.service.ts` | — |
| `common/redis/redis.module.ts` | — |
| `common/schemas/objectid-fields.ts` | 07/10/2026 — DANH SÁCH CÁC FIELD KIỂU ObjectId (ngoài `_id`) TRONG TOÀN BỘ SCHEMA |
| `common/schemas/objectid-migration.ts` | 07/10/2026 — Lõi của `scripts/migrate-objectid-fields.ts` (tách ra đây để có unit test). |
| `common/schemas/processed-webhook-event.schema.ts` | processed_webhook_events — CHUẨN BỊ SẴN cho TikTok/Tiki, Lazada |
| `common/utils/env.util.ts` | eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- cố ý coi chuỗi rỗng ('') là "chưa cấu hình", khác nullish coalescing (chỉ bắt null/undefined) |
| `common/utils/hash.util.ts` | — |

### `config` — 10 file mã, 0 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `config/ai.config.ts` | Nhà cung cấp mô hình ngôn ngữ theo chuẩn API kiểu OpenAI (Chat Completions). */ |
| `config/carrier.config.ts` | CONFIG NAMESPACE "carrier" — đơn vị vận chuyển (08/10/2026, C2 — GHN) |
| `config/database.config.ts` | — |
| `config/google.config.ts` | — |
| `config/jwt.config.ts` | — |
| `config/mail.config.ts` | — |
| `config/marketplace.config.ts` | CONFIG NAMESPACE "marketplace" — ĐÚNG PATTERN registerAs() đã dùng |
| `config/packer.config.ts` | Kết nối tới microservice CP-SAT `packer/` (chứng minh tối ưu đóng gói). */ |
| `config/redis.config.ts` | — |
| `config/storefront.config.ts` | Website đặt hàng xong bắn webhook "đơn mới" tới ứng dụng đối tác đã |

### `modules/auth` — 29 file mã, 6 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/auth/auth.controller.ts` | FIX #35: Nhận diện ĐÚNG loại lỗi Google OAuth (nhờ instanceof, không đoán |
| `modules/auth/auth.errors.ts` | (09/10/2026) Mã lỗi Auth cho FE phân biệt bằng code thay vì so câu chữ. |
| `modules/auth/auth.module.ts` | — |
| `modules/auth/auth.service.ts` | Google `/oauth2/v2/userinfo` trả `verified_email`. |
| `modules/auth/token.module.ts` | FIX #32: secret mặc định của module này CHỈ dùng cho access token |
| `modules/auth/decorators/current-user.decorator.ts` | — |
| `modules/auth/decorators/index.ts` | — |
| `modules/auth/decorators/roles.decorator.ts` | — |
| `modules/auth/dto/change-password.dto.ts` | — |
| `modules/auth/dto/forgot-password.dto.ts` | — |
| `modules/auth/dto/index.ts` | — |
| `modules/auth/dto/login.dto.ts` | Mã TOTP 6 số — bắt buộc nếu tài khoản Admin đã bật MFA, |
| `modules/auth/dto/mfa.dto.ts` | — |
| `modules/auth/dto/refresh-token.dto.ts` | (09/10/2026) Trước đây đọc `@Body('refresh_token')` trần — thiếu/sai kiểu không bị chặn. */ |
| `modules/auth/dto/reset-password.dto.ts` | — |
| `modules/auth/exceptions/google-auth.exceptions.ts` | — |
| `modules/auth/guards/force-password-change.guard.ts` | — |
| `modules/auth/guards/index.ts` | — |
| `modules/auth/guards/jwt-auth.guard.ts` | — |
| `modules/auth/guards/roles.guard.ts` | — |
| `modules/auth/interfaces/authenticated-request.interface.ts` | — |
| `modules/auth/schemas/index.ts` | — |
| `modules/auth/schemas/login-audit-log.schema.ts` | Audit log đăng nhập — ghi lại MỌI lần thử login, kể cả thất bại, |
| `modules/auth/schemas/refresh-token.schema.ts` | Đánh dấu "đã rotate" thay vì xóa  — nếu token bị dùng lại |
| `modules/auth/schemas/trusted-device.schema.ts` | Trusted Device — sau khi verify MFA đúng 1 lần trên 1 thiết bị, |
| `modules/auth/services/mfa.service.ts` | MFA (TOTP) bắt buộc cho role Admin — dùng chung app kiểu |
| `modules/auth/services/token.service.ts` | FIX #32: refresh token ký bằng SECRET RIÊNG (jwt.refreshSecret), KHÁC |
| `modules/auth/strategies/index.ts` | — |
| `modules/auth/strategies/jwt.strategy.ts` | Khóa CỨNG nếu quá 72h chưa đổi mật khẩu — kiểm tra NGAY Ở ĐÂY, |

### `modules/carriers` — 8 file mã, 4 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/carriers/carrier-adapter.interface.ts` | Token DI cho adapter đang dùng — chọn theo CARRIER_MODE trong carriers.module.ts. */ |
| `modules/carriers/carrier.types.ts` | KIỂU DỮ LIỆU CHUNG CỦA ĐƠN VỊ VẬN CHUYỂN (08/10/2026, C2) |
| `modules/carriers/carriers.errors.ts` | Mã lỗi ổn định BE ↔ FE cho khâu đơn vị vận chuyển (08/10/2026, C2). */ |
| `modules/carriers/carriers.module.ts` | Chọn adapter theo CARRIER_MODE (08/10/2026, C2): |
| `modules/carriers/adapters/ghn.adapter.ts` | ADAPTER — GIAO HÀNG NHANH (GHN) (08/10/2026, C2) |
| `modules/carriers/adapters/mock.adapter.ts` | ADAPTER MOCK — DỰ PHÒNG KHI KHÔNG GỌI ĐƯỢC GHN (08/10/2026, C2) |
| `modules/carriers/utils/parcel.util.ts` | Giới hạn kiện của GHN (tài liệu Create Order): 50 kg, mỗi cạnh 200 cm. */ |
| `modules/carriers/utils/recipient-address.util.ts` | C3 (10/10/2026) — DỰNG ĐỊA CHỈ GỬI ĐƠN VỊ VẬN CHUYỂN TỪ ĐỊA CHỈ ĐƠN HÀNG |

### `modules/categories` — 7 file mã, 1 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/categories/categories.controller.ts` | K2 (26/09/2026) — danh mục sản phẩm 2 cấp. Dùng `code` làm định danh trên URL (dễ đọc, không đổi). */ |
| `modules/categories/categories.errors.ts` | — |
| `modules/categories/categories.module.ts` | Đăng ký lại schema kệ (KHÔNG import WarehouseModule) — kho phụ thuộc |
| `modules/categories/categories.service.ts` | K2 (26/09/2026) — danh mục 2 cấp, đủ vòng đời ngay từ lúc tạo (áp dụng |
| `modules/categories/dto/create-category.dto.ts` | — |
| `modules/categories/dto/update-category.dto.ts` | K2 — sửa tên + thang size. `code`, `parent_code` KHÔNG sửa được (gửi lên -> 400). */ |
| `modules/categories/schemas/category.schema.ts` | K2 (26/09/2026) — Danh mục sản phẩm 2 cấp (VD Áo -> Áo thun). |

### `modules/documents` — 5 file mã, 1 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/documents/documents.controller.ts` | Chứng từ in (PDF). Chỉ đọc. */ |
| `modules/documents/documents.errors.ts` | Mã lỗi module documents (prefix DOC_). */ |
| `modules/documents/documents.module.ts` | Module lá: đăng ký lại schema cần đọc (không import module khác → không vòng phụ thuộc). */ |
| `modules/documents/documents.service.ts` | Dựng dữ liệu chứng từ từ DB rồi giao cho renderer thuần (pdf/document-renderers). |
| `modules/documents/pdf/document-renderers.ts` | Bộ render chứng từ PDF — hàm thuần, không DB (30/09/2026) |

### `modules/mail` — 3 file mã, 1 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/mail/mail.module.ts` | — |
| `modules/mail/mail.service.ts` | KHÔNG throw lỗi ra ngoài nếu gửi mail thất bại — nghiệp vụ chính |
| `modules/mail/mail.templates.ts` | 1. WELCOME — gửi khi Admin tạo tài khoản mới, kèm mật khẩu tạm. |

### `modules/marketplace-integration` — 16 file mã, 3 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/marketplace-integration/index.ts` | — |
| `modules/marketplace-integration/marketplace-integration.controller.ts` | — |
| `modules/marketplace-integration/marketplace-integration.errors.ts` | DANH SÁCH MÃ LỖI — module marketplace-integration (prefix: MKT_) |
| `modules/marketplace-integration/marketplace-integration.module.ts` | import { TikTokShopAdapter } from './adapters/tiktok-shop.adapter'; |
| `modules/marketplace-integration/marketplace-integration.service.ts` | TTL của OAuth state (10 phút) chỉ khai báo Ở SCHEMA (marketplace-oauth-state.schema.ts, |
| `modules/marketplace-integration/adapters/aurelle.adapter.ts` | Vỏ response chung của Open API mở rộng (không thuộc phần "tương thích |
| `modules/marketplace-integration/adapters/lazada-protocol.client.ts` | LazadaProtocolClient — giao thức HTTP DÙNG CHUNG (29/09/2026) |
| `modules/marketplace-integration/adapters/lazada.adapter.ts` | Re-export — mapper.ts/orders.service.ts/product-master.service.ts import |
| `modules/marketplace-integration/adapters/tiki.adapter.ts` | Hình dạng response CHUẨN OAuth2 của Tiki — tên field seller_id/seller_name/ |
| `modules/marketplace-integration/adapters/tiktok-shop.adapter.ts` | 3 domain KHÁC NHAU — đây chính là điểm dễ nhầm nhất khi code TikTok. |
| `modules/marketplace-integration/common/utils/token-encryption.util.ts` | 2. MÃ HÓA TOKEN — CÙNG NGUYÊN TẮC ĐÃ ÁP DỤNG CHO mfaSecret |
| `modules/marketplace-integration/dto/oauth-callback-query.dto.ts` | DTO — QUERY PARAMS KHI SÀN REDIRECT VỀ callback |
| `modules/marketplace-integration/enums/platform.enum.ts` | BỔ SUNG (29/09/2026) — AURELLE_MARKETPLACE_DESIGN.md: sàn thứ 2 tự |
| `modules/marketplace-integration/interfaces/marketplace-adapter.interface.ts` | 5. HỢP ĐỒNG CHUNG CHO ADAPTER TỪNG SÀN |
| `modules/marketplace-integration/schemas/marketplace-oauth-state.schema.ts` | TTL 600 giây (10 phút) — MongoDB tự động xóa document sau khi hết hạn, |
| `modules/marketplace-integration/schemas/marketplace-shop.schema.ts` | COLLECTION `marketplace_shops` — "CHÌA KHÓA" GỌI API TỪNG SÀN |

### `modules/marketplace-webhooks` — 3 file mã, 1 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/marketplace-webhooks/marketplace-webhooks.controller.ts` | marketplace-webhooks.controller.ts — MỚI (29/09/2026, Giai đoạn 3) |
| `modules/marketplace-webhooks/marketplace-webhooks.module.ts` | MODULE MỚI (29/09/2026, Giai đoạn 3 — AURELLE_MARKETPLACE_DESIGN.md) |
| `modules/marketplace-webhooks/marketplace-webhooks.service.ts` | Vỏ payload webhook AURELLE — đúng Mục 8.1 AURELLE_MARKETPLACE_DESIGN.md. */ |

### `modules/master-skus` — 9 file mã, 3 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/master-skus/master-skus.controller.ts` | — |
| `modules/master-skus/master-skus.errors.ts` | 10/10/2026 — xoá hẳn SKU nội bộ tạo nhầm |
| `modules/master-skus/master-skus.module.ts` | K4a (27/09/2026). Phụ thuộc: categories (danh mục + thang size). Không vòng. |
| `modules/master-skus/master-skus.service.ts` | K4a (27/09/2026) — DANH MỤC MÀU + SKU NỘI BỘ + NỐI SKU SÀN |
| `modules/master-skus/stock-key.util.ts` | K4b (27/09/2026) — "ĐƯỜNG LÙI": tra SKU sàn -> SKU nội bộ (nếu đã nối). |
| `modules/master-skus/dto/master-sku.dto.ts` | Chỉ sửa được thuộc tính mô tả. Mã + danh mục/mẫu/màu/size KHÓA — sai thì dùng "Thay thế SKU". */ |
| `modules/master-skus/schemas/color.schema.ts` | K4a (27/09/2026) — danh mục màu chuẩn: hết cảnh "DEN" và "DENN" bị coi là 2 màu. */ |
| `modules/master-skus/schemas/marketplace-sku-mapping.schema.ts` | K4a — nối SKU của từng sàn/shop về SKU nội bộ. 1 SKU sàn chỉ nối được 1 SKU nội bộ; |
| `modules/master-skus/schemas/master-sku.schema.ts` | K4a (27/09/2026) — SKU NỘI BỘ: 1 sản phẩm thật = 1 mã, không phụ thuộc cách |

### `modules/notifications` — 6 file mã, 1 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/notifications/notifications.controller.ts` | — |
| `modules/notifications/notifications.errors.ts` | — |
| `modules/notifications/notifications.module.ts` | — |
| `modules/notifications/notifications.service.ts` | notifications.service.ts — MỚI (2026-09-10) |
| `modules/notifications/enums/notification-type.enum.ts` | Loại thông báo — mở rộng thêm khi có sự kiện mới, không đổi giá |
| `modules/notifications/schemas/notification.schema.ts` | notifications — MỚI (2026-09-10) |

### `modules/order-groups` — 28 file mã, 10 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/order-groups/express-order-sla.scheduler.ts` | SLA cảnh báo Đơn Hỏa Tốc — mỗi 10 phút, đúng thiết kế đã nghiên cứu |
| `modules/order-groups/order-group-backfill.scheduler.ts` | BACKFILL order_groups CHO ĐƠN CHƯA CÓ GROUP — LƯỚI AN TOÀN |
| `modules/order-groups/order-groups.controller.ts` | Response tối thiểu — cùng nguyên tắc "không trả thẳng Document ra |
| `modules/order-groups/order-groups.errors.ts` | DANH SÁCH MÃ LỖI — module order-groups (prefix: ORD_GROUP_) |
| `modules/order-groups/order-groups.module.ts` | Đăng ký LẠI schema Order đã có (KHÔNG import OrdersModule để tránh |
| `modules/order-groups/order-groups.service.ts` | Đọc TRỰC TIẾP schema Order đã có sẵn (KHÔNG sửa file gốc) — Mongoose/ |
| `modules/order-groups/staff-assignment.controller.ts` | staff-assignment.controller.ts — MỚI (2026-09-10) |
| `modules/order-groups/staff-assignment.errors.ts` | — |
| `modules/order-groups/staff-assignment.service.ts` | staff-assignment.service.ts — MỚI (2026-09-10) |
| `modules/order-groups/stock-availability.controller.ts` | K5 (27/09/2026) — tồn khả dụng + giữ chỗ của nhóm đơn. */ |
| `modules/order-groups/stock-reservation.service.ts` | K5 (27/09/2026) — CHỐNG BÁN LỐ: tồn khả dụng + giữ chỗ |
| `modules/order-groups/dto/assign-staff.dto.ts` | `staff_id` OPTIONAL — không truyền = auto-assign (Least-Busy), |
| `modules/order-groups/dto/decide-partial.dto.ts` | Hướng Y (đã chốt với user 2026-09-10): PARTIAL_NEEDS_REVIEW KHÔNG |
| `modules/order-groups/dto/link-order-group.dto.ts` | 13/10/2026 — Coordinator liên kết tay 2 nhóm đơn cùng người nhận (giao chung chuyến). */ |
| `modules/order-groups/dto/list-order-groups-query.dto.ts` | — |
| `modules/order-groups/dto/pack-order-group.dto.ts` | Body của POST /order-groups/:id/fulfillment/pack. `materials_used` là tùy chọn. */ |
| `modules/order-groups/dto/pick-item.dto.ts` | scan_method: audit (BR-07) — biết lần nào quét thật, lần nào nhập |
| `modules/order-groups/dto/receive-return.dto.ts` | Nhận hàng hoàn về kho (group phải đang `returned`). */ |
| `modules/order-groups/dto/report-missing.dto.ts` | UC-07 Alt Flow (Report 1, đề bài gốc): "Sản phẩm hết hàng lúc lấy |
| `modules/order-groups/dto/set-priority.dto.ts` | — |
| `modules/order-groups/dto/stock-availability-query.dto.ts` | (09/10/2026) Trước đây đọc chuỗi trần — thiếu tham số vẫn chạy và trả số 0 sai. */ |
| `modules/order-groups/dto/transition-order-group.dto.ts` | Body dùng CHUNG cho cả 5 endpoint fulfillment (pick/pack/ship/deliver/ |
| `modules/order-groups/enums/allowed-status-transitions.ts` | Map trạng thái hợp lệ KẾ TIẾP — dùng CHUNG cho cả 5 endpoint |
| `modules/order-groups/enums/group-fulfillment-status.enum.ts` | MODULE MỚI `order-groups/` — TÁCH BIỆT HOÀN TOÀN với `orders/enums/order-status.enum.ts` |
| `modules/order-groups/schemas/order-group.schema.ts` | order_groups — collection MỚI HOÀN TOÀN, KHÔNG đụng order.schema.ts |
| `modules/order-groups/schemas/pick-event.schema.ts` | pick_events — MỚI (2026-09-10), Điểm yếu #10 mục 4 |
| `modules/order-groups/schemas/stock-reservation.schema.ts` | K5 (27/09/2026) — GIỮ CHỖ TỒN KHO cho 1 nhóm đơn trên 1 khóa tồn. |
| `modules/order-groups/utils/add-business-hours.util.ts` | addBusinessHours() — Đơn Hỏa Tốc, giờ hành chính 8h-17h, TÍNH CẢ |

### `modules/orders` — 13 file mã, 5 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/orders/lazada-order-sync.scheduler.ts` | BỔ SUNG (AOFP-XX, 2026-09-16) — chống spam Notification khi sync lỗi |
| `modules/orders/orders.controller.ts` | Hình dạng response public — KHÔNG trả thẳng OrderDocument ra ngoài |
| `modules/orders/orders.errors.ts` | DANH SÁCH MÃ LỖI — module orders (prefix: ORD_) |
| `modules/orders/orders.module.ts` | MODULE `orders` — ĐỒNG BỘ + CHUẨN HÓA + GỘP ĐƠN (Mainflow 1) |
| `modules/orders/orders.service.ts` | Lần sync ĐẦU TIÊN của 1 shop (last_polled_at = null) — kéo lịch sử tối |
| `modules/orders/dto/list-orders-query.dto.ts` | — |
| `modules/orders/dto/sync-lazada-orders-query.dto.ts` | — |
| `modules/orders/enums/order-status.enum.ts` | BỔ SUNG (2026-09-10) — xác nhận qua bảng Error Code thật của |
| `modules/orders/mappers/lazada-order.mapper.ts` | "PHIÊN DỊCH" ĐƠN LAZADA → HÌNH DẠNG NỘI BỘ — CÔ LẬP CHỖ CHƯA CHẮC CHẮN |
| `modules/orders/schemas/order.schema.ts` | SUBDOCUMENT — ĐỊA CHỈ NGƯỜI NHẬN (embedded, không tách collection) |
| `modules/orders/utils/aggregate-order-items.util.ts` | GỘP items[] (LƯU DẠNG UNIT-LEVEL) → DÒNG HIỂN THỊ CHO FE |
| `modules/orders/utils/consolidation-key.util.ts` | CONSOLIDATION KEY — CỐT LÕI TỐI ƯU TỐC ĐỘ CỦA "Mainflow 1" |
| `modules/orders/utils/vn-administrative-area.util.ts` | ĐƠN VỊ HÀNH CHÍNH VIỆT NAM — tách Tỉnh / Quận / Phường từ các phần địa chỉ |

### `modules/packaging` — 30 file mã, 14 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/packaging/bag-fit.util.ts` | Kiểm túi zip có vừa món không (08/10/2026) — hàm thuần. |
| `modules/packaging/packaging-bag.controller.ts` | — |
| `modules/packaging/packaging-bag.service.ts` | CRUD danh mục túi zip (21/09/2026). Ngừng dùng = xóa mềm (Rule #8); |
| `modules/packaging/packaging-box.controller.ts` | (22/09/2026) Tồn kho: thực có, đang được phương án chưa đóng giữ chỗ, còn trống. */ |
| `modules/packaging/packaging-box.service.ts` | Tồn một loại thùng: `available` = `onHand` − `reserved` (không âm). */ |
| `modules/packaging/packaging-material.controller.ts` | (05/10/2026) Thu hồi dùng lại được khi tháo kiện. */ |
| `modules/packaging/packaging-material.service.ts` | Vật tư vừa bị trừ tồn lúc pack — dùng để báo sắp hết. */ |
| `modules/packaging/packaging.errors.ts` | Mã lỗi module packaging — từ 04/10/2026 chỉ còn danh mục thùng, túi zip, |
| `modules/packaging/packaging.module.ts` | Kho vật tư CHUNG (gộp main + thi_dev 04/10/2026) — thùng + vật tư chèn. |
| `modules/packaging/packing-guide-ai.service.ts` | `nhà-cung-cấp/model` đã viết, VD `groq/openai/gpt-oss-120b`; null nếu là câu mẫu. */ |
| `modules/packaging/dto/packaging-bag.dto.ts` | — |
| `modules/packaging/dto/packaging-box.dto.ts` | — |
| `modules/packaging/dto/packaging-material.dto.ts` | — |
| `modules/packaging/engine/budget.ts` | Ngân sách tính toán XÁC ĐỊNH (Bước 1, tin cậy kết quả) |
| `modules/packaging/engine/ep-packer.ts` | Packer extreme-point có chấm điểm (30/09/2026, Milestone 2) |
| `modules/packaging/engine/greedy-packer.ts` | Trần số món cho MỘT thùng (an toàn hiệu năng); đơn lớn hơn đi sang đa kiện. */ |
| `modules/packaging/engine/improve.ts` | Cải tiến sau greedy (Bước 2, chất lượng xếp) — giải thể kiện |
| `modules/packaging/engine/index.ts` | — |
| `modules/packaging/engine/lower-bound.ts` | Cận dưới số kiện (Bước 1; siết thêm ở Bước 2) |
| `modules/packaging/engine/material-selector.ts` | Chọn vật tư chèn theo luật (28/09/2026, P1) — hàm thuần |
| `modules/packaging/engine/multi-carton-packer.ts` | Chốt chặn đồng hồ tường (ms) — chỉ chống treo; giới hạn chính là `maxChecks`. */ |
| `modules/packaging/engine/packing-guide.ts` | Hướng dẫn đóng gói từng bước — phần DỮ KIỆN (21/09/2026) |
| `modules/packaging/engine/types.ts` | Engine đóng gói 3D — kiểu dữ liệu lõi (21/09/2026, BE-3a) |
| `modules/packaging/engine/units.ts` | Đổi cm → mm làm tròn LÊN (món hàng không được nhỏ hơn thực tế). |
| `modules/packaging/engine/validator.ts` | Hai khối giao nhau thật sự (chạm mặt KHÔNG tính là giao). */ |
| `modules/packaging/engine/scenarios/order-scenarios.ts` | Thư viện kịch bản đơn hàng (30/09/2026, Milestone 1) |
| `modules/packaging/enums/packaging-approval-status.enum.ts` | Rule #11 (CLAUDE.md) — mảng đã lọc, tránh reverse-mapping. |
| `modules/packaging/schemas/packaging-bag.schema.ts` | packaging_bags — MỚI (21/09/2026) — danh mục túi zip bọc hàng |
| `modules/packaging/schemas/packaging-material-rules.schema.ts` | packaging_material_rules — MỚI (28/09/2026, P1) — bộ luật chọn vật tư |
| `modules/packaging/schemas/packaging-recommendation.schema.ts` | Rule #1 (Database Design Standards) — sub-schema riêng, KHÔNG dùng |

### `modules/packaging-materials` — 8 file mã, 1 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/packaging-materials/packaging-materials.controller.ts` | G4 (27/09/2026) — vật liệu đóng gói + tái sử dụng. */ |
| `modules/packaging-materials/packaging-materials.errors.ts` | — |
| `modules/packaging-materials/packaging-materials.module.ts` | G4 (27/09/2026). KHÔNG import module nào khác (chỉ đọc schema gợi ý đóng gói) |
| `modules/packaging-materials/packaging-materials.service.ts` | 1 dòng cần trừ khi đóng gói: vật tư/thùng của 1 kiện trong kế hoạch. */ |
| `modules/packaging-materials/dto/packaging-material.dto.ts` | Không sửa được code/kind/kích thước (đã gắn với gợi ý đóng gói và lịch sử). */ |
| `modules/packaging-materials/schemas/box-dimensions.schema.ts` | Kích thước thùng theo mm (lòng thùng `inner` / mặt ngoài `outer`) — engine |
| `modules/packaging-materials/schemas/packaging-material.schema.ts` | G4 (27/09/2026) — danh mục + tồn vật liệu đóng gói. Tồn tách 2 loại: MỚI và |
| `modules/packaging-materials/schemas/packaging-movement.schema.ts` | G4 — sổ cái vật liệu đóng gói (append-only). Nguồn cho số liệu tiết kiệm. */ |

### `modules/packing` — 27 file mã, 5 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/packing/packer-assignment.service.ts` | Kế hoạch còn là "việc đang làm" của người đóng. */ |
| `modules/packing/packing-feedback.service.ts` | Vòng phản hồi cho Admin (08/10/2026) |
| `modules/packing/packing-job.service.ts` | Số nhóm tối đa xử lý mỗi lượt quét (giữ mỗi lượt ngắn). */ |
| `modules/packing/packing-plan.controller.ts` | Nhãn YẾU NHẤT trong các đơn (cả nhóm chỉ "tối ưu" khi mọi đơn tối ưu). */ |
| `modules/packing/packing-plan.service.ts` | Đệm hàng dễ vỡ của 1 kế hoạch (05/10/2026: lấy từ packing_settings lúc tính, |
| `modules/packing/packing-queue.service.ts` | Thông tin nhận diện 1 nhóm trên bảng hàng chờ đóng gói. */ |
| `modules/packing/packing-report.service.ts` | Duyệt xong → bắt đầu đóng (phút, trung bình; chỉ nhóm có bấm bắt đầu/quét). */ |
| `modules/packing/packing-session.service.ts` | Món của kiện còn chưa quét. */ |
| `modules/packing/packing-settings.service.ts` | null = đang dùng mặc định trong code (chưa ai lưu). */ |
| `modules/packing/packing.errors.ts` | Mã lỗi module packing (kế hoạch đóng gói `packing_plans`, 04/10/2026). */ |
| `modules/packing/packing.module.ts` | Kế hoạch đóng gói (04/10/2026, làm lại): bộ giải BRKGA + CP-SAT, kế hoạch |
| `modules/packing/dto/packing-plan.dto.ts` | Lý do làm KHÁC gợi ý (chỉnh tay, từ chối). Mỗi mã ứng với một việc Admin |
| `modules/packing/dto/packing-session.dto.ts` | Lý do khi xem lại kiện lệch cân / gỡ lần quét. */ |
| `modules/packing/schemas/packing-plan.schema.ts` | packing_plans — kế hoạch đóng gói của MỘT nhóm đơn (04/10/2026, đợt 3) |
| `modules/packing/schemas/packing-settings.schema.ts` | packing_settings — luật đóng gói Store Owner/Admin chỉnh được (05/10/2026) |
| `modules/packing/solver/brkga.ts` | BRKGA — Biased Random-Key Genetic Algorithm (Gonçalves & Resende, 2011; |
| `modules/packing/solver/cp-sat.ts` | Nâng nhãn chứng minh bằng CP-SAT (microservice `packer/`, đợt 2) |
| `modules/packing/solver/decoder.ts` | Bộ giải mã BRKGA: nhiễm sắc thể → phương án nhiều kiện |
| `modules/packing/solver/index.ts` | — |
| `modules/packing/solver/objective.ts` | Dựng kết quả 1 kiện từ trạng thái giải mã. */ |
| `modules/packing/solver/parcel-state.ts` | Trạng thái MỘT kiện trong lúc giải mã — Empty Maximal Spaces (EMS) |
| `modules/packing/solver/prng.ts` | PRNG xác định mulberry32 — cùng seed luôn ra cùng dãy số trong [0, 1). */ |
| `modules/packing/solver/proof.ts` | Chứng minh "tối ưu toàn cục" (optimal_global) bằng ĐIỀU KIỆN CẦN |
| `modules/packing/solver/solve-order.ts` | Giải MỘT đơn: chọn số kiện, thùng, vị trí, hướng xoay, gập |
| `modules/packing/solver/types.ts` | Bộ giải đóng gói mới (BRKGA + EMS, chứng minh tối ưu) — kiểu dữ liệu |
| `modules/packing/utils/parcels.util.ts` | Kiểu "đối tượng thuần" của 1 class schema — để sao chép/ghi đè field mà không mang prototype class. */ |
| `modules/packing/utils/stock-suggestion.util.ts` | Gợi ý kho thùng (04/10/2026) |

### `modules/product-master` — 8 file mã, 2 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/product-master/product-master-sync.scheduler.ts` | Danh sách sàn đồng bộ nằm ở ProductMasterService (PRODUCT_SYNC_PLATFORMS) — |
| `modules/product-master/product-master.controller.ts` | (08/10/2026) Chỉ có ở PUT packaging-profile: túi zip nhỏ nhất còn vừa gói vừa đo (null = không túi nào vừa). */ |
| `modules/product-master/product-master.errors.ts` | (29/09/2026) sàn chưa implement getProducts trên MarketplaceAdapter (VD TikTok/Tiki) |
| `modules/product-master/product-master.module.ts` | Chỉ đọc để kiểm tra mã túi zip khi xác nhận hồ sơ — không import |
| `modules/product-master/product-master.service.ts` | 🔄 ĐÃ ĐỔI (29/09/2026, AURELLE_MARKETPLACE_DESIGN.md Mục 9.3 #7) — |
| `modules/product-master/dto/confirm-packaging-profile.dto.ts` | Kho/Admin nhập số đo THẬT sau khi gấp/bọc (giày đo nguyên hộp). Nếu |
| `modules/product-master/dto/list-product-master-query.dto.ts` | — |
| `modules/product-master/schemas/product-master.schema.ts` | Rule #1 (Database Design Standards, CLAUDE.md) — sub-schema riêng |

### `modules/shipments` — 25 file mã, 6 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/shipments/carrier-status.util.ts` | C5 (14/10/2026) — trạng thái của HÃNG (GHN) → trạng thái vận đơn OptiPack |
| `modules/shipments/carrier-webhook.controller.ts` | C5 (14/10/2026) — WEBHOOK GHN (Order Status Callback) — PUBLIC, không JWT |
| `modules/shipments/legacy-fulfillment.controller.ts` | G1 (27/09/2026) — 3 route CŨ giữ NGUYÊN đường dẫn, body, response, quyền — |
| `modules/shipments/returns.controller.ts` | G3 (27/09/2026) — trả/hoàn hàng bản gọn (bấm nút, giả lập khách). |
| `modules/shipments/returns.errors.ts` | — |
| `modules/shipments/returns.service.ts` | (09/10/2026) Số phiếu tối đa đọc cho danh sách cách ly. */ |
| `modules/shipments/shipment-config.ts` | Tham số vận hành giao hàng — đọc từ biến môi trường, có giá trị mặc định. |
| `modules/shipments/shipment-sla.scheduler.ts` | Mỗi 15 phút: gắn cờ + gửi thông báo các vận đơn quá hạn giao. */ |
| `modules/shipments/shipment-transitions.ts` | Luật chuyển trạng thái vận đơn — định nghĩa 1 lần, mọi nút dùng chung. */ |
| `modules/shipments/shipments.controller.ts` | Gộp thi_dev (04/10/2026) — null khi giao bằng đội xe nhà (không chọn hãng) |
| `modules/shipments/shipments.errors.ts` | Gộp từ thi_dev (04/10/2026) — giao chung chuyến + chọn hãng |
| `modules/shipments/shipments.module.ts` | G1 (27/09/2026). Phụ thuộc 1 chiều: shipments -> order-groups. OrderGroupsModule |
| `modules/shipments/shipments.service.ts` | Hãng/dịch vụ chọn khi tạo vận đơn (gộp thi_dev 04/10/2026). */ |
| `modules/shipments/dto/create-shipment-batch.dto.ts` | Body của POST /shipments/batch (Mục 9.5, hàng #4). 🔄 30/09/2026: BẮT BUỘC chọn |
| `modules/shipments/dto/list-query.dto.ts` | (09/10/2026) Phân trang chung — trước đây đọc chuỗi trần, id sai định dạng lọt thành 500. */ |
| `modules/shipments/dto/return.dto.ts` | [Admin — đóng vai khách] Giả lập khách yêu cầu trả hàng / hoàn tiền / đổi hàng. */ |
| `modules/shipments/dto/shipment-action.dto.ts` | Gộp thi_dev (04/10/2026) — chọn hãng + dịch vụ để ghi cước/ETA lên vận đơn |
| `modules/shipments/enums/delivery-failure-reason.enum.ts` | Lý do giao thất bại — DANH SÁCH CỐ ĐỊNH (không cho gõ tự do) để thống kê |
| `modules/shipments/enums/return.enums.ts` | G3 (27/09/2026) — trả hàng / hoàn hàng (bản gọn, bấm nút, giả lập). */ |
| `modules/shipments/enums/shipment-event-type.enum.ts` | C4/C5 (14/10/2026) — vận đơn giao qua hãng thật (GHN) |
| `modules/shipments/enums/shipment-status.enum.ts` | G1 (27/09/2026) — trạng thái VẬN ĐƠN (chi tiết hơn trạng thái nhóm đơn). |
| `modules/shipments/schemas/carrier-webhook-event.schema.ts` | carrier_webhook_events — C5 (14/10/2026): sổ chống xử lý trùng sự kiện hãng |
| `modules/shipments/schemas/return-request.schema.ts` | Chỉ dòng "quarantine": pending -> restocked / discarded. Dòng cũ không có field = pending. |
| `modules/shipments/schemas/shipment-event.schema.ts` | G1 — lịch sử vận đơn = TRACKING dạng dòng thời gian. APPEND-ONLY: code |
| `modules/shipments/schemas/shipment.schema.ts` | C4 (14/10/2026) — chi tiết phí hãng báo cho 1 kiện (VND). */ |

### `modules/shipping` — 9 file mã, 4 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/shipping/live-carrier.service.ts` | Địa chỉ Coordinator sửa / bổ sung khi gửi hãng (đơn Lazada bị che). Rỗng = lấy từ đơn. */ |
| `modules/shipping/shipping.controller.ts` | Query địa chỉ → ToLocationInput (bỏ field không gửi). */ |
| `modules/shipping/shipping.errors.ts` | Mã lỗi module shipping (prefix SHIP_) — module vận chuyển: hãng, bảng cước, |
| `modules/shipping/shipping.module.ts` | Đăng ký LẠI schema kế hoạch đóng gói (KHÔNG import PackingModule) — cùng |
| `modules/shipping/shipping.service.ts` | C6 (14/10/2026) — 1 phương án đóng gói của 1 kiện kèm TỔNG chi phí. */ |
| `modules/shipping/dto/shipping.dto.ts` | — |
| `modules/shipping/schemas/shipping-carrier.schema.ts` | 1 dịch vụ của hãng (VD nhanh / tiết kiệm): thời gian giao dự kiến + bảng cước theo bậc khối lượng. */ |
| `modules/shipping/schemas/shipping-settings.schema.ts` | shipping_settings — MỚI (30/09/2026): tùy chọn vận chuyển của Store Owner |
| `modules/shipping/utils/shipping-cost.util.ts` | Tính cước vận chuyển — hàm THUẦN (30/09/2026) |

### `modules/storefront` — 24 file mã, 6 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/storefront/aurelle-open-api.mapper.ts` | Chiếu dữ liệu website AURELLE sang định dạng Open API (kiểu Lazada) |
| `modules/storefront/aurelle-webhook.publisher.ts` | Website AURELLE báo "đơn vừa đổi" cho ứng dụng đối tác đã kết nối bằng |
| `modules/storefront/catalog.service.ts` | — |
| `modules/storefront/customer-auth.controller.ts` | — |
| `modules/storefront/customer-auth.service.ts` | — |
| `modules/storefront/customer-jwt.guard.ts` | — |
| `modules/storefront/customer-jwt.strategy.ts` | — |
| `modules/storefront/storefront-admin-auth.controller.ts` | — |
| `modules/storefront/storefront-admin-auth.service.ts` | — |
| `modules/storefront/storefront-admin.controller.ts` | — |
| `modules/storefront/storefront-admin.guard.ts` | — |
| `modules/storefront/storefront-admin.service.ts` | — |
| `modules/storefront/storefront-cart.service.ts` | — |
| `modules/storefront/storefront-counter.util.ts` | Tối thiểu cái cần của 1 collection để $inc bộ đếm (mongoose hoặc driver gốc). */ |
| `modules/storefront/storefront-images.controller.ts` | — |
| `modules/storefront/storefront-orders.service.ts` | — |
| `modules/storefront/storefront-pricing.ts` | — |
| `modules/storefront/storefront-seed.service.ts` | — |
| `modules/storefront/storefront.controller.ts` | — |
| `modules/storefront/storefront.errors.ts` | (09/10/2026) Mã lỗi website AURELLE (storefront + tài khoản khách). Exception |
| `modules/storefront/storefront.module.ts` | — |
| `modules/storefront/dto/storefront-admin.dto.ts` | — |
| `modules/storefront/dto/storefront.dto.ts` | Hệ thống mới sau sáp nhập bỏ cấp quận/huyện; địa chỉ cũ vẫn gửi field này. |
| `modules/storefront/schemas/storefront.schema.ts` | — |

### `modules/users` — 10 file mã, 1 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/users/users.controller.ts` | (09/10/2026) Một dòng trong danh sách nhân viên cho Admin/Store Owner. Trước |
| `modules/users/users.errors.ts` | — |
| `modules/users/users.module.ts` | — |
| `modules/users/dto/admin-update-user.dto.ts` | FIX #6: Admin sửa thông tin 1 user ĐÃ TỒN TẠI (khác CreateUserDto — không có |
| `modules/users/dto/create-user.dto.ts` | — |
| `modules/users/dto/index.ts` | — |
| `modules/users/dto/update-profile.dto.ts` | — |
| `modules/users/schemas/index.ts` | — |
| `modules/users/schemas/user.schema.ts` | ĐÃ THAY ĐỔI 2026-09-14 so với unique partial `{ is_active: true }`: |
| `modules/users/services/users.service.ts` | hạn đổi mật khẩu — 72 giờ kể từ lúc must_change_password bật lên |

### `modules/warehouse` — 21 file mã, 7 file test

| File | Chức năng (chú thích đầu file) |
|---|---|
| `modules/warehouse/warehouse-layout.ts` | K2 (26/09/2026) — BỐ CỤC KHO CHUẨN MỚI (layout v2) |
| `modules/warehouse/warehouse.controller.ts` | BỔ SUNG (2026-09-10) — Điểm yếu #9: trước đây trả THẲNG Document |
| `modules/warehouse/warehouse.errors.ts` | BỔ SUNG (16/09/2026) — báo cáo thật: tạo trùng warehouse_code/zone_code |
| `modules/warehouse/warehouse.module.ts` | — |
| `modules/warehouse/warehouse.service.ts` | K1 (26/09/2026) — document khu/kệ tạo TRƯỚC K1 không có field is_active. |
| `modules/warehouse/dto/assign-sku-bin.dto.ts` | BỔ SUNG (2026-09-10) — Điểm yếu #10 mục 1. Optional: gán vị trí |
| `modules/warehouse/dto/bin-suggestions-query.dto.ts` | (09/10/2026) category_code bắt buộc — trước đây thiếu vẫn chạy. */ |
| `modules/warehouse/dto/create-rack.dto.ts` | K2 — tạo 1 KỆ (1 bên của dãy, 1 số kệ) cùng toàn bộ ô bên trong, trong 1 lần gọi. |
| `modules/warehouse/dto/create-warehouse.dto.ts` | — |
| `modules/warehouse/dto/create-zone.dto.ts` | — |
| `modules/warehouse/dto/generate-bin-locations.dto.ts` | Range generator — Admin không phải tạo tay từng kệ 1 (VD 40 kệ = |
| `modules/warehouse/dto/restock-sku.dto.ts` | K2 — vượt sức chứa ô thì bị chặn 409 WH_BIN_OVER_CAPACITY; gửi force=true |
| `modules/warehouse/dto/stock-operations.dto.ts` | K3 — kiểm kê: nhập SỐ ĐẾM THỰC TẾ, hệ thống tự tính chênh lệch. */ |
| `modules/warehouse/dto/update-bin.dto.ts` | K2 — sửa 1 ô: sức chứa + thuộc tính đăng ký (danh mục/size/màu). |
| `modules/warehouse/dto/update-warehouse.dto.ts` | K1 (26/09/2026) — CHỈ cho sửa tên + địa chỉ. `warehouse_code` KHÔNG có |
| `modules/warehouse/dto/update-zone.dto.ts` | K1 (26/09/2026) — CHỈ cho sửa tên + mô tả. `zone_code` KHÔNG sửa được: |
| `modules/warehouse/schemas/bin-location.schema.ts` | bin_locations — tầng 3/4 ("kệ/vị trí", VD "A-03-02" = Khu A, Kệ 3, |
| `modules/warehouse/schemas/inventory-movement.schema.ts` | K3 (27/09/2026) — SỔ CÁI BIẾN ĐỘNG KHO. APPEND-ONLY: code không có đường |
| `modules/warehouse/schemas/sku-bin-assignment.schema.ts` | sku_bin_assignments — tầng 4/4, nối SKU (đã có trong product_master, |
| `modules/warehouse/schemas/warehouse-zone.schema.ts` | warehouse_zones — tầng 2/4 ("khu", VD "Khu A - Phụ kiện điện tử"). |
| `modules/warehouse/schemas/warehouse.schema.ts` | warehouse — tầng 1/4, MỚI (2026-09-09). Thiết kế đã CHỐT SẴN từ |


## 5. Đánh giá cách bố trí

### Điểm tốt

- Khuôn module đồng nhất (module / controller / service / errors / dto / schemas / enums / utils); thuật toán thuần nằm ở `utils/` hoặc `solver/`, `engine/` — test được không cần DI.
- Mã lỗi có tiền tố theo module (`WH_`, `SHP_`, `SHIP_`, `PACKING_`, `CARRIER_`…).
- Lớp adapter: sàn (`MARKETPLACE_ADAPTERS` — Lazada, AURELLE) và hãng vận chuyển (`CARRIER_ADAPTER` — GHN, mock) — thêm sàn/hãng không sửa luồng.
- Scheduler tách khỏi service; test đặt cạnh mã (85 file).

### Điểm chưa tối ưu

| Vấn đề | Ví dụ | Đề xuất |
|---|---|---|
| Service quá lớn | `order-groups.service.ts` 2.250 dòng, `packing-plan.service.ts` 1.594, `warehouse.service.ts` 1.485, `shipments.service.ts` 1.414 | Tách theo nhóm chức năng (VD `shipments` → `carrier-tracking.service`, `shipment-batch.service`) |
| Module ghi thẳng collection của module khác | `shipments`, `documents`, `shipping`, `packing` đăng ký schema `Order`, `PackingPlan`… | Chỉ module sở hữu được ghi; module khác gọi service |
| Tên module chưa đúng nội dung | `shipments/` chứa cả trả hàng/đổi hàng/route cũ; `master-skus/` chứa cả màu | Tách `returns/`, `colors/` |
| Mã/schema chết | `packaging-recommendation.schema.ts` (không module nào đăng ký), adapter TikTok/Tiki, biến `TIKTOK_*`/`TIKI_*` | Xoá khi FE bỏ màn cũ |
| Comment lịch sử dày đặc | "BỔ SUNG (dd/mm)…", "ĐÃ ĐỔI…" | Giữ comment *vì sao*; lịch sử để ở Git + CLAUDE.md |
