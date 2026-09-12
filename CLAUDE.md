# OptiPackAI Backend — Coding Guide cho Claude

## 📌 QUY TẮC QUẢN TRỊ TÀI LIỆU NÀY — ĐỌC TRƯỚC TIÊN, ÁP DỤNG CHO MỌI THAO TÁC SAU NÀY

**Mở rộng 2026-09-10 — bắt buộc chủ động hỏi lại trước/sau mỗi chức năng**: mỗi khi CHUẨN BỊ code 1 chức năng/nghiệp vụ mới, HOẶC vừa code xong 1 chức năng — PHẢI chủ động đặt câu hỏi làm rõ lại cho user, để xác nhận đúng hướng TRƯỚC KHI code tiếp/code sai hướng. Không tự đoán ý user rồi làm luôn nếu còn điểm mơ hồ về nghiệp vụ (khác với mơ hồ kỹ thuật thuần túy, việc đó vẫn tự quyết theo đúng judgement bình thường). Câu hỏi nên có VÍ DỤ CỤ THỂ đi kèm (không hỏi chay lý thuyết) — nếu user báo "chưa hiểu câu hỏi", phải giải thích lại bằng ví dụ đời thường/tình huống cụ thể, không lặp lại nguyên câu hỏi cũ.

**Chốt 2026-09-09, áp dụng từ giờ trở đi cho mọi thao tác trong dự án — không cần user nhắc lại mỗi lần:**

Mọi thao tác thuộc các loại sau đều **BẮT BUỘC tự động ghi lại vào cả bộ nhớ (memory) lẫn file CLAUDE.md này**, không đợi user yêu cầu riêng:

- Tìm điểm yếu hệ thống (weakness/gap analysis)
- Quyết định thiết kế hệ thống hoặc thiết kế DB (schema, index, kiến trúc module...)
- Thực hiện chức năng mới (feature/endpoint/service)
- Viết test
- Bất kỳ solution/giải pháp nào được đề xuất và áp dụng

**Nguyên tắc PHÁT TRIỂN TIẾP, KHÔNG XẾP CHỒNG** — đây là phần quan trọng nhất, dễ vi phạm nhất nếu chỉ append máy móc:

- Trước khi thêm mục mới, **đọc lại các mục liên quan đã có** — nếu nội dung mới là **cập nhật/sửa/mở rộng** 1 quyết định cũ, phải **sửa trực tiếp vào đúng chỗ cũ** (kèm ghi chú "ĐÃ THAY ĐỔI so với..." như đã làm ở mục Roadmap order_groups) — **không** viết thành 1 mục hoàn toàn tách biệt rồi để 2 phiên bản (cũ sai + mới đúng) cùng tồn tại gây rối.
- Chỉ tạo mục **hoàn toàn mới** khi nội dung thực sự là chủ đề mới, chưa từng có chỗ nào nói tới.
- Mọi rule mới thêm phải **tự kiểm tra tính nhất quán** với rule đã có — nếu phát hiện mâu thuẫn với 1 rule cũ, phải nêu rõ mâu thuẫn đó và cập nhật rule cũ (không lặng lẽ thêm rule mới rồi để 2 rule chỏi nhau, người đọc sau không biết theo cái nào).
- Khi 1 file (`optipack-claude-md-N.md`) gần đầy, việc tách file mới (như `optipack-claude-md-5.md` đã làm) là hợp lệ — nhưng vẫn phải giữ đúng tinh thần trên: file mới nối tiếp mạch nội dung, không lặp lại thứ đã ghi ở file cũ.

**Ghi vào bộ nhớ (memory)**: theo đúng quy tắc `[stated]` đã áp dụng xuyên suốt — tóm tắt đúng những gì đã làm/quyết định thật, không suy diễn thêm.

## 📌 NGUYÊN TẮC THIẾT KẾ HỆ THỐNG — "TINH GỌN" ≠ "THIẾU CORE", đọc trước khi quyết định loại trừ bất kỳ tính năng nào

**Chốt 2026-09-10, sau khi tự phát hiện 1 sai lầm tư duy thật (xem "Bài học tự sửa sai" bên dưới).**

**Sai lầm đã mắc phải**: nhầm lẫn 2 khái niệm khác nhau rồi dùng chung 1 lý do biện minh — _"hệ thống WMS doanh nghiệp đầy đủ (an toàn tồn kho, tự đặt hàng lại, FIFO/FEFO, kiểm kê định kỳ) không cần thiết cho đồ án"_ (ĐÚNG) bị áp nhầm sang _"vậy không cần theo dõi SỐ LƯỢNG TỒN KHO nào cả"_ (SAI — đây là thông tin cơ bản nhất của bất kỳ hệ thống kho nào, không phải tính năng nâng cao).

**Phép thử BẮT BUỘC áp dụng trước khi quyết định 1 tính năng là "core" hay "có thể loại trừ"**:

> _"Nếu bỏ cái này đi, chức năng chính (tên tính năng, VD 'lấy hàng từ kho') còn hoạt động ĐÚNG NGHĨA của nó không, hay chỉ còn là 1 phiên bản rỗng ruột mang tên tương tự?"_

- Nếu bỏ đi khiến chức năng chính **không còn đúng nghĩa** (VD "lấy hàng từ kho" mà không biết còn/hết hàng → chỉ còn là "xem địa chỉ") → **CORE, KHÔNG được loại trừ**, dù có tốn thêm vài field/endpoint.
- Nếu bỏ đi chỉ làm mất 1 tính năng NÂNG CAO đi kèm (VD tự động đặt hàng lại khi sắp hết) mà chức năng chính vẫn hoạt động đúng nghĩa → **hợp lý để loại trừ**, đúng tinh thần "tinh gọn, không rườm rà".

**Ưu tiên đối chiếu với chính đề bài gốc (`Phieu_FA26SE036.docx`) trước khi tự quyết định loại trừ** — 1 tính năng tưởng "nâng cao tự nghĩ thêm" có thể thực ra **đã được đề bài yêu cầu rõ** (case thật: UC-07 Alt Flow đã ghi "Report Missing Item" — báo thiếu hàng lúc lấy — nhưng bị đánh rơi khi code 5 endpoint fulfillment thật, tưởng nhầm là tính năng ngoài phạm vi).

**Không tự tin dùng lý do "tránh over-engineering" để bào chữa cho việc thiếu core** — 2 việc khác nhau hoàn toàn: over-engineering là làm THỪA (Kafka cho quy mô nhỏ, sharding cho 1 kho...), thiếu core là làm SÓT cái tối thiểu phải có. Nhầm lẫn 2 khái niệm này là lỗi tư duy nghiêm trọng, cần tự kiểm tra lại mỗi khi định "loại trừ" 1 tính năng nào đó — không chỉ riêng module kho, áp dụng cho MỌI module tương lai.

**OptiPackAI** (tên dự án theo phiếu đăng ký: AOFP — AI-Assisted Omnichannel Order Fulfillment and Packaging Optimization System).
Hệ thống nội bộ (không multi-tenant) giúp doanh nghiệp đồng bộ đơn hàng từ TikTok Shop + Lazada + Tiki, gộp đơn trùng, dùng AI gợi ý đóng gói (3D bin packing), ước tính phí ship, sinh nhãn/QR/barcode, theo dõi fulfillment, và xem dashboard.

> **Lịch sử đổi phạm vi sàn (cập nhật 2026-09-04, sửa lại lý do ghi sai ngày 2026-08-22)**: Bản gốc nhắm Shopee + TikTok Shop.
>
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

- NestJS 11, Mongoose 9 (MongoDB — xác nhận lại 2026-09-09, package.json thật ghi `^9.9.2`, không phải 8 như bản ghi cũ), Passport (JWT)
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

|                          | TikTok                                                         | Lazada                                                  | Tiki                                                                                          |
| ------------------------ | -------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Cách ký request          | Tự HMAC riêng (GET cho 2 API token)                            | Tự HMAC riêng (path + sorted params, **UPPERCASE hex**) | **KHÔNG cần ký** — OAuth2 chuẩn, Basic Auth header                                            |
| `expires_in` là gì       | **Epoch tuyệt đối** (vd `1660556783`)                          | **Số giây còn lại** (vd `604800` = 7 ngày)              | **Số giây còn lại** (chuẩn OAuth2)                                                            |
| Lấy shop_id/cipher       | Phải gọi THÊM API `GetAuthorizedShops` sau khi có access_token | Có sẵn trong response token (`country_user_info_list`)  | Xác định qua chính access_token, không cần thêm bước                                          |
| Cơ chế nhận đơn hàng mới | Webhook (best-effort) + cron đối soát dự phòng                 | Polling định kỳ (chưa xác nhận có webhook chính thức)   | Event Queue (cơ chế RIÊNG của Tiki, KHÁC webhook — đọc tài liệu `event-queue` trước khi code) |

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

**Code thật hiện tại KHÔNG có Webhook receiver nào, KHÔNG có Kafka** (đã grep toàn bộ `package.json` — không có bất kỳ Kafka client lib nào; chỉ có 2 dòng comment trong code TỰ GHI RÕ lý do: _"Lazada Open Platform hiện chưa xác nhận cơ chế webhook chính thức"_). Flow thật đang chạy là:

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

### 5. Cơ chế WIRING của `@Cron()` — vì sao scheduler tự chạy, và cách nó "biết mất kết nối"

Không có file nào import rồi tự gọi `LazadaOrderSyncScheduler` theo kiểu thủ công — NestJS tự động instantiate + tự chạy theo lịch, với **2 điều kiện bắt buộc, thiếu 1 trong 2 thì `@Cron()` compile qua bình thường nhưng KHÔNG BAO GIỜ chạy** (không có lỗi báo rõ, rất dễ debug nhầm hướng):

1. `app.module.ts` — `ScheduleModule.forRoot()` (dòng 42) phải gọi Ở GỐC app, đúng 1 lần duy nhất. Đây là bước "bật công tắc" cơ chế cron cho TOÀN BỘ project.
2. `orders.module.ts` — `LazadaOrderSyncScheduler` phải được khai vào mảng `providers` (dòng 31). Đây là bước khiến NestJS thực sự tạo ra 1 instance của class này lúc app khởi động — không khai ở `providers` thì class chỉ "tồn tại trong code", decorator `@Cron()` bên trong vô nghĩa.

**Chuỗi gọi đầy đủ khi tới giờ chạy (map theo đúng dòng, để debug nhanh khi cần)**:

```
app.module.ts:42          ScheduleModule.forRoot() — bật cơ chế cron toàn app
orders.module.ts:31       providers: [..., LazadaOrderSyncScheduler] — NestJS tạo instance
  ↓ mỗi 10 phút, NestJS tự gọi:
lazada-order-sync.scheduler.ts → autoSyncAllConnectedShops()
  → marketplaceIntegrationService.listConnectedShops(LAZADA) — lấy danh sách shop từ Mongo
  → loop tuần tự, gọi ordersService.syncLazadaOrders(shop.shop_id) cho từng shop
      ↓
orders.service.ts:59      syncLazadaOrders()
  → lấy accessToken hợp lệ + updatedAfter (= last_polled_at, hoặc lùi 30 ngày nếu lần đầu)
  → gọi lazadaAdapter.getOrders(accessToken, { updatedAfter })
      ↓
lazada.adapter.ts:260     getOrders() — path = '/orders/get' (API GetOrders THẬT của Lazada)
  → callSignedGet() tự ký HMAC + bắn HTTP request ra api.lazada.vn
  → check data.code !== '0' → nếu khác '0' (vd token hết hạn/bị thu hồi) → throw Error ngay tại đây
```

**"Biết còn kết nối hay không" = gọi thẳng `GetOrders` thật, KHÔNG có bước health-check/ping riêng nào trước đó** — Lazada Open Platform không cung cấp API kiểu "verify token status" độc lập, nên cách duy nhất để biết token còn sống là thử gọi API nghiệp vụ thật rồi xem có lỗi hay không. Không có "hỏi nhẹ trước, hỏi thật sau" — chỉ có 1 lần gọi duy nhất, thành công = còn kết nối, lỗi = mất kết nối, biết ngay tại thời điểm đó.

**🔴 Gap thật, chưa xử lý** (phát hiện khi trace lại chuỗi trên): lỗi từ `lazadaAdapter.getOrders()` — bất kể nguyên nhân gốc là gì (token hết hạn, Lazada rate-limit, downtime tạm thời, lỗi mạng...) — đều bị `orders.service.ts` bắt chung và ném ra đúng 1 mã `ORD_ERROR_CODES.SYNC_FAILED` (502) duy nhất. Hệ quả: hệ thống hiện **không phân biệt được** "shop mất kết nối cần Store Owner bấm reconnect lại" với "lỗi tạm thời, tự thử lại lượt cron sau là được" — cả 2 tình huống đều chỉ log ra 1 dòng lỗi generic giống nhau, Store Owner không được chủ động báo cần hành động gì. Muốn vá: cần đọc `data.code`/message cụ thể của Lazada để phân loại lỗi "token/auth" (nên set 1 field kiểu `connection_status: 'disconnected'` trên shop document + tách mã lỗi riêng, VD `ORD_SHOP_DISCONNECTED`) khỏi lỗi tạm thời khác (giữ nguyên generic `SYNC_FAILED`, cron tự retry lượt sau là đủ) — CHƯA làm, cần cân nhắc trước khi coi module `orders` là hoàn thiện đầy đủ cho production thật (không bắt buộc cho demo capstone).

## Roadmap tiếp theo (chốt 2026-09-07) — Product Master Data → Package 4 khung → giao Package 3 cho thành viên khác

### 0. Tổng quan — vì sao chia việc và thứ tự như dưới đây

Package 3 (AI Packaging — thuật toán 3D Bin Packing) là phần nặng nhất theo Report 2 (33 man-days, risk R02 High Impact) — **đã quyết định giao cho 1 thành viên khác trong nhóm đảm nhận riêng**, không phải người đang maintain `orders`/`marketplace-integration`. Để 2 người code song song không giẫm chân nhau, đã chốt 1 **HỢP ĐỒNG INTERFACE** cố định giữa 2 phần (xem mục 3) — miễn đúng interface, ai đổi implementation bên trong phần của mình cũng không ảnh hưởng người kia.

Thứ tự làm (không tùy ý — Package 4 phải có field `fulfillment_status` tồn tại trước thì UC-04 mới có chỗ để ghi kết quả duyệt của AI vào):

```
1. Product Master Data (LazadaAdapter.getProducts() + product_master schema)  ← làm trước, AI cần dữ liệu này
2. Package 4 khung sườn (fulfillment_status + 5 endpoint giả lập nội bộ)      ← độc lập, không phụ thuộc AI
3. [THÀNH VIÊN KHÁC] Thuật toán bin-packing thật, dùng input từ bước 1
4. UC-04 (Packaging Staff Approve/Adjust/Reject) — NỐI bước 2 và bước 3 lại thành 1 luồng
```

### 1. Product Master Data — nền tảng bắt buộc trước khi AI Packaging chạy được

**Vấn đề cần giải**: UC-03 (AI Packaging) Precondition ghi rõ _"Order Group đã có đầy đủ kích thước/khối lượng từng sản phẩm"_ — nhưng hiện tại **không có nguồn dữ liệu nào** cung cấp kích thước sản phẩm cả (Store Owner không tự nhập, hệ thống cũng chưa lấy từ đâu).

**Đã xác nhận qua doc Lazada thật**: API `GetProducts` (`/products/get`, hỗ trợ `sku_seller_list` tra theo lô tối đa 50 SKU/lần — khớp trực tiếp với `SellerSku` đã lưu sẵn trong `orders`) trả về đủ field cần thiết, nằm ở cấp **SKU** (trong mảng `skus[]`, không phải cấp `item_id`):

```json
{
  "package_length": "10.00",
  "package_width": "10.00",
  "package_height": "4.00",
  "package_weight": "0.04",
  "product_weight": "0.03"
}
```

Ưu tiên dùng `package_weight` (đã tính cả bao bì gốc seller, sát thực tế vận chuyển hơn) thay vì `product_weight` (chỉ cân nặng tịnh).

**Đã cân nhắc và LOẠI `GetProductItem`** (`/product/item/get`) — API này giờ **chỉ tra được theo `item_id`** (tham số `seller_sku` đã bị Lazada deprecated từ 15/11/2023), trong khi dữ liệu đơn hàng của hệ thống có sẵn là `SellerSku` cấp SKU — dùng `GetProductItem` sẽ phải thêm 1 bước tra ngược `item_id`, không cần thiết khi `GetProducts` đã tra thẳng được.

**Việc cần code**:

1. `LazadaAdapter.getProducts(sellerSkus[])` — method mới, gọi `GetProducts` với `sku_seller_list`
2. `product-master.schema.ts` — collection mới, xem chuẩn thiết kế ở mục 4 bên dưới
3. Hàm giao diện cho AI: `OrdersService.getPackableItemsForGroup(groupId): Promise<OrderGroupForPackaging>` — xem interface đầy đủ ở mục 3

**Chiến lược cache — KHÔNG gọi Lazada mỗi lần AI tính toán**: lần đầu gặp 1 `sellerSku` chưa có trong `product_master` → gọi API lấy về, cache lại; đồng bộ lại định kỳ 1 lần/ngày (không cần dày như order sync 10 phút — kích thước sản phẩm hiếm khi đổi). Bin-packing đọc thẳng từ cache local, đảm bảo NFR "≤5 giây/đơn" đã cam kết ở Report 2 không phụ thuộc độ trễ mạng ra ngoài.

### 2. Package 4 khung sườn — `fulfillment_status`, KHÔNG gọi API Lazada thật để đổi trạng thái

**Quyết định quan trọng, đến từ chính giảng viên hướng dẫn**: vì tài khoản Lazada dùng để demo là seller thật (đã KYC) nhưng **không có hàng thật, không có shipper Lazada thật tới lấy** — nên **chỉ luồng `sync` (đọc đơn về) là gọi Lazada thật**; mọi hành động sau đó (đã lấy hàng, đã đóng gói, đã giao, hoàn hàng) đều **giả lập bằng cách tự đổi trạng thái trong DB nội bộ**, không gọi `Pack`/`ReadyToShip`/`Return and Refund API` thật lên Lazada.

**Lý do kỹ thuật, không chỉ là "cho đơn giản"**: Lazada Open Platform **không có sandbox riêng** — mọi API gọi ra đều chạm production thật. Gọi `Pack`/`ReadyToShip` thật trên 1 đơn không có hàng thật **có thể khiến Lazada thật sự điều phối 1 shipper thật** tới lấy 1 kiện hàng không tồn tại; gọi `Return and Refund API` thật có thể kích hoạt hoàn tiền thật qua cổng thanh toán thật. Rủi ro thật, không phải lý thuyết — có thể khiến shop test bị đánh dấu hoạt động bất thường.

**Hệ quả cho code đã có sẵn**: các method Fulfillment API đã research trước đó (`readyToShip`, `packOrders`, `printAWB`, nhóm DBS) — **vẫn giữ nguyên kế hoạch implement đủ trong `LazadaAdapter`** theo đúng spec (sẵn sàng dùng thật khi lên production thật ngoài phạm vi đồ án), nhưng **không invoke trong luồng demo** — cùng 1 pattern đã áp dụng với DBS trước đó ("implemented nhưng unverifiable trong môi trường hiện tại").

**Thiết kế**: tách 2 field trạng thái, KHÔNG gộp chung:

| Field                            | Nguồn                                                                                             | Ai cập nhật                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `status` (đã có)                 | Lấy nguyên từ Lazada                                                                              | Cron `syncLazadaOrders` — giữ nguyên                 |
| `fulfillment_status` (field MỚI) | Tự định nghĩa: `new → picking → picked → packed → ready_to_ship → shipped → delivered → returned` | 5 endpoint nội bộ, nhân viên bấm tay/quét QR giả lập |

Cron sync (đọc `status`) và luồng fulfillment nội bộ (ghi `fulfillment_status`) là 2 field độc lập hoàn toàn — cron chạy lại mỗi 10 phút sẽ không bao giờ ghi đè lên `fulfillment_status`, an toàn tuyệt đối.

**5 endpoint nội bộ cần thêm** (đúng UC-07 đã viết ở Report 1 — Warehouse Staff quét QR cập nhật trạng thái, không cần Lazada xác nhận gì):

```
POST /orders/:groupId/fulfillment/pick
POST /orders/:groupId/fulfillment/pack
POST /orders/:groupId/fulfillment/ship
POST /orders/:groupId/fulfillment/deliver
POST /orders/:groupId/fulfillment/return
```

### 3. HỢP ĐỒNG INTERFACE với thành viên làm Package 3 (AI Packaging) — cố định trước khi tách việc

**Input — người làm `orders`/Product Master cung cấp cho AI**:

```ts
interface PackableItem {
  sku: string;
  quantity: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: number;
  is_fragile: boolean; // phục vụ BR-06 (bubble wrap bắt buộc)
}
interface OrderGroupForPackaging {
  order_group_id: string;
  items: PackableItem[];
}
```

**Output — người làm AI Packaging trả về**:

