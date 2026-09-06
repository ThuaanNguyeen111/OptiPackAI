# OptiPackAI Backend — Coding Guide cho Claude

**OptiPackAI** (tên dự án theo phiếu đăng ký: AOFP — AI-Assisted Omnichannel Order Fulfillment and Packaging Optimization System).
Hệ thống nội bộ (không multi-tenant) giúp doanh nghiệp đồng bộ đơn hàng từ TikTok Shop + Lazada + Tiki, gộp đơn trùng, dùng AI gợi ý đóng gói (3D bin packing), ước tính phí ship, sinh nhãn/QR/barcode, theo dõi fulfillment, và xem dashboard.

> **Lịch sử đổi phạm vi sàn (cập nhật 2026-09-04, sửa lại lý do ghi sai ngày 2026-08-22)**: Bản gốc nhắm Shopee + TikTok Shop.
> - **Shopee bị loại khỏi scope** — lý do ĐÚNG (bản ghi cũ nói "mã số thuế bắt buộc" là SAI, đã sửa): đăng ký dev account Shopee route "Shopee Seller" (cá nhân) đòi hỏi shop Shopee liên kết phải **đã đạt trạng thái Preferred Seller hoặc Mall Seller** — một shop cá nhân mới lập không bao giờ đạt được ngay. Đã đọc kỹ toàn bộ doc chính thức Shopee Open Platform (Authorization, API calls, App management, Developer account registration) để xác nhận, xem thêm ở mục "Nghiên cứu Shopee — dừng scope nhưng giữ tài liệu" bên dưới.
> - **TikTok Shop Partner Center (API/sandbox) cũng bị xác nhận KHÔNG khả thi**: bắt buộc giấy phép kinh doanh + công ty thành lập > 1 năm, không có route cá nhân/self-developed nào. (Đã tạo được TikTok Shop **Seller Center** cá nhân — `seller-vn.tiktok.com` — nhưng đây KHÁC hoàn toàn Partner Center, không có API.)
> - **Lazada** trở thành sàn tích hợp CHÍNH và DUY NHẤT đang code (đăng ký cá nhân chỉ cần CCCD) — đã OAuth connect + GetOrders + lưu DB thành công END-TO-END với đơn hàng thật (xem mục "Module Orders — Lazada ĐÃ CHẠY END-TO-END" bên dưới).
> - **TikTok Shop và Tiki**: cố ý HOÃN lại (không xóa khỏi roadmap, nhưng KHÔNG code adapter tích cực lúc này) cho tới khi 2 sàn này sẵn sàng hơn (TikTok cần chờ hướng giải quyết business license; Tiki cần chờ email xin sandbox từ `partnersupport@tiki.vn` được duyệt).
> - **Facebook Marketplace** (C2C listing cá nhân) xác nhận KHÔNG có API công khai, Meta không có kế hoạch mở. Nếu sau này cần tích hợp Facebook, mục tiêu đúng là **Facebook Shop** (Meta Commerce/Catalog API, chỉ cần Facebook Business Manager miễn phí) — mới là hướng nghiên cứu, CHƯA quyết định đưa vào scope chính thức.

## Quyết định kiến trúc đã chốt

- **Database**: MongoDB + Mongoose (không dùng PostgreSQL dù phiếu đề xuất có gợi ý)
- **Message queue**: CHƯA dùng Kafka/BullMQ ở giai đoạn đầu — TikTok đồng bộ qua webhook (best-effort, cần cron đối soát dự phòng), Lazada qua polling định kỳ (chưa xác nhận có webhook chính thức đáng tin), Tiki qua Event Queue (cơ chế riêng của Tiki, KHÁC webhook truyền thống — đọc kỹ tài liệu `event-queue` trước khi code, không áp thẳng logic webhook TikTok vào đây). Có thể bổ sung BullMQ+Redis sau nếu cần retry/queue.
- **3D Bin Packing (AI Packaging)**: CHƯA chốt cách triển khai (microservice Python OR-Tools vs thư viện JS thuần) — quyết định sau khi có prototype. Không tự ý chọn khi code — hỏi lại nếu task đụng tới module này.
- **Phạm vi tích hợp sàn — CODE TÍCH CỰC hiện tại: CHỈ Lazada** (đã đổi từ Shopee + TikTok — xem lịch sử đổi phạm vi ở đầu file). TikTok Shop + Tiki vẫn trong roadmap nhưng adapter **cố ý HOÃN**, không code song song lúc này — tránh vừa dang dở nhiều sàn cùng lúc trong khi Lazada mới vừa chạy ổn định. Facebook Shop mới ở mức nghiên cứu, chưa vào scope chính thức. Shopee: KHÔNG code lại trừ khi được yêu cầu rõ (đã gỡ `shopee.adapter.ts` khỏi `marketplace-integration/`; toàn bộ nghiên cứu sandbox Shopee được giữ lại làm tài liệu tham khảo, không phải code).

## Tech Stack

