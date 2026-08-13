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

## Cấu trúc BÊN TRONG 1 module — BẮT BUỘC theo đúng khuôn này

Module có ≥ 2 entity hoặc ≥ 2 controller PHẢI theo đầy đủ cấu trúc subfolder sau (không được rút gọn tùy tiện):

```
modules/<name>/
 ┣ controllers/
 ┃  ┣ <feature-a>.controller.ts
 ┃  ┣ <feature-b>.controller.ts
 ┃  ┗ index.ts              ← export * from mỗi controller
 ┣ dto/
 ┃  ┣ <feature-a>.dto.ts
 ┃  ┗ index.ts              ← export TỪNG class DTO theo tên cụ thể
 ┣ schemas/
 ┃  ┣ <feature-a>.schema.ts
 ┃  ┗ index.ts              ← export cả class VÀ type Document riêng
 ┣ services/
 ┃  ┣ <feature-a>.service.ts
 ┃  ┗ index.ts              ← export * from mỗi service
 ┣ index.ts                  ← barrel gốc: chỉ export những gì module KHÁC thực sự cần (thường là schema + Document type)
 ┗ <name>.module.ts           ← @Module: MongooseModule.forFeature([...]) + controllers + providers + exports
```

Chỉ module NHỎ (1 entity, 1 controller — vd `admin`, `audit`) mới được để PHẲNG ngay trong `modules/<name>/`, không tạo subfolder rỗng.

**Quy tắc barrel `index.ts` theo từng loại** (khác nhau, không dùng `export *` tràn lan cho mọi trường hợp):

- `controllers/`, `services/`: `export * from './x.controller'` — an toàn vì tên class thường không đụng nhau
- `dto/`: export TỪNG class cụ thể theo tên (`export { CreateOrderDto, UpdateOrderDto } from './order.dto'`) — tránh xung đột tên DTO giữa các module
- `schemas/`: export cả class schema lẫn type Document riêng biệt (`export { Order, OrderSchema } from './order.schema'; export type { OrderDocument } from './order.schema';`)

**Import xuyên module**: luôn qua path alias (`@modules/orders`), KHÔNG dùng relative path xuyên module (`../../../orders/...`). Trong cùng 1 module thì dùng relative path bình thường.

## Naming Convention

- **File**: `kebab-case.<type>.ts`
- **DB field / JSON payload trả về FE**: `snake_case`
- **Biến / method trong TypeScript**: `camelCase`
- **Class**: `PascalCase`

## Controller / Service / DTO / Schema / Testing

_(Giữ nguyên convention đã rút ra từ project trước — xem lịch sử style: comment header đánh số tiếng Việt, Swagger đầy đủ, exception built-in message tiếng Việt, DTO validate message tiếng Việt, bcrypt cost 12, config qua ConfigService namespaced key.)_

## Type Safety / Build Hygiene — BẮT BUỘC (rút kinh nghiệm từ dự án `be` cũ)

tsconfig của project bật `"declaration": true` + `strict: true` + `noUncheckedIndexedAccess: true`, và ESLint dùng `strictTypeChecked` (`no-unsafe-assignment`, `no-explicit-any`, `explicit-function-return-type`...). 4 quy tắc dưới đây từng gây ra CẢ MỘT CHUỖI lỗi khó debug (TS4053, unsafe-any, warning tràn lan) trong module Auth — bắt buộc tuân thủ để không lặp lại:

### 1. LUÔN khai báo return type tường minh cho MỌI public method của Controller/Service

Không để TypeScript tự suy luận (`async login(...) {`). Vì `declaration: true`, nếu kiểu suy luận ra chứa 1 interface/type **không được `export`** ở module khác → lỗi `TS4053: ... cannot be named`, chỉ hiện ra sau khi các lỗi khác (vd otplib) đã được dọn — rất dễ tưởng nhầm là lỗi mới phát sinh.

```ts
// ❌ Tránh
async login(@Body() dto: LoginDto) { return this.authService.login(...); }

// ✅ Luôn làm
async login(@Body() dto: LoginDto): Promise<LoginResult | MfaRequiredResult> {
  return this.authService.login(...);
}
```