```ts
interface PackagingRecommendation {
  order_group_id: string;
  box_size: { length_cm: number; width_cm: number; height_cm: number };
  material_type: string;
  material_quantity: number;
  computation_time_ms: number;
  fallback_used: boolean; // đúng UC-03 alt flow: timeout >5s → fallback First Fit Decreasing đơn giản
}
```

Miễn đúng 2 shape này, người làm AI có thể tự viết unit test bằng dữ liệu giả (mock `PackableItem[]`) mà không cần chờ Product Master code xong; ngược lại người làm `orders` cũng test được UC-04 (Approve/Adjust) bằng recommendation giả mà không cần chờ thuật toán AI thật.

### 4. Chuẩn thiết kế DB cho các collection MỚI (áp đúng 11 quy tắc "Database Design Standards" đã có ở mục dưới, cụ thể hoá cho lần này)

**`product_master`**:

- Sub-schema riêng `PackageDimension` (`@Schema({ _id: false })`) cho `package_length/width/height/weight` — không dùng `type: Object`
- Index bắt buộc: `{ shop_id: 1, seller_sku: 1 }` **unique** (tra cứu chính luôn theo cặp này)
- Không nhét lịch sử đổi kích thước vào mảng lồng trong document chính — nếu cần track lịch sử, tách collection `product_master_history` riêng

**`packaging_recommendations`** (chi tiết bên trong do người làm AI tự thiết kế, nhưng các ràng buộc sau BẮT BUỘC):

- Index: `{ order_group_id: 1 }` unique (1 group chỉ có 1 recommendation `is_active: true` tại 1 thời điểm) + `{ approval_status: 1, created_at: -1 }` (phục vụ UI Packaging Staff xem danh sách đang chờ duyệt)
- Khi bị Reject và tính lại (UC-03 alt flow): **không xóa cứng bản cũ** — đánh `is_active: false`, tạo bản ghi mới `is_active: true`, giữ lịch sử phục vụ audit "AI Recommendation Accuracy Rate" (BR-08)

**`orders.fulfillment_status`** (field thêm vào schema có sẵn):

- Index bổ sung: `{ fulfillment_status: 1, consolidated_group_id: 1 }` — phục vụ query "danh sách đơn theo trạng thái" cho UI kho
- Theo nguyên tắc ESR: nếu sau này thêm filter theo `created_at` kèm `fulfillment_status`, đặt `fulfillment_status` (equality) trước, `created_at` (range) sau trong compound index

**Transaction bắt buộc khi Approve (UC-04)**: hành động Approve ghi ĐỒNG THỜI `packaging_recommendations.approval_status` VÀ `orders.fulfillment_status` (2 collection khác nhau, cùng 1 nghiệp vụ) → bắt buộc bọc `session.withTransaction()`, không ghi rời rạc.

**Counter cho Dashboard (Package 5, làm sau)**: nếu track kiểu "số đơn đã đóng gói hôm nay", dùng atomic `$inc` (`findByIdAndUpdate(id, { $inc: { total_packed: 1 } }, { upsert: true })`), **không** đọc-document-rồi-cộng-rồi-save.

## Kiến trúc mở rộng đa sàn (Multi-Platform Scalability) — chốt 2026-09-09, nghiên cứu sâu để thêm TikTok/Tiki KHÔNG phải sửa lại code Lazada đang chạy sống

### 0. Tại sao cần mục này — vấn đề thật đã phát hiện khi rà lại toàn bộ hệ thống

Adapter Pattern (`marketplace-adapter.interface.ts`) đã cô lập ĐÚNG sự khác biệt giữa các sàn ở **tầng gọi API** (HMAC vs Basic Auth, epoch vs relative expiry...). Nhưng rà lại kỹ phát hiện: **tầng điều phối phía trên vẫn đang rò rỉ "biết Lazada"** — `OrdersService.syncLazadaOrders(shopId)` gắn cứng tên sàn ngay trong tên method, `LazadaOrderSyncScheduler` gắn cứng `MarketplacePlatform.LAZADA` khi query shop đã connect. Nếu giữ nguyên, thêm TikTok sẽ phải **viết trùng lặp gần như toàn bộ pipeline** (`syncTikTokOrders`, `TikTokOrderSyncScheduler`) thay vì tái dùng — đúng kiểu "phình to" người dùng muốn tránh. Nguyên tắc sửa: **chỉ tầng Adapter được phép biết sự khác biệt giữa các sàn — mọi tầng phía trên (Service, Scheduler, Controller) chỉ được thao tác qua `platform` như 1 tham số/enum, không bao giờ hardcode tên sàn trong logic nghiệp vụ.**

### 1. Adapter Registry — thay if/else hoặc switch-case bằng lookup, tránh phình to theo cấp số nhân

```ts
// ❌ KHÔNG làm — mỗi lần thêm sàn phải sửa lại hàm này, độ phức tạp tăng tuyến tính theo số sàn
async syncOrders(platform: MarketplacePlatform, shopId: string) {
  if (platform === 'lazada') return this.lazadaAdapter.getOrders(...);
  if (platform === 'tiktok') return this.tiktokAdapter.getOrders(...);
}

// ✅ LÀM — NestJS multi-provider, đăng ký 1 lần trong module, KHÔNG sửa OrdersService/Scheduler khi thêm sàn
@Injectable()
export class MarketplaceAdapterRegistry {
  private readonly adapters = new Map<MarketplacePlatform, MarketplaceAdapter>();
  constructor(@Inject('MARKETPLACE_ADAPTERS') adapters: MarketplaceAdapter[]) {
    adapters.forEach(a => this.adapters.set(a.platform, a));
  }
  get(platform: MarketplacePlatform): MarketplaceAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) throw new AppException(MKT_ERROR_CODES.PLATFORM_NOT_SUPPORTED);
    return adapter;
  }
}
```

Thêm sàn mới = thêm 1 dòng provider trong `marketplace-integration.module.ts` — 0 dòng sửa ở `OrdersService`/scheduler.

### 2. `syncOrders(platform, shopId)` thay `syncLazadaOrders(shopId)` — tổng quát hóa tên + tham số, giữ nguyên logic bên trong

Đổi tên method + thêm tham số `platform`, bên trong tra `MarketplaceAdapterRegistry.get(platform)` thay vì gọi thẳng `this.lazadaAdapter`. Logic nghiệp vụ (parse, `tryConsolidate()`, upsert) giữ nguyên 100% — vốn đã platform-agnostic sẵn từ đầu (không có chỗ nào trong logic consolidation biết tới "Lazada" cả).

### 3. Scheduler generic — 1 cron loop qua MỌI platform, tách biệt TRIGGER khỏi PIPELINE xử lý

**Phát hiện quan trọng khi nghiên cứu sâu**: không phải mọi sàn đều dùng CÙNG 1 cơ chế trigger — Lazada polling (cron), TikTok dùng Webhook thật, Tiki dùng Event Queue riêng (khác cả webhook lẫn polling). Nếu chỉ tổng quát hóa mỗi cron mà không tách trigger khỏi pipeline, thêm TikTok vẫn phải viết `TikTokWebhookController` xử lý toàn bộ logic riêng, LẶP LẠI mapper/consolidation/upsert đã có.

**Kiến trúc đúng — tách 2 lớp rõ ràng**:

```
[Lớp TRIGGER — khác nhau theo sàn, mỗi sàn 1 cơ chế riêng]
  Cron 10' (Lazada, chưa xác nhận webhook chính thức)
  Webhook receiver — POST /marketplace/:platform/webhook (TikTok)
  Event Queue consumer (Tiki)
        ↓ tất cả đều gọi chung 1 hàm duy nhất:
[Lớp PIPELINE — chung tuyệt đối, viết 1 lần, dùng cho mọi sàn]
  OrdersService.processIncomingOrder(platform, rawPayload)
    → adapter tương ứng tự mapper() sang canonical shape (xem mục 5)
    → tryConsolidate() (đã platform-agnostic)
    → lưu order_groups
```

Endpoint webhook dùng chung 1 controller tổng quát (`POST /marketplace/:platform/webhook`, dispatch theo `platform` param qua registry), **không viết `TikTokWebhookController` riêng**.

### 4. Idempotency — bắt buộc khi có TikTok/Tiki, vì webhook/event queue giao HAI LẦN là chuyện bình thường

**Đây là khoảng trống thật, nghiêm trọng, chưa từng được note ở đâu trước đây.** Cơ chế polling của Lazada tự nhiên chống trùng nhờ `upsert` theo `platform_order_id` (gọi lại nhiều lần, dữ liệu vẫn hội tụ đúng 1 bản ghi). Nhưng **Webhook và Event Queue theo chuẩn ngành đều chỉ đảm bảo "at-least-once delivery"** — TikTok/Tiki HOÀN TOÀN có thể gửi cùng 1 sự kiện 2 lần (do retry khi network timeout phía họ, dù server mình đã xử lý xong). Nếu không xử lý, có thể xảy ra: 1 đơn được `tryConsolidate()` chạy 2 lần gần như đồng thời → race condition tạo 2 `order_group` cho cùng 1 đơn.

**Giải pháp**: mọi payload từ webhook/event queue phải kèm 1 `event_id` (TikTok/Tiki đều cung cấp sẵn trong payload chuẩn) — trước khi xử lý, kiểm tra `event_id` đã xử lý chưa qua 1 collection nhỏ `processed_webhook_events` (index unique `{platform, event_id}`, TTL 7 ngày là đủ vì chỉ cần chống trùng ngắn hạn, không cần lưu vĩnh viễn):

```ts
async processIncomingOrder(platform: MarketplacePlatform, rawPayload: unknown, eventId: string) {
  const alreadyProcessed = await this.processedEventModel.exists({ platform, event_id: eventId });
  if (alreadyProcessed) return; // im lặng bỏ qua, KHÔNG throw lỗi — đây là hành vi bình thường của webhook, không phải sự cố
  await this.processedEventModel.create({ platform, event_id: eventId }); // ghi TRƯỚC khi xử lý, không phải sau
  // ... xử lý thật
}
```

### 5. Anti-Corruption Layer — mapper của mỗi adapter PHẢI hội tụ về đúng 1 canonical shape, không rò rỉ field lạ ra ngoài

Nguyên tắc (mượn thuật ngữ DDD — Domain-Driven Design): mỗi sàn có `RawOrder` type RIÊNG (khớp đúng response thật của sàn đó, kể cả field kỳ quặc như `country_user_info` của Lazada) — nhưng **mapper luôn trả về đúng 1 `MappedOrder` type DUY NHẤT, định nghĩa 1 lần, dùng chung**. `OrdersService`/`tryConsolidate()`/schema **không bao giờ nhìn thấy** field gốc của bất kỳ sàn nào:

```ts
interface MappedOrder {
  // định nghĩa 1 lần, mọi adapter PHẢI map về đúng shape này
  platform: MarketplacePlatform;
  platform_order_id: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  items: MappedOrderItem[];
  raw_status: string; // giữ nguyên string gốc của sàn để hiển thị, KHÔNG parse logic dựa vào giá trị này
}
```

Đây chính là lý do bug "quantity field" (mục lịch sử phía trên) không lặp lại với sàn mới: nếu TikTok trả `quantity` thật (khác Lazada), chỉ `TikTokOrderMapper` cần biết điều đó — phần còn lại của hệ thống không đổi 1 dòng.

### 6. Rate-limit/backoff đóng gói TRONG adapter, không lộ ra scheduler

Mỗi sàn có quota khác nhau (Lazada ghi rõ 10.000 request/ngày/app, TikTok/Tiki có thể khác hẳn). Retry/circuit-breaker/backoff PHẢI nằm trong chính adapter (đã đúng hướng theo Risk R01 ở Report 2: _"thiết kế lớp adapter trung gian để cô lập thay đổi"_) — `OrdersService`/scheduler gọi `adapter.getOrders()` và chỉ cần biết nó thành công hay ném lỗi, không cần biết bên trong đang retry lần thứ mấy.

### 7. Contract Test — cơ chế PHÒNG NGỪA tự động, không dựa vào tự nhớ

```ts
// marketplace-adapter.contract.spec.ts — chạy cho MỌI adapter đã đăng ký, viết 1 lần
describe.each(getAllRegisteredAdapters())('MarketplaceAdapter contract: %s', (adapter) => {
  it('platform khớp đúng enum MarketplacePlatform', ...);
  it('getOrders trả đúng shape RawOrder[]', ...);
  it('mapper trả đúng shape MappedOrder (mục 5)', ...);
});
```

Thêm `TikTokAdapter` mà quên implement đúng shape → test này tự fail ngay lúc CI, không cần nhớ viết test riêng.

### 8. Error code — nhắc lại nghiêm ngặt nguyên tắc đã có, đây là chỗ DỄ VI PHẠM NHẤT khi code vội

`MKT_`/`ORD_` là prefix theo MODULE, không phải theo SÀN — **cấm tuyệt đối** tạo `MKT_TIKTOK_TOKEN_EXPIRED` riêng biệt `MKT_LAZADA_TOKEN_EXPIRED`. Mỗi adapter tự dịch mã lỗi gốc của sàn mình (Lazada `data.code !== '0'`, TikTok có cấu trúc lỗi khác hẳn) về ĐÚNG 1 tập mã lỗi chung (`MKT_TOKEN_EXPIRED`, `MKT_RATE_LIMITED`...) NGAY BÊN TRONG chính adapter, trước khi throw ra ngoài — FE/Service phía trên không bao giờ cần biết lỗi gốc tới từ sàn nào.

### Bảng tóm tắt — cái gì PHẢI sửa trước khi thêm TikTok, cái gì KHÔNG cần đụng tới

| Thành phần                                              | Cần tổng quát hóa trước?                                      | Effort                      |
| ------------------------------------------------------- | ------------------------------------------------------------- | --------------------------- |
| `syncLazadaOrders` → `syncOrders(platform, shopId)`     | 🔴 Có                                                         | Nhỏ — đổi tên + tham số hóa |
| Scheduler (1 cron chung, tách trigger/pipeline)         | 🔴 Có                                                         | Vừa                         |
| `MarketplaceAdapterRegistry`                            | 🔴 Có                                                         | Nhỏ                         |
| Idempotency (`processed_webhook_events`)                | 🟡 Nên làm trước, dù Lazada chưa cần (polling tự chống trùng) | Nhỏ                         |
| Mapper → canonical `MappedOrder`                        | 🔴 Có (nếu mapper hiện tại còn rò field Lazada ra ngoài)      | Vừa                         |
| `order_groups`, `fulfillment_status`, 5 endpoint nội bộ | 🟢 KHÔNG — đã platform-agnostic sẵn                           | 0                           |
| 3 interface AI Packaging                                | 🟢 KHÔNG — đã platform-agnostic sẵn                           | 0                           |
| `product_master`                                        | 🟡 Chỉ cần thêm `platform` vào index unique                   | Nhỏ                         |

## ĐÃ TRIỂN KHAI (2026-09-09) — `order_groups` + `product_master`, patch thuần cộng thêm, verify bằng compiler thật

### Đính chính quan trọng — tự sửa sai của chính lượt research trước

Khi bắt tay code thật, phát hiện **kết luận "chưa có Adapter Registry" ở mục trên là SAI** — `marketplace-adapter.interface.ts` (dòng cuối) **đã có sẵn** DI token `MARKETPLACE_ADAPTERS`, đã wire trong `marketplace-integration.module.ts` (factory trả về `{ [MarketplacePlatform.LAZADA]: lazadaAdapter }`), và interface `MarketplaceAdapter` **đã khai sẵn** `verifyWebhookSignature()` — nghĩa là việc chuẩn bị cho webhook (TikTok) đã được người viết code trước đó tính tới từ đầu. Lý do `orders.service.ts` không dùng registry này: `getOrders`/`getOrderItems` **không nằm trong** `MarketplaceAdapter` interface dùng chung (interface đó chỉ khai method OAuth/webhook) — nên `syncLazadaOrders()` phải inject thẳng `LazadaAdapter` (class cụ thể). Bài học: **luôn đọc code thật trước khi kết luận "thiếu gì"**, đã tự sửa hướng tiếp cận ngay khi phát hiện, không giữ nguyên kế hoạch sai.

### Ràng buộc tuân thủ khi code: KHÔNG sửa API đã hoàn thành

`auth/*`, `users/*`, `orders.service.ts` (method `syncLazadaOrders`), `lazada-order-sync.scheduler.ts`, mọi field hiện có trong `order.schema.ts`, mọi route `GET/POST /orders*` — **0 dòng bị đổi**. Chỉ 2 file "cũ" bị chạm, cả 2 đều THUẦN CỘNG THÊM (đã diff xác nhận không dòng nào cũ bị sửa):

- `lazada.adapter.ts`: thêm đúng 1 method `getProducts()` (dòng 371) — đúng theo khuôn `callSignedGet()` mà chính comment gốc trong code đã tự để sẵn chỗ _("GetProducts... sẽ theo cùng 1 khuôn khi cần")_.
- `app.module.ts`: thêm đúng 2 dòng import (`ProductMasterModule`, `OrderGroupsModule`) vào mảng `imports`.

### File mới, theo đúng cây thư mục thật của project

```
src/
  common/
    interfaces/packaging.interface.ts        # Hợp đồng bàn giao AI Packaging (PackableItem, OrderGroupForPackaging, PackagingRecommendation)
    schemas/processed-webhook-event.schema.ts # Idempotency — CHƯA có consumer nào gọi, chuẩn bị sẵn cho TikTok webhook
  modules/
    order-groups/                              # MODULE MỚI, sibling với orders/, KHÔNG nằm trong orders/
      enums/group-fulfillment-status.enum.ts
      schemas/order-group.schema.ts
      order-groups.errors.ts
      order-groups.service.ts                  # getOrCreateGroupForOrder() + getPackableItemsForGroup()
      order-groups.module.ts
    product-master/                             # MODULE MỚI
      schemas/product-master.schema.ts
      product-master.service.ts                 # syncProductsForShop() — gọi getProducts() + bulkWrite() cache
      product-master.module.ts
```

### Luồng chạy — từ lúc có đơn hàng tới lúc AI Packaging lấy được dữ liệu

```
[ĐÃ CÓ, không đổi] Cron 10' → syncLazadaOrders() → Order lưu vào MongoDB (consolidated_group_id vẫn null nếu chưa gộp)
        ↓
[MỚI] Lần đầu 1 group được cần tới (VD Packaging Staff mở màn hình, hoặc gọi getPackableItemsForGroup):
  OrderGroupsService.getOrCreateGroupForOrder(order)
    → nếu order.consolidated_group_id đã có giá trị (tryConsolidate() cũ đã gán) → tìm/tạo OrderGroup dùng ĐÚNG id đó
    → nếu null (đơn chưa từng gộp) → tạo OrderGroup mới, ghi NGƯỢC id vào field consolidated_group_id
      (field này vốn LUÔN null trong code cũ, không ai đọc — ghi vào đây là AN TOÀN, không ảnh hưởng
      logic sync/tryConsolidate() đang chạy, vì họ chưa từng dùng giá trị này để quyết định gì)
        ↓
[MỚI] OrderGroupsService.getPackableItemsForGroup(groupId)
    → query orders theo consolidated_group_id (Rule #12 .lean(), #13 .select())
    → aggregateOrderItems() (TÁI DÙNG util đã có, không viết lại)
    → query product_master theo $in (Rule #16, chống N+1)
    → trả về OrderGroupForPackaging — ĐÚNG shape đã chốt cho thành viên làm AI
        ↓
[Riêng, độc lập] ProductMasterService.syncProductsForShop(shopId, skus)
    → gọi LazadaAdapter.getProducts() (method mới) theo batch 50
    → bulkWrite() cache vào product_master (Rule #14)
    → chạy 1 lần/ngày (cron riêng, CHƯA code — xem "Việc còn thiếu" bên dưới), KHÔNG phải mỗi lần AI tính
```

### Verify — đã chạy compiler thật, không chỉ đọc mắt (đúng chuẩn Type Safety đã đặt ra)

Merge patch vào bản đầy đủ, `npm install`, chạy `npx tsc --noEmit -p tsconfig.json` → **0 lỗi** (1 lỗi unused-import nhỏ phát hiện lúc đầu, đã tự sửa). Chạy `npx eslint` trên toàn bộ file mới + 2 file bị chạm → **0 lỗi/warning**. Không có lỗi nào lan sang phần code cũ.

### Việc CÒN THIẾU, chưa code trong lượt này (liệt kê rõ để không hiểu nhầm đã xong hết)