- NestJS 11, Mongoose 8 (MongoDB), Passport (JWT)
- class-validator + class-transformer cho DTO
- @nestjs/swagger cho API docs
- nodemailer cho gửi email (welcome/quên mật khẩu/khóa tài khoản/MFA) — xem module `mail/`
- Cần bổ sung so với project cũ: thư viện sinh QR/Barcode (`qrcode`, `bwip-js`), xuất PDF (packing slip/shipping label — `pdfkit` hoặc `@react-pdf/renderer`), HTTP client cho TikTok Shop Partner API + Lazada Open Platform (dùng `axios`, tự viết wrapper HMAC — 2 sàn này không có SDK Node chính thức ổn định) + Tiki Open API (dùng chuẩn OAuth2 thuần túy, KHÔNG cần tự ký — đơn giản hơn hẳn 2 sàn kia, xem `marketplace-integration/adapters/tiki.adapter.ts`)
- Jest cho unit test (đặc biệt bắt buộc cho module Order Consolidation và AI Packaging theo Report 2, mục 2.2)

## Module Auth/Users — ĐÃ HOÀN THIỆN (đọc kỹ trước khi sửa, tránh code trùng)

Auth/Users KHÔNG nằm trong 5 package chính thức của đồ án nhưng là hạ tầng nền tảng bắt buộc, đã code đầy đủ các tính năng sau — **kiểm tra danh sách này trước khi thêm tính năng auth mới, rất có thể đã có sẵn**:

- **Role model = ĐÚNG 5 role theo Report 1 (System Actors), lưu dạng SỐ (numeric enum)**: `STORE_OWNER=0, WAREHOUSE_STAFF=1, PACKAGING_STAFF=2, SHIPPING_COORDINATOR=3, ADMIN=4` — KHÔNG dùng lại role kiểu cũ (`MANAGER` không tồn tại, đã đổi tên đúng thành `STORE_OWNER`). Khi thêm route cho Package 2-4, tra đúng bảng Actor trong Report 1 để gắn `@Roles(...)` đúng, đừng tự đặt role mới.
- Login email/password, lockout 5 lần sai (15 phút), khóa CỨNG nếu quá 72h chưa đổi mật khẩu tạm (field `must_change_password_by`, chỉ Admin reset-password mới mở lại được)
- **MFA (TOTP) là tính năng OPT-IN, hoàn toàn độc lập với việc đổi mật khẩu** — không tự bật, phải tự gọi `/auth/mfa/setup` + `/auth/mfa/verify`. Kèm 10 mã dự phòng dùng 1 lần (`mfa_backup_codes`, hash bcrypt) — dùng khi mất điện thoại. Hiện KHÔNG ép buộc role nào phải bật MFA (kể cả Admin) — cân nhắc thêm nếu cần siết chặt hơn cho Admin.
- Trusted Device — verify MFA thật 1 lần, 30 ngày sau không hỏi lại trên đúng thiết bị đó (`device_token` trong `LoginDto`, collection `trusted_devices`)
- Quên mật khẩu tự động qua email (`/auth/forgot-password`, `/auth/reset-password`) — không cần Admin
- Google OAuth (chỉ đăng nhập cho tài khoản ĐÃ tồn tại, không tự đăng ký)
- Refresh token rotation + reuse detection
- **User tự xem/sửa hồ sơ CHỈ qua `GET/PATCH /users/me`** (phone/address/avatar) — **`employee_code`/`department` CHỈ Admin sửa được, qua `PATCH /users/:id`**, kể cả khi Admin tự sửa hồ sơ chính mình cũng phải đi qua route `:id`, không được lẫn vào `/me` (2 DTO tách riêng có chủ đích, không gộp)
- Admin: tạo/sửa (`PATCH /users/:id`)/reset-password/deactivate/reactivate/disable-mfa cho user khác
- Gửi email qua module `mail/` (4 template: welcome, forgot-password, account-locked, mfa-enabled) — mọi lời gọi `mailService.sendXxx()` PHẢI dùng `void` (không `await`), gửi mail không được phép làm fail luồng nghiệp vụ chính. Thiết kế email theo phong cách transactional doanh nghiệp thật (nền trắng, 1 màu nhấn duy nhất, chữ ngắn) — **tránh** banner màu to/nhiều box màu (dễ trông như AI generate). Logo thương hiệu: khối lập phương đẳng trắc 3 tông tím, phẳng, không gradient — asset gốc ở `be/assets/logo/`.
- `ThrottlerGuard` đã gắn `APP_GUARD` global trong `app.module.ts` — `@Throttle()` trên route (login, forgot-password) giờ thực sự có tác dụng (trước đây từng bị khai config nhưng chưa gắn guard, không chặn được gì)
- TTL tự dọn: `login_audit_logs` (180 ngày), `trusted_devices` (30 ngày), `refresh_tokens` (theo hạn token)

**Chưa có, biết trước để không ngạc nhiên**: đổi email tự thân, ép buộc MFA cho Admin, giới hạn số thiết bị tin cậy tối đa/user, lịch sử nhiều lần nghỉ/quay lại việc (mới có field đơn `is_active`, chưa có mảng giai đoạn làm việc).