### 2. Interface/type dùng làm return type của method public trong exported class → BẮT BUỘC `export`

Kể cả khi interface đó chỉ dùng nội bộ trong 1 service, nếu nó "lộ" ra qua return type của 1 public method (trực tiếp hoặc gián tiếp qua method khác gọi tới) thì phải export, nếu không sẽ dính TS4053 y hệt lỗi `LoginResult`/`MfaRequiredResult` đã gặp.

### 3. KHÔNG tin thẳng type suy luận ra từ Express `Request` khi gán vào field có kiểu cụ thể

Từng gặp `req.headers['user-agent']` bị ESLint coi là `any` dù `@types/express` cài đúng version — nguyên nhân chính xác không xác định được (type-inference quirk giữa `@types/express`/node16 moduleResolution). Quy tắc phòng thủ, áp dụng mọi nơi lấy giá trị từ `req.headers`, `req.query`, hoặc bất kỳ index access nào tương tự:

```ts
// ✅ Ép qua `unknown` rồi narrow bằng typeof/type guard — an toàn tuyệt đối
// bất kể type declaration của thư viện có đúng hay không
const raw: unknown = req.headers['user-agent'];
const userAgent = typeof raw === 'string' ? raw : undefined;
```

### 4. Khi thêm hoặc đổi version 1 dependency (đặc biệt lib có major version breaking như `otplib`)

- Kiểm tra CHANGELOG/migration guide trước khi để `^` tự động lên major mới — `otplib` v13 từng xóa hẳn preset `authenticator` (API cũ dùng `.generateSecret()/.keyuri()/.verify()`) mà không note rõ trong error message, khiến 1 lỗi TS đơn giản kéo theo 11 lỗi ESLint `unsafe-*` ăn theo.
- Sau khi đổi version trong `package.json`, nếu `npm ls <pkg> --workspace=be` vẫn báo `invalid` hoặc version cũ dù cài lại — **xóa hẳn `node_modules` + `package-lock.json` rồi `npm install` lại từ đầu** (đừng chỉ chạy `npm install <pkg>@version` — với npm workspaces, cách này hay bị "up to date" giả, không thực sự ghi đè `node_modules`).

## Commit Message

Format chính thức (đã cập nhật, khác với bản gốc trong Report 2 — cần đồng bộ lại Report 2): kết hợp Conventional Commits + mã ticket Jira đặt trong `scope`:

```
type(AOFP-12): mô tả ngắn gọn
```

Ví dụ: `feat(AOFP-12): add Shopee webhook configuration`, `fix(AOFP-15): resolve duplicate order detection bug`.
Type hợp lệ: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. Enforce tự động qua `commitlint.config.mjs` + husky `commit-msg` hook.

## Database Design Standards — BẮT BUỘC (rút kinh nghiệm từ lỗi ở project EDUMEE)

### 1. Không bao giờ dùng `type: Array` / `type: Object` cho dữ liệu có cấu trúc

Mọi object/array lồng bên trong 1 schema PHẢI có Mongoose sub-schema riêng bằng `@Schema({ _id: false })`, KHÔNG dùng interface TypeScript suông (interface biến mất lúc runtime, Mongoose không validate được).

```ts
@Schema({ _id: false })
export class BoxDimension {
  @Prop({ required: true }) length_cm!: number;
  @Prop({ required: true }) width_cm!: number;
  @Prop({ required: true }) height_cm!: number;
}
export const BoxDimensionSchema = SchemaFactory.createForClass(BoxDimension);

@Schema({
  collection: 'packaging_recommendations',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class PackagingRecommendation {
  @Prop({ type: BoxDimensionSchema, required: true })
  recommended_box!: BoxDimension; // ✅ có validate thật, không phải "Object" mù mờ
}
```

### 2. Tránh mảng lồng không giới hạn (Unbounded Array Growth)

