# OptiPackAI Backend — Coding Guide cho Claude

**OptiPackAI** (tên dự án theo phiếu đăng ký: AOFP — AI-Assisted Omnichannel Order Fulfillment and Packaging Optimization System).
Hệ thống nội bộ (không multi-tenant) giúp doanh nghiệp đồng bộ đơn hàng từ Shopee + TikTok Shop, gộp đơn trùng, dùng AI gợi ý đóng gói (3D bin packing), ước tính phí ship, sinh nhãn/QR/barcode, theo dõi fulfillment, và xem dashboard.

## Quyết định kiến trúc đã chốt

- **Database**: MongoDB + Mongoose (không dùng PostgreSQL dù phiếu đề xuất có gợi ý)
- **Message queue**: CHƯA dùng Kafka/BullMQ ở giai đoạn đầu — đồng bộ đơn hàng qua webhook đơn giản từ Shopee/TikTok. Có thể bổ sung BullMQ+Redis sau nếu cần retry/queue.
- **3D Bin Packing (AI Packaging)**: CHƯA chốt cách triển khai (microservice Python OR-Tools vs thư viện JS thuần) — quyết định sau khi có prototype. Không tự ý chọn khi code — hỏi lại nếu task đụng tới module này.
- **Phạm vi tích hợp sàn**: chỉ Shopee + TikTok Shop (Facebook/Lazada nằm ngoài phạm vi theo Report 1, mục 6.2 — không code cho các sàn này trừ khi được yêu cầu rõ)

## Tech Stack

- NestJS 11, Mongoose 8 (MongoDB), Passport (JWT)
- class-validator + class-transformer cho DTO
- @nestjs/swagger cho API docs
- Cần bổ sung so với project cũ: thư viện sinh QR/Barcode (`qrcode`, `bwip-js`), xuất PDF (packing slip/shipping label — `pdfkit` hoặc `@react-pdf/renderer`), HTTP client cho Shopee Open API + TikTok Shop Partner API (dùng `axios`, tự viết wrapper — 2 sàn này không có SDK Node chính thức ổn định)
- Jest cho unit test (đặc biệt bắt buộc cho module Order Consolidation và AI Packaging theo Report 2, mục 2.2)

## Cấu trúc thư mục

```
src/
  common/       # dùng chung: auth guard, dto, enums, filters, interceptors, mail, pipes, services
  config/       # namespaced config (app, database, jwt, marketplace credentials)
  modules/      # 1 module = 1 domain
    orders/           # đồng bộ đơn hàng từ sàn, gộp đơn (FE-01, FE-02)
    packaging/         # AI packaging recommendation, 3D bin packing (FE-03)
    shipping/           # ước tính phí, tạo nhãn (FE-04, FE-05)
    fulfillment/        # picking/packing tracking (FE-06, FE-07)
    marketplace-integration/  # connector Shopee, TikTok Shop
    admin/              # user, role, AI config (FE-08)
```

Path alias: `@/*`, `@common/*`, `@modules/*`, `@config/*`.

## Naming Convention

- **File**: `kebab-case.<type>.ts`
- **DB field / JSON payload trả về FE**: `snake_case`
- **Biến / method trong TypeScript**: `camelCase`
- **Class**: `PascalCase`

## Controller / Service / DTO / Schema / Testing

_(Giữ nguyên convention đã rút ra từ project trước — xem lịch sử style: comment header đánh số tiếng Việt, Swagger đầy đủ, exception built-in message tiếng Việt, DTO validate message tiếng Việt, bcrypt cost 12, config qua ConfigService namespaced key.)_

## Commit Message

Format chính thức (đã cập nhật, khác với bản gốc trong Report 2 — cần đồng bộ lại Report 2): kết hợp Conventional Commits + mã ticket Jira đặt trong `scope`:

```
type(AOFP-12): mô tả ngắn gọn
```

Ví dụ: `feat(AOFP-12): add Shopee webhook configuration`, `fix(AOFP-15): resolve duplicate order detection bug`.
Type hợp lệ: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. Enforce tự động qua `commitlint.config.mjs` + husky `commit-msg` hook.

## Khi tạo module mới, LUÔN:

1. Đăng ký `MongooseModule.forFeature([...])` trong `<name>.module.ts`
2. Swagger đầy đủ, DTO validate tiếng Việt
3. Nếu module đụng tới Order Consolidation hoặc AI Packaging → viết `.spec.ts` bắt buộc (yêu cầu QA trong Report 2)
4. Không tự thêm tích hợp Facebook/Lazada trừ khi được yêu cầu — ngoài phạm vi đồ án