## Module Marketplace Integration — TikTok/Lazada/Tiki (đọc trước khi sửa adapter)

Adapter Pattern (`interfaces/marketplace-adapter.interface.ts`) — service/controller KHÔNG biết bên trong từng sàn code ra sao, chỉ gọi qua hợp đồng chung `MarketplaceAdapter`. Đổi/thêm sàn = thêm 1 file adapter + đăng ký vào `marketplace-integration.module.ts`, KHÔNG sửa service/controller.

**3 điểm khác biệt kỹ thuật CHÍ MẠNG giữa các sàn — nhầm lẫn sẽ gây lỗi tính hạn token sai lệch nghiêm trọng:**

| | TikTok | Lazada | Tiki |
|---|---|---|---|
| Cách ký request | Tự HMAC riêng (GET cho 2 API token) | Tự HMAC riêng (path + sorted params, **UPPERCASE hex**) | **KHÔNG cần ký** — OAuth2 chuẩn, Basic Auth header |
| `expires_in` là gì | **Epoch tuyệt đối** (vd `1660556783`) | **Số giây còn lại** (vd `604800` = 7 ngày) | **Số giây còn lại** (chuẩn OAuth2) |
| Lấy shop_id/cipher | Phải gọi THÊM API `GetAuthorizedShops` sau khi có access_token | Có sẵn trong response token (`country_user_info_list`) | Xác định qua chính access_token, không cần thêm bước |
| Cơ chế nhận đơn hàng mới | Webhook (best-effort) + cron đối soát dự phòng | Polling định kỳ (chưa xác nhận có webhook chính thức) | Event Queue (cơ chế RIÊNG của Tiki, KHÁC webhook — đọc tài liệu `event-queue` trước khi code) |

**Độ tin cậy thông tin**: TikTok đã tự trải nghiệm đăng ký thật (cao, nhưng Partner Center/API xác nhận KHÔNG khả thi — xem lịch sử đổi phạm vi ở đầu file). **Lazada: ĐÃ TỰ TRẢI NGHIỆM THẬT VÀ CHẠY THÀNH CÔNG END-TO-END** (không còn "chưa tự trải nghiệm" như ghi cũ) — xem mục "Module Orders — Lazada ĐÃ CHẠY END-TO-END" bên dưới, độ tin cậy giờ là CAO NHẤT trong 3 sàn. Tiki: phần OAuth2 xác nhận qua tài liệu chính thức (cao), nhưng domain trang authorize + tên field response cụ thể vẫn là suy luận (trung bình, CHƯA test) — xem `SETUP_NOTES.md` trong module để biết chỗ nào cần test lại bằng Postman trước khi tin tưởng, và nhớ Tiki hiện đang HOÃN code (xem lịch sử đổi phạm vi).

## Module Orders — Lazada ĐÃ CHẠY END-TO-END (2026-09-04, đọc trước khi đụng vào `orders/` hoặc `marketplace-integration/lazada`)

Toàn bộ chuỗi **OAuth connect → verified seller → GetOrders → mapper → lưu MongoDB → trả FE** đã test bằng dữ liệu THẬT (không phải mock), xác nhận hoạt động đúng:

- Shop test: `i7Yix2IJ` (seller ID `201171264532`, short code `VN34F9B5F7`) — shop cá nhân thật của leader, đã KYC/verify đủ để gọi `GetOrders` (ban đầu bị lỗi `SellerNotVerified`, đã tự hết sau khi hoàn tất thêm bước xác minh trong Seller Center — không phải bug code).
- `POST /orders/lazada/sync?shop_id=201171264532` → response `{ fetched, upserted, newlyConsolidated }`. Test với đơn thật: `fetched: 1, upserted: 1` — mapper transform đúng.
- `GET /orders` → trả đúng field `consolidation_key`-based (`isConsolidated`, `consolidatedGroupId`), `recipientName` bị Lazada tự mask (`"N**n"` — hành vi PDPA của Lazada, không phải bug), `recipientCity` xác nhận ĐÚNG (giá trị dạng "Phường Gia Định" — theo cấu trúc hành chính VN mới bỏ cấp huyện, KHÔNG phải mapper sai field).
- **Chưa test**: case consolidation thật (2 đơn khác sàn/khác thời điểm cùng 1 khách/địa chỉ để xác nhận `newlyConsolidated` > 0) — làm tiếp trước khi coi module `orders` là "hoàn thành" đầy đủ.

### 2 bug thật đã gặp và fix trong quá trình test thật (rút kinh nghiệm, đừng lặp lại)

1. **`JwtAuthGuard`/`RolesGuard` áp sai ở class-level của controller** — chặn luôn cả OAuth callback endpoint (browser gọi callback KHÔNG kèm Bearer token, nên bị 401 dù logic không có gì sai). **Fix**: chuyển guard xuống method-level, chỉ áp cho endpoint `connect` (kích hoạt OAuth) — endpoint `callback` để public, bảo mật dựa vào state token dùng 1 lần thay vì JWT.
2. **Field response thật của Lazada token API là `country_user_info`, KHÔNG PHẢI `country_user_info_list`** như code gốc đoán theo tài liệu cộng đồng — xác nhận lại bằng chính response thật, đã sửa trong mapper.