Dữ liệu tăng dần theo thời gian (order events, fulfillment scan logs, packing history) PHẢI là **collection riêng** tham chiếu `order_id`, KHÔNG nhét vào 1 mảng bên trong document Order. Chỉ embed khi dữ liệu có kích thước cố định, nhỏ, không tăng trưởng (vd `shipping_address`, `recommended_box`).

### 3. Mọi field dùng để filter/sort trong controller PHẢI có index tương ứng — khai báo NGAY khi thêm field đó

Không để "thêm filter trước, tối ưu sau" — index viết cùng lúc với schema, kèm comment nêu rõ query nào cần nó:

```ts
// Phục vụ: GET /orders?status=xxx&channel=shopee (OrdersController.findAll)
OrderSchema.index({ status: 1, channel: 1, created_at: -1 });
```

Áp dụng nguyên tắc **ESR (Equality → Sort → Range)** khi thiết kế compound index — field lọc bằng (`=`) đứng trước, field sort đứng giữa, field range (`$gt`/`$lt`) đứng cuối.

### 4. Không tự ý index field cardinality thấp (boolean, enum ít giá trị) một mình

Chỉ đưa boolean/enum vào **compound index** đứng sau field cardinality cao hơn, không tạo index riêng lẻ cho chúng — index đơn lẻ trên field 2-3 giá trị thường bị query planner bỏ qua, chỉ tốn chi phí ghi.

### 5. Ràng buộc duy nhất nghiệp vụ PHẢI enforce ở tầng DB, không chỉ ở service

```ts
OrderConsolidationSchema.index({ source_order_id: 1, channel: 1 }, { unique: true });
```

Không phó mặc chống trùng cho code service — race condition sẽ xuyên thủng logic đó.

### 6. Ghi đa collection PHẢI dùng Mongoose transaction (session)

Bất kỳ luồng nào ghi > 1 collection trong cùng 1 nghiệp vụ (vd: xác nhận đóng gói → cập nhật Order + tạo ShippingLabel + trừ FulfillmentQueue) PHẢI bọc trong `session.withTransaction()`. Không chấp nhận ghi rời rạc rồi hy vọng không lỗi giữa chừng.

### 7. Counter/số liệu cộng dồn PHẢI atomic, không đọc-rồi-ghi

```ts
// ❌ SAI — race condition (lost update)
const order = await this.orderModel.findById(id);
order.total_packed += 1;
await order.save();

// ✅ ĐÚNG — atomic ở tầng MongoDB
await this.orderModel.findByIdAndUpdate(id, { $inc: { total_packed: 1 } });
```

### 8. Xóa mềm nhất quán trên MỌI schema có thể bị tham chiếu

Không được để 1 module dùng soft-delete (`is_active`) còn module khác xóa cứng — chọn 1 convention duy nhất (`is_active: boolean` + `deleted_at?: Date`) áp dụng toàn bộ `modules/`, ghi rõ trong PR nếu có ngoại lệ.

### 9. Kiểu Document nhất quán toàn project

Luôn dùng `HydratedDocument<T>` (Mongoose 8 khuyến nghị), KHÔNG trộn với pattern cũ `T & Document`.

### 10. Dashboard/Analytics (FE-07) không query trực tiếp aggregation nặng mỗi lần load

Với các con số tổng hợp tính toán tốn kém (tổng chi phí đóng gói theo tháng, hiệu suất kho...), dùng **scheduled job tính trước** (cron ghi vào collection `dashboard_snapshots`) thay vì chạy `aggregate()` phức tạp mỗi lần user mở dashboard.

## Khi tạo module mới, LUÔN:

0. Trước khi viết schema: liệt kê rõ field nào sẽ dùng để filter/sort ở controller → thiết kế index NGAY lúc đó theo nguyên tắc ESR, không để "sau"
1. Đăng ký `MongooseModule.forFeature([...])` trong `<name>.module.ts`
2. Swagger đầy đủ, DTO validate tiếng Việt
3. Nếu module đụng tới Order Consolidation hoặc AI Packaging → viết `.spec.ts` bắt buộc (yêu cầu QA trong Report 2)
4. Không tự thêm tích hợp Facebook/Lazada trừ khi được yêu cầu — ngoài phạm vi đồ án
