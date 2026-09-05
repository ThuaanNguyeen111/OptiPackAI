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