### `LAZADA_SANDBOX` KHÔNG phải environment switch thật

Biến `environment: 'sandbox' | 'production'` lưu trên shop document chỉ là **nhãn (label)** để phân biệt trong DB — Lazada Open Platform **không có domain sandbox API riêng**, MỌI request (kể cả lúc đang "test") đều gọi thẳng vào domain production thật (`api.lazada.vn`). Đừng nhầm với domain sandbox tách biệt kiểu Shopee (`.sandbox.test-stable...`) — 2 sàn khác cơ chế hoàn toàn.

### Setup local dev để test OAuth callback thật (ngrok + Redis-compatible)

Lazada callback redirect cần 1 URL public HTTPS thật (không nhận `localhost`) — dùng **ngrok** làm tunnel:
```bash
ngrok http --url=congenial-nectar-siesta.ngrok-free.dev 3000
```
Domain free cố định `congenial-nectar-siesta.ngrok-free.dev` đã đăng ký khớp với `redirect_uri` khai trên Lazada ISV Console — nếu domain hết hạn/bị thu hồi, phải đổi lại ĐỒNG THỜI ở cả Lazada Console lẫn `.env` backend (`CLIENT_REDIRECT_CALLBACK`). Máy dev cũng cần Redis chạy (app có dependency Redis) — nếu không có Docker/WSL tiện dùng, **Memurai** (bản Redis-compatible, free Developer edition, chạy native trên Windows) là lựa chọn thay thế đã dùng thành công.

### Testing Tools của Lazada ISV Console — phân biệt rõ, tránh lặp lại nhầm lẫn đã gặp

- **Loan Test Account** (VD short code `VN33WH4M4S`) — CHỈ dùng để test thao tác tay trên UI Seller Center (order lifecycle, returns/refunds bằng mắt), **KHÔNG kết nối được qua OAuth/Open API** — thử OAuth-connect account loan sẽ tự động quay về authorize nhầm seller cá nhân thật, không phải account loan.
- **Create Test Case (domain=ORDER)** — sinh đơn hàng giả trên account loan, cũng chỉ phục vụ test UI, không liên quan tới luồng API `GetOrders` đang dùng thật cho `orders` module.
- → Kết luận: muốn test `GetOrders` API thật, PHẢI dùng 1 seller shop thật đã KYC-verify (như `i7Yix2IJ`), không dùng được account loan cho việc này.

## Module Orders — bổ sung 2026-09-05: `GET /orders/:id` + fix hiểu nhầm `quantity` + PHÁT HIỆN LỚN về khoảng cách kiến trúc thật vs diagram Mainflow 1

### 1. `quantity: 1` hard-code trong `lazada-order.mapper.ts` KHÔNG PHẢI bug — đã xác nhận bằng doc thật

Trước đây nghi ngờ đây là workaround tạm vì "chưa tìm thấy field quantity". Đã tra cứu field reference đầy đủ của Lazada `GetOrderItems`/`GetMultipleOrderItems` (đối chiếu open.lazada.com + community docs) — **xác nhận dứt khoát: KHÔNG hề có field `quantity`/`qty` nào trong response**. Lý do: mỗi `order_item_id` Lazada trả về **ĐÃ LÀ ĐÚNG 1 ĐƠN VỊ sản phẩm** — khách đặt 3 cái cùng SKU thì Lazada trả 3 phần tử `order_item_id` RIÊNG BIỆT trong mảng `data`, có thể có `status` khác nhau từng cái (VD 1 cái bị hủy riêng). `quantity: 1` là ĐÚNG BẢN CHẤT dữ liệu, không phải giá trị tạm — đã sửa comment trong code phản ánh đúng mức độ chắc chắn này (trước đó ghi dấu ⚠️ gây hiểu nhầm là chưa chắc).

**Hệ quả thiết kế quan trọng**: vì lưu trữ giữ nguyên dạng unit-level (đúng chủ ý, để Package 4/fulfillment thao tác được theo từng `order_item_id` riêng — 1 đơn vị có thể bị hủy/đổi trạng thái độc lập với các đơn vị khác cùng SKU), việc "gộp số lượng để hiển thị" phải làm ở TẦNG RESPONSE, không phải tầng lưu trữ — xem mục 2 dưới.

### 2. Đã thêm `GET /orders/:id` — trả `items[]` đã gộp theo (sku, variation, status)

File mới: `orders/utils/aggregate-order-items.util.ts` — hàm thuần `aggregateOrderItems()`, gộp các đơn vị CÙNG sku+variation+status thành 1 dòng (cộng `quantity`, giữ mảng `platformOrderItemIds` gốc không mất dữ liệu). CỐ Ý KHÔNG gộp khác status vào cùng 1 dòng (2 cái cùng SKU nhưng 1 cái `canceled` → 2 dòng riêng, không mất thông tin đã hủy 1 cái).