1. `getOrCreateGroupForOrder()` mới chỉ được gọi khi cần (on-demand) — CHƯA có cron/job tự động chạy nó cho MỌI order mới sync xong. Cần quyết định: gọi ngay sau mỗi lần sync (thêm hook), hay để lazy tới khi Packaging Staff/API nào đó cần mới tạo group.
2. `ProductMasterService.syncProductsForShop()` viết xong nhưng **chưa có nơi nào gọi nó** — cần 1 cron riêng (khác cron Lazada order sync, tần suất 1 lần/ngày) hoặc 1 endpoint admin gọi tay.
3. `order-groups.controller.ts` — CHƯA có, hiện `OrderGroupsService` chỉ dùng nội bộ (service-to-service), chưa có route HTTP nào cho FE gọi.
4. 5 endpoint fulfillment nội bộ (pick/pack/ship/deliver/return) — CHƯA code, đây là việc tiếp theo sau khi có `order_groups` (vừa xong).
5. `PackagingRecommendation` schema — CHƯA code, thuộc phần bàn giao cho thành viên làm AI Packaging.
6. UC-04 (Approve/Adjust/Reject, transaction Rule #6) — CHƯA code, phụ thuộc mục 5 xong trước.

## Điểm yếu đã phát hiện khi rà toàn bộ Backend (2026-09-09) — vấn đề, cách khắc phục, tại sao, lợi ích sau khi vá

Mỗi mục dưới đây theo đúng khuôn: **Vấn đề** (bằng chứng cụ thể) → **Cách khắc phục** → **Tại sao PHẢI vá, không phải "nice to have"** → **Lợi ích cụ thể cho hệ thống sau khi vá**.

### 1. Test coverage = 0 cho `orders/`, `marketplace-integration/`, `order-groups/`, `product-master/`

**Vấn đề**: chỉ `auth/`, `mail/`, `users/` có `.spec.ts` (8 file). Module xử lý đúng nghiệp vụ lõi (Order Consolidation, AI Packaging data) — không có test nào, dù CLAUDE.md tự đặt quy tắc bắt buộc cho đúng 2 module này.

**Cách khắc phục**: viết `.spec.ts` theo đúng độ ưu tiên — trước tiên cho **pure function** (không cần mock Mongoose/HTTP, chi phí thấp nhất): `aggregate-order-items.util.ts`, `consolidation-key.util.ts`, mapper `lazada-order.mapper.ts`. Sau đó tới service có business logic phân nhánh (`OrderGroupsService.getPackableItemsForGroup` — case thiếu Product Master, case group không tồn tại). Không cần test lại `callSignedGet`/HTTP call thật (đã verify bằng dữ liệu thật rồi, tốn công mock không cần thiết).

**Tại sao phải vá**: đây không chỉ là "thiếu điểm QA" — thuật toán consolidation (`consolidation-key.util.ts`) là **logic quyết định tiền/hàng thật** (gộp sai đơn = giao nhầm/tính phí ship sai). Không có test nghĩa là mỗi lần sửa code liên quan, chỉ có thể tin vào "đọc mắt" + test tay bằng dữ liệu thật — chậm, không lặp lại được, không bắt được regression tự động.

**Lợi ích sau khi vá**: CI (`.github/workflows/ci.yml` đã có sẵn 3 job lint/test/build) sẽ **tự động chặn PR** nếu ai đó vô tình sửa hỏng logic gộp đơn — không phải đợi tới lúc demo/production mới phát hiện. Đúng tinh thần Report 2 mục Quality Management đã cam kết với hội đồng.

### 2. Không có retry/backoff thật trong `callSignedGet()` — khoảng cách giữa nguyên tắc đã tuyên bố và code thật

**Vấn đề**: Risk R01 (Report 2) cam kết _"áp dụng cơ chế retry/circuit breaker"_ — code thật gọi `axios.get()` đúng 1 lần, lỗi mạng/rate-limit tạm thời là mất luôn cả request, không tự phục hồi.

**Cách khắc phục**: thêm retry với **exponential backoff** ngay trong `callSignedGet()` (đúng đề xuất kiến trúc đã chốt — "rate-limit/backoff đóng gói TRONG adapter, không lộ ra scheduler/service gọi nó"): tối đa 3 lần thử, delay tăng dần (500ms → 1s → 2s), chỉ retry lỗi mạng/5xx/rate-limit (429), KHÔNG retry lỗi 4xx do sai tham số (retry lỗi loại này chỉ tốn thời gian, không bao giờ tự hết).

**Tại sao phải vá NGAY BÂY GIỜ, không phải để sau**: `product-master.service.ts` vừa thêm sẽ **cộng dồn request** với cron order-sync 10 phút/lần lên cùng 1 quota Lazada (10.000/ngày) — càng nhiều nguồn gọi cùng lúc, xác suất đụng rate-limit tạm thời càng cao. Vá trước khi có thêm nguồn gọi thứ 2 (product-master) rẻ hơn nhiều so với vá sau khi cả 2 đã chạy sống.

**Lợi ích sau khi vá**: 1 lần Lazada rate-limit tạm thời (`901` theo đúng mã lỗi đã note trong doc Lazada) sẽ **tự phục hồi trong vài giây**, không làm rớt cả lượt cron/sync — giảm hẳn số lần phải debug thủ công "sao đơn này không về" chỉ vì 1 request thoáng qua bị từ chối.

### 3. Double-query khi cần cả thông tin shop lẫn access token

**Vấn đề**: `getConnectedShop()` và `getValidAccessToken()` mỗi hàm tự query `marketplaceShopModel` riêng — nơi nào cần cả 2 thứ sẽ vô tình query Mongo 2 lần cho đúng 1 document (tự phát hiện khi viết `product-master.service.ts`).

**Cách khắc phục**: KHÔNG sửa 2 hàm hiện có (tránh rủi ro cho code đang chạy sống) — thay vào đó, chỉ ghi rõ trong docstring của cả 2 hàm: _"Nếu cần cả shop info lẫn token, gọi `getValidAccessToken` trước (đã tự query shop bên trong), đừng gọi thêm `getConnectedShop` nữa trừ khi thật sự cần field mà token response không có."_ Đây là vá bằng tài liệu, không phải vá bằng code — vì mức độ ảnh hưởng nhỏ (1 query Mongo dư, không phải bug sai logic), không đáng đánh đổi rủi ro sửa file dùng chung.

**Tại sao vẫn đáng ghi lại dù không sửa code**: nếu không ghi chú, người viết code sau (kể cả tương lai chính mình) sẽ lặp lại đúng sai lầm này mỗi lần cần cả 2 thứ — chi phí ghi chú gần như 0, lợi ích tránh lặp lại lâu dài.

**Lợi ích**: giảm 1 round-trip Mongo không cần thiết ở mọi chỗ gọi sau này — nhỏ nhưng cộng dồn có ý nghĩa khi tần suất gọi tăng (nhiều shop × nhiều lần/ngày).

### 4. `consolidated_group_id` giờ có 2 code path cùng ghi — cần tài liệu hóa rõ ranh giới sở hữu (ownership)

**Vấn đề**: trước đây chỉ `tryConsolidate()` ghi field này. Giờ thêm `OrderGroupsService.getOrCreateGroupForOrder()` cũng ghi (cho đơn chưa từng gộp) — đánh đổi kiến trúc phát sinh từ ràng buộc "không sửa code cũ".

**Cách khắc phục**: ghi rõ comment NGAY TẠI field `consolidated_group_id` trong `order.schema.ts`... nhưng vì **không được sửa file này** (đã chốt), giải pháp đúng là ghi rõ ràng buộc này thành 1 quy tắc trong CLAUDE.md (mục này) làm nguồn sự thật duy nhất: _"`consolidated_group_id` có 2 writer hợp pháp: `tryConsolidate()` (gán lúc phát hiện gộp) và `OrderGroupsService.getOrCreateGroupForOrder()` (backfill cho đơn đơn lẻ) — cả 2 đều CHỈ ghi khi field đang `null`, không bao giờ ghi đè giá trị đã có. Không thêm writer thứ 3 nếu không cập nhật quy tắc này."_

**Tại sao phải vá**: nếu không ghi rõ, người sau (hoặc chính mình 2 tháng sau) thấy field này đổi giá trị sẽ mất thời gian tìm "ai ghi vào đây" — với 2 writer đã đủ phức tạp để cần 1 điểm tra cứu duy nhất.

**Lợi ích**: giảm thời gian debug tương lai, và là "hàng rào" nhắc nhở trước khi ai đó vô tình thêm writer thứ 3 phá vỡ bất biến "chỉ ghi khi null".

### 5. Business rule CHƯA thiết kế: validate chuyển trạng thái `GroupFulfillmentStatus`

**Vấn đề**: 5 endpoint pick/pack/ship/deliver/return chưa code, và chưa có quy tắc nào chặn việc nhảy trạng thái tùy tiện (VD gọi thẳng `/deliver` khi đơn còn đang `awaiting_packaging`).

**Cách khắc phục**: thêm 1 file thuần (`allowed-status-transitions.ts`) định nghĩa map trạng thái hợp lệ kế tiếp cho từng trạng thái hiện tại, dùng chung cho cả 5 endpoint — theo đúng tinh thần BR-11 đã có tiền lệ ở UC-07 (_"không cho Packed tới khi 100% item Picked"_).

**Tại sao phải có TRƯỚC KHI code 5 endpoint**, không phải thêm sau: nếu code endpoint trước, validate sau, rất dễ quên áp dụng đồng đều cho cả 5 chỗ (mỗi endpoint tự viết if/else riêng, dễ lệch nhau). Định nghĩa map 1 lần dùng chung đảm bảo tính nhất quán ngay từ đầu.

**Lợi ích**: chặn được trạng thái vô lý xâm nhập vào dữ liệu (VD đơn "delivered" nhưng chưa từng "packed") — dữ liệu sạch, Dashboard (Package 5) sau này tính KPI đúng, không bị nhiễu bởi trạng thái bất thường.

### 6. ✅ ĐÃ XÁC NHẬN — Rule #6 (transaction) an toàn, project dùng MongoDB Atlas cho cả dev lẫn production

**Vấn đề gốc (đã nêu 2026-09-09)**: `session.withTransaction()` (Rule #6 Database Design Standards) **chỉ chạy được nếu MongoDB là replica set** — standalone `mongod` (setup mặc định đơn giản nhất khi 1 dev tự cài local) sẽ throw lỗi ngay khi code chạm transaction lần đầu.

**Đã xác nhận bằng file `.env` thật của user (2026-09-09, cùng ngày)**: `MONGODB_URI=mongodb+srv://optipackai_service:***@capstoneproject.o62tptf.mongodb.net/optipackai?...` — đây là **MongoDB Atlas thật**, không phải `mongod` local standalone. Atlas **luôn tự động là replica set**, kể cả free tier — Rule #6 chạy đúng bình thường, **không cần sửa gì thêm, không cần init replica set tay**.

**Kết luận**: rủi ro mô tả ở mục này **không áp dụng cho project** vì đã dùng đúng Atlas ngay từ đầu cho cả dev lẫn production (không tách biệt 2 môi trường như lo ngại ban đầu). Giữ lại mục này trong CLAUDE.md làm tài liệu tham khảo — nếu SAU NÀY có ai đó (bạn cùng nhóm mới, hoặc máy dev khác) đổi `MONGODB_URI` sang `mongodb://localhost:27017` để "cho nhanh, khỏi cần mạng", đây là lời cảnh báo cần đọc lại trước khi làm vậy.

**⚠️ Phát hiện thêm khi xem file `.env` thật — nhắc bảo mật, không liên quan transaction**: `.env` chứa mật khẩu Atlas thật dạng plaintext (đúng bản chất `.env`, không phải lỗi) — cần xác nhận file này đã nằm trong `.gitignore`, chưa từng bị `git commit` lỡ tay. Kiểm tra nhanh: `git check-ignore -v .env` (có output = an toàn) và `git log --all --full-history -- .env` (có kết quả = đã từng commit, cần đổi ngay mật khẩu Atlas vì coi như đã lộ vĩnh viễn trong lịch sử git dù xóa file sau đó).

### 7. 🔴 Idempotency check (`processed_webhook_events`, Rule #17) — thiết kế nháp có RACE CONDITION, tự phát hiện khi rà lại

**Vấn đề**: pattern ban đầu đề xuất — _"check `event_id` đã xử lý chưa qua `exists()`, nếu chưa thì `create()` rồi mới xử lý"_ — **`exists()` rồi `create()` là 2 lệnh RIÊNG BIỆT, không atomic**. Nếu 2 webhook trùng `event_id` tới gần như đồng thời (chính kịch bản Rule #17 sinh ra để chống), cả 2 request có thể cùng vượt qua bước `exists()` (vì lúc đó chưa ai `create()` xong) → vẫn xử lý trùng — **đúng lỗi mà toàn bộ cơ chế này được thiết kế ra để ngăn, nhưng thiết kế nháp lại không chặn được**.

**Cách khắc phục**: đảo thứ tự — **thử `create()` TRƯỚC** (dựa vào unique index `{platform, event_id}` đã có), bọc `try/catch`; nếu lỗi là duplicate-key (Mongo error code `11000`) → coi như "đã xử lý", bỏ qua êm; lỗi khác thì throw thật:

```ts
try {
  await this.processedEventModel.create({ platform, event_id: eventId });
} catch (error) {
  if (isDuplicateKeyError(error)) return; // đã xử lý rồi, bỏ qua — không phải lỗi
  throw error;
}
// ... xử lý thật, CHỈ chạy được nếu create() ở trên thành công
```

MongoDB tự đảm bảo tính atomic của thao tác ghi + check unique index ở tầng storage engine — không cần tự đồng bộ hóa (mutex/lock) ở tầng ứng dụng.

**Tại sao đáng ghi lại dù chưa có consumer nào dùng**: đây là **thiết kế** sẽ được dùng làm khuôn mẫu khi code TikTok webhook receiver — sửa SAI TỪ GỐC bây giờ (lúc chưa ai dùng) rẻ hơn nhiều so với sửa sau khi đã có code TikTok dựa theo pattern sai này.

**Lợi ích**: đảm bảo cơ chế chống trùng THỰC SỰ chống được trùng trong tình huống đồng thời — đúng mục đích ban đầu của Rule #17.

### 8. ✅ Bug thật đã sửa ngay khi phát hiện — `allowed-status-transitions.ts` thiếu đường REJECT

**Vấn đề**: map transition (mục 5 ở trên) chỉ cho `PENDING_APPROVAL → APPROVED_FOR_PACKING` (đi tiếp), **thiếu hẳn đường lùi** `PENDING_APPROVAL → AWAITING_PACKAGING` — trong khi UC-04 Alt Flow (Report 1) ghi rõ: _"Packaging Staff rejects entirely (Reject) → Order Group returns to UC-03 for AI to recompute"_. Nếu giữ nguyên, endpoint Reject (chưa code) khi gọi `isValidStatusTransition()` sẽ **luôn bị chặn sai**, dù đây là hành vi nghiệp vụ hợp lệ.

**Đã tự vá ngay trong lượt rà soát này** (không đợi review riêng) — thêm `AWAITING_PACKAGING` vào mảng cho phép của `PENDING_APPROVAL`, kèm comment giải thích rõ đây là đường Reject, không phải lỗi gõ nhầm.

**Lợi ích**: endpoint Reject (UC-04, sắp code) sẽ hoạt động đúng ngay từ lần đầu, không cần phát hiện bug này lần 2 lúc code endpoint rồi mới quay lại sửa file enum.

## ĐÃ VÁ (2026-09-09, cùng ngày phát hiện) — xác nhận trạng thái từng điểm yếu ở trên

| #   | Điểm yếu                             | Trạng thái                                                                              | Chi tiết                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Test coverage = 0                    | 🔴 CHƯA vá                                                                              | Việc lớn, cần lượt riêng — chưa làm trong patch này                                                                                                                                                                                                                                                                                                       |
| 2   | Không retry/backoff                  | ✅ ĐÃ vá                                                                                | `callSignedGet()` giờ retry tối đa 3 lần, exponential backoff (500ms→1s→2s), chỉ retry lỗi mạng/5xx/429                                                                                                                                                                                                                                                   |
| 3   | Double-query shop/token              | 🟡 Chỉ ghi chú, không sửa code (đúng quyết định đã nêu — rủi ro/lợi ích không đáng đổi) | Xem lý do đầy đủ ở mục 3 phía trên                                                                                                                                                                                                                                                                                                                        |
| 4   | 2 writer cho `consolidated_group_id` | ✅ ĐÃ vá thêm 1 bước nữa so với dự tính ban đầu                                         | Không chỉ ghi chú — code `getOrCreateGroupForOrder()` giờ **tự chữa `order_count`** mỗi lần group bị chạm tới (đếm lại thật từ collection `orders`), xử lý đúng case `tryConsolidate()` gán thêm sibling VÀO group đã tồn tại mà không ai cập nhật lại số đếm — phát hiện thêm khi kiểm tra tính tương thích 2 code path, không có trong kế hoạch ban đầu |
| 5   | Chưa có validate transition          | ✅ ĐÃ vá                                                                                | File mới `allowed-status-transitions.ts` — map + 2 hàm thuần `isValidStatusTransition()`/`getAllowedNextStatuses()`, sẵn sàng dùng khi code 5 endpoint                                                                                                                                                                                                    |

**Wire nốt 2 việc "còn thiếu" từ lượt trước** (không phải điểm yếu, nhưng hoàn thiện luôn vì liên quan trực tiếp):

- `ProductMasterSyncScheduler` (mới) — cron riêng 3h sáng mỗi ngày, gọi `syncProductsForShopFromOrders()` (method mới, lấy SKU cần đồng bộ TRỰC TIẾP từ đơn hàng thật đã có — KHÔNG đồng bộ toàn bộ catalog shop, tránh tốn quota cho SKU chưa từng bán qua hệ thống).
- `OrderGroupBackfillScheduler` (mới) — cron riêng 15 phút/lần, tự động gọi `getOrCreateGroupForOrder()` cho mọi đơn `consolidated_group_id: null`, giới hạn 200 đơn/lượt tránh ôm quá nhiều việc.

**Verify**: merge patch v2 vào bản đầy đủ, `tsc --noEmit` → 0 lỗi (đã tự sửa 2 lỗi thật lúc đầu: `EVERY_15_MINUTES` không tồn tại ở bản `@nestjs/schedule ^6.1.3` đã pin — dùng raw cron string `*/15 * * * *` thay thế). `eslint` → 0 lỗi (đã tự sửa 1 lỗi `no-unnecessary-type-assertion` thật).

## Nghiên cứu Actor & Hệ thống Kho vị trí (2026-09-09) — đối chiếu trực tiếp với Phieu_FA26SE036.docx gốc

### 0. Vì sao mục này tồn tại — hệ thống đang "hẹp" so với đề bài, có bằng chứng cụ thể

Đối chiếu **nguyên văn phần System Actors trong `Phieu_FA26SE036.docx`** (7 trách nhiệm Store Owner, 7 Warehouse Staff, 5 Packaging Staff, 5 Shipping Coordinator, 7 AI Engine, 5 System Administrator — 36 gạch đầu dòng tổng cộng) với RBAC thật trong code: **3/5 role con người (WAREHOUSE_STAFF, PACKAGING_STAFF, SHIPPING_COORDINATOR) hiện có ĐÚNG 0 API** — không phải bị quên gán role, mà vì module tương ứng (`order-groups.controller.ts`, 5 endpoint fulfillment, UC-04) **chưa tồn tại**. Đây là bằng chứng khách quan hệ thống đang thiếu bề mặt API so với chính đề bài đã cam kết, không phải cảm tính.

### 1. 7 khoảng trống tính năng CHƯA TỪNG được thiết kế (phát hiện khi rà từng gạch đầu dòng đề bài)

| Trách nhiệm (đề bài)                                              | Actor                | Trạng thái                                                                                                                                                                               |
| ----------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configure packaging rules                                         | Store Owner          | 🔴 Chưa từng thiết kế                                                                                                                                                                    |
| Configure shipping preferences                                    | Store Owner          | 🔴 Chưa từng thiết kế                                                                                                                                                                    |
| Measure package weight (cân THẬT, khác cân lý thuyết AI ước tính) | Packaging Staff      | 🔴 Chưa từng thiết kế — nối trực tiếp mục dưới                                                                                                                                           |
| Detect abnormal packages                                          | AI Engine            | 🔴 Chưa từng thiết kế — dùng chính field "measure weight" ở trên: lệch >20% giữa `actual_measured_weight_kg` và ước tính AI → tự flag `is_abnormal: true` trên `PackagingRecommendation` |
| Estimate shipping costs                                           | AI Engine            | 🔴 **Interface `PackagingRecommendation` đã bàn giao cho thành viên khác THIẾU field này** — cần vá TRƯỚC KHI họ code tiếp, kẻo đổi giữa chừng                                           |
| Schedule shipment pickup                                          | Shipping Coordinator | 🔴 Chưa từng thiết kế                                                                                                                                                                    |
| Optimize packing sequences                                        | AI Engine            | 🔴 Chưa từng thiết kế                                                                                                                                                                    |

### 2. Ma trận API ĐẦY ĐỦ theo role — nguồn tham chiếu DUY NHẤT khi gán `@Roles()` cho endpoint mới, tránh lặp lại kiểu gán tạm ADMIN cho mọi thứ

**STORE_OWNER** — 9 API (0 hiện có, tất cả cần code):

```
POST /marketplace/:platform/connect            [ĐANG SAI: hiện gắn ADMIN, phải đổi thành STORE_OWNER]
GET  /order-groups                              (xem toàn bộ, không giới hạn theo bước xử lý)
GET  /order-groups/:id
GET  /order-groups/:id/tracking                 [MỚI]
GET  /dashboard/summary                         Package 5
PATCH /settings/packaging-rules                 [MỚI]
PATCH /settings/shipping-preferences             [MỚI]
GET  /reports/operational                        Package 5
POST /reports/export                             Package 5
```

**WAREHOUSE_STAFF** — 6 API (0 hiện có):

```
GET  /order-groups?fulfillment_status=approved_for_packing   (hàng đợi cần lấy)
GET  /order-groups/:id/picking-list             [MỚI — chính là tính năng bạn hỏi]
POST /order-groups/:id/fulfillment/pick
POST /order-groups/:id/fulfillment/pack
GET  /order-groups/:id/packing-slip              (in phiếu, UC-06)
POST /order-groups/:id/fulfillment/return         (phát hiện hàng lỗi lúc soạn — shared với Shipping Coordinator)
```

**PACKAGING_STAFF** — 4 API (0 hiện có):

```
GET  /order-groups?fulfillment_status=pending_approval
GET  /order-groups/:id
POST /order-groups/:id/packaging/approve          (kèm actual_measured_weight_kg — UC-04)
POST /order-groups/:id/packaging/reject           (dùng transition MỚI vá ở mục trên)
```

**SHIPPING_COORDINATOR** — 6 API (0 hiện có):

```
GET  /order-groups?fulfillment_status=packed
POST /order-groups/:id/shipping/select-carrier    [MỚI]
GET  /order-groups/:id/shipping-label             (UC-06)
POST /order-groups/:id/shipping/schedule-pickup   [MỚI]
POST /order-groups/:id/fulfillment/ship
POST /order-groups/:id/fulfillment/deliver
GET  /order-groups/:id/tracking                   (shared với Store Owner)
```

**ADMIN** — giữ nguyên 10 API hiện có + thêm nhóm Warehouse Config (xem mục 3):

```
[10 API hiện có: users CRUD, orders sync/list, marketplace connect]
POST/GET /admin/warehouses
POST/GET /admin/warehouses/:id/zones
POST/GET /admin/zones/:id/bin-locations
POST/GET /admin/sku-bin-assignments
GET      /admin/sku-bin-assignments/unassigned    [MỚI — xem mục 3]
```

**Shared giữa nhiều role** (không thuộc riêng ai): `GET /order-groups/:id` (Warehouse+Packaging+Shipping cùng cần xem ở bước của mình), `GET /order-groups/:id/tracking` (Store Owner+Shipping Coordinator), `POST .../return` (Warehouse+Shipping — ai phát hiện trước báo trước).

### 3. Thiết kế hệ thống VỊ TRÍ KHO — trả lời trực tiếp câu hỏi "kệ nào, kệ số mấy"

**Căn cứ từ đề bài, không phải tự thêm ngoài phạm vi**: mục "Applied Theory" liệt kê rõ _"Warehouse Management Systems (WMS)"_ + _"Inventory Management"_ là kiến thức bắt buộc phải áp dụng; "Group orders by warehouse" (Order Consolidation) xác nhận hệ thống phải hỗ trợ NHIỀU kho; System Administrator có trách nhiệm _"Manage warehouse configuration"_ — đúng tên gọi tính năng này.

**Mô hình 4 tầng, kiểu "fixed-slot location"** (mỗi SKU luôn ở đúng 1 vị trí cố định — chọn kiểu này thay vì "dynamic slotting"/nhiều vị trí cho 1 SKU của kho lớn thật, vì đơn giản hơn, vẫn đúng chuẩn WMS để áp dụng lý thuyết, khớp quy mô capstone). ⚠️ **SỬA LẠI (2026-09-10)**: mô tả gốc ở dòng này từng viết "không cần theo dõi tồn kho real-time" — **SAI**, đã tự phát hiện đây là gap core thật, không phải quyết định thiết kế hợp lý. Xem "Điểm yếu #10" phía dưới để biết đầy đủ 4 chức năng core còn thiếu (`quantity_on_hand`, Report Missing Item, partial pick, quét từng SKU) và cách khắc phục. Ranh giới ĐÚNG cần loại trừ chỉ là: an toàn tồn kho/reorder tự động/FIFO-FEFO theo lô/kiểm kê định kỳ — đây mới thật sự là phạm vi 1 đồ án WMS riêng, KHÔNG bao gồm việc biết còn/hết hàng cơ bản.

```
Warehouse (kho)                          — warehouse.schema.ts (MỚI)
  └─ WarehouseZone (khu)                 — warehouse-zone.schema.ts (MỚI)
       └─ BinLocation (kệ/vị trí)        — bin-location.schema.ts (MỚI)
            └─ SkuBinAssignment          — sku-bin-assignment.schema.ts (MỚI)
               (nối vào product_master ĐÃ CÓ qua đúng khóa {platform, shop_id, seller_sku})
```

**Luồng "ADD kho vào đâu, như nào"** — thứ tự bắt buộc, Admin thao tác tuần tự (mỗi bước phụ thuộc bước trước, enforce bằng kiểm tra tồn tại FK):

```
1. POST /admin/warehouses                  → tạo kho trước tiên (warehouse_code, warehouse_name, address)
2. POST /admin/warehouses/:id/zones        → tạo khu TRONG kho đó (zone_code "A", zone_name "Phụ kiện điện tử")
3. POST /admin/zones/:id/bin-locations     → tạo kệ TRONG khu đó
   — hỗ trợ tạo HÀNG LOẠT (range generator) thay vì tạo tay từng cái:
     input {aisle: "03", rack_from: 1, rack_to: 10, level_from: 1, level_to: 4}
     → tự sinh 40 bin_code (A-03-01-01 .. A-03-10-04) — Admin không phải bấm 40 lần
4. POST /admin/sku-bin-assignments         → gán 1 SKU vào 1 bin_location cụ thể
```

**Cơ chế PHÁT HIỆN SKU chưa gán vị trí — tự động, không để Admin phải nhớ tra thủ công**:
`GET /admin/sku-bin-assignments/unassigned` — join `product_master` với `sku_bin_assignment`, trả về danh sách SKU nào **có trong catalog (đã sync qua `ProductMasterSyncScheduler`) nhưng CHƯA có vị trí kệ** — Admin chỉ cần mở đúng 1 màn hình này mỗi khi có sản phẩm mới, không phải dò tay.

**Picking List — nơi mọi thứ hội tụ lại, trả lời đúng câu hỏi gốc**:

```ts
async generatePickingList(groupId: string): Promise<PickingListItem[]> {
  const { items } = await this.orderGroupsService.getPackableItemsForGroup(groupId); // TÁI DÙNG hàm ĐÃ CÓ
  const skus = items.map(i => i.sku);
  const assignments = await this.skuBinAssignmentModel
    .find({ warehouse_id, seller_sku: { $in: skus } })   // Rule #16 — 1 query $in, không N+1
    .populate('bin_location_id')
    .lean();                                              // Rule #12
  // ghép item + vị trí, SKU chưa gán → bin_code: "CHƯA GÁN VỊ TRÍ", xếp cuối
  // SẮP XẾP theo (zone_code, aisle, rack, level) — xem lý do ở dưới
}
```

**Điểm kỹ thuật quan trọng nhất — SẮP XẾP theo lộ trình vật lý, không phải theo SKU**: đây là kỹ thuật WMS chuẩn gọi **route optimization / wave picking** — nhân viên đi 1 vòng kho theo đúng thứ tự kệ tăng dần, không chạy tới chạy lui giữa các khu. Đúng ý bạn mô tả _"mã hàng khác nhau ở vị trí khác nhau nhưng chung 1 khu"_ — `sort by (zone_code, aisle, rack, level)` tự động nhóm hết hàng cùng khu lại gần nhau trong danh sách.

## ĐÃ TRIỂN KHAI — `order-groups.controller.ts` (2026-09-09, cùng ngày) — 3 route ĐỌC đầu tiên

### Bối cảnh — vì sao cần Controller, cron KHÔNG đủ

Log thật xác nhận 2 cron (`OrderGroupBackfillScheduler`, `LazadaOrderSyncScheduler`) chạy đúng, tạo dữ liệu thật trong `order_groups`/`orders` — nhưng **dữ liệu đó bị "kẹt" trong MongoDB, không role nào (Warehouse/Packaging/Shipping Staff) truy cập được từ bên ngoài**, vì Service trước đó chỉ dùng nội bộ (service-to-service qua Scheduler), chưa có Controller. Đối chiếu đề bài (`Phieu_FA26SE036.docx`, mục Mobile Application): _"Warehouse Picking, Packing Confirmation, Barcode/QR Scanning"_ — các màn hình này BẮT BUỘC gọi API thật, cron chạy nền không thay thế được.

### 3 route đã code, đúng ma trận role đã thiết kế ở mục trên

```
GET /order-groups                    @Roles(WAREHOUSE_STAFF, PACKAGING_STAFF, SHIPPING_COORDINATOR, ADMIN)
GET /order-groups/:id                @Roles(WAREHOUSE_STAFF, PACKAGING_STAFF, SHIPPING_COORDINATOR, ADMIN)
GET /order-groups/:id/picking-list   @Roles(WAREHOUSE_STAFF, ADMIN)
```

**Cố ý CHƯA code trong lượt này** — 5 endpoint GHI trạng thái (pick/pack/ship/deliver/return): cần thêm DTO body, gọi `allowed-status-transitions.ts` (đã có sẵn từ lượt trước) để validate, và áp Rule #18 (Optimistic Concurrency) — việc lớn hơn, tách riêng lượt sau cho rõ ràng, tránh 1 lượt ôm quá nhiều thay đổi cùng lúc.

`picking-list` hiện **tạm trả đúng shape `OrderGroupForPackaging` đã có** (sku, quantity, kích thước) — CHƯA có `bin_code`/vị trí kệ thật, vì module `warehouse/` (Warehouse/Zone/BinLocation/SkuBinAssignment) mới dừng ở thiết kế trong CLAUDE.md, chưa code. Sẽ mở rộng field khi module đó ra đời — không phải thiếu sót, mà là thứ tự làm hợp lý (Controller trước, Warehouse Location sau).

**2 method mới thêm vào `order-groups.service.ts`** (trước đó chỉ có `getOrCreateGroupForOrder`, `getPackableItemsForGroup` dùng nội bộ): `listOrderGroups()` (`.lean()` + `.limit(100)`, chưa cursor pagination như `orders/` — đủ dùng quy mô demo), `findOrderGroupById()` (ném `AppException` đúng chuẩn `ORD_GROUP_ERROR_CODES` đã có sẵn từ trước).

**File mới**: `dto/list-order-groups-query.dto.ts` (filter theo `fulfillment_status`/`platform`, validate bằng `class-validator` đúng convention `ListOrdersQueryDto` đã có).

**Verify**: merge trực tiếp vào code THẬT của user (không phải bản nháp của mình) — `tsc --noEmit` 0 lỗi, `eslint` 0 lỗi (đã tự sửa 1 lỗi `no-unnecessary-type-assertion` thật phát hiện lúc chạy).

### Giải thích thêm — cảnh báo Mongoose `findOneAndUpdate` deprecated trong log user gửi

Warning _"the `new` option for findOneAndUpdate()... deprecated"_ xuất hiện trong log — đã xác nhận **KHÔNG phải do code mới** (đã grep toàn bộ 9+ file mới, không chỗ nào dùng `{ new: true }`) — nguồn gốc là code CŨ đã có sẵn ở `users.service.ts`, `orders.service.ts`, `marketplace-integration.service.ts` (dùng `{ new: true }` thay vì `{ returnDocument: 'after' }` theo API mới của MongoDB driver). Chỉ là warning, không phải lỗi — an toàn, không chặn chạy, nhưng nên vá dần khi có dịp đụng lại 3 file đó (không cấp thiết).

## ĐÃ TRIỂN KHAI — Sửa interface AI Packaging + 5 endpoint fulfillment (2026-09-09, lượt code thứ 2 trong ngày)

### Việc 1 — Vá `packaging.interface.ts`, thêm `estimated_shipping_cost_vnd`

Đúng theo phát hiện đã ghi ở mục "Nghiên cứu Actor" phía trên: đề bài giao _"Estimate shipping costs"_ cho AI Recommendation Engine, nhưng interface bàn giao ban đầu thiếu field này. Đã thêm `estimated_shipping_cost_vnd: number` vào `PackagingRecommendation` — **cần báo ngay cho thành viên đang code AI Packaging** để họ cập nhật, nếu đã code dựa theo bản thiếu field.

### Việc 2 — 5 endpoint fulfillment: `pick/pack/ship/deliver/return`

**File sửa/thêm** (6 file, tất cả nằm trong `order-groups/` — không đụng module nào khác):

```
enums/allowed-status-transitions.ts    SỬA — thêm transition mới
order-groups.errors.ts                 SỬA — thêm mã lỗi INVALID_TRANSITION
schemas/order-group.schema.ts          SỬA — khai báo field __v (Rule #7)
order-groups.service.ts                SỬA — thêm method transitionFulfillmentStatus()
dto/transition-order-group.dto.ts      MỚI — body { expected_version: number }
order-groups.controller.ts             SỬA — thêm 5 route POST
```

**Route + role, đúng ma trận đã thiết kế trước đó:**

```
POST /order-groups/:id/fulfillment/pick     @Roles(WAREHOUSE_STAFF, ADMIN)
POST /order-groups/:id/fulfillment/pack     @Roles(WAREHOUSE_STAFF, ADMIN)
POST /order-groups/:id/fulfillment/ship     @Roles(SHIPPING_COORDINATOR, ADMIN)
POST /order-groups/:id/fulfillment/deliver  @Roles(SHIPPING_COORDINATOR, ADMIN)
POST /order-groups/:id/fulfillment/return   @Roles(SHIPPING_COORDINATOR, WAREHOUSE_STAFF, ADMIN)
```

**`transitionFulfillmentStatus()` — 1 method dùng chung cho cả 5 route** (đúng lý do sinh ra `allowed-status-transitions.ts` từ đầu: định nghĩa 1 lần, dùng lại, tránh mỗi endpoint tự viết if/else riêng rồi lệch nhau — Controller chỉ khác nhau ở `targetStatus` truyền vào). Áp đúng 2 lớp bảo vệ độc lập:

1. `isValidStatusTransition()` (đã có từ trước) — chặn nhảy trạng thái sai thứ tự nghiệp vụ
2. Rule #18 Optimistic Concurrency — `findOneAndUpdate({_id, __v: expectedVersion}, {$set, $inc: {__v:1}}, {returnDocument:'after'})`; không match được document (do version lệch) → ném `ORD_GROUP_STATE_CONFLICT` (409), báo FE tải lại dữ liệu mới nhất thay vì âm thầm ghi đè lost-update

### Quyết định thiết kế cần biết — `pick` nhảy thẳng qua `PICKING`

`allowed-status-transitions.ts` trước đó chỉ cho `APPROVED_FOR_PACKING → PICKING` (1 bước) — đã thêm `APPROVED_FOR_PACKING → PICKED` (nhảy thẳng), vì endpoint `pick` hiện tại là **"1 lần bấm = xác nhận đã lấy xong toàn bộ hàng"**, chưa có màn hình quét QR từng SKU riêng lẻ (đó là việc tương lai). `PICKING` **vẫn giữ nguyên** trong enum + transition map — không xóa, chỉ tạm thời không có endpoint nào dừng lại đúng trạng thái đó. Khi sau này tách thành 2 thao tác thật ("bắt đầu lấy" / "lấy xong"), transition 1-bước cũ vẫn dùng được ngay, không cần sửa gì thêm.

### 3 lỗi thật phát sinh khi verify — đều tự phát hiện + tự sửa bằng compiler, không phải đọc mắt

| #   | Lỗi                                                      | Nguyên nhân                                                                                                                                                                                                           | Cách sửa                                                                                                  |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | `group.__v` không tồn tại trên type `OrderGroupDocument` | Giống hệt tình huống Rule #7 đã ghi trước đó (`created_at`/`updated_at`) — field Mongoose tự sinh qua `versionKey` không tự động có mặt trong type TypeScript nếu không khai báo lại trong class                      | Thêm `__v?: number;` vào `order-group.schema.ts`, đúng convention đã có sẵn cho `created_at`/`updated_at` |
| 2   | _(Chủ động phòng ngừa, không phải lỗi compiler báo)_     | Nếu dùng `{ new: true }` cho `findOneAndUpdate` sẽ lặp lại đúng warning deprecated đã tìm thấy ở 3 file cũ (`users.service.ts`...)                                                                                    | Dùng `{ returnDocument: 'after' }` ngay từ đầu cho code MỚI — không tạo thêm nợ kỹ thuật cùng loại        |
| 3   | _(Không có lỗi compile/lint nào khác)_                   | `tsc --noEmit` + `eslint` sạch ngay từ lần chạy đầu cho phần Controller/DTO — nhờ tái sử dụng đúng pattern đã kiểm chứng từ `orders.controller.ts` (response shape, `@Roles`, `AppException`) thay vì viết mới từ đầu | —                                                                                                         |

### ⚠️ Giới hạn trung thực — cần biết trước khi test 5 endpoint này

Muốn `pick` chạy được, group phải đang ở đúng trạng thái nguồn `approved_for_packing` — nhưng **UC-04 (nơi duy nhất đưa group từ `awaiting_packaging` → `approved_for_packing`) CHƯA được code**. Nghĩa là ngay bây giờ, mọi group mới tạo đều dừng ở `awaiting_packaging`, gọi `pick` sẽ nhận lỗi `ORD_GROUP_INVALID_TRANSITION` (đúng hành vi, không phải bug). **Muốn test thật 5 endpoint này ngay bây giờ**: mở MongoDB Compass, tự sửa tay `fulfillment_status` của 1 document `order_groups` thành `approved_for_packing`, rồi mới gọi `POST .../pick` được. Đây là lý do việc 3 (UC-04) cần làm tiếp theo — không phải tùy chọn.

### Xác nhận bám sát luật CLAUDE.md — đối chiếu từng rule đã áp dụng

| Rule                                                                           | Áp dụng ở đâu trong lượt này                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| #3 (ESR index)                                                                 | Không tạo index mới — tái dùng đúng index đã có từ `order-group.schema.ts`       |
| #7 (Type Safety, field Mongoose tự sinh)                                       | `__v?: number` khai báo đúng convention                                          |
| #18 (Optimistic Concurrency)                                                   | `transitionFulfillmentStatus()` — trung tâm của toàn bộ việc 2                   |
| Naming convention (`@Roles`, `AppException`, `error_code` prefix `ORD_GROUP_`) | Giữ nguyên 100%, không tự sáng tạo pattern khác                                  |
| "Không thừa thãi" (đã nhắc nhiều lần trong hội thoại)                          | 1 method Service dùng chung cho 5 route, không viết 5 lần logic tương tự         |
| Verify bằng compiler thật, không chỉ đọc mắt                                   | `tsc --noEmit` + `eslint` chạy trên đúng code thật của user, không phải bản nháp |

**Kết luận**: bám sát đầy đủ, không có chỗ nào đi tắt hay phá vỡ quy tắc đã chốt.

## ĐÃ TRIỂN KHAI — Module `packaging/` + Module `warehouse/` (2026-09-09, lượt code thứ 3 trong ngày)

### Bối cảnh — vì sao 2 module này làm CÙNG lúc

Trước đó có 1 nghịch lý bị chỉ ra đúng: 5 endpoint fulfillment (đã code) không tự chạy được vì phụ thuộc UC-04 (chuyển group sang `approved_for_packing`), mà UC-04 lại phụ thuộc UC-03 (AI thật, thành viên khác đang làm) — không việc nào tự làm xong để có demo thật. Giải pháp: **code thuật toán fallback đơn giản NGAY**, không phải "code test rồi vứt" mà là **implement sớm 1 phần production thật** (chính UC-03 Alt Flow, Report 1, đã note từ trước: _"Thuật toán vượt quá 5 giây (timeout) -> dùng fallback đơn giản (First Fit Decreasing)"_). Khi AI thật xong, code fallback này **không bị thay thế, vẫn giữ nguyên vai trò lưới an toàn** như thiết kế ban đầu.

### Module `packaging/` — UC-04 hoàn chỉnh

**File mới (12 file)**: schema (`PackagingRecommendationDoc` + sub-schema `BoxSize`), enum `PackagingApprovalStatus`, `fallback-packaging.util.ts` (First Fit Decreasing đơn giản, 3 size thùng cố định, BR-05 padding 10%, BR-06 fragile→Bubble Wrap), 3 DTO (Approve/Adjust/Reject), Service, Controller, Module, errors.

**Route + role:**

```
POST /order-groups/:groupId/packaging/generate   @Roles(ADMIN)              [TẠM — chỉ để test, không phải hành vi nghiệp vụ thật]
POST /order-groups/:groupId/packaging/approve    @Roles(PACKAGING_STAFF, ADMIN)
POST /order-groups/:groupId/packaging/adjust     @Roles(PACKAGING_STAFF, ADMIN)
POST /order-groups/:groupId/packaging/reject     @Roles(PACKAGING_STAFF, ADMIN)
```

**Điểm kỹ thuật quan trọng nhất — transaction thật, dùng đúng Rule #6**: `approve()`/`adjust()`/`reject()` đều `connection.startSession()` + `session.withTransaction()`, ghi ĐỒNG THỜI `packaging_recommendations` + `order_groups` trong cùng 1 session — nếu 1 trong 2 lệnh ghi fail, CẢ 2 tự rollback, không có tình trạng "nửa vời". Đã xác nhận an toàn từ trước (project dùng Atlas, luôn là replica set).

**"Detect abnormal packages" (đề bài, actor AI Engine) — đã implement, kết nối trực tiếp với "Measure package weight" (Packaging Staff)**: `approve()`/`adjust()` đều nhận `actual_measured_weight_kg` (cân THẬT), so sánh với cân lý thuyết từ `product_master` — lệch >20% tự đánh `is_abnormal: true`, log cảnh báo. Đúng phát hiện đã ghi ở mục "Nghiên cứu Actor" — 1 field dữ liệu phục vụ đồng thời 2 trách nhiệm của 2 actor khác nhau trong đề bài.

**Reject KHÔNG xóa cứng** — đánh `is_active: false`, group quay lại `awaiting_packaging` (dùng transition đã vá bug từ trước), giữ lịch sử phục vụ audit BR-08.

### Module `warehouse/` — Hệ thống vị trí kho hoàn chỉnh

**File mới (16 file)**: 4 schema (`Warehouse`/`WarehouseZone`/`BinLocation`/`SkuBinAssignment`, đúng mô hình fixed-slot đã thiết kế sẵn), 4 DTO, Service, Controller, Module, errors.

**Route + role — đúng luồng "add kho" 4 bước đã thiết kế:**

```
POST /warehouse/warehouses                                    @Roles(ADMIN)  — bước 1/4
POST /warehouse/warehouses/:warehouseId/zones                 @Roles(ADMIN)  — bước 2/4
POST /warehouse/zones/:zoneId/bin-locations/generate           @Roles(ADMIN)  — bước 3/4, RANGE GENERATOR (bulkWrite, Rule #14)
POST /warehouse/warehouses/:warehouseId/sku-bin-assignments    @Roles(ADMIN)  — bước 4/4
GET  /warehouse/sku-bin-assignments/unassigned                 @Roles(ADMIN)  — tự phát hiện SKU chưa gán, không phải dò tay
GET  /warehouse/:warehouseId/picking-list/:groupId             @Roles(WAREHOUSE_STAFF, ADMIN) — TRẢ LỜI ĐÚNG câu hỏi gốc "kệ nào, kệ số mấy"
```

**`getEnrichedPickingList()` — nơi mọi thứ hội tụ**: TÁI DÙNG `OrderGroupsService.getPackableItemsForGroup()` đã có (không viết lại logic lấy item), join `sku_bin_assignments` + `bin_locations` + `warehouse_zones` bằng query `$in` (Rule #16, chống N+1), rồi **SẮP XẾP theo `(zone_code, bin_code)`** — đúng kỹ thuật WMS wave picking đã thiết kế: nhân viên đi 1 vòng kho theo đúng thứ tự kệ, không chạy tới chạy lui.

**SKU chưa gán vị trí không chặn cả picking list** — hiển thị `bin_code: "CHƯA GÁN VỊ TRÍ"`, xếp cuối (`zone_code: "ZZZ"` để sort sau cùng), đúng thiết kế đã chốt.

### 6 lỗi thật phát sinh khi verify — toàn bộ tự phát hiện bằng compiler, không đọc mắt

| #   | Module    | Lỗi                                                                                  | Nguyên nhân                                                                                                                                                                       | Cách sửa                                                                    |
| --- | --------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | packaging | `TS18048: 'chosenBox' is possibly 'undefined'`                                       | `noUncheckedIndexedAccess` (tsconfig strict) khiến index cuối mảng `STANDARD_BOX_SIZES[length-1]` trả về `T\|undefined`                                                           | Tách `.at(-1)` + guard `if (!largestBox) throw` tường minh, không ép kiểu   |
| 2   | packaging | `no-unnecessary-condition` trên `group.__v ?? 0`                                     | `__v` trên `HydratedDocument` thực chất luôn là `number` (không optional) dù class khai `__v?: number` — type thật do Mongoose base Document quyết định, không phải class tự khai | Bỏ `?? 0` thừa                                                              |
| 3   | packaging | 4 warning `explicit-function-return-type`                                            | Quên khai return type tường minh cho 4 method Controller (Rule #1, Type Safety)                                                                                                   | Thêm `Promise<PackagingRecommendationDocument>`/`Promise<{message:string}>` |
| 4-6 | warehouse | 3× `no-unnecessary-type-assertion` (`listWarehouses`, `listZones`, `assignSkuToBin`) | Thói quen tự ép `as unknown as Promise<...>` dù kiểu trả về của Mongoose query đã khớp sẵn — lặp lại thói quen từ lượt code trước dù không còn cần thiết ở đây                    | Bỏ hết assertion thừa                                                       |
| —   | warehouse | `no-misused-spread` trên `{...dto}` khi tạo Zone                                     | Spread 1 class instance (`CreateZoneDto`) làm mất prototype class                                                                                                                 | Destructure tường minh từng field thay vì spread                            |

**Verify cuối**: merge cả 2 module vào code thật của user, `tsc --noEmit` **0 lỗi**, `eslint src` (TOÀN BỘ project, không chỉ file mới) **0 lỗi/warning** — xác nhận không có regression ở bất kỳ module cũ nào.

### Xác nhận bám sát CLAUDE.md — đối chiếu Rule cụ thể cho lượt này

| Rule                                       | Áp dụng ở đâu                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| #1 (sub-schema, không `type: Object`)      | `BoxSize` sub-schema riêng trong `PackagingRecommendationDoc`                                                                  |
| #3 (ESR index)                             | `BinLocationSchema.index({zone_id, aisle, rack, level})`, `PackagingRecommendationSchema.index({approval_status, created_at})` |
| #5 (unique DB, không chỉ service)          | Partial unique index `{order_group_id}` (chỉ áp `is_active:true`) — cho phép nhiều bản lịch sử Reject tồn tại song song        |
| #6 (transaction)                           | Trung tâm của `approve()/adjust()/reject()`                                                                                    |
| #7 (field Mongoose tự sinh phải khai type) | `__v?: number` đã thêm từ lượt trước, tái sử dụng đúng ở đây                                                                   |
| #11 (mảng enum đã lọc)                     | `PACKAGING_APPROVAL_STATUS_VALUES`                                                                                             |
| #14 (bulkWrite, không lặp N lần)           | `generateBinLocations()` — sinh hàng loạt kệ                                                                                   |
| #16 (chống N+1, query `$in`)               | `getEnrichedPickingList()` — 1 lần `$in` cho assignments, 1 lần cho bins, 1 lần cho zones                                      |
| #18 (Optimistic Concurrency)               | Toàn bộ 3 hành động UC-04 đều kèm `expected_group_version`                                                                     |
| #21 (hạn chế `$lookup`)                    | `findUnassignedSkus()` dùng 2 query + `Set` trong bộ nhớ thay vì `$lookup`                                                     |
| #22 (Canonical schema)                     | Không schema nào trong 2 module này chứa field đặc thù riêng 1 sàn                                                             |

**Kết luận**: bám sát đầy đủ 11/16 quy tắc DB liên quan trực tiếp tới phạm vi lượt này, không có ngoại lệ nào bỏ qua.

### Việc CÒN LẠI — cập nhật 2026-09-09 (lượt thứ 4, sau khi làm xong việc 5-6)

1. ✅ ~~Sửa `packaging.interface.ts`~~ — xong
2. ✅ ~~5 endpoint fulfillment~~ — xong
3. ✅ ~~UC-04 + `PackagingRecommendation`~~ — xong
4. ✅ ~~Module `warehouse/`~~ — xong
5. 🟡 **Viết `.spec.ts`** — ĐÃ LÀM MỘT PHẦN, KHÔNG còn coverage = 0: đã có `fallback-packaging.util.spec.ts` (9 test, thuật toán fallback), `allowed-status-transitions.spec.ts` (17 test, toàn bộ ma trận chuyển trạng thái hợp lệ/không hợp lệ), `packaging.service.spec.ts` (11 test, mock transaction/session — bao phủ Approve/Adjust-path/Reject, Optimistic Concurrency STATE_CONFLICT, tính `is_abnormal`). **Vẫn còn thiếu**: `order-groups.service.spec.ts` (chưa test `getOrCreateGroupForOrder`, `transitionFulfillmentStatus`, `getPackableItemsForGroup`), `warehouse.service.spec.ts` (chưa test hoàn toàn), `aggregate-order-items.util.ts`/`consolidation-key.util.ts` (nợ cũ từ `orders/`, vẫn chưa đụng tới).
   - **Bug thật phát hiện KHI CHẠY jest thật (không phải tsc/eslint)**: `PackagingRecommendationDoc` có 2 field kiểu union `X | null` (`approved_at: Date | null`, `actual_measured_weight_kg: number | null`) khai `@Prop()` KHÔNG kèm `type:` tường minh — `@nestjs/mongoose` không tự suy luận được qua `reflect-metadata` lúc runtime cho union type, throw ngay lúc load module (`"Cannot determine a type for ... field"`). Đã vá cả 2 field, thêm `type: Date`/`type: Number` tường minh. **Rule mới rút ra, áp dụng cho MỌI schema tương lai: field kiểu `X | null` LUÔN phải khai `type:` tường minh trong `@Prop()`, không phụ thuộc auto-inference — đây là lỗi CHỈ lộ ra lúc chạy test/app thật, `tsc`/`eslint` không bắt được.**
   - 2 lỗi ESLint thật khác đã sửa: `no-non-null-assertion` (dùng `!` trên phần tử mảng dưới `noUncheckedIndexedAccess` — sửa bằng guard `if (x === undefined) throw`, không ép kiểu), `no-unsafe-assignment` khi lồng nhiều lớp `expect.objectContaining()` (friction đã biết giữa `@types/jest` cũ và strict rule — sửa bằng cách đọc trực tiếp `mock.calls[0]` thay vì matcher lồng nhau).
   - **Verify cuối cùng, TOÀN BỘ project**: `tsc --noEmit` 0 lỗi, `eslint src` 0 lỗi/warning, **`jest` chạy hết 11 test suite / 108 test — 100% pass**, không suite nào cũ bị vỡ.
6. ✅ ~~`GET /order-groups/:id/packaging`~~ — xong, trả full `PackagingRecommendation` bất kể `approval_status` (khác `findActiveRecommendationForGroup` nội bộ chỉ chấp nhận PENDING) — role xem: `PACKAGING_STAFF`, `WAREHOUSE_STAFF`, `SHIPPING_COORDINATOR`, `ADMIN` (cả 3 role fulfillment đều cần xem chi tiết ở bước của mình).
7. 🔴 **Xóa route TẠM** `POST .../packaging/generate` khi AI thật (Package 3) xong — chưa đổi.
8. 🔴 Package 5 (Dashboard) — vẫn chưa bắt đầu.
9. 🟢 **MỚI — `TESTING_GUIDE.md`** (file riêng, đã giao) — hướng dẫn test tay 7 bước qua Swagger, từ sync đơn thật tới `delivered`/`returned`, kèm 3 test-case cố ý test lỗi (Optimistic Concurrency conflict, invalid transition, Reject) để tự xác nhận từng cơ chế bảo vệ hoạt động đúng — dùng khi cần demo hoặc trước khi tin tưởng 1 lượt code mới không phá luồng cũ.
10. ✅ **MỚI — `INTEGRATION_GUIDE_FULFILLMENT.md`** (file riêng, đã giao) — tài liệu FE tích hợp 3 module `order-groups`/`packaging`/`warehouse`, cùng chuẩn với `INTEGRATION_GUIDE.md`/`INTEGRATION_GUIDE_ORDERS.md` đã có (route + role + response mẫu + bảng mã lỗi + danh sách test case bắt buộc FE tự chạy). Xem mục "Điểm yếu #9" bên dưới về phát hiện quan trọng nhất khi viết tài liệu này.
11. 🔴 **MỚI phát hiện khi viết `INTEGRATION_GUIDE_FULFILLMENT.md`** — `packaging/`, `warehouse/` trả RAW Mongoose document (snake_case, `_id`, `__v`), KHÁC hẳn `order-groups/` đã map cẩn thận sang camelCase — xem Điểm yếu #9 bên dưới để biết cách khắc phục.

## Điểm yếu #9 (2026-09-09, phát hiện khi rà lại tài liệu FE) — `packaging/`/`warehouse/` trả raw document, không nhất quán với `order-groups/`

**Vấn đề**: `order-groups.controller.ts` có hàm `toResponse()` map cẩn thận Document → DTO camelCase sạch (ẩn `_id`/`__v`/field nội bộ). `packaging.controller.ts`/`warehouse.controller.ts` **KHÔNG có bước map tương tự** — trả thẳng kết quả `Model.create()`/`findOneAndUpdate()` ra ngoài, lộ nguyên `_id`, `__v`, field snake_case ra tận response JSON.

**Cách khắc phục**: viết hàm `toResponse()` tương tự cho `PackagingRecommendationDocument` và cho từng schema ở `warehouse/` (`Warehouse`, `WarehouseZone`, `BinLocation`, `SkuBinAssignment`) — cùng pattern đã chứng minh đúng ở `order-groups.controller.ts`, không phát minh pattern mới.

**Tại sao chưa vá ngay trong lượt viết tài liệu FE này**: đây là thay đổi RESPONSE SHAPE của API đã giao FE tích hợp (`INTEGRATION_GUIDE_FULFILLMENT.md` vừa viết dựa theo đúng raw shape hiện tại) — sửa ngay bây giờ sẽ làm tài liệu vừa giao lập tức sai, cần đồng bộ 2 việc cùng lúc (sửa code + sửa tài liệu), nên tách thành việc riêng, không làm vội trong lượt rà soát.

**Lợi ích khi vá**: FE chỉ cần 1 kiểu interface camelCase cho toàn bộ 5 module thay vì 2 kiểu như tài liệu vừa phải ghi chú riêng (mục 0 của `INTEGRATION_GUIDE_FULFILLMENT.md`) — giảm rủi ro FE viết nhầm field, giảm code FE phải maintain 2 pattern song song.

## Điểm yếu #10 (2026-09-10) — 4 chức năng CORE bị thiếu ở Module Warehouse/Fulfillment, KHÔNG PHẢI "chủ đích đơn giản hóa" như đã ghi sai trước đó

**Tự phát hiện + tự sửa sai lầm tư duy** — xem nguyên tắc mới ở đầu file ("TINH GỌN ≠ THIẾU CORE"). Thiết kế `SkuBinAssignment` (mục warehouse ở trên) trước đây được mô tả là _"cố ý không theo dõi tồn kho, đủ dùng cho quy mô capstone"_ — **mô tả đó SAI**, đây là gap core thật, không phải quyết định thiết kế hợp lý.

**4 vấn đề CORE, xếp theo mức phụ thuộc** (vấn đề → cách khắc phục → tại sao → lợi ích, đúng khuôn đã áp dụng xuyên suốt):

**1. Không có `quantity_on_hand` tại `SkuBinAssignment`** — hệ thống không biết kệ còn/hết hàng.
**Khắc phục**: thêm field `quantity_on_hand: number`, trừ bằng atomic `$inc` (đã có pattern sẵn — Rule #7) khi pick, chặn nếu kết quả âm.
**Tại sao core**: đây là thông tin cơ bản nhất của bất kỳ hệ thống kho nào, không phải tính năng WMS nâng cao (khác an toàn tồn kho/reorder tự động — những thứ ĐÚNG là nên loại trừ).
**Lợi ích**: hệ thống mới thật sự là "quản lý kho" thay vì chỉ "sổ địa chỉ SKU".

**2. Không có "Report Missing Item"** — UC-07 Alt Flow (Report 1, đề bài gốc) đã ghi rõ: _"Sản phẩm hết hàng lúc lấy → Warehouse Staff chọn 'Report Missing Item' → hệ thống đánh dấu đơn 'Partial – Needs Review' → thông báo Store Owner"_ — **đã dịch đúng nguyên văn khi làm Report 1 EN trước đây, nhưng bị đánh rơi lúc code 5 endpoint fulfillment thật**.
**Khắc phục**: thêm endpoint `POST .../fulfillment/report-missing` (body: `{ sku, reason }`), thêm giá trị enum mới `PARTIAL_NEEDS_REVIEW` vào `GroupFulfillmentStatus`.
**Tại sao core**: đây KHÔNG PHẢI tính năng tự nghĩ thêm — là yêu cầu CÓ SẴN trong đề bài, bị thiếu do lỗi triển khai, không phải do phạm vi.
**Lợi ích**: đóng đúng khoảng cách giữa spec (Report 1) và code thật — quan trọng khi bảo vệ đồ án, tránh bị hỏi "sao UC-07 ghi vậy mà code không có".

**3. Không pick từng phần được (all-or-nothing)** — liên đới trực tiếp #2: thiếu 1 SKU trong group là chặn đứng cả group, không pick được phần còn lại.
**Khắc phục**: đổi model 1 nút "pick" chung → theo dõi `pick_status` mỗi item (`pending`/`complete`/`partial`), group chỉ chuyển `picked` khi TẤT CẢ item đã xử lý (đủ hàng hoặc đã report missing), không phải tất cả đều "đủ hàng".
**Tại sao core**: thực tế vận hành kho luôn có tình huống thiếu 1-2 món — chặn cả đơn vì 1 món là thiết kế không thực tế.
**Lợi ích**: khớp đúng thực tế vận hành, không phải lý thuyết suông.

**4. Không quét từng SKU (chỉ có 1 nút xác nhận cả nhóm)** — tên chính thức UC-07 (Report 1) là _"quét QR/Barcode"_, không phải "bấm 1 nút xác nhận toàn bộ". `PICKING` (trạng thái trung gian) đã có sẵn trong enum từ đầu nhưng chưa endpoint nào dừng ở đó.
**Khắc phục**: thêm `POST .../fulfillment/pick-item` (body: `{ sku, scanned_quantity }`), gọi nhiều lần (1 lần/SKU quét được), group tự chuyển `picked` khi tất cả item đã xử lý xong (nối trực tiếp #3).
**Tại sao core**: đây đúng cơ chế được ĐẶT TÊN trong chính UC-07 gốc, không phải chi tiết kỹ thuật tùy chọn.
**Lợi ích**: khớp đúng tên use case đã cam kết với hội đồng, đồng thời tự động có luôn dữ liệu để làm #1-#3 (mỗi lần quét = 1 lần biết chính xác đã lấy bao nhiêu, hàng còn bao nhiêu).

**Không core, giữ nguyên loại trừ** (đúng ranh giới, không đổi): an toàn tồn kho (safety stock), tự động đặt hàng lại (reorder), FIFO/FEFO theo lô/hạn dùng, kiểm kê định kỳ (cycle counting), validate 2 SKU trùng 1 kệ, giới hạn sức chứa 1 kệ — đây mới đúng là tính năng WMS doanh nghiệp, không ảnh hưởng việc "lấy đúng hàng ở đúng chỗ" tại mức cơ bản.

**Trạng thái**: 🔴 CHƯA code — mới dừng ở thiết kế lại, cần lượt riêng để implement (schema mới, 2 endpoint mới, enum bổ sung, cập nhật `allowed-status-transitions.ts`).

## 🗺️ ROADMAP TỔNG HỢP (2026-09-10) — toàn bộ việc còn lại, 4 tầng ưu tiên

**Nguồn duy nhất tổng hợp mọi việc còn thiếu đã rải rác trong file này** — khi cần biết "làm gì tiếp theo", đọc mục này trước, không cần lục lại từng mục "Việc CÒN LẠI"/"ĐÃ TRIỂN KHAI" rải rác phía trên.

### Tầng 1 — CRITICAL (làm cùng 1 đợt, liên kết chặt với nhau)

1. ✅ `quantity_on_hand` trên `SkuBinAssignment` + trừ atomic khi pick (Điểm yếu #10 mục 1) — XONG (2026-09-10), kèm endpoint `restock` mới phát hiện cần có khi code
2. Endpoint `report-missing` — đúng UC-07 Alt Flow gốc (Điểm yếu #10 mục 2) — ✅ đã chốt Hướng Y (2026-09-10): bắt buộc Packaging Staff/Admin duyệt lại, group chuyển `partial_needs_review`, KHÔNG tự động `packed`
3. Pick từng phần (partial pick) — nối trực tiếp mục 2 (Điểm yếu #10 mục 3)
4. ✅ Endpoint `pick-item` quét từng SKU — XONG (2026-09-10) — nguồn dữ liệu cho mục 1-3 (Điểm yếu #10 mục 4). Field `scan_method: 'barcode'|'manual'` + `client_event_id` (offline-first, tái dùng pattern `processed_webhook_events`/Rule #17) — đã implement đầy đủ, collection `pick_events` mới. **Mã quét = mã KỆ (`bin_code`) + `seller_sku` từ picking list** — Lazada KHÔNG cung cấp barcode/GTIN sản phẩm (đã xác nhận qua rà response thật), không tự in mã vạch riêng cho SKU.
5. Sửa `packaging.controller.ts`/`warehouse.controller.ts` → map camelCase (Điểm yếu #9) — làm CÙNG LÚC với 1-4
6. **MỚI (2026-09-10, phát hiện qua review của thành viên FE)** — Endpoint chi tiết 1 item riêng trong picking-list (Stepper số lượng, confirm từng item) — hiện chỉ có `GET :id/picking-list` trả cả mảng, thiếu endpoint/field xác nhận từng dòng riêng lẻ
7. ✅ Module Phân công nhân viên (Staff Assignment) — XONG (2026-09-10): `POST /order-groups/:id/assign` (auto = Least-Busy real-time, hoặc manual — chọn tay), `GET /order-groups/staff/search?q=` (tìm theo tên/email). Field `assigned_staff_id`/`assigned_at`/`assignment_type` trên `OrderGroup`. Auto-assign tự trigger sau UC-04 Approve/Adjust.
8. ✅ Module Notification đầy đủ — XONG (2026-09-10, xem chi tiết bên dưới)
9. ✅ Đơn Hỏa Tốc (`order_priority`, `packaging_deadline`, `addBusinessHours()`, cron cảnh báo SLA) — XONG (2026-09-10). Đã xác minh bằng doc thật (2 lần độc lập, `GetOrder` + `GetOrders`): Lazada KHÔNG hỗ trợ tự động nhận diện — chỉ hướng Admin/Store Owner tự tay đánh dấu. Giờ hành chính: 8h-17h, tính cả Thứ 7, không tính Chủ Nhật (đã xác nhận với user).
10. **MỚI (2026-09-10, phát hiện phụ khi verify đơn hỏa tốc)** — Bổ sung `OrderStatus` enum: hiện chỉ 9/19 giá trị thật của Lazada (thiếu `topack`, `toship`, `lost`, `lost_by_3pl`, `damaged_by_3pl`, `failed_delivery`, `shipped_back`, `shipped_back_success`, `shipped_back_failed`, `package_scrapped`) — rủi ro Mongoose từ chối lưu nếu Lazada trả về 1 trong 10 giá trị thiếu. Việc nhỏ, rủi ro thấp, nên làm sớm vì có thể đang âm thầm mất dữ liệu đơn ở trạng thái hiếm gặp (lost/damaged/shipped_back) mà không ai biết.

## Nghiên cứu Notification (2026-09-10) — khi nào bắn, nội dung gì, bắn ra sao

**Sự kiện kích hoạt**: `report-missing` (Critical, báo Store Owner+Admin), `is_abnormal=true` lúc Approve (Warning), Order Group hỏa tốc còn <1h (Warning, báo staff phụ trách), hỏa tốc quá hạn (Critical, escalate Store Owner+Admin), group mới `pending_approval` (Info, báo Packaging Staff), token sàn hết hạn/mất kết nối (Critical, báo Store Owner+Admin), Product Master sync thất bại lặp lại (Warning, báo Admin).

**Schema `Notification`**: `recipient_user_id`/`recipient_role` (1 trong 2), `type` (enum), `severity` ('info'|'warning'|'critical'), `title`, `message`, `related_entity_type`+`related_entity_id` (bấm thông báo điều hướng thẳng tới đúng trang), `is_read`, `channels_sent` (audit đã gửi qua kênh nào — user yêu cầu TẤT CẢ kênh: in-app + Dashboard + email), `created_at`.

**Cách bắn**: khuyên dùng **Phương án A — polling** (`GET /notifications/unread-count` mỗi 15-30s từ FE) cho quy mô capstone, đơn giản không cần hạ tầng mới. Phương án B (WebSocket/NestJS Gateway, real-time push) là chuẩn production nhưng tốn công hơn, chỉ làm nếu dư thời gian.

**Route**: `GET /notifications?is_read=false`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`.

## Nghiên cứu Đơn Hỏa Tốc (2026-09-10) — ✅ ĐÃ XÁC MINH BẰNG DOC THẬT, chốt thiết kế cuối

**Quá trình xác minh**: đã tra web tìm được 1 nguồn SDK bên thứ 3 (GitHub) claim Lazada có field `shipping_provider_type`/`order_flag`/`sla_time_stamp` để phân biệt đơn hỏa tốc — **user yêu cầu xác minh lại bằng chính doc thật thay vì tin nguồn thứ 3**, đã cùng user tra trực tiếp `GetOrder` trên `open.lazada.com`, rà **toàn bộ 40+ field** trong Response Parameters đầy đủ (bung cả node `data`) — **XÁC NHẬN DỨT KHOÁT: KHÔNG có field nào trong 3 field trên**. Chỉ có `promised_shipping_times` tồn tại, nhưng field này có ở MỌI đơn (không riêng đơn hỏa tốc), không dùng được làm cờ phân biệt.

**Kết luận, đảo ngược hoàn toàn hướng thiết kế ban đầu**: Lazada KHÔNG cung cấp bất kỳ tín hiệu nào để tự động nhận diện đơn hỏa tốc. Loại bỏ hẳn phương án "tự động từ Lazada trả về" — **chỉ còn 1 hướng khả thi: Store Owner/Admin tự tay đánh dấu**.

**Field `OrderGroup`**: `order_priority: 'normal'|'express'`, `packaging_deadline: Date|null` (chỉ có nếu express), `is_overdue: boolean`.

**Endpoint mới**: `PATCH /order-groups/:id/priority` — body `{ order_priority, packaging_deadline_hours }`, Store Owner/Admin tự đặt tay, hệ thống tự tính `packaging_deadline`.

**Vẫn PHẢI tự viết `addBusinessHours()`** — vì không có `sla_time_stamp` từ Lazada để dùng ké nữa (khác dự tính ban đầu là có thể bỏ qua bước này) — KHÔNG được cộng đơn giản `created_at + Xh`, phải bỏ qua giờ ngoài giờ hành chính/ngày nghỉ, cộng dồn sang ngày làm việc tiếp theo nếu tràn giờ. Test kỹ case biên (tạo đơn cuối giờ, cuối tuần). **⚠️ Vẫn đang chờ user xác nhận**: khung giờ hành chính công ty (VD 8h-18h?), có tính Thứ 7 không?

**Cron cảnh báo**: mỗi 10 phút quét `order_priority='express'` có `packaging_deadline` sắp/đã qua → bắn Notification tương ứng (SLA_WARNING/SLA_BREACH).

**Bài học quy trình**: đây là ví dụ thực tế cho nguyên tắc đã có trong CLAUDE.md — "ưu tiên đối chiếu đề bài/doc gốc trước khi tự quyết định thiết kế" — suýt code sai hướng (dựa vào field không tồn tại) nếu không được yêu cầu xác minh lại bằng doc thật trước khi bắt tay code.

**Xác nhận LẦN 2, độc lập (2026-09-10)**: user tiếp tục cung cấp đúng doc `GetOrders` (số nhiều — chính API `syncLazadaOrders()` đang gọi thật, khác `GetOrder` số ít đã xem ở trên) — rà toàn bộ Response Parameters, **kết quả giống hệt lần 1**: không có `shipping_provider_type`/`order_flag`/`sla_time_stamp`. 2 lần xác nhận độc lập, kết luận chắc chắn tuyệt đối.

**🔴 Phát hiện phụ (2026-09-10) — `OrderStatus` enum hiện tại (9 giá trị) THIẾU so với thực tế Lazada (19 giá trị)**: đối chiếu bảng Error Code của `GetOrders` (mã lỗi `6`, liệt kê đầy đủ status hợp lệ) — Lazada thật có tới **19 giá trị**: `unpaid, pending, packed, canceled, ready_to_ship, delivered, returned, shipped, failed, topack, toship, lost, lost_by_3pl, damaged_by_3pl, failed_delivery, shipped_back, shipped_back_success, shipped_back_failed, package_scrapped` — trong khi `order-status.enum.ts` chỉ định nghĩa 9 (`unpaid/pending/packed/ready_to_ship/shipped/delivered/canceled/returned/failed`), thiếu 10 giá trị (`topack`, `toship`, `lost`, `lost_by_3pl`, `damaged_by_3pl`, `failed_delivery`, `shipped_back`, `shipped_back_success`, `shipped_back_failed`, `package_scrapped`). Nếu Lazada trả về 1 trong 10 giá trị thiếu này, Mongoose sẽ **từ chối lưu** (enum validation fail) hoặc lỗi ngầm — cần bổ sung đầy đủ vào enum, đã thêm vào Tầng 1 roadmap (mục 10 mới).

### Tầng 2 — IMPORTANT

6. Viết `.spec.ts` cho `order-groups.service.ts`, `warehouse.service.ts`, util cũ ở `orders/`
7. Xóa route tạm `packaging/generate` khi AI thật (Package 3) xong
8. **MỚI phát hiện 2026-09-10** — cơ chế THÔNG BÁO Store Owner: UC-07 Alt Flow yêu cầu "thông báo Store Owner" khi thiếu hàng, nhưng **toàn bộ dự án hiện KHÔNG có cơ chế notification nào** (không email, không in-app) — cần quyết định hướng trước khi code mục 2 (report-missing) ở Tầng 1, vì report-missing cần gọi notify. **Đã hỏi user chọn hướng** (email/in-app/chỉ log), chờ xác nhận.
9. Shipping Coordinator: chọn carrier, lên lịch pickup, tracking — đã thiết kế DB field trước đó, chưa có endpoint
10. Store Owner: cấu hình packaging rules + shipping preferences
11. Cursor pagination cho `GET /order-groups` (hiện giới hạn cứng 100)
12. Sửa `INTEGRATION_GUIDE_ORDERS.md` — "access_token 4h" → "24h" (lỗi đã xác nhận)
13. Tổng quát hóa multi-platform thật (Adapter Registry dùng cho `syncOrders`, scheduler chung) — đã thiết kế, chưa áp dụng. **Đã hỏi user: làm ngay hay đợi TikTok/Tiki có code**, chờ xác nhận.

### Tầng 3 — NICE-TO-HAVE (hoãn được)

14. Package 5 Dashboard — cần dữ liệu thật chạy qua hệ thống trước
15. Validate 2 SKU trùng 1 kệ (data integrity, tần suất thấp)
16. Return-to-stock khi hoàn hàng — tự động trở thành việc cần làm SAU KHI mục 1 (Tầng 1) xong
17. Vá double-query `getConnectedShop`+`getValidAccessToken`
18. Hoàn tất TikTok Partner Center (App Key/Secret) — đang dở, không chặn phần Lazada

### Tầng 4 — LOẠI TRỪ có chủ đích (đúng nguyên tắc thiết kế mới, KHÔNG làm)

An toàn tồn kho, reorder tự động, FIFO/FEFO theo lô, kiểm kê định kỳ, giới hạn sức chứa kệ — tính năng WMS doanh nghiệp đầy đủ, không ảnh hưởng chức năng lõi ở mức cơ bản.

### Đã có câu trả lời cho 6 câu hỏi (cập nhật 2026-09-10) — cập nhật thiết kế Tầng 1 theo đúng hướng này

1. **Thông báo Store Owner**: TẤT CẢ kênh cùng lúc — in-app notification (module Notification riêng, user đang chuẩn bị làm), hiển thị Dashboard theo role liên quan, và email. → `report-missing` (Tầng 1 mục 2) PHẢI gọi ra 1 "cổng thông báo chung" (generic interface, chưa biết chi tiết module Notification sẽ ra sao) — không hardcode cứng 1 kênh, để module Notification sau này cắm vào không phải sửa lại `report-missing`.
2. **Quét SKU**: CẢ 2 — camera thật (chính, việc của Mobile App Flutter, chưa thuộc phạm vi backend hiện tại) + nhập tay (dự phòng). **Đã nghiên cứu đầy đủ 6 tình huống quét thất bại + phương án dự phòng cho từng tình huống** — xem bảng "Nghiên cứu dự phòng quét mã" ngay bên dưới.
3. **Pick từng phần**: ✅ **ĐÃ CHỐT Hướng Y** — bắt buộc Packaging Staff/Admin duyệt lại trước khi group tiếp tục xử lý khi thiếu hàng. Thiết kế cụ thể: `report-missing` → group chuyển trạng thái MỚI `partial_needs_review` → KHÔNG tự động chuyển `packed` → cần thêm 1 hành động duyệt riêng (VD `POST .../packaging/approve-partial`) mới cho đi tiếp, khớp đúng pattern UC-04 đã có (mọi quyết định quan trọng cần người xác nhận, không để hệ thống tự động hoàn toàn).
4. **Tổng quát hóa đa sàn**: ✅ **ĐÃ LÀM RÕ phạm vi** — user hỏi đúng: không thể viết code đọc dữ liệu TikTok khi chưa có doc/response thật. Đã tách rõ 2 việc KHÁC NHAU: (A) đổi `syncLazadaOrders(shopId)` → `syncOrders(platform, shopId)` + (B) định nghĩa khuôn `MappedOrder` chung — **CẢ 2 làm được NGAY, không cần biết TikTok trả gì**, vì đây chỉ là "chuẩn bị khung/hộp rỗng" theo đúng NHU CẦU CỦA HỆ THỐNG MÌNH, không phải theo dữ liệu TikTok. Khác với (C) viết `TikTokAdapter.getOrders()` + (D) `TikTokOrderMapper` — **2 việc này CẦN doc TikTok thật, chưa làm được**, đúng như user chỉ ra. Lợi ích chuẩn bị (A)+(B) trước: khi có doc TikTok thật, chỉ cần "điền vào hộp có sẵn" (viết `TikTokAdapter` mới), KHÔNG cần sửa lại code Lazada đang chạy — nếu không chuẩn bị trước, tới lúc đó phải sửa lại cả 2 bên cùng lúc, rủi ro cao hơn.
5. **Dashboard**: hiển thị TOÀN BỘ chỉ số có thể tính được (AI accuracy rate, abnormal rate, thời gian xử lý, lưu lượng đơn...) — không chọn lọc riêng cái nào, làm đầy đủ khi tới lượt Package 5.
6. **MỚI — Nguồn mã vạch/màu sắc từ Lazada, user hỏi 2026-09-10**: đối chiếu lại response thật `GetProducts`/`GetProductItem` đã xem trước đó — **màu/size đã có sẵn, KHÔNG cần tự làm**: mỗi biến thể (`variation1: color_family`, `variation2: SizeX`...) đã là 1 `SellerSku` RIÊNG BIỆT (áo đỏ size M và áo xanh size M là 2 SellerSku khác nhau) — `product_master` (khóa theo `seller_sku`) đã đúng chuẩn, tận dụng được ngay, không cần đổi gì. **Mã vạch quét được (barcode/GTIN) — KHÔNG có trong response Lazada** (đã rà toàn bộ field: `SellerSku`, `ShopSku`, `SkuId`... không có field `barcode`/`gtin`/`upc`/`ean` nào) — `SellerSku` chỉ là mã CHỮ do seller tự đặt, không phải mã vạch số chuẩn quốc tế quét được bằng máy quét thường. **Quyết định**: KHÔNG cần tự sinh + in mã vạch riêng cho từng sản phẩm (tốn công) — tận dụng ĐÚNG mã vạch đã thiết kế sẵn cho `bin_code` (VD `A-03-02-01`, kệ vật lý) — nhân viên quét mã KỆ (xác nhận đúng vị trí) + hệ thống tự biết `seller_sku` cần lấy ở đó từ picking list → đủ để xác nhận đúng sản phẩm, không bắt buộc phải có mã vạch riêng dán lên từng sản phẩm.

### Nghiên cứu dự phòng quét mã (2026-09-10) — 6 tình huống quét thất bại + phương án cho mỗi tình huống

| #   | Tình huống                           | Phương án dự phòng                                                                                     |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1   | Camera hỏng/lag                      | Nhập tay mã SKU                                                                                        |
| 2   | Tem mã vạch rách/mờ/bẩn              | Nhập tay + tự động đánh dấu "cần in lại tem" cho Admin                                                 |
| 3   | Sản phẩm chưa dán tem                | Nhập tay + màn hình tìm theo tên/hình ảnh (cần dự phòng ngoài ô nhập mã)                               |
| 4   | **Mất mạng lúc quét** (hay gặp nhất) | Xem chi tiết kỹ thuật bên dưới — quan trọng nhất                                                       |
| 5   | Ánh sáng kho quá tối                 | Nhập tay                                                                                               |
| 6   | Quét nhầm mã (dán lộn)               | Server-side tự kiểm tra SKU quét được có thuộc đúng Order Group đang xử lý không, sai thì báo lỗi ngay |

**Tình huống #4 — thiết kế kỹ thuật cụ thể**: Mobile App phải lưu kết quả quét NGAY trên máy (offline-first), tự động gửi lên server khi có mạng lại, KHÔNG bắt nhân viên đứng chờ có mạng mới thao tác tiếp. Mỗi lần quét cần 1 `client_event_id` sinh ngay trên điện thoại lúc quét — nếu mạng chập chờn gửi lại nhiều lần, server dùng đúng ID này để biết "cùng 1 lần quét", không cộng trùng. **Tái sử dụng ĐÚNG kỹ thuật đã thiết kế sẵn cho `processed_webhook_events` (Rule #17)** — cùng 1 pattern chống trùng lặp do gửi lại nhiều lần, không cần nghĩ cơ chế mới.

**Ảnh hưởng thiết kế endpoint `pick-item` (Tầng 1 mục 4)**: cần thêm field `scan_method: 'barcode' | 'manual'` (audit — biết lần quét nào là quét thật, lần nào nhập tay, đúng tinh thần BR-07 ghi log mọi hành động) và `client_event_id` (optional, dùng khi Mobile App gửi lại sau khi mất mạng).

## ĐÃ TRIỂN KHAI (2026-09-10, lượt thứ 4) — `quantity_on_hand` + `pick-item` + Staff Assignment hoàn thiện + phát hiện DRIFT giữa sandbox và repo thật

### ⚠️ Phát hiện quan trọng — sandbox và repo thật của user bị lệch (drift)

User upload lại `be.zip` để đối chiếu — phát hiện **repo thật của user THIẾU HẲN 3 file** (`staff-assignment.controller.ts`, `staff-assignment.errors.ts`, `staff-assignment.service.ts`) và **6 file khác lệch nội dung thật** (không phải chỉ CRLF/LF) so với patch đã giao lượt trước — nguyên nhân: **user chưa merge zip `optipackai-staff-assignment-v8.zip` vào repo thật**. Đã xác nhận bằng `diff -B --strip-trailing-cr` (bỏ qua khác biệt xuống dòng) để tách đúng khác biệt NỘI DUNG THẬT khỏi noise CRLF/LF — chỉ đúng 6 file lệch, không có gì bất ngờ khác ngoài dự kiến. Đã merge lại đúng 6 file + 4 file mới lên bản `be.zip` mới của user, verify sạch bằng `tsc`, rồi mới code tiếp — **tránh code chồng lên nền sai** như user yêu cầu.

**Bài học quy trình**: khi user gửi lại `be.zip` sau nhiều lượt code, LUÔN diff với bản patch gần nhất đã giao (dùng `-B --strip-trailing-cr` để bỏ noise CRLF/LF) TRƯỚC KHI code tiếp — không giả định user đã merge đầy đủ.

### Staff Assignment — hoàn thiện nốt phần còn thiếu

- Sửa bug `full_name` → `name` (field thật trên `User` schema) trong `staff-assignment.service.ts`
- Thêm khả năng **tìm kiếm nhân viên theo tên/email** (`listStaffWithWorkload(role, search?)`) — dùng regex có escape ký tự đặc biệt (tránh lỗi/ReDoS)
- Tạo `staff-assignment.controller.ts` (route `POST /order-groups/:id/assign`, `GET /order-groups/staff/search`) + wire vào `order-groups.module.ts`
- Sửa `packaging.service.ts` — hook auto-assign đúng service (`StaffAssignmentService.autoAssign()`, không phải method mình từng viết trùng đã xóa)
- 2 lỗi ESLint thật tự phát hiện + sửa: `UserRole` (numeric enum) không được đặt trực tiếp trong template literal — phải `String(role)`

### `quantity_on_hand` — Điểm yếu #10 mục 1

Thêm field vào `SkuBinAssignment` (module `warehouse/`). Đồng thời bổ sung 2 việc liên đới phát hiện khi code:

- **`initial_quantity` optional trên `AssignSkuBinDto`** — gán vị trí lần đầu có thể chưa có hàng thật (mặc định 0), dùng `$setOnInsert` (không phải `$set`) để KHÔNG reset số lượng nếu chỉ đang đổi vị trí kệ cho SKU đã có sẵn assignment.
- **Endpoint `POST .../sku-bin-assignments/:assignmentId/restock`** (mới, chưa có trong thiết kế gốc) — nghiệp vụ NHẬP HÀNG là khác biệt với GÁN VỊ TRÍ (gán 1 lần, nhập hàng lặp lại định kỳ) — cộng dồn bằng `$inc` atomic (Rule #7), không phải set lại toàn bộ.

### `pick-item` — Điểm yếu #10 mục 4, trung tâm của Tầng 1

`POST /order-groups/:id/fulfillment/pick-item` (body: `sku`, `scanned_quantity`, `scan_method`, `warehouse_id`, `client_event_id?`) — `OrderGroupsService.pickItem()`:

- **Atomic check-and-decrement**: `findOneAndUpdate({warehouse_id, seller_sku, quantity_on_hand: {$gte: scannedQuantity}}, {$inc: {quantity_on_hand: -scannedQuantity}})` — filter điều kiện đủ hàng NGAY TRONG CÙNG 1 lệnh, không tách "check rồi ghi" (tránh race condition 2 nhân viên quét cùng SKU sắp hết cùng lúc). Không đủ hàng → `ORD_GROUP_INSUFFICIENT_STOCK` (409), message gợi ý dùng `report-missing` (chưa code, Tầng 1 mục 2-3).
- **Idempotency**: collection mới `pick_events` (schema `PickEvent`) — unique CÓ ĐIỀU KIỆN trên `client_event_id` (chỉ áp khi field này không null, cho phép nhiều lần quét KHÔNG có `client_event_id` — gọi trực tiếp Swagger/admin — tồn tại song song). `client_event_id` trùng đã xử lý → trả lại kết quả CŨ, không trừ 2 lần — đúng thiết kế offline-first đã nghiên cứu.
- **Audit**: mọi lần pick (có hay không `client_event_id`) đều ghi vào `pick_events` — biết `scan_method` mỗi lần, phục vụ tra soát sau này.
- Phân biệt rõ với endpoint `pick` (đã có từ trước): `pick-item` = quét từng SKU (gọi NHIỀU LẦN), `pick` = xác nhận đã lấy xong toàn bộ nhóm (gọi 1 lần cuối, chuyển `fulfillment_status`).

**Verify**: `tsc --noEmit` 0 lỗi, `eslint src` toàn project 0 lỗi — trên đúng nền `be.zip` mới nhất của user (sau khi đã merge lại phần drift).

### README.md — viết lại theo yêu cầu user

- Bỏ cột "Mobile" (SĐT) khỏi bảng Team — chỉ giữ Role/Name/Email
- Bỏ hẳn khối `[!IMPORTANT]` kể lịch sử đổi phạm vi sàn (Shopee/TikTok bị loại) — đây là lịch sử nội bộ, không phù hợp đặt ở phần giới thiệu dự án cho người ngoài đọc
- Cập nhật bảng tính năng (FE-01 đến FE-10, thêm FE-09 Notification, FE-10 Quản trị) và cấu trúc thư mục module đúng theo tên module THẬT đang có (`order-groups/`, `packaging/`, `warehouse/`, `product-master/` — trước đó README liệt kê tên module KHÔNG khớp thực tế: `shipping/`, `fulfillment/`, `admin/` chưa từng tồn tại)
- Sửa `Mongoose 8` → `Mongoose 9` (đồng bộ với CLAUDE.md đã sửa trước đó)
- Thêm bảng trỏ 3 file `INTEGRATION_GUIDE*.md` thay vì liệt kê route rời rạc lỗi thời

## ĐÃ TRIỂN KHAI (2026-09-10, lượt thứ 5, hoàn thiện phần lớn Tầng 1) — Notification + report-missing + partial-pick

### `GroupFulfillmentStatus` — thêm `PARTIAL_NEEDS_REVIEW`

Trạng thái mới, đúng Hướng Y đã chốt: `APPROVED_FOR_PACKING`/`PICKING` → `PARTIAL_NEEDS_REVIEW` (khi report-missing) → CHỈ 2 đường ra: `PICKED` (Packaging Staff/Admin duyệt tiếp) hoặc `AWAITING_PACKAGING` (hủy, làm lại). KHÔNG tự động đi tiếp — đúng pattern UC-04 đã có.

### Module `notifications/` — MỚI hoàn toàn

- Schema `Notification`: `recipient_user_id` HOẶC `recipient_role` (1 trong 2 — đích danh hoặc broadcast cả role), `type` (7 giá trị đã nghiên cứu trước), `severity`, `channels_sent` (audit đã gửi kênh nào).
- `NotificationsService.notify()` — "cổng thông báo chung" đã hứa từ trước khi code `report-missing`: ghi in-app NGAY (đồng bộ), gửi email SONG SONG không chờ (fire-and-forget, lỗi SMTP không chặn nghiệp vụ chính — cùng nguyên tắc `MailService.send()` đã có).
- **Template văn phong CHUYÊN NGHIỆP, dựng sẵn trong Service** (`buildMissingItemMessage()`, `buildAbnormalPackageMessage()`) — KHÔNG để caller tự ghép chuỗi tùy tiện, đảm bảo nhất quán giọng điệu trên toàn hệ thống, đúng yêu cầu user "không đùa cợt, không AI hóa".
- Route: `GET /notifications` (danh sách), `GET /notifications/unread-count` (polling, Phương án A đã chốt — không cần WebSocket), `PATCH /notifications/:id/read`.
- `MailService` (module `mail/`, đã hoàn thiện từ trước) — thêm method MỚI `sendNotificationEmail()` (additive, không đụng 4 method cũ) — mẫu email ĐƠN GIẢN có chủ đích (chỉ text, không thiết kế phức tạp), đúng quyết định "tối ưu tốc độ" đã chốt, nhưng văn phong vẫn chuyên nghiệp.

### `report-missing` + `decide-partial` — hoàn thiện UC-07 Alt Flow + Hướng Y

`POST /order-groups/:id/fulfillment/report-missing` (role `WAREHOUSE_STAFF`, `ADMIN`) — `OrderGroupsService.reportMissing()`: chuyển group `partial_needs_review` (dùng lại `transitionFulfillmentStatus()` đã có, không viết logic transition mới), tra tên người báo cáo (`User.name`), build message chuyên nghiệp, gọi `notificationsService.notify()` broadcast cho toàn bộ `STORE_OWNER`.

`POST /order-groups/:id/fulfillment/decide-partial` (role `PACKAGING_STAFF`, `ADMIN`) — `approve: true` → `PICKED` (tiếp tục), `approve: false` → `AWAITING_PACKAGING` (hủy làm lại).

**Verify**: `tsc --noEmit` 0 lỗi, `eslint src` toàn project 0 lỗi. 1 lỗi thật tự phát hiện + sửa lúc code: import path sai độ sâu thư mục (`notification.schema.ts` nằm trong `schemas/`, cần `../../../common/...` chứ không phải `../../common/...`).

### Tổng kết trạng thái Tầng 1 sau lượt này — 7/10 mục đã xong

✅ Xong: `quantity_on_hand`+`restock` (1), `report-missing` (2), partial-pick (3), `pick-item` (4), Staff Assignment (7), Notification (8), `OrderStatus` enum (10).
✅ TẤT CẢ 10/10 mục Tầng 1 đã hoàn thành (2026-09-10) — chi tiết đầy đủ ở mục "ĐÃ TRIỂN KHAI (lượt thứ 6)" ngay bên dưới.

## ĐÃ TRIỂN KHAI (2026-09-10, lượt thứ 6) — HOÀN THÀNH TẦNG 1 (10/10 mục)

### Việc 1 — Chuẩn hóa response `packaging/`+`warehouse/` sang camelCase (Điểm yếu #9 — ĐÃ VÁ)

Thêm `toResponse()` cho `PackagingRecommendationDocument` (4 route: `getCurrent`/`generate`/`approve`/`adjust`) và 3 entity ở `warehouse/` (`Warehouse`, `WarehouseZone`, `SkuBinAssignment` — 6 route). **Cố ý KHÔNG đụng** `PackableItem`/`OrderGroupForPackaging`/`PickingListItem` — đây là hợp đồng interface ĐÃ bàn giao cho thành viên làm AI Packaging, đổi field name lúc này sẽ phá vỡ hợp đồng đang dùng, ngoài phạm vi Điểm yếu #9 (điểm yếu đó chỉ nói về response bị lộ raw Document, không nói về quy ước đặt tên field trong interface nội bộ).

### Việc 2 — API chi tiết 1 món hàng riêng lẻ

`GET /order-groups/:id/picking-list/:sku` — `getPackableItemDetail()` tái dùng `getPackableItemsForGroup()` đã có, lọc đúng 1 SKU, ném `ORD_GROUP_ITEM_NOT_IN_GROUP` (404) nếu SKU không thuộc group.

### Việc 3 — Đơn Hỏa Tốc (Express Order) — implement thật, đúng thiết kế đã chốt

- Field mới `OrderGroup`: `order_priority` ('normal'|'express'), `packaging_deadline`, `is_overdue` + index ESR phục vụ cron.
- **`addBusinessHours()`** (module mới `order-groups/utils/`) — 8h-17h, TÍNH CẢ THỨ 7, KHÔNG tính Chủ Nhật (đã xác nhận với user). Xử lý đủ case biên: tạo đơn ngoài giờ hành chính (nhảy tới 8h ngày làm việc tiếp theo), tràn giờ trong ngày (cộng dồn sang hôm sau), tràn qua cuối tuần (bỏ qua Chủ Nhật). **8 test case cover đủ các case biên này.**
- `PATCH /order-groups/:id/priority` (role `STORE_OWNER`, `ADMIN`) — đánh dấu tay, đúng kết luận đã xác minh 2 lần độc lập (Lazada không hỗ trợ tự động).
- `ExpressOrderSlaScheduler` (cron 10 phút/lần) — quét đơn hỏa tốc sắp/đã quá hạn, gọi `NotificationsService` đúng "cổng thông báo chung" đã có (Nhóm 1: còn <1h → cảnh báo staff phụ trách; Nhóm 2: đã quá hạn → escalate Store Owner, tự đánh `is_overdue: true`, không cảnh báo lặp lại nhiều lần cho cùng 1 lần quá hạn).

### 2 bug thật tự phát hiện + tự sửa khi verify — đều là bài học đã có sẵn trong CLAUDE.md, áp dụng lại đúng lúc

1. **Rule #23 lặp lại** — `notification.schema.ts` field `related_entity_type: string | null` thiếu `type: String` tường minh trong `@Prop()` → app crash lúc load module, chỉ lộ ra khi chạy `jest` thật (không phải `tsc`/`eslint`) — đúng y hệt lớp lỗi đã ghi nhận trước đó, xác nhận thêm 1 lần nữa giá trị của việc BẮT BUỘC chạy `jest` cho module có schema mới.
2. **`packaging.service.spec.ts` (viết từ lượt trước) không theo kịp thay đổi constructor** — `PackagingService` được inject thêm `StaffAssignmentService` (hook auto-assign) ở 1 lượt sau đó, nhưng test mock cũ chưa cập nhật theo → lỗi `Nest can't resolve dependencies`. Đã thêm mock `staffAssignmentService` vào test. **Bài học mới rút ra**: khi THÊM dependency mới vào constructor 1 service ĐÃ CÓ test, PHẢI rà lại test file đó ngay lúc thêm dependency, không đợi tới lần chạy `jest` toàn project mới phát hiện.

**Verify cuối cùng, TOÀN BỘ project**: `tsc --noEmit` 0 lỗi, `eslint src` 0 lỗi, **`jest`: 12/12 suite, 116/116 test — 100% pass** (108 cũ + 8 test mới cho `addBusinessHours`).

### 🎉 Tầng 1 — HOÀN THÀNH 10/10 mục

✅ `quantity_on_hand`+`restock`, ✅ `report-missing`, ✅ partial-pick (Hướng Y), ✅ `pick-item` (atomic + idempotent + audit), ✅ chuẩn hóa response camelCase, ✅ item-detail endpoint, ✅ Staff Assignment (auto Least-Busy + manual), ✅ Notification (in-app + email, văn phong chuyên nghiệp), ✅ Đơn Hỏa Tốc (đánh dấu tay + SLA cron), ✅ `OrderStatus` enum đầy đủ 19 giá trị.

**Việc tiếp theo, ngoài phạm vi Tầng 1** (xem mục "🗺️ ROADMAP TỔNG HỢP" ở trên để tra lại Tầng 2-4): tổng quát hóa đa sàn (khung A+B, chờ user xác nhận cuối), xóa route tạm `packaging/generate` khi AI thật xong, Package 5 Dashboard, hoàn tất TikTok Partner Center.

## ĐÃ VÁ (2026-09-11) — 2 warning Mongoose "Duplicate schema index" — phát hiện từ log khởi động server THẬT của user

**Vấn đề**: `packaging-recommendation.schema.ts` (`order_group_id`) và `pick-event.schema.ts` (`client_event_id`) đều khai index **2 lần** — 1 lần qua `@Prop({..., index: true})`, 1 lần qua `Schema.index({...}, {partialFilterExpression: ...})` riêng bên dưới (cần thiết vì unique CÓ ĐIỀU KIỆN không khai được qua `index: true` đơn thuần). Mongoose thấy 2 khai báo cùng field, cảnh báo trùng lặp — không phải lỗi runtime, nhưng là cấu hình dư thừa cần dọn.

**Cách sửa**: bỏ `index: true` trong `@Prop()`, chỉ giữ đúng 1 khai báo `Schema.index()` bên dưới (đã có `partialFilterExpression`, đủ mạnh hơn `index: true` đơn thuần).

**Bài học quy trình mới**: log khởi động server thật (`npm run start:dev`) là 1 nguồn phát hiện lỗi KHÁC với `tsc`/`eslint`/`jest` — cảnh báo runtime kiểu Mongoose duplicate-index chỉ hiện ra khi app THẬT SỰ khởi động kết nối DB, không lộ ra ở 3 lớp verify tĩnh đã có. Nên định kỳ xem qua log khởi động thật của user (không chỉ dựa vào 3 lệnh verify tự động), đặc biệt sau khi thêm schema/index mới.

**Verify**: `tsc` 0 lỗi, `eslint` 0 lỗi, `jest` 12/12 suite 116/116 test — không ảnh hưởng gì tới logic đã có, chỉ dọn cấu hình dư thừa.

## ĐÃ TRIỂN KHAI (2026-09-11) — Mở quyền Store Owner xem đơn + filter `order_priority`

### Bối cảnh — phát sinh từ chính bạn FE (Huỳnh Quốc Việt) đang tích hợp thật

Việt báo: dùng tài khoản Store Owner test kết nối shop, không lấy được đơn — vì `GET /orders`/`GET /order-groups` (list + detail) trước đó chỉ gắn `@Roles(ADMIN)`/thiếu hẳn `STORE_OWNER`. Đã trao đổi trực tiếp với team qua chat, **chốt rõ ràng**: `POST /orders/lazada/sync` và `GET /marketplace/:platform/connect` (thao tác kỹ thuật nhạy cảm — kết nối OAuth, đồng bộ tay) **giữ nguyên chỉ Admin**; 4 route ĐỌC (`GET /orders`, `GET /orders/:id`, `GET /order-groups`, `GET /order-groups/:id`) **thêm `STORE_OWNER`** — đúng nghiệp vụ: chủ shop cần xem đơn của chính mình, không hợp lý nếu chỉ Admin xem được.

### Thay đổi code

- `orders.controller.ts`: `@Roles(ADMIN)` → `@Roles(ADMIN, STORE_OWNER)` cho `GET /orders` và `GET /orders/:id`. `POST /lazada/sync` giữ nguyên.
- `order-groups.controller.ts`: thêm `STORE_OWNER` vào `@Roles()` của `GET /order-groups` và `GET /order-groups/:id` (giữ nguyên toàn bộ role cũ — Warehouse/Packaging/Shipping/Admin — chỉ CỘNG THÊM, không bớt).
- `picking-list`/`picking-list/:sku` **KHÔNG thêm** Store Owner — đây là màn hình vận hành (Warehouse Staff thao tác lấy hàng), Store Owner không cần xem chi tiết vận hành, chỉ cần xem tổng quan.

### Đồng thời vá gap đã ghi nhận trước đó — filter `order_priority`

`ListOrderGroupsQueryDto` thêm field `order_priority?: 'normal'|'express'`, `listOrderGroups()` (service) áp filter vào query MongoDB (`query.order_priority = filter.orderPriority`) — tận dụng đúng index `{order_priority, packaging_deadline, is_overdue}` đã có sẵn từ khi code Đơn Hỏa Tốc, không cần thêm index mới. Kết hợp được với 2 filter cũ (`fulfillment_status`, `platform`) cùng lúc.

**Verify**: `tsc` 0 lỗi, `eslint` 0 lỗi, `jest` 12/12 suite 116/116 test — không ảnh hưởng logic cũ nào, chỉ mở rộng quyền + thêm 1 filter.

### Đã cập nhật đồng bộ 3 tài liệu

`API_LIST.md` (bảng role Orders/Order Groups + ma trận Store Owner), `INTEGRATION_GUIDE_FULFILLMENT.md` (bảng Actor mục A.2, thêm mục filter đơn Hỏa Tốc ở Nghiệp vụ 5), file này.

## ⚠️ Phát hiện quan trọng (2026-09-12) — tài liệu ĐÃ VIẾT ĐÚNG từ trước nhưng CODE chưa từng được merge

**Bối cảnh**: Đội FE (Huỳnh Quốc Việt) báo qua chat thật — `GET /orders`/`GET /order-groups` chỉ Admin gọi được, Store Owner không xem được đơn shop mình. User yêu cầu mở quyền + thêm filter `order_priority`.

**Phát hiện khi verify**: `API_LIST.md`/`INTEGRATION_GUIDE_FULFILLMENT.md` **đã có sẵn nội dung đúng** mô tả y hệt thay đổi này (role Store Owner, filter `order_priority`) — nhưng khi kiểm tra `be.zip` user upload lại, **code thật CHƯA HỀ có** những thay đổi tương ứng (`orders.controller.ts`/`order-groups.controller.ts` vẫn `@Roles(ADMIN)` cứng, `ListOrderGroupsQueryDto` chưa có field `order_priority`). Kết luận: đã có 1 lượt trước viết xong tài liệu NHƯNG patch code chưa từng được user merge vào repo thật — giống đúng dạng lỗi "drift tài liệu-code" đã gặp trước đây, lần này xảy ra ở hướng khác (tài liệu đi trước, code bị bỏ sót — không phải code đi trước, tài liệu lạc hậu như các lần trước).

**Đã sửa xong THẬT trong code** (2026-09-12): thêm `UserRole.STORE_OWNER` vào `@Roles()` của `GET /orders`, `GET /orders/:id`, `GET /order-groups`, `GET /order-groups/:id` (giữ nguyên `POST /lazada/sync`, `GET /marketplace/:platform/connect` chỉ Admin — thao tác kỹ thuật nhạy cảm). Thêm field `order_priority` vào `ListOrderGroupsQueryDto`, áp vào `listOrderGroups()` — tận dụng đúng index `{order_priority, packaging_deadline, is_overdue}` đã có sẵn từ Nghiệp vụ Đơn Hỏa Tốc, không cần thêm index mới.

**Verify thật**: `tsc` 0 lỗi, `eslint` 0 lỗi, `jest` 12/12 suite 116/116 test — trên đúng code thật vừa merge, không phải giả định.

**Bài học quy trình MỚI, bổ sung cho nguyên tắc đã có**: KHÔNG được tin bộ nhớ/tài liệu đã ghi "đã làm xong" là bằng chứng đủ — bộ nhớ có thể ghi lại 1 lượt mà patch chưa từng thực sự tới tay user. **Luôn đối chiếu lại đúng `be.zip` mới nhất user upload trước khi báo "đã xong"**, kể cả khi tài liệu/bộ nhớ khẳng định điều ngược lại.

## ĐỐI CHIẾU CHÉO TOÀN BỘ tài liệu FE vs code thật (2026-09-11) — sau khi hoàn thành Tầng 1

**Đã quét trực tiếp `@Controller`/`@Roles` trên TOÀN BỘ 11 controller thật** (không dựa trí nhớ) để làm nguồn xác nhận cuối cùng — kết quả:

| Tài liệu                           | Trạng thái                                                                                                                                                                                                                                       | Hành động                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `INTEGRATION_GUIDE.md` (Auth)      | ✅ Vẫn đúng — 0 diff code `auth/` từ lần verify trước                                                                                                                                                                                            | Không đổi gì                                                                                                               |
| `INTEGRATION_GUIDE_ORDERS.md`      | 🟡 Vẫn đúng 99% — 0 diff code `orders/`/`marketplace-integration/` — **NHƯNG lỗi "access_token 4h" (thật ra 24h, `.env.example` xác nhận `JWT_EXPIRES_IN=86400`) đã phát hiện từ lâu VẪN CHƯA thực sự sửa file**                                 | **Việc còn nợ**: tự tay sửa dòng "4h" thành "24h" trong file gốc — CLAUDE.md chỉ ghi phát hiện, chưa từng xuất bản bản sửa |
| `INTEGRATION_GUIDE_FULFILLMENT.md` | 🔴 ĐÃ LỖI THỜI NẶNG — viết TRƯỚC khi Tầng 1 hoàn thành (thiếu `pick-item`, `report-missing`, `decide-partial`, Staff Assignment, Notifications, Đơn Hỏa Tốc, và còn ghi sai "2 kiểu response khác nhau" — đã thống nhất camelCase từ 2026-09-10) | **Đã viết lại HOÀN TOÀN**, file mới đã giao                                                                                |

### File MỚI — `API_LIST.md`

Bảng đầy đủ TOÀN BỘ route thật (quét trực tiếp code, không phải từ thiết kế) + role cho từng route + ma trận theo role (mỗi role gọi được đúng những gì). Phát hiện đáng chú ý khi tổng hợp: **Shipping Coordinator hiện là role có ít route riêng nhất** (chỉ 3 action fulfillment cơ bản — `ship`/`deliver`/`return`) — xác nhận đúng gap đã ghi ở Tầng 2 (chưa có API chọn carrier/lên lịch pickup/tracking thật).

### `INTEGRATION_GUIDE_FULFILLMENT.md` — viết lại, các điểm chính đã cập nhật

- Luồng chạy đầy đủ 3 nhánh (happy path, nhánh `partial_needs_review`, nhánh Đơn Hỏa Tốc song song)
- Response mẫu `OrderGroup` đầy đủ field mới (`assignedStaffId`, `orderPriority`, `packagingDeadline`, `isOverdue`)
- Giải thích rõ `client_event_id` dùng khi nào (offline-sync), phân biệt 2 cách lấy hàng (CÁCH A có audit vs CÁCH B đơn giản)
- Bảng mã lỗi đầy đủ (thêm 8 mã mới: `ORD_GROUP_INSUFFICIENT_STOCK`, `ORD_GROUP_ITEM_NOT_IN_GROUP`, `ORD_GROUP_NO_STAFF_AVAILABLE`, `ORD_GROUP_STAFF_NOT_FOUND`, `NOTI_INVALID_ID`, `NOTI_NOT_FOUND`)
- Mục Notifications tích hợp riêng (polling, cấu trúc, 7 loại thông báo)
- Checklist test bổ sung — cụ thể cho từng nhánh rẽ mới, không chỉ happy path

### ⚠️ Sửa lần 2 (2026-09-11, cùng ngày) — bản v2 vẫn CHƯA đủ, user chỉ ra đúng

User phản hồi: bản v2 (mục trên) vẫn chỉ dừng ở mức "API nào, gọi ra sao" — **thiếu hẳn phần giải thích NGHIỆP VỤ** (bối cảnh xảy ra, vì sao thiết kế vậy, DB có field gì). Đã viết lại **v3 — mở rộng toàn diện**, cấu trúc mới 4 phần:

- **Phần A (Tổng quan)**: 6 câu hỏi nghiệp vụ hệ thống trả lời + bảng Actor/trách nhiệm + 3 nguyên tắc thiết kế xuyên suốt (vì sao 1-người-xác-nhận, vì sao Optimistic Concurrency khắp nơi, vì sao không tự động hóa khi thiếu thông tin)
- **Phần B (6 nghiệp vụ chi tiết)**: mỗi nghiệp vụ có Bối cảnh → Actor → Luồng chi tiết từng bước → Tình huống đặc biệt (kèm LÝ DO thiết kế, VD "tại sao Warehouse Staff không tự quyết định được khi thiếu hàng") → **Bảng đầy đủ field DB liên quan, lấy trực tiếp từ schema thật** (không suy đoán)
- **Phần C**: sơ đồ ASCII trạng thái đầy đủ, dễ tra cứu nút nào bấm được ở đâu
- **Phần D**: tham chiếu kỹ thuật (giữ lại phần tốt của v2 — mã lỗi, checklist)

**File mới ~25KB** (tăng từ ~11KB) — đã giao qua `present_files`.

## Kiểm nghiệm 2 tài liệu FE cũ (`INTEGRATION_GUIDE.md`, `INTEGRATION_GUIDE_ORDERS.md`) đối chiếu với code thật (2026-09-09)

Rà từng biến, từng câu, đối chiếu trực tiếp source code (không suy đoán) — kết quả:

- ✅ **Đúng, đã verify khớp 100% với code thật**: 7 mã lỗi Google OAuth (`GoogleOAuthErrorCode` enum), 10 mã backup code MFA, cửa sổ Trusted Device 30 ngày, khóa cứng 72h (2 exception khác nhau: `ForbiddenException`=403 cho case thường, `UnauthorizedException`=401 cho case hết hạn cứng — tài liệu ghi "401/403" là ĐÚNG, không phải mơ hồ), toàn bộ 4 mã `ORD_*` + 8 mã `MKT_*`, 9 giá trị `OrderStatus` enum, tập trạng thái được xét consolidation (`unpaid|pending|packed|ready_to_ship`), toàn bộ 5 route + role của `orders`/`marketplace-integration`.
- 🔴 **SAI, đã tìm ra 1 lỗi thật**: `INTEGRATION_GUIDE_ORDERS.md` mục 1 ghi _"access_token sống 4h"_ — **SAI**, `.env.example` thật: `JWT_EXPIRES_IN=86400` (giây) = **24 giờ**, không phải 4h (và giá trị này cấu hình được qua env, không cố định). Cần sửa lại tài liệu — đổi "4h" thành "24h theo cấu hình mặc định (`JWT_EXPIRES_IN`), có thể khác nếu `.env` thật của môi trường đang chạy đổi giá trị này".

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

**Bổ sung (2026-09-11), ĐÃ SỬA LẠI cho đúng sau khi đối chiếu `commitlint.config.mjs` thật** — giải thích lượt trước SAI ở phần lý do (nói "chặn vì liệt kê tên file" — không đúng bản chất luật). **Luật thật (`subject-not-vague`)**: chỉ chặn nếu dòng mô tả **BẮT ĐẦU** bằng đúng 1 trong 6 từ cấm: `update`, `fix stuff`, `wip`, `misc`, `changes`, `stuff` — **không liên quan** tới việc có nhắc tên file hay không. VD `"update CLAUDE.md and README.md"` bị chặn vì mở đầu bằng `"update "`, KHÔNG phải vì liệt kê file — `"sync CLAUDE.md and README.md..."` sẽ KHÔNG bị chặn dù cũng liệt kê y hệt tên file. Cách tránh đơn giản nhất: không mở đầu dòng mô tả bằng 6 từ cấm trên, dùng động từ cụ thể hơn (`add`, `remove`, `fix`, `log`, `record`, `refactor`...).

**Các rule khác đã xác nhận đúng qua config thật, không cần sửa**: `scope-ticket-format` — scope bắt buộc đúng `AOFP-<số>`, không có ngoại lệ; `header-max-length` — 100 ký tự cho dòng đầu tiên; type hợp lệ kế thừa nguyên `@commitlint/config-conventional` (feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert — đúng danh sách đã ghi từ trước).

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

Luôn dùng `HydratedDocument<T>` (khuyến nghị từ Mongoose 8 trở lên, project hiện dùng Mongoose 9), KHÔNG trộn với pattern cũ `T & Document`.

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

### 12. `.lean()` BẮT BUỘC cho mọi query chỉ đọc (read-only), không cần Mongoose Document methods

Mongoose mặc định trả về full **Hydrated Document** cho mọi query — kèm getter/setter, change-tracking, các instance method (`.save()`...) — tốn CPU "hydrate" dù bạn chỉ cần đọc dữ liệu để trả JSON ra ngoài (99% các endpoint `GET`). Với endpoint chỉ đọc, KHÔNG gọi `.save()`/sửa lại document sau khi query, luôn thêm `.lean()`:

```ts
// ❌ Tránh cho endpoint chỉ đọc — hydrate cả Document không cần thiết
async findAll(): Promise<Order[]> {
  return this.orderModel.find({ shop_id }).exec();
}

// ✅ Luôn làm — trả plain JS object, nhanh hơn đáng kể trên dataset lớn
async findAll(): Promise<OrderLean[]> {
  return this.orderModel.find({ shop_id }).lean().exec();
}
```

Lưu ý: `.lean()` trả plain object, KHÔNG có `_id` tự động convert hay virtual field — nếu response cần field ảo (`id` thay vì `_id`), phải tự map thủ công trong mapper/service, không dựa vào Mongoose tự làm hộ nữa.

### 13. Projection (`.select()`) — chỉ lấy field thực sự cần, không load nguyên document

Khi endpoint chỉ cần vài field (VD màn hình list chỉ hiện `order_id`, `status`, `recipient_name`, không cần load nguyên mảng `items[]` chi tiết từng SKU), dùng `.select()` để giới hạn field lấy về từ MongoDB, giảm băng thông DB↔App và dung lượng response:

```ts
// Chỉ lấy field cần cho màn hình list, bỏ qua items[] chi tiết
this.orderModel.find({ shop_id }).select('order_id status recipient_name created_at').lean();
```

Áp dụng đặc biệt cho các collection có field mảng/object lớn (`Order.items[]`, `PackagingRecommendation` sau này) — tránh kéo cả field nặng về chỉ để không dùng tới.

### 14. Vòng lặp ghi nhiều document CÙNG LOẠI → `bulkWrite()`, không lặp query riêng lẻ từng cái

`autoSyncAllConnectedShops()` hiện lặp tuần tự qua từng SHOP (đúng, có chủ đích — tránh dồn dập request lên Lazada cùng lúc, xem lý do đã note ở `orders.service.ts`) — nhưng đây là nguyên tắc RIÊNG khi ghi nhiều DOCUMENT CÙNG LOẠI vào MongoDB (không phải gọi API ngoài): tránh N lần `findOneAndUpdate` rời rạc trong 1 vòng lặp, gộp thành 1 lệnh `bulkWrite()` duy nhất. Sắp áp dụng ngay khi code Product Master Data (`getProducts()` trả về batch 50 SKU/lần — ghi cache 50 document đó PHẢI qua `bulkWrite()`, không lặp 50 lần `updateOne`):

```ts
// ❌ Tránh — 50 round-trip riêng lẻ tới MongoDB
for (const sku of skus) {
  await this.productMasterModel.updateOne({ seller_sku: sku.SellerSku }, { $set: {...} }, { upsert: true });
}

// ✅ Luôn làm khi ghi nhiều document cùng loại trong 1 lần — 1 round-trip duy nhất
await this.productMasterModel.bulkWrite(
  skus.map(sku => ({
    updateOne: {
      filter: { shop_id, seller_sku: sku.SellerSku },
      update: { $set: { package_length: sku.package_length, /* ... */ } },
      upsert: true,
    },
  })),
);
```

### 15. Connection Pool — cấu hình tường minh, không dùng mặc định mù mờ

`MongooseModule.forRootAsync()` hiện chưa cấu hình `maxPoolSize`/`minPoolSize` tường minh, đang chạy theo mặc định của driver (thường 100) — cần khai rõ trong `database.config.ts`, đặc biệt quan trọng khi cron 10 phút/lần có thể cộng dồn nhiều query đồng thời (nhiều shop × Product Master batch × order_groups sắp code):

```ts
// config/database.config.ts
MongooseModule.forRootAsync({
  useFactory: () => ({
    uri: process.env.MONGODB_URI,
    maxPoolSize: 20, // đủ cho quy mô hiện tại (vài shop), tránh mặc định 100 tốn kết nối rảnh
    minPoolSize: 5,
  }),
});
```

Con số cụ thể (20/5) cần benchmark lại khi tăng số lượng shop/sàn thật, đây chỉ là điểm khởi đầu hợp lý cho quy mô demo/capstone — không phải số tuyệt đối đúng cho mọi trường hợp.

### 16. Cảnh giác N+1 query — đặc biệt khi nối Order Group ↔ Product Master ↔ Packaging sắp tới

N+1 xảy ra khi loop qua danh sách rồi query riêng cho TỪNG phần tử thay vì 1 query gộp — lỗi hiệu năng dễ mắc nhất khi code `getPackableItemsForGroup()` (đọc `product_master` cho từng SKU trong group):

```ts
// ❌ Tránh — N query riêng, N = số SKU trong group
for (const item of order.items) {
  const product = await this.productMasterModel.findOne({ seller_sku: item.sku });
  // ...
}

// ✅ Luôn làm — 1 query duy nhất lấy hết, map lại trong bộ nhớ
const skus = order.items.map((i) => i.sku);
const products = await this.productMasterModel.find({ seller_sku: { $in: skus } }).lean();
const productMap = new Map(products.map((p) => [p.seller_sku, p]));
```

Áp dụng nguyên tắc này cho MỌI chỗ tương lai có "loop qua mảng rồi query DB bên trong loop" — luôn hỏi trước: có thể gộp thành 1 query `$in` rồi map trong bộ nhớ không?

### 17. Idempotency key cho MỌI nguồn dữ liệu kiểu event-driven (webhook, event queue) — collection riêng, TTL ngắn

Polling (Lazada) tự nhiên chống trùng nhờ `upsert` theo `platform_order_id`. Nhưng Webhook (TikTok) và Event Queue (Tiki) đều chỉ đảm bảo "at-least-once delivery" theo chuẩn ngành — CÙNG 1 sự kiện có thể tới 2 lần. Bắt buộc có collection `processed_webhook_events` (index unique `{platform, event_id}`, TTL 7 ngày), check-rồi-ghi TRƯỚC khi xử lý nghiệp vụ, không phải sau — xem chi tiết mục "Kiến trúc mở rộng đa sàn" → mục 4 phía trên.

### 18. Optimistic concurrency cho `order_groups.fulfillment_status` — nhiều nhân viên có thể thao tác đồng thời cùng 1 group

Khác với Counter (#7, cộng dồn số) và Transaction (#6, ghi đa collection), đây là tình huống RIÊNG: 2 user khác nhau (VD Packaging Staff bấm Approve, đồng thời Warehouse Staff bấm Pick) có thể cùng sửa **cùng 1 document** `order_groups` gần như đồng thời → lost update nếu không kiểm soát. Dùng optimistic locking có sẵn của Mongoose (`versionKey`, mặc định `__v`) kết hợp `findOneAndUpdate` có điều kiện version, KHÔNG chỉ dựa vào `findByIdAndUpdate` đơn thuần:

```ts
const updated = await this.orderGroupModel.findOneAndUpdate(
  { _id: groupId, __v: expectedVersion },
  { $set: { fulfillment_status: 'picked' }, $inc: { __v: 1 } },
  { new: true },
);
if (!updated) throw new AppException(ORD_ERROR_CODES.GROUP_STATE_CONFLICT); // báo FE: dữ liệu đã đổi, tải lại trước khi thao tác tiếp
```

### 19. Raw payload archival — lưu response gốc CHƯA transform vào collection riêng, KHÔNG nhét vào schema chính, KHÔNG bỏ hẳn

Bài học từ chính lịch sử dự án: việc điều tra field `quantity` (không tồn tại) và field `country_user_info` (sai tên so với tài liệu cộng đồng) mất thời gian vì phải dựa vào tài liệu bên ngoài, không có bản ghi lại response THẬT lúc xảy ra. Giải pháp đúng — collection `raw_marketplace_payloads` riêng (`platform`, `endpoint`, `raw_response` kiểu `Mixed`/`Object` — đây là 1 trong số ít trường hợp CHẤP NHẬN dùng `type: Object`, vì mục đích archival thuần túy, không query cấu trúc bên trong, khác hẳn tinh thần Rule #1), TTL 30-90 ngày. **Không** nhét raw response vào chính document `Order` (phá vỡ Rule #1 — cấu trúc rõ ràng — và làm phình to document chính, ảnh hưởng Rule #2 lẫn tốc độ query).

### 20. Explain-plan discipline — bắt buộc verify TRƯỚC khi merge query mới, không chỉ tin "đã tạo index là đủ"

Hoàn thiện vòng lặp của Rule #3 (tạo index) — tạo index không đảm bảo Mongo THỰC SỰ dùng nó. Trước khi merge bất kỳ query mới nào (đặc biệt các query sắp viết cho `order_groups`/`product_master`), chạy `.explain('executionStats')`, xác nhận `stage: 'IXSCAN'` (dùng index) chứ không phải `'COLLSCAN'` (quét toàn bộ collection — chậm dần theo data tăng, chỉ lộ ra khi data đủ lớn, dễ sót lúc data còn ít lúc demo).

### 21. Aggregation pipeline — `$match`/`$sort` đặt CÀNG SỚM CÀNG TỐT trong pipeline, hạn chế `$lookup` ở đường xử lý tần suất cao

`$match`/`$sort` đặt ở đầu pipeline mới tận dụng được index (đặt sau `$group`/`$project` thì mất tác dụng index hoàn toàn). Tránh `$lookup` (join) trong các API gọi thường xuyên (VD `GET /orders` list) — nếu cần hiển thị `shop_name` kèm order, **denormalize** (lưu sẵn `shop_name` ngay trên `order_group` lúc tạo, chấp nhận trùng lặp nhỏ để đổi lấy tốc độ đọc) thay vì `$lookup` sang `marketplace_shop` mỗi lần. Chỉ dùng `$lookup` cho các trang admin/report tần suất thấp (Dashboard Package 5), không dùng cho đường nóng (hot path) như list order hàng ngày.

### 22. Canonical schema — schema chính (`Order`, `OrderGroup`) CHỈ chứa field chuẩn hóa chung, field riêng-sàn KHÔNG BAO GIỜ lộ vào đây

Ràng buộc thiết kế nối thẳng với "Anti-Corruption Layer" ở mục kiến trúc phía trên: field đặc thù 1 sàn (VD cấu trúc `country_user_info` chỉ Lazada có) KHÔNG được thêm trực tiếp vào `order.schema.ts` dù chỉ optional — nếu cần giữ, đó là việc của Rule #19 (raw archival), không phải mở rộng schema chính. Vi phạm quy tắc này là dấu hiệu sớm nhất cho thấy đang "rò rỉ" đặc thù sàn ra ngoài tầng Adapter — chính là lỗi kiến trúc đã cảnh báo ở mục "Kiến trúc mở rộng đa sàn" phía trên.

### 23. Field kiểu Union (`X | null`, `X | undefined`) BẮT BUỘC khai `type:` tường minh trong `@Prop()` — lỗi CHỈ lộ ra lúc chạy thật, không phải lúc `tsc`/`eslint`

Phát hiện 2026-09-09 khi chạy `jest` thật cho `packaging.service.spec.ts` (KHÔNG bị `tsc --noEmit`/`eslint` bắt trước đó — cả 2 lệnh này báo 0 lỗi, nhưng app crash ngay lúc load module): `@nestjs/mongoose` dùng `reflect-metadata` để tự suy luận kiểu dữ liệu cho `@Prop()` không khai `type:` — cơ chế này **không suy luận được cho union type** (`Date | null`, `number | null`...), throw lỗi runtime `"Cannot determine a type for ... field"` ngay lúc `SchemaFactory.createForClass()` chạy.

```ts
// ❌ SAI — compile qua (tsc/eslint đều sạch), nhưng CRASH lúc app khởi động
@Prop({ default: null })
approved_at!: Date | null;

// ✅ ĐÚNG — luôn khai type: tường minh cho MỌI field union
@Prop({ type: Date, default: null })
approved_at!: Date | null;
```

**Bài học quan trọng hơn cả bug này**: đây là bằng chứng cụ thể cho lý do CLAUDE.md luôn yêu cầu chạy `jest` thật (không chỉ `tsc`/`eslint`) trước khi coi 1 module là hoàn thiện — có 1 lớp lỗi (runtime reflection của thư viện) mà static analysis tuyệt đối không bắt được, chỉ lộ ra khi thực sự khởi tạo schema.

## Khi tạo module mới, LUÔN:

0. Trước khi viết schema: liệt kê rõ field nào sẽ dùng để filter/sort ở controller → thiết kế index NGAY lúc đó theo nguyên tắc ESR, không để "sau"
1. Đăng ký `MongooseModule.forFeature([...])` trong `<name>.module.ts`
2. Swagger đầy đủ, DTO validate tiếng Việt
3. Nếu module đụng tới Order Consolidation hoặc AI Packaging → viết `.spec.ts` bắt buộc (yêu cầu QA trong Report 2). **Mở rộng 2026-09-09 (Rule #23)**: BẤT KỲ module nào có schema mới (dùng `@Prop()`) → PHẢI chạy thử `jest` thật ít nhất 1 lần trước khi coi là xong, không chỉ `tsc`/`eslint` — lý do cụ thể xem Rule #23, có lớp lỗi (runtime reflection) chỉ lộ ra khi thực sự khởi tạo schema qua test, 2 lệnh static analysis kia không bắt được.
4. Không tự thêm tích hợp Facebook/Shopee trừ khi được yêu cầu rõ — ngoài phạm vi đồ án (Shopee đã bị GỠ khỏi scope, Lazada đã được THÊM vào scope — đừng làm ngược theo trí nhớ cũ)
