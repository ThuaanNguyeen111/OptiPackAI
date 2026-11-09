# Changelog — module `marketplace-integration` (merge trực tiếp vào be.zip thật, 22/08/2026)

## Đã tự động patch — KHÔNG cần làm tay nữa

- `src/app.module.ts`: thêm `marketplaceConfig` vào `load:[]`, thêm `MarketplaceIntegrationModule` vào `imports:[]`
- `src/main.ts`: thêm `app.useGlobalFilters(new GlobalExceptionFilter())`
- `package.json`: thêm `"axios": "^1.7.9"` vào dependencies
- `.env.example`: thêm section "Marketplace Integration" ở cuối file
- `src/common/exceptions/app-exception.ts`: file mới (thư mục cũ đang rỗng, không đè gì)
- `src/common/filters/global-exception.filter.ts`: file mới (thư mục chưa từng có)
- `src/config/marketplace.config.ts`: file mới, đúng pattern `registerAs()` như `database.config.ts`

**KHÔNG đụng vào**: `modules/auth/`, `modules/users/`, `modules/mail/`, `common/redis/` — giữ nguyên 100%.

## 3 lỗi thật đã sửa so với bản thảo đầu tiên (đối chiếu code thật)

1. DB field phải `snake_case` viết TRỰC TIẾP trên property (giống `user.schema.ts`) — đã sửa toàn bộ `marketplace-shop.schema.ts`
2. Config phải qua `ConfigService` namespace, không đọc thẳng `process.env` — đã sửa 3 adapter + service
3. `RedisCacheService` thật không có hàm chung `get/set/del` — đổi OAuth state sang collection Mongo mới `marketplace_oauth_states` (TTL 600s), không đụng Redis/Auth

## Việc CÒN LẠI bạn phải tự làm

```bash
cd be
npm install   # cài axios vừa thêm vào package.json
```

Rồi điền giá trị thật vào các biến mới trong `.env` (copy từ `.env.example` phần "Marketplace Integration").

## Tài khoản đăng ký từng sàn (cập nhật 22/08/2026)

| Sàn | Email đăng ký | Người đứng tên Seller | Trạng thái |
|---|---|---|---|
| TikTok | Email chung nhóm | — | Chờ Partner registration review (3-5 ngày) |
| Lazada | Email chung nhóm | CCCD 1 thành viên | "Under review" (1-3 ngày) |
| Tiki | Email CÁ NHÂN riêng | Profile "Personal" | Chờ verify (tối đa 3 ngày) |

## 🔄 31/10/2026 — Tiki: ĐÃ KẾT NỐI THẬT (app Inhouse)

Các ghi chú Tiki phía trên (OAuth authorization_code qua `id.tiki.vn`, tên field `seller_id`/`seller_code` trong response token) là SUY ĐOÁN cũ — **không dùng nữa**. Đã đăng ký và gọi thử thật:

- open.tiki.vn → Application Create → **Inhouse**, Seller ID `365980`, Seller name "OptiPackAI Test Shop", token endpoint auth = Basic header. App ID `7463062494373526`. Nhà bán đồng ý ở Seller Center (`Thông tin nhà bán` → `Thiết lập gian hàng`) → trạng thái app "Connected".
- Token: `POST https://api.tiki.vn/sc/oauth2/token`, Basic AppID:Secret, `grant_type=client_credentials` → `{ access_token, expires_in: 1295999, scope: "", token_type: "bearer" }` — không refresh token.
- `GET /integration/v2/sellers/me` (Bearer) → `operation_models: ["dropship","instock"]`. Header `tiki-api` (doc ghi) bị từ chối "Missing Authorization header".
- Kho nhà bán `425011` "OptiPackAI Warehouse" (Bình Thạnh), gán cho kho Tiki `sgn`, `sgn3`; `hn4`, `dn` không có.
- Secret chỉ để trong `be/.env` (`TIKI_CLIENT_SECRET`), không commit. Secret từng hiện trong 1 cuộc trò chuyện — dùng thật thì bấm "Renew secret" trên open.tiki.vn rồi cập nhật `.env`.