2 mã lỗi mới trong `ORD_ERROR_CODES`: `ORD_INVALID_ORDER_ID` (400, id sai định dạng ObjectId) và `ORD_ORDER_NOT_FOUND` (404, đúng định dạng nhưng không tồn tại) — tách riêng có chủ đích để FE phân biệt lỗi do tự gửi sai vs dữ liệu thật sự không có.

Tra cứu theo `_id` KHÔNG cần thêm index mới (Mongo tự tạo unique index cho `_id` mọi collection) — O(log n) đã là tối ưu nhất cho truy vấn 1 document theo khóa chính.

**Bonus fix cùng lúc**: phát hiện `ListOrdersQueryDto` không có cách nào lọc "các đơn cùng 1 nhóm gộp" dù index `consolidated_group_id` đã có sẵn trong schema — đã thêm param `consolidated_group_id` (validate `@IsMongoId()`), tận dụng đúng partial index (d) đã khai ở `order.schema.ts`.

**Đã verify bằng compiler thật, không chỉ đọc mắt**: cài `typescript@5.7` + `eslint` vào `node_modules` (bản gốc trong zip bị thiếu, chỉ có phần rỗng), chạy `tsc --noEmit -p tsconfig.json` với đầy đủ cờ strict của project (`strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals`...) → **0 lỗi**. Chạy `eslint src/modules/orders` → **0 lỗi/warning**. Trước khi merge code mới cho module này, luôn chạy lại đúng 2 lệnh này để xác nhận, đừng chỉ tin đọc code bằng mắt.

### 3. 🔴 PHÁT HIỆN LỚN — Kiến trúc thật vs slide "Mainflow 1" (Omnichannel Sync & Order Consolidation) KHÔNG khớp nhau

Slide thuyết trình mô tả flow: `E-commerce platform trigger event → gọi Webhook → AOFP ingest vào Apache Kafka queue → normalize → consolidation check → save MongoDB`.

**Code thật hiện tại KHÔNG có Webhook receiver nào, KHÔNG có Kafka** (đã grep toàn bộ `package.json` — không có bất kỳ Kafka client lib nào; chỉ có 2 dòng comment trong code TỰ GHI RÕ lý do: *"Lazada Open Platform hiện chưa xác nhận cơ chế webhook chính thức"*). Flow thật đang chạy là:

```
Admin bấm nút (hoặc sau này @Cron() định kỳ — CHƯA LÀM)
  → POST /orders/lazada/sync
  → LazadaAdapter.getOrders() + getOrderItems() (polling, gọi trực tiếp Lazada API)
  → mapLazadaOrder() chuẩn hóa
  → tryConsolidate() check trùng consolidation_key (ĐÚNG logic decision diamond trong slide)
  → lưu MongoDB (findOneAndUpdate upsert)
```

**Phần LÕI nghiệp vụ (chuẩn hóa dữ liệu + check gộp đơn + lưu Mongo) hoàn toàn ĐÚNG với ý đồ trong slide** — chỉ khác ở **cơ chế TRIGGER và INGESTION**: slide vẽ kiến trúc push-based (webhook + message queue), thực tế đang là pull-based (polling thủ công, chưa có cả cron tự động).

**Việc cần làm trước khi demo cho giảng viên** (không phải lỗi cần sửa gấp, mà là rủi ro trình bày sai sự thật cần né):
- **KHÔNG được nói/ngụ ý "hệ thống đang dùng Kafka"** khi demo — nếu giảng viên hỏi thẳng kiến trúc, trả lời trung thực: hiện dùng polling on-demand (lý do: Lazada không có webhook chính thức đáng tin cậy, xác nhận qua chính doc Lazada), Kafka/webhook là hướng mở rộng dự kiến khi có thêm sàn hỗ trợ webhook thật (TikTok Shop có, Tiki dùng Event Queue riêng — gần giống ý tưởng queue nhưng không phải Kafka).
- Cân nhắc **cập nhật lại slide Mainflow 1** cho khớp thực tế (thay "Webhook → Kafka" bằng "Manual/Scheduled Polling → In-process processing"), hoặc giữ slide như định hướng kiến trúc MỤC TIÊU dài hạn nhưng nói rõ với giảng viên đây là target chưa implement, còn cái đang chạy live là bản polling.
- Nếu muốn demo gần đúng slide hơn mà không cần dựng Kafka thật (tốn công, không cần thiết cho quy mô hiện tại): thêm `@Cron()` (package `@nestjs/schedule`, CHƯA cài) bọc quanh `syncLazadaOrders()` để có tối thiểu phần "tự động, không cần bấm tay" — đây là việc nhỏ, đáng làm trước demo nếu còn thời gian, khác hẳn việc dựng Kafka (việc lớn, không đáng làm chỉ để demo).

### 4. Kiểm tra API còn thiếu cho luồng Mainflow 1 (Omnichannel Sync & Consolidation) — báo cáo đầy đủ

**Đã có, hoạt động đúng**: OAuth connect Lazada, `POST /orders/lazada/sync`, `GET /orders` (list + filter + cursor pagination), `GET /orders/:id` (mới thêm, có items đã gộp).

**Còn thiếu, cần cân nhắc trước demo (xếp theo mức ưu tiên)**:
1. ~~`@Cron()` tự động sync định kỳ~~ — **ĐÃ LÀM (2026-09-05)**: `orders/lazada-order-sync.scheduler.ts`, mỗi 10 phút quét mọi shop Lazada đã connect (`marketplaceIntegrationService.listConnectedShops()`) và gọi `syncLazadaOrders()` tuần tự cho từng shop, có khóa `isRunning` chống chạy chồng lượt, per-shop try/catch không để 1 shop lỗi làm hỏng cả lượt. Cần thêm `@nestjs/schedule` vào `package.json` (**chốt đúng bản `^6.1.3`** — bản `^12.x` mới nhất là ESM-thuần, KHÔNG tương thích project CommonJS này, đã tự cài thử và xác nhận lỗi `TS1479` thật trước khi chốt bản đúng) và bật `ScheduleModule.forRoot()` **Ở GỐC `app.module.ts`** (không phải trong `OrdersModule` — gọi nhầm chỗ sẽ khiến `@Cron()` không chạy dù compile vẫn qua bình thường, không có lỗi báo rõ).
2. **Endpoint check trạng thái connect của 1 shop** (`GET /marketplace/lazada/status?shop_id=...`) — đã đề xuất ở phiên trước với FE, vẫn CHƯA làm. Không bắt buộc cho demo Mainflow 1 nhưng FE cần để tránh đoán qua lỗi.
3. **Webhook receiver thật cho ít nhất 1 sàn có hỗ trợ** (TikTok Shop hoặc Tiki Event Queue) — nếu muốn slide "Mainflow 1" có ít nhất 1 nhánh chạy đúng kiến trúc push-based thật, KHÔNG bắt buộc, effort lớn, không nên làm gấp trước demo chỉ để khớp slide.
4. **Apache Kafka** — KHÔNG nên làm cho demo capstone quy mô hiện tại; polling (giờ đã tự động hoá nhờ mục 1) + in-process xử lý tuần tự là lựa chọn hợp lý và đủ dùng, dựng Kafka chỉ để "khớp slide" là over-engineering thật sự (đúng tinh thần "tối ưu không phải phức tạp hóa" đã thống nhất).
5. **Test case consolidation thật với ≥2 đơn cùng khách** — logic đã viết đúng (đọc code xác nhận), nhưng CHƯA từng test bằng dữ liệu Lazada thật có 2 đơn khớp `consolidation_key`. Nên làm trước demo để có ảnh chụp `newlyConsolidated > 0` thật, tăng độ tin cậy khi trình bày.

## Chuẩn xử lý lỗi — BẮT BUỘC toàn bộ project (áp dụng từ module `marketplace-integration` trở đi)

Mọi lỗi trả về FE PHẢI đi qua `AppException` (`common/exceptions/app-exception.ts`) — không ném `Error`/`HttpException` trần trụi trong service. Format response lỗi thống nhất qua `GlobalExceptionFilter` (`common/filters/global-exception.filter.ts`):

```json
{
  "success": false,
  "error_code": "MKT_SHOP_NOT_CONNECTED",
  "message": "Shop chưa được kết nối hoặc đã bị ngắt kết nối.",
  "details": null,
  "timestamp": "2026-08-22T10:00:00.000Z",
  "path": "/marketplace/tiktok/orders"
}
```

**Quy tắc đặt `error_code`**: `<PREFIX_MODULE>_<MÔ_TẢ_NGẮN>`, UPPER_SNAKE_CASE, prefix theo module (`AUTH_`, `MKT_` cho marketplace-integration, `ORD_` cho orders...). Đăng ký mã lỗi mới vào đúng file `<module>.errors.ts` của module đó — KHÔNG rải string mã lỗi tự do trong code.

**Validate đủ 3 tầng, không tin tưởng tầng dưới đã validate**:
1. DTO (`class-validator`) — chặn request sai hình dạng trước khi vào Controller
2. Mongoose schema (`required`, `enum`, `type`) — chặn dữ liệu sai cấu trúc trước khi ghi DB, kể cả khi có bug ở tầng Service
3. Service (business rule) — validate logic nghiệp vụ mà DTO/Schema không diễn tả được (vd "token đã hết hạn", "shop đã bị ngắt kết nối") → ném `AppException` với `error_code` cụ thể, KHÔNG dùng message chung chung



```
src/
  common/       # dùng chung: auth guard, dto, enums, filters, interceptors, mail, pipes, services
  config/       # namespaced config (app, database, jwt, marketplace credentials)
  modules/      # 1 module = 1 domain
    orders/           # đồng bộ đơn hàng từ sàn, gộp đơn (FE-01, FE-02)
    packaging/         # AI packaging recommendation, 3D bin packing (FE-03)
    shipping/           # ước tính phí, tạo nhãn (FE-04, FE-05)
    fulfillment/        # picking/packing tracking (FE-06, FE-07)
    marketplace-integration/  # connector TikTok Shop, Lazada, Tiki (adapter pattern — xem interfaces/marketplace-adapter.interface.ts)
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

### 5. Middleware/package không tự ship type — luôn kiểm tra trước khi coi là "chưa cài đúng"

Không phải mọi package đều tự bao gồm TypeScript type definitions. Ví dụ thực tế: `helmet` (từ v4+) tự ship type trong chính nó, nhưng `compression` thì KHÔNG — thiếu `@types/compression` khiến `compression` bị resolve thành `any`, ESLint báo `no-unsafe-call` dù cú pháp hoàn toàn đúng. Trước khi nghi ngờ code sai, luôn kiểm tra package đó có tự ship type hay cần cài thêm `@types/<package>` riêng.

```bash
npm install -D @types/<package>   # nếu package không tự ship type
```

Sau khi cài, nếu editor (VS Code) vẫn hiện gạch đỏ dù type đã đúng: `TypeScript: Restart TS Server` và `ESLint: Restart ESLint Server` là **2 lệnh khác nhau, không thay thế nhau được** — restart cái này không tự restart cái kia. Luôn tin vào kết quả `npm run lint` chạy thật trong terminal hơn là gạch đỏ trong editor.

### 6. Trong file test (`.spec.ts`), KHÔNG reference method của 1 class instance làm giá trị độc lập trong `expect()`

```ts
// ❌ Tránh — TS coi đây là "unbound method" (tách method khỏi instance của nó)
// -> @typescript-eslint/unbound-method
jest.spyOn(service, 'generateTokenPair').mockResolvedValue(...);
// ...
expect(service.generateTokenPair).toHaveBeenCalledWith(...);

// ✅ Luôn làm — lưu spy vào biến riêng ngay lúc tạo, dùng biến đó về sau
const generateTokenPairSpy = jest.spyOn(service, 'generateTokenPair').mockResolvedValue(...);
// ...
expect(generateTokenPairSpy).toHaveBeenCalledWith(...);
```

Áp dụng luôn quy tắc #1 (return type tường minh) cho MỌI helper function viết trong file test (vd hàm dựng mock document như `makeStoredToken()`), không chỉ controller/service — ESLint strict áp dụng đồng đều cho cả `src/` lẫn `test`/`.spec.ts`.

### 7. Field Mongoose tự sinh (`timestamps: true`) PHẢI khai báo lại kiểu trong class — KHÔNG dùng `@Prop()`

`@Schema({ timestamps: { createdAt: 'created_at', ... } })` khiến Mongoose tự thêm `created_at`/`updated_at` vào document lúc runtime, nhưng class TypeScript không tự biết field đó tồn tại. Muốn đọc `user.created_at` mà không phải ép kiểu unsafe (`as unknown as {...}`), khai báo field đó NGAY TRONG class nhưng **không gắn `@Prop()`** (tránh xung đột với field Mongoose tự sinh):

```ts
export class User {
  // ...các @Prop() khác...

  // Không @Prop() — chỉ khai kiểu để TS biết field này tồn tại
  created_at?: Date;
  updated_at?: Date;
}
```

### 8. `Model<T>.create()`/`findOne()` với field kiểu `Types.ObjectId` — LUÔN bọc `new Types.ObjectId(idString)`, không truyền thẳng string

Dù Mongoose thường tự ép kiểu string -> ObjectId lúc runtime, đừng phụ thuộc vào auto-cast ngầm này — luôn tường minh:

```ts
// ❌ Tránh
await this.model.create({ user_id: userId }); // userId: string

// ✅ Luôn làm
await this.model.create({ user_id: new Types.ObjectId(userId) });
```

### 9. `ConfigService.get<T>(key)` KHÔNG có default trả về `T | undefined`, không phải `T`

Gán thẳng vào 1 field khai kiểu `T` (không `| undefined`) sẽ bị TS strict báo lỗi. 2 cách xử lý đúng, chọn theo tình huống:

- Giá trị THỰC SỰ bắt buộc (secret, SMTP host/user/password...) → bọc `requireEnv()` (đã có sẵn trong `common/utils/env.util.ts`), throw rõ ràng lúc app khởi động nếu thiếu.
- Giá trị có default hợp lý (port, timeout...) → truyền default trực tiếp vào `.get<T>(key, defaultValue)`, lúc đó return type mới là `T` chắc chắn, không cần `requireEnv` nữa.

```ts
// ✅ Bắt buộc, không có default hợp lý nào cả
const host = requireEnv(configService.get<string>('mail.host'), 'MAIL_HOST');
// ✅ Có default hợp lý
const port = configService.get<number>('mail.port', 587);
```

### 10. Catch block: KHÔNG ép kiểu `as Error`, dùng `instanceof Error`

```ts
// ❌ Tránh — vẫn là 1 dạng unsafe assertion, catch value có thể KHÔNG phải Error thật
catch (err: unknown) { logger.error((err as Error).message); }

// ✅ Luôn làm
catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(message);
}
```

### 11. Enum số (`enum X { A = 0, B = 1 }`) trong Mongoose — luôn kèm mảng đã lọc sẵn (kiểu `USER_ROLE_VALUES`)

TypeScript compile enum số kèm reverse-mapping (`Object.values()` trả về LẪN CẢ số lẫn tên chuỗi) — dùng thẳng `Object.values(EnumX)` làm `enum: [...]` trong `@Prop()` sẽ vô tình chấp nhận cả chuỗi tên làm giá trị hợp lệ. Luôn export riêng 1 mảng đã lọc chỉ giữ number từ file enum, dùng lại ở mọi `@Prop({ enum: ... })` cần đến (xem `USER_ROLE_VALUES` trong `user-role.enum.ts`).

### 12. Sau `typeof value === 'number'`, KHÔNG cần `as EnumSố` nữa

Enum số cho phép gán thẳng từ `number` (khác enum chuỗi, cần assertion) — sau khi đã narrow bằng `typeof`, ép kiểu thêm là thừa, bị `no-unnecessary-type-assertion` bắt lỗi.

### 13. `.catch(callback)` trên Promise KHÔNG được `useUnknownInCatchVariables` (tsconfig) bảo vệ tự động

Option đó chỉ áp dụng cho `try { } catch (e) { }`, KHÔNG áp dụng cho `promise.catch((err) => ...)` — tham số callback vẫn ngầm là `any` trừ khi khai rõ `(err: unknown) =>`.

### 14. `??` không bắt được chuỗi rỗng `''` — chỉ bắt `null`/`undefined`

`.env` viết `KEY=` (không có gì sau `=`) gán **chuỗi rỗng**, không phải `undefined` → `process.env.KEY ?? fallback` vẫn ra `''`, không nhảy `fallback`. Muốn coi cả rỗng lẫn thiếu là "chưa cấu hình", dùng ternary tường minh (`value ? value : fallback`), KHÔNG dùng `||` (bị ESLint `prefer-nullish-coalescing` bắt lỗi ngược lại).

### 15. Mongoose: field optional KHÔNG có `default` sẽ VẮNG MẶT hẳn trong document, không lưu `null`

Nếu tạo document mà không truyền giá trị cho field `@Prop({ optional })` không có `default`, Mongo Compass sẽ **không hiện field đó luôn** (khác field có `default: []`, luôn hiện dù rỗng). Đừng hoảng khi thấy field "biến mất" trên Compass — kiểm tra lại có `default` hay không trước khi nghi ngờ code sai.

## Commit Message

Format chính thức (đã cập nhật, khác với bản gốc trong Report 2 — cần đồng bộ lại Report 2): kết hợp Conventional Commits + mã ticket Jira đặt trong `scope`:

```
type(AOFP-12): mô tả ngắn gọn
```

Ví dụ: `feat(AOFP-12): add TikTok Shop webhook configuration`, `fix(AOFP-15): resolve duplicate order detection bug`.
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

### 11. Property Mongoose PHẢI đặt TÊN TRỰC TIẾP bằng snake_case, không map riêng tên khác

**Lỗi thật đã xảy ra** (module `marketplace-integration`, sửa 22/08/2026): code ban đầu viết property theo camelCase (`shopId`, `accessTokenEncrypted`, `isActive`...) rồi định bụng map sang snake_case sau — sai hoàn toàn cách project đang làm. Đối chiếu `user.schema.ts` (đã chạy production): property đặt tên TRỰC TIẾP bằng snake_case ngay trên class, Mongoose dùng đúng tên đó làm field trong Mongo, KHÔNG qua bước map/transform nào khác:

```ts
// ✅ ĐÚNG — property TRÊN CLASS đã là snake_case, không có bước map riêng
@Prop({ default: true })
must_change_password!: boolean;

@Prop({ default: true })
is_active!: boolean;

// ❌ SAI — đừng viết camelCase trên class rồi định "sẽ map sau"
@Prop({ default: true })
mustChangePassword!: boolean; // Mongo sẽ lưu field tên "mustChangePassword", KHÔNG PHẢI "must_change_password"
```

Áp dụng cho MỌI schema mới, không có ngoại lệ — kể cả khi property đó chỉ dùng nội bộ, không trả ra FE.


## Khi tạo module mới, LUÔN:

0. Trước khi viết schema: liệt kê rõ field nào sẽ dùng để filter/sort ở controller → thiết kế index NGAY lúc đó theo nguyên tắc ESR, không để "sau"
1. Đăng ký `MongooseModule.forFeature([...])` trong `<name>.module.ts`
2. Swagger đầy đủ, DTO validate tiếng Việt
3. Nếu module đụng tới Order Consolidation hoặc AI Packaging → viết `.spec.ts` bắt buộc (yêu cầu QA trong Report 2)
4. Không tự thêm tích hợp Facebook/Shopee trừ khi được yêu cầu rõ — ngoài phạm vi đồ án (Shopee đã bị GỠ khỏi scope, Lazada đã được THÊM vào scope — đừng làm ngược theo trí nhớ cũ)
