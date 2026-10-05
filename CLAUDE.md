# OptiPackAI Backend — Coding Guide cho Claude

**Đối chiếu 12/09/2026:** đã triển khai lát cắt BE-1 để không mặc định số đo/độ nhạy và chặn hồ sơ packaging chưa `ready`; các phần tự động hóa/validator/picking nhất quán vẫn chưa hoàn tất. Quyết định flow hiện hành nằm ở mục [Roadmap điều chỉnh](#flow-20260912) và [BE-1 → BE-5](docs/BE_PACKAGING_IMPLEMENTATION_ROADMAP.md). Các mục ghi ngày 09–11/09 bên dưới là nhật ký code/lựa chọn cũ, không phải bằng chứng mọi bảo đảm nghiệp vụ đã đạt. Khi khác flow mới, giữ chúng làm lịch sử và theo quyết định 12/09; không tự bật tính năng chưa triển khai.

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

> **Ngành hàng thật của shop demo (xác nhận 2026-09-12)**: cửa hàng Lazada dùng để demo/test dự án bán **giày dép và quần áo** — đây là dữ liệu SKU thật sẽ chạy qua hệ thống, không phải giả định. Ghi chú này quan trọng cho module AI Packaging (xem mục "Đối chiếu 3 tài liệu thuật toán AI Packaging" bên dưới) — hướng thiết kế tập trung ngành hàng thời trang trong 3 tài liệu đó **khớp đúng với dữ liệu thật**, không phải thu hẹp sai phạm vi như đánh giá ban đầu.

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
- **3D Bin Packing (AI Packaging)**: 🔄 **ĐÃ CHỐT 04/10/2026** (thay câu cũ "chưa chốt microservice Python OR-Tools vs JS thuần") — dùng **cả hai, lai**: bộ giải BRKGA + EMS viết TypeScript trong backend (`modules/packing/solver/`, xác định) cho mọi đơn, cộng microservice Python **CP-SAT** (OR-Tools, `packer/`) chạy nền để chứng minh tối ưu cho đơn ≤ 12 món; thiếu `PACKER_URL` thì hệ thống vẫn chạy bằng BRKGA. Chi tiết ở các mục "Làm lại đóng gói 3D — Đợt 1…5" cuối file.
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
- Google OAuth (chỉ đăng nhập cho tài khoản ĐÃ tồn tại, không tự đăng ký) — **đã fix bug field response Google 2026-09-13, xem mục "3 bug Auth/Users đã gặp và fix" ngay bên dưới trước khi đụng lại `getGoogleUserInfo()`**
- Refresh token rotation + reuse detection
- **User tự xem/sửa hồ sơ CHỈ qua `GET/PATCH /users/me`** (phone/address/avatar) — **`employee_code`/`department` CHỈ Admin sửa được, qua `PATCH /users/:id`**, kể cả khi Admin tự sửa hồ sơ chính mình cũng phải đi qua route `:id`, không được lẫn vào `/me` (2 DTO tách riêng có chủ đích, không gộp)
- Admin: tạo/sửa (`PATCH /users/:id`)/reset-password/deactivate/reactivate/disable-mfa cho user khác
- **Tạo user — email trùng bị chặn tuyệt đối (2026-09-14, ĐÃ THAY ĐỔI)**: trước đây `createByAdmin()` chỉ chặn email của tài khoản `is_active: true`, unique index cũng partial theo `is_active` → Admin tạo lại đúng email của nhân viên đã vô hiệu hóa thì hệ thống **tạo thêm 1 user mới** (không ghi đè, nhưng ra 2 tài khoản cùng email). Giờ tìm email **không lọc is_active**; nếu trùng tài khoản đang hoạt động → `USER_EMAIL_IN_USE` (409); nếu trùng tài khoản đã vô hiệu hóa → `USER_EMAIL_INACTIVE` (409) kèm `details.existingUserId`, **không tạo mới, không ghi đè**. Unique `{ email: 1 }` giờ áp mọi trạng thái (bỏ `partialFilterExpression`). FE hiện lỗi trên form tạo user; với `USER_EMAIL_INACTIVE` có nút **Kích hoạt lại ngay** (gọi `POST /users/:id/reactivate`, mở lại tài khoản cũ với dữ liệu đã lưu — không lấy tên/vai trò từ form tạo mới).
- **Admin tắt MFA hộ → thông báo user (2026-09-14)**: `adminDisableMfa()` gọi cổng `NotificationsService.notify()` (in-app + email `mfaDisabledTemplate`). FE hiện popup `MfaDisabledNotice` khi user đăng nhập / đang trong phiên (poll **10s** — user chốt 2026-09-14, đủ cho capstone, không cần WebSocket). Không báo lại nếu MFA vốn đã tắt. Lỗi gửi thông báo không làm fail thao tác tắt MFA.
- Gửi email qua module `mail/` (5 template: welcome, forgot-password, account-locked, mfa-enabled, mfa-disabled) + `sendNotificationEmail()` cho thông báo vận hành — mọi lời gọi `mailService.sendXxx()` PHẢI dùng `void` (không `await`), gửi mail không được phép làm fail luồng nghiệp vụ chính. Thiết kế email theo phong cách transactional doanh nghiệp thật (nền trắng, 1 màu nhấn duy nhất, chữ ngắn) — **tránh** banner màu to/nhiều box màu (dễ trông như AI generate). Logo thương hiệu: khối lập phương đẳng trắc 3 tông tím, phẳng, không gradient — asset gốc ở `be/assets/logo/`.
- `ThrottlerGuard` đã gắn `APP_GUARD` global trong `app.module.ts` — `@Throttle()` trên route (login, forgot-password) giờ thực sự có tác dụng (trước đây từng bị khai config nhưng chưa gắn guard, không chặn được gì)
- TTL tự dọn: `login_audit_logs` (180 ngày), `trusted_devices` (30 ngày), `refresh_tokens` (theo hạn token)

**Chưa có, biết trước để không ngạc nhiên**: đổi email tự thân, ép buộc MFA cho Admin, giới hạn số thiết bị tin cậy tối đa/user, lịch sử nhiều lần nghỉ/quay lại việc (mới có field đơn `is_active`, chưa có mảng giai đoạn làm việc).

### 3 bug Auth/Users đã gặp và fix (2026-09-13, rút kinh nghiệm, đừng lặp lại)

1. **Google login luôn fail với `?error=server_error` — root cause: sai tên field response của Google.** `getGoogleUserInfo()` gọi endpoint REST cũ `https://www.googleapis.com/oauth2/v2/userinfo`, endpoint này trả field `verified_email`. Code cũ (`isGoogleUserInfo` type guard) lại kiểm tra field `email_verified` (tên field chuẩn OIDC, dùng ở endpoint `/oauth2/v3/userinfo` khác) — vì sai tên nên type guard luôn trả `false` với response thật, ném `GOOGLE_RESPONSE_FORMAT_INVALID`. **Fix**: thay `isGoogleUserInfo` bằng hàm `parseGoogleUserInfo()` chấp nhận cả 2 tên field (`email_verified` hoặc `verified_email`), chuẩn hóa về 1 shape dùng chung trong app. Không đổi DB/schema — chỉ sửa bước parse response Google.
2. **Đổi mật khẩu bắt buộc xong, login lại → `GET /users/me` vẫn 403.** Nguyên nhân: `JwtStrategy` đọc trạng thái `must_change_password` từ **cache Redis trước**, chỉ fallback Mongo nếu cache miss. `changePassword()` và `updateLastLogin()` trong `users.service.ts` chỉ update Mongo, không gọi `redisCache.invalidateUserAuthState(userId)` nên cache cũ (`must_change_password: true`) không bị xóa. **Fix**: thêm lời gọi `invalidateUserAuthState(userId)` ngay sau update Mongo ở cả 2 hàm (các hàm khác như `adminResetPassword` đã làm đúng từ trước, chỉ 2 hàm này thiếu).
3. **Lỗi Google OAuth trước đây không log đủ chi tiết để debug** — token exchange fail hoặc userinfo sai định dạng chỉ ném exception chung, không log HTTP status/`redirect_uri`/`client_id`/response body thật; `googleAuthCallback` catch block cũng không log message cụ thể. **Fix**: thêm `Logger` vào `AuthService` và `AuthController`, log rõ chi tiết lỗi ở cả 2 điểm trên (không đổi hành vi trả về FE, chỉ thêm log phía server).

**Không đổi DB/migration nào cho cả 3 fix trên** — Redis chỉ là cache tạm bị xóa/tự build lại từ Mongo, Mongo schema/dữ liệu user giữ nguyên.

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

<a id="flow-20260912"></a>

## Roadmap điều chỉnh — chốt 12/09/2026, thay thứ tự 07/09

**[stated] Phạm vi được chốt:** phát triển trên module hiện có, đã triển khai lát cắt BE-1 và tiếp tục theo kế hoạch BE-1 → BE-5, không tạo packaging song song. Một đơn nguồn là một phạm vi đóng; grouping chỉ phục vụ lấy hàng cùng lượt, không tự gom kiện/vận đơn. Kho/Admin xác nhận đã đo/thử khi nhập hồ sơ, không có bước Admin duyệt riêng. Đơn thường tự tính/thông qua chỉ khi đủ dữ liệu và candidate qua validator; nhân viên xử lý ngoại lệ.

### 1. Dữ liệu đầu vào và thuật toán

Product Master đã lấy package dimensions qua GetProducts. Đây là số đo khai báo từ sàn, chưa thay cho hồ sơ gấp/bọc thực tế. Lưu hồ sơ kho/version/người-thời điểm xác nhận riêng; sync không ghi đè. Thiếu dữ liệu không được thay bằng 20 cm/0,5 kg hoặc false cho độ nhạy. Giữ unit ID, shop/platform, SKU/biến thể và trạng thái; chỉ PENDING đã xác minh ở bản đầu, canceled loại bỏ, trạng thái lạ chờ xem lại.

Túi zip bọc item khác bao bì ngoài. Hàng sau chuẩn bị là khối đưa vào engine; carton có số đo trong/ngoài riêng, túi có quy cách fit đã thử. Vật tư đã trong gói khác cấp thêm, không cộng hai lần. Giữ greedy 3D + validator độc lập; fallback hiện tại chỉ cộng thể tích +10%, không phải FFD 3D và chưa an toàn cho hàng thật.

### 2. Flow mục tiêu và phạm vi demo

**🔄 ĐÃ THAY ĐỔI 30/09/2026 (phạm vi kiện):** "mỗi đơn một kiện" trong mục này và các mục 21/09, 28/09 bên dưới đã được thay bằng **mỗi đơn N kiện** — xem mục "Engine đóng gói 3D mới + đa kiện thật (30/09/2026)" ở cuối file.

**ĐÃ THAY ĐỔI 21/09/2026** (so với flow 12/09 "tính phương án → phân công → lấy hàng"): flow chính thức là **lấy hàng trước, đóng gói sau** — theo code AOFP-35 (Thuận, merge 20/09), user chốt 21/09. Phạm vi kiện **vẫn là mỗi đơn nguồn một kiện** (code hiện còn tính cả group thành một thùng — cần sửa, xem BE-3a).

```text
Sync → Gộp nhóm lấy hàng → Tự phân công (lúc tạo group) → picking
→ Quét từng SKU, không vượt số đặt; đủ → picked / thiếu → partial_needs_review
→ Chia hàng đã lấy về từng đơn → Hồ sơ kho đã xác nhận
→ Thiếu: chờ bổ sung / Đủ: tính và validate túi-carton cho từng đơn
→ pending_approval → approve/adjust (không cân) → approved_for_packing
→ Đóng → Cân/đo kiện thật từng đơn tại pack + đối soát vật tư
→ Xác nhận packed → Bàn giao vận chuyển nội bộ
```

Approve/adjust kế hoạch không bắt cân sau đóng; dời cân/đo thật sang pack. Chọn kế hoạch không trừ vật tư; cấp phát lúc bắt đầu đóng có transaction/ledger. Cân dự kiến gồm hàng + bì + vật tư; lệch policy thì chờ xem lại trước packed. Partial không chuyển picked bằng boolean nếu chưa đối soát tập giao và tính lại; bản đầu chờ bổ sung hoặc hủy/xử lý lại, chưa giao thiếu tự động.

Giữ status nguồn sàn tách fulfillment nội bộ. Trong phạm vi đồ án, không gọi Pack/ReadyToShip/giao hàng thật lên Lazada. Đây là phạm vi mô phỏng có chủ đích; không tuyên bố đã tích hợp shipping production.

### 3. Contract và tương thích

Interface đang chạy ở common/interfaces/packaging.interface.ts dùng group ID, SKU/quantity, cm/kg và một box; HTTP packaging/warehouse đã camelCase. Đây là contract legacy cần adapter/version sang unit một đơn, mm/g, candidate box/mailer, snapshot và branch status; không đổi tên ngầm hoặc ép túi thành box giả.

Nhóm legacy chứa nhiều đơn đang xử lý phải được rà soát trước chuyển; không tự tách/viết lại lịch sử đã hoàn tất. Recommendation cũ thiếu snapshot không được tự hợp thức hóa. Chỉ sửa các module Orders liên quan theo BE-1 có regression; yêu cầu cũ “không đụng Orders” là phạm vi của lượt code trước, không cấm sửa lỗi đã xác định.

### 4. Các đợt sửa và bảo đảm cần kiểm chứng

| Đợt | Nội dung | Nghiệm thu chính |
| --- | --- | --- |
| BE-1 | Mapper, unit đủ điều kiện, mỗi đơn riêng, backfill group | Không canceled/nhầm shop, không thiếu document group |
| BE-2 | Hồ sơ kho, version, catalog và readiness | Nháp không dùng, thiếu báo thiếu, sync không ghi đè |
| BE-3 | Validator, greedy/carton, fit túi, snapshot/adapter | Không hộp giả/quá cỡ, giữ fixture hình học đúng |
| BE-4 | Picking, idempotency/transaction, partial, vật tư/cân sau đóng | Không trừ trùng/đủ giả/stale; ledger và đối soát |
| BE-5 | Job bền vững, retry/recovery, tự thông qua và pilot | Chỉ bật khi BE-1 đến BE-4 đạt, không mất/lặp quyết định |

Nguồn chi tiết: [roadmap backend](docs/BE_PACKAGING_IMPLEMENTATION_ROADMAP.md). Multi-start/ML/nhiều kiện/viewer/cước thật là các bước sau; không giữ lịch triển khai M0–M8 cũ như một kế hoạch song song.

**Kết quả rà code trước đợt docs:** 16/16 test packaging cũ đạt nhưng có test chấp nhận quá cỡ vẫn trả Large. Chạy trực tiếp fallback tái hiện món 100×1×1 cm được Small, món cạnh 200 cm được Large, đơn rỗng cũng có hộp. Các vấn đề còn phải sửa: mất ID/lọc trạng thái ở getPackableItemsForGroup; grouping thiếu shop/phạm vi; backfill chỉ ID null; pick trừ tồn và ghi event không nguyên tử; partial chỉ đổi trạng thái; generate không transaction; adjust chưa validate/tính lại/ghi đủ lý do. Không coi log “đã xong” cũ là bằng chứng các lỗi này đã được vá.

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

### Luồng đang có — đối chiếu lại 12/09/2026

Orders sync mỗi 10 phút. Group backfill mỗi 15 phút chỉ tìm consolidated_group_id=null, còn thiếu trường hợp ID có giá trị mà document group không tồn tại. Product Master có cron riêng lúc 3h mỗi ngày; chưa có cache-miss fetch trong getPackableItemsForGroup, nơi đang dùng số đo mặc định khi thiếu.

Packaging hiện (21/09) đọc số lượng đã quét (`pick_events`) của cả group rồi tra Product Master; group được phân công và chuyển picking ngay lúc tạo, sau picked Admin mới gọi generate bằng fallback, rồi Packaging Staff/Admin approve/adjust (ĐÃ THAY ĐỔI so với thứ tự "approve rồi mới phân công và picking" ghi 12/09). Các lỗi dữ liệu/thứ tự cân được xử lý theo [roadmap mới](docs/BE_PACKAGING_IMPLEMENTATION_ROADMAP.md); không phải code đã tự theo flow mới.

### Verify — đã chạy compiler thật, không chỉ đọc mắt (đúng chuẩn Type Safety đã đặt ra)

Merge patch vào bản đầy đủ, `npm install`, chạy `npx tsc --noEmit -p tsconfig.json` → **0 lỗi** (1 lỗi unused-import nhỏ phát hiện lúc đầu, đã tự sửa). Chạy `npx eslint` trên toàn bộ file mới + 2 file bị chạm → **0 lỗi/warning**. Không có lỗi nào lan sang phần code cũ.

### Trạng thái các phần từng thiếu — cập nhật 12/09/2026

Cron Product Master, group backfill, controller Order Groups, schema recommendation và approve/adjust/reject đã có. Không triển khai lại từ đầu. Những việc còn thiếu hiện hành là hồ sơ kho/readiness, validator/engine, sửa picking/nhất quán dữ liệu và tự động hóa theo BE-1 đến BE-5.

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

> 🔄 **ĐÃ THAY ĐỔI so với ma trận gốc (cập nhật 01/10/2026)** — ma trận trên là bản thiết kế 09/09. Route kho thực tế của Warehouse Staff hiện nay (đọc từ `@Roles` trong `warehouse.controller.ts`): `GET warehouses`, `GET warehouses/:id`, `GET warehouses/:id/zones`, `GET warehouses/:id/bin-locations`, `GET warehouses/:id/sku-bin-assignments`, `POST .../restock`, `POST .../adjust`, `POST .../transfer`, `GET .../movements`, `GET bin-suggestions`, `GET picking-list`. **Nguyên tắc phân quyền kho (chốt 01/10/2026): route CẤU HÌNH kho (tạo/sửa/tắt kho-khu-kệ, gán/bỏ gán SKU, danh sách SKU chưa gán, danh sách ô theo khu) chỉ ADMIN; route VẬN HÀNH kho (xem vị trí và tồn, nhập hàng, kiểm kê, chuyển ô, lấy hàng) mở ADMIN + WAREHOUSE_STAFF.** Mục "ADMIN — ... POST/GET /admin/..." bên dưới là tên route thiết kế cũ, route thật không có tiền tố `/admin` — tra `API_LIST.md` mục 9.

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

### Hành vi legacy — `pick` nhảy thẳng qua `PICKING`

**ĐÃ THAY ĐỔI 12/09:** BE-4 phải đối soát unit/số lượng ở server trước picked. Đường tắt bên dưới chỉ mô tả code/demo cũ, không phải lựa chọn vận hành mục tiêu.

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

### Bối cảnh và giới hạn fallback — đính chính 12/09/2026

Fallback được tạo để mở khóa demo UC-04/fulfillment khi chưa có engine thật. Code thực tế chỉ chọn theo tổng thể tích +10%, vẫn trả Large khi quá cỡ; không có bước xếp giảm dần hay validator. Vì vậy nhận định cũ “production/lưới an toàn giữ nguyên” bị thay thế: chỉ dùng làm dữ liệu demo cho tới khi BE-3 có fallback hợp lệ. Không gọi implementation hiện tại là FFD 3D.

### Module `packaging/` — API UC-04 hiện hữu, còn lỗi flow cần sửa

**File mới (12 file)**: schema (`PackagingRecommendationDoc` + sub-schema `BoxSize`), enum `PackagingApprovalStatus`, `fallback-packaging.util.ts` (chọn theo thể tích, 3 hộp cố định, +10%, fragile→Bubble Wrap; chưa chứng minh xếp vừa/bảo vệ), 3 DTO (Approve/Adjust/Reject), Service, Controller, Module, errors.

**Route + role:**

```
POST /order-groups/:groupId/packaging/generate   @Roles(ADMIN)              [TẠM — chỉ để test, không phải hành vi nghiệp vụ thật]
POST /order-groups/:groupId/packaging/approve    @Roles(PACKAGING_STAFF, ADMIN)
POST /order-groups/:groupId/packaging/adjust     @Roles(PACKAGING_STAFF, ADMIN)
POST /order-groups/:groupId/packaging/reject     @Roles(PACKAGING_STAFF, ADMIN)
```

**Điểm kỹ thuật quan trọng nhất — transaction thật, dùng đúng Rule #6**: `approve()`/`adjust()`/`reject()` đều `connection.startSession()` + `session.withTransaction()`, ghi ĐỒNG THỜI `packaging_recommendations` + `order_groups` trong cùng 1 session — nếu 1 trong 2 lệnh ghi fail, CẢ 2 tự rollback, không có tình trạng "nửa vời". Đã xác nhận an toàn từ trước (project dùng Atlas, luôn là replica set).

**Cân bất thường — hành vi cũ còn phải sửa:** `approve()`/`adjust()` đều nhận `actual_measured_weight_kg` (cân THẬT), so sánh với cân lý thuyết từ `product_master` — lệch >20% tự đánh `is_abnormal: true`, log cảnh báo. BE-4 dời cân về sau đóng; so với cả kiện gồm bì/vật tư, không chỉ khối lượng item. Hiện trạng này chưa đáp ứng thứ tự thao tác thực tế.

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

## 🗺️ Backlog lịch sử 10/09/2026 — không thay thứ tự BE-1 → BE-5

Các nhãn hoàn tất dưới đây ghi nhận API đã được thêm ở lượt cũ; không chứng minh các bảo đảm nghiệp vụ đã đạt. Phần packaging/fulfillment thực hiện theo roadmap 12/09 ở trên.

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

**Sự kiện kích hoạt**: `report-missing` (Critical, báo Store Owner+Admin), `is_abnormal=true` lúc Approve (Warning), Order Group hỏa tốc còn <1h (Warning, báo staff phụ trách), hỏa tốc quá hạn (Critical, escalate Store Owner+Admin), group mới `pending_approval` (Info, báo Packaging Staff), token sàn hết hạn/mất kết nối (Critical, báo Store Owner+Admin), Product Master sync thất bại lặp lại (Warning, báo Admin), **Admin tắt MFA hộ user (Warning, 2026-09-14 — đích danh user bị tắt, popup in-app + email)**.

**Schema `Notification`**: `recipient_user_id`/`recipient_role` (1 trong 2), `type` (enum — 8 giá trị: 7 loại vận hành kho/sàn + `mfa_disabled` thêm 2026-09-14), `severity` ('info'|'warning'|'critical'), `title`, `message`, `related_entity_type`+`related_entity_id` (bấm thông báo điều hướng thẳng tới đúng trang), `is_read`, `channels_sent` (audit đã gửi qua kênh nào — user yêu cầu TẤT CẢ kênh: in-app + Dashboard + email), `created_at`.

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

### `pick-item` — API đã thêm, chưa bảo đảm retry đồng thời

**Đính chính 12/09:** decrement và create event hiện chưa trong cùng transaction; unique event không ngăn lần trừ trước đó. BE-4 cần transaction, kiểm tra unit/số lượng và idempotency theo cả nội dung.

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

### `report-missing` + `decide-partial` — API legacy cần hoàn thiện đối soát

**ĐÃ THAY ĐỔI 12/09:** code hiện chỉ đổi trạng thái khi decide-partial. Mục tiêu không cho picked trước khi xử lý tập hàng, phần thiếu và tính lại recommendation; xem BE-4.

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

**Nhắc lại (01/10/2026):** Claude từng đề xuất nhầm `feat(warehouse): ...` — scope là tên module thay vì mã ticket, bị `scope-ticket-format` chặn. Mọi commit đề xuất cho user PHẢI dạng `type(AOFP-<số>): ...`, subject viết thường, không dấu chấm cuối, ≤ 100 ký tự; không biết số ticket thì ghi rõ để user thay theo Jira.

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

**Ngoại lệ email user (2026-09-14, ĐÃ THAY ĐỔI so với unique partial `is_active:true`)**: xóa mềm `users` VẪN giữ unique `email` trên mọi trạng thái — Admin không được tạo tài khoản mới trùng email đã vô hiệu hóa; phải dùng Kích hoạt lại. Đây là unique định danh đăng nhập, khác unique nghiệp vụ cho phép tái sử dụng mã sau khi deactivate (vd `employee_code` vẫn partial).

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

## Đối chiếu 3 tài liệu thuật toán AI Packaging (2026-09-12) — nghiên cứu chuyên sâu, KHÔNG sửa file gốc

Bạn cùng nhóm giao 3 tài liệu thiết kế thuật toán AI Packaging (`AI_3D_PACKAGING_OPTIMIZATION.md`, `BE_PACKAGING_IMPLEMENTATION_ROADMAP.md`, `GIAI_THICH_THUAT_TOAN_3D_PACKAGING.md`, 1556 dòng tổng). Đã đọc kỹ, đối chiếu trực tiếp code thật (`packaging/`, `product-master/`, interface `PackableItem` đã bàn giao), tra cứu thêm thư viện npm bên ngoài. Đây là bộ tài liệu **chất lượng học thuật rất cao** — tự đặt giới hạn cẩn thận, có tư duy Validator-độc-lập-với-thuật-toán-tìm-kiếm rất chuẩn, trích dẫn nguồn thật (arXiv, OR-Tools, Node.js docs). Không phải tài liệu hời hợt — nhưng có các vấn đề thật khi đặt cạnh dự án.

### Vấn đề 1 — Tài liệu dựa trên ảnh chụp CŨ của repo, không biết module `packaging/` đã tồn tại và chạy thật

Tài liệu 1 (mục 1.1) ghi _"Module packaging... **Không có module tương ứng** trong cây `be/src/modules`"_ — **SAI**, module này đã tồn tại đầy đủ (`packaging.controller.ts` 5 route, `packaging.service.ts` có transaction MongoDB thật, `fallback-packaging.util.ts` đang chạy, đã tích hợp Staff Assignment auto-trigger + Notifications `is_abnormal`). Roadmap M0-M8 đề xuất cấu trúc thư mục và schema `PackagingRecommendation` hoàn toàn mới mà không nói rõ là THAY THẾ hay CHẠY SONG SONG với module hiện tại — nếu code thẳng theo roadmap sẽ tạo 2 schema trùng tên, phá vỡ hook auto-assign đã gắn vào `packaging.service.ts` hiện tại. **Cần 1 buổi đối chiếu trực tiếp với bạn cùng nhóm trước khi bắt đầu bất kỳ mốc M0 nào** — quyết định rõ thay thế toàn bộ hay module riêng.

### Vấn đề 2 — ĐÃ SỬA LẠI kết luận (2026-09-12): tập trung ngành hàng thời trang là ĐÚNG, không phải thu hẹp sai

Đánh giá ban đầu (lượt nghiên cứu trước) cho rằng việc 3 tài liệu đóng khung toàn bộ thiết kế quanh "quần áo, giày và phụ kiện thời trang" (hồ sơ gấp/bọc, quy cách túi mailer, xử lý hộp giày riêng) là lệch với đề bài AOFP tổng quát mọi ngành hàng. **User xác nhận shop demo thật đúng là bán giày dép + quần áo** — kết luận cũ SAI, tài liệu đã đi ĐÚNG hướng theo dữ liệu thật sẽ chạy qua hệ thống. Rút lại toàn bộ khuyến nghị "bỏ lớp hồ sơ thời trang, dùng thẳng ProductMaster tổng quát" ở lượt đánh giá trước — **giữ nguyên hướng thiết kế theo ngành hàng thời trang của 3 tài liệu**, đây mới là phù hợp thật.

**Việc cần làm lại cho đúng**: `ProductMaster` (đã có, lấy kích thước/cân nặng trực tiếp từ Lazada `GetProducts`) vẫn là nguồn dữ liệu NỀN — không bỏ. Bổ sung thêm lớp "hồ sơ gấp/bọc" (`packing_profile`) theo đúng đề xuất tài liệu như 1 catalog RIÊNG, liên kết `(platform, shop_id, sku, variation)` → hồ sơ, đúng thiết kế mục 4.1 tài liệu 1 — vì với ngành giày dép/quần áo, kích thước "trải phẳng" từ `ProductMaster` KHÔNG đủ để tính đóng gói thật (tài liệu đã giải thích đúng: không dùng số đo áo trải phẳng, phải đo sau gấp/bọc).

### Vấn đề 3 — Roadmap quá lớn so với thời gian capstone còn lại (giữ nguyên nhận định)

9 mốc (M0→M8), 12 nhãn PR, worker threads, ML ranker — quy mô 1 sản phẩm WMS thương mại, không phải module con trong đồ án còn Dashboard/Shipping Coordinator API chưa xong. **Khuyến nghị**: chỉ làm M0→M4 cho demo thật (Contract input dùng `ProductMaster`+`packing_profile` mới, Validator hình học độc lập — giữ nguyên, phần thiết kế tốt nhất trong tài liệu, Greedy baseline — dùng thư viện có sẵn thay vì tự viết, xem Vấn đề 5). M5 trở đi để "hướng phát triển tương lai" trong báo cáo đồ án.

### Vấn đề 4 — 1 khẳng định SAI về hạ tầng của chính chúng ta (giữ nguyên nhận định)

Tài liệu 1 (mục 7.3) nêu "Docker Compose chưa khai replica set" như rủi ro transaction — **SAI**, chúng ta dùng MongoDB Atlas (luôn là replica set mặc định), bằng chứng `packaging.service.ts` **đã dùng `session.withTransaction()` thành công thật** trong UC-04 approve/adjust. Không cần chuẩn bị gì thêm cho transaction, chỉ cần dùng đúng pattern đã có sẵn.

### Vấn đề 5 — Bỏ sót thư viện JS có sẵn, không cần tự viết Greedy/Multi-start từ đầu

Tài liệu chỉ nhắc `skjolber/3d-bin-container-packing` (Java, không dùng thẳng được) mà không tìm thư viện TS/JS thuần. Tra cứu thêm (npm 2026): **`binpackingjs`** — TypeScript thuần, immutable, cập nhật trong 1 năm gần đây, dựa trên bài báo học thuật thật (Erick Dube et al., "Optimizing Three-Dimensional Bin Packing Through Simulation"), hỗ trợ xoay 3D đầy đủ, nhiều bin. **Khuyến nghị dùng thư viện này làm lõi sinh vị trí đặt (thay M3+M5), giữ nguyên 100% tư duy Validator độc lập (M2) của chính tài liệu để kiểm tra lại kết quả** — cắt giảm đáng kể effort tự viết thuật toán hình học từ đầu, quan trọng cho capstone còn ít thời gian.

### Vấn đề 6 — Chi tiết nhỏ cần lưu ý khi triển khai

- Interface `PackableItem` hiện tại (`sku`+`quantity` gộp) KHÔNG tương thích trực tiếp với `item_key` cho từng đơn vị vật lý riêng mà tài liệu đòi hỏi (2 áo cùng SKU = 2 `item_key` khác nhau) — đây là thay đổi cấu trúc dữ liệu ảnh hưởng cả `warehouse/picking-list` đang dùng chung interface, cần đánh giá kỹ trước khi đổi, không phải chi tiết nhỏ.
- Role đề xuất trong tài liệu 1 (mục 8.3) nói "Route Orders hiện giới hạn Admin" — đã lạc hậu, `GET /orders` vừa mở thêm Store Owner.
- Ranh giới trách nhiệm module (Packing engine hàm thuần, không gọi Mongo/sàn) — thiết kế tốt, nên giữ, khớp tinh thần tách interface hợp đồng đã áp dụng trong dự án.

### Kết luận đối chiếu hệ thống hiện tại

Không phát hiện điểm yếu mới trong chính hệ thống đã xây (schema/code/role guard đã verify nhiều lượt, không có gì cần sửa thêm) — toàn bộ 6 vấn đề trên nằm ở phía 3 tài liệu thuật toán, không phải lỗi trong hệ thống đã có.

## Đã viết 2 tài liệu chính thức phản biện AI Packaging (2026-09-12)

Theo yêu cầu viết feedback chuyên nghiệp cho bạn cùng nhóm (không sửa 3 file gốc) — đã giao 2 file mới:

1. **`FEEDBACK_AI_PACKAGING_REVIEW.md`** — nhận xét phản biện theo văn phong học thuật, cấu trúc mỗi nhận xét gồm 4 phần cố định (Khẳng định gốc / Bằng chứng đối chiếu / Khoảng cách-hệ quả / Khuyến nghị sửa), có trích dẫn code thật kèm số dòng. 7 nhận xét: (1) module `packaging/` đã tồn tại, roadmap chưa biết; (2) `computeFallbackPackaging()` hiện tại là heuristic dung lượng (so tổng thể tích với 3 cỡ thùng cố định), KHÔNG phải 3D bin packing hình học thật — phát hiện quan trọng nhất, ảnh hưởng tính hợp lệ học thuật đồ án; (3) `item_key` theo instance không tương thích ngược với `PackableItem.quantity` (hợp đồng đang dùng chung `warehouse/`); (4) catalog `packing_profile` đề xuất cần làm rõ quan hệ với `ProductMaster` đã có (nền vs lớp phủ); (5) roadmap M0-M8 quá lớn so với capstone còn lại; (6) hiểu sai MongoDB replica set (Atlas đã sẵn sàng); (7) bỏ sót `binpackingjs` (thư viện TS 3D bin packing có sẵn, dựa trên bài báo học thuật thật).
2. **`AI_PACKAGING_TECHNICAL_DIRECTION.md`** — hướng kỹ thuật cụ thể: sơ đồ luồng dữ liệu thật (4 bước `getPackableItemsForGroup()`), thiết kế schema mới `PackingProfile` (bổ sung, không trùng `ProductMaster`), kiến trúc kết hợp `binpackingjs` (lõi sinh candidate) + `validateCandidate()` tự viết (giữ nguyên nguyên tắc Validator độc lập của tài liệu gốc), lý do KHÔNG cần worker thread cho M0-M4 (chi phí IPC có thể lớn hơn thời gian tính toán thật ở quy mô nhỏ), kế hoạch M0-M4 điều chỉnh với PR cụ thể — **`computeFallbackPackaging()` sửa TẠI CHỖ, giữ nguyên signature, không đụng `packaging.service.ts`/route/DTO**.

**Xác nhận lại (2026-09-12)**: user xác nhận field `platform` trong `GET /orders` **đã có sẵn từ trước** (dòng 81, 110 `orders.controller.ts`, map từ `order.platform`, enum 3 giá trị `lazada/tiktok/tiki` — tự động đúng khi thêm sàn mới, không hardcode) — không cần sửa gì, chỉ cần báo lại bạn cùng nhóm.

## Rút gọn mô hình vật liệu đóng gói + xác định category sản phẩm qua Lazada API (13/09/2026)

Tiếp nối mục "Đối chiếu 3 tài liệu thuật toán AI Packaging" ở trên — đã giao bộ 6 file audit riêng (`AI_Packaging_Audit/00_INDEX...md` đến `05_DANH_SACH_NGHIEP_VU_DAY_DU.md`, đối chiếu từng biến/dòng code với 3 tài liệu, liệt kê business case, đề xuất công nghệ). Không copy nguyên văn 6 file vào đây (674 dòng, tài liệu riêng) — chỉ ghi lại 2 quyết định quan trọng phát sinh sau khi bàn thêm với user, CẦN áp dụng khi code thật:

### 1. Mô hình vật liệu bảo vệ RÚT GỌN — không dùng bảng 8 cờ rủi ro như bản đề xuất đầu

Bản đầu của `03_KHO_VAT_TU_DONG_GOI...md` copy nguyên khung "thời trang" rộng của 3 tài liệu gốc (8 field rủi ro: impact/crush/scratch/moisture/static sensitivity, sharp edges, no-stack, kèm 13 loại vật liệu gồm cả trang sức/điện tử). **User chỉ ra đúng: catalog thật chỉ có giày dép + quần áo** (đã xác nhận ở mục trên, dòng 46) — dư thừa không cần thiết. Đã rút gọn còn:

- **2 field thay `is_fragile: boolean`**: `product_category` (`CLOTHING | SHOES`) + `has_rigid_box` (boolean, chỉ có nghĩa khi `product_category=SHOES` — true cho giày đóng hộp cứng, false cho dép/sandal túi mềm nếu catalog có loại này) + giữ `max_stack_load_g` (number|null, đúng ví dụ SH1/T1 đã có sẵn trong `GIAI_THICH_THUAT_TOAN...md`).
- **4 loại vật liệu thay 13 loại**: `FOAM_CORNER` (góc xốp — quan trọng nhất, bảo vệ hộp giày khỏi móp), `CORRUGATED_DIVIDER` (ngăn cách khi ≥2 hộp giày chung 1 thùng), `AIR_PILLOW`/giấy chèn (lấp khoảng trống chống xê dịch — áp dụng cả đơn chỉ có quần áo), `FRAGILE_TAPE` (tem cảnh báo ngoài thùng khi có hộp giày).
- Bảng công thức chọn vật liệu còn đúng **3 dòng điều kiện** (hộp giày đơn lẻ / ≥2 hộp giày chung thùng / chỉ quần áo) thay vì 10 dòng.
- Giữ nguyên nguyên tắc: bảng công thức là dữ liệu tra cứu trong DB (có version, nhân viên kho xác nhận), KHÔNG hard-code if/else như `fallback-packaging.util.ts` đang làm.
- Nếu sau này shop mở thêm ngành hàng (phụ kiện/trang sức) — không cần thiết kế lại, chỉ thêm field/document mới vào đúng 2 bảng trên, xem `03_KHO_VAT_TU...md` mục 5b.

### 2. Nguồn xác định `product_category` — qua Lazada API thật, đã tra cứu tài liệu chính thức (không suy từ tên sản phẩm)

Đã tra cứu trực tiếp doc Lazada Open Platform (`GetProducts`, `GetCategoryTree`) — xác nhận:

- **`GetProducts`** (`GET /products/get`, API **đã dùng sẵn** trong `lazada.adapter.ts` dòng 371) — response thật trả field **`primary_category`** dạng **string** (ví dụ `"10000211"`), nằm ở **cấp `item_id` cha**, KHÔNG lặp lại trong từng phần tử `skus[]`. **Hiện tại interface `LazadaProductRaw` (dòng 146-149, chỉ có `item_id` + `skus`) CHƯA khai field này — bị bỏ rơi ngay từ bước parse, dù response thật của Lazada có trả về.**
- **`GetCategoryTree`** (`GET /category/tree/get`, KHÔNG cần `access_token` — chỉ cần `app_key`/`sign` như mọi request khác, khác `GetProducts` cần `access_token`) — trả cây category phân cấp `{category_id, name, children[], leaf}` (category_id dạng number ở API này, VD `6588`, `7436` — LƯU Ý khác kiểu string ở `primary_category` của `GetProducts`, cần ép kiểu khi so sánh/map). Tham số `language_code` optional, mặc định `en_US` — **nên truyền `"vi_VN"`** để tên category trả về tiếng Việt, dễ cho Admin map thủ công.

**Việc cần làm theo thứ tự** (chưa code, ghi lại kế hoạch):

1. Gọi thử `GetProducts` thật 1 lần (sandbox hoặc shop đã kết nối), xác nhận `primary_category` xuất hiện đúng vị trí/kiểu như tài liệu trước khi sửa code (đúng tinh thần Rule đã có: không tin suông tài liệu, Lazada từng có tiền lệ ghi 1 kiểu nhưng trả thực tế khác — xem comment `package_length` dòng 138 `lazada.adapter.ts`).
2. Thêm `primary_category?: string` vào `LazadaProductRaw`.
3. Gọi `GetCategoryTree` 1 lần (param `language_code=vi_VN`), lưu cây category vào 1 collection nhỏ.
4. Admin map `category_id → CLOTHING | SHOES` **1 lần cho mỗi category_id** qua UI đơn giản (không phải set từng SKU — Lazada chỉ có vài chục category_id cho 2 ngành hàng này).
5. Sửa `product-master.service.ts` (`syncProductsForShop()`, chỗ build `bulkOps`) — lưu `product_category` vào `ProductMaster` bằng cách tra bảng mapping ở bước 4.
6. Nếu bước 1 phát hiện `primary_category` KHÔNG tồn tại/không đáng tin trong response thật — fallback: Admin/Warehouse Staff tự gắn cờ category thủ công khi duyệt SKU mới lần đầu, không phụ thuộc Lazada.

### Đối chiếu với phát hiện cũ về `binpackingjs` (giữ nguyên, không mâu thuẫn)

Mục "Vấn đề 5" ở trên (2026-09-12) đã tìm ra `binpackingjs` (npm, MIT, ~1.068 lượt tải/tuần, port từ `bp3d` Go dựa trên paper thật) làm lõi sinh candidate. Tra cứu lại lần này (13/09) không phủ định phát hiện đó — chỉ bổ sung: các package cùng họ `bp3d` (`bp3d` gốc, các fork `3d-bin-packing`) đều tồn tại thật nhưng lượt dùng thấp hơn `binpackingjs` nhiều — **giữ nguyên khuyến nghị dùng `binpackingjs` làm baseline benchmark**, không đổi.

## Bug xác nhận bằng data thật: đơn `canceled` vẫn được tính vào packaging (13/09/2026)

User gửi trực tiếp JSON thật từ `GET /orders` (7 đơn, shop Lazada `201171264532`) — phát hiện bug thật, không còn là nghi vấn:

**Bằng chứng cụ thể**: group `consolidatedGroupId = "6a9c18292fced4f442f6e1b1"` gồm 3 đơn (`6a9c1ca16b6e447eff8270a4`, `6a9c18296b6e447eff82709d`, `6a9af7843c22e98f3a6105c7`) — **cả 3 đều `status: "canceled"`**, nhưng vẫn giữ nguyên `consolidatedGroupId`, tức vẫn thuộc group đó.

**Root cause**: `order-groups.service.ts`, hàm `getPackableItemsForGroup()` — dòng 160-163:

```ts
const orders = await this.orderModel
  .find({ consolidated_group_id: group._id }) // KHÔNG lọc status
  .select('items platform shop_id')
  .lean();
```

Không lọc bỏ đơn `status: canceled` trước khi lấy `items` đưa vào thuật toán packaging. Nếu 1 group có đơn bị hủy SAU KHI đã gộp (tình huống rất thường gặp — khách/sàn hủy đơn bất kỳ lúc nào), hàng đã hủy vẫn bị tính vào recommendation đóng gói. Đúng điều `AI_3D_PACKAGING_OPTIMIZATION.md` mục 4.1 đã cảnh báo: _"Item bị hủy không được đi vào phương án giao."_

**Cách sửa (nhỏ, độc lập, không đụng thiết kế lớn)**:

```ts
const orders = await this.orderModel
  .find({ consolidated_group_id: group._id, status: { $ne: 'canceled' } })
  .select('items platform shop_id')
  .lean();
```

Cần xử lý thêm case biên: sau khi lọc, nếu group KHÔNG còn đơn nào (toàn bộ đơn trong group đều `canceled` — đúng case group `6a9c18292fced4f442f6e1b1` ở trên, 3/3 đơn hủy hết) → phải trả lỗi nghiệp vụ rõ ràng ("group không còn hàng để đóng"), KHÔNG được tạo ra 1 recommendation rỗng hoặc lỗi ngầm.

**Ghi chú phụ**: đã xác nhận `isConsolidated: false` kèm `consolidatedGroupId` không phải bug — xảy ra đúng khi group chỉ có 1 đơn duy nhất (không có gì để "gộp" cùng), logic hiện tại đánh `true` chỉ khi group có ≥2 đơn — thiết kế đúng, không cần sửa.

Cập nhật trạng thái case 1.6 trong `AI_Packaging_Audit/05_DANH_SACH_NGHIEP_VU_DAY_DU.md` từ "⚠️ cần kiểm tra" sang "❌ xác nhận có bug thật".

## Feedback chi tiết cho bạn cùng nhóm (Package 3) — 2 file mới (13/09/2026)

Đọc lại lần 2 toàn bộ 3 tài liệu thiết kế + soi lại chính xác `packaging.controller.ts`/`packaging.service.ts` thật (bao gồm cả `toResponse()` mapper, DTO, thứ tự transaction/auto-assign) — đã giao 2 file feedback mới cho bạn phụ trách AI Packaging, KHÔNG trùng nội dung với `FEEDBACK_AI_PACKAGING_REVIEW.md`/`AI_PACKAGING_TECHNICAL_DIRECTION.md` đã giao ngày 12/09 (2 file đó vẫn giữ nguyên giá trị tham khảo, không bị thay thế):

1. **`FEEDBACK_GUI_BAN_CUNG_NHOM.md`** — feedback tổng quan: trạng thái hiện tại (`computeFallbackPackaging` là lưới an toàn tạm, không phải lỗi), việc cần làm đúng thứ tự M2→M3→M4, 3 điểm bắt buộc 2 bên bàn trước khi code (đơn vị đo cm/kg vs mm/g, thay thế hay giữ song song module hiện tại, `item_key` cho `PackableItem` — interface dùng chung), và danh sách việc bên mình đang tự làm để tránh trùng.

2. **`HUONG_DI_KY_THUAT_CHI_TIET_AI_PACKAGING.md`** — đào sâu hơn, bám sát TỪNG DÒNG code thật, có 3 phát hiện mới khi soi lại lần 2:
   - **Response API hiện tại là camelCase** (`toResponse()` trong controller, từ 2026-09-10) — **ngược với đề xuất snake_case của roadmap §6.2**, roadmap đã lỗi thời so với code thật ở điểm này; field mới phải map sang camelCase khi thêm vào response, giữ snake_case trong Mongo schema (đúng Rule #11).
   - **`is_abnormal` hiện chỉ log warning, KHÔNG bắn Notification thật** dù module `notifications/` đã có sẵn — gap nhỏ, không bắt buộc sửa cùng đợt M2-M4.
   - **`autoAssign()` chạy NGOÀI transaction, best-effort, SAU khi ghi DB** — thứ tự này phải giữ nguyên khi engine thật khiến `approve()` chạy lâu hơn.
   - Đối chiếu cấu trúc thư mục roadmap đề xuất (`domain/`, `engine/`, `workers/`) với chính Rule "Cấu trúc BÊN TRONG 1 module" của dự án — xác nhận khớp đúng, nhưng phải chuyển `packaging/` từ cấu trúc phẳng (hợp lệ khi module nhỏ) sang cấu trúc subfolder đầy đủ NGAY khi thêm các thư mục này, không phải tùy chọn.
   - Kèm checklist "KHÔNG được đổi" (route, DTO, thứ tự transaction/auto-assign, partial unique index) và timeline M2→M4 có tiêu chí xong đối chiếu code thật, không chỉ tài liệu.

Cả 2 file đều nhấn mạnh: chỉ cần thay **1 dòng gọi hàm duy nhất** trong `packaging.service.ts` (`computeFallbackPackaging(items)` → engine thật) — phần transaction/audit/auto-assign/is_active partial index xung quanh **không cần đụng vào**, đã đúng từ trước.

## Đọc lại kỹ 3 tài liệu thuật toán lần 2 + viết luồng kỹ thuật chi tiết cho bạn cùng nhóm (13/09/2026, cùng ngày)

Đọc lại đầy đủ cả 3 file (không chỉ đối chiếu tổng quan như lượt trước) — phát hiện 1 điểm quan trọng làm **giảm rủi ro** so với feedback đã gửi trước đó, đã sửa lại:

### Sửa lại đề xuất cũ: KHÔNG cần đổi interface `PackableItem` dùng chung

Feedback trước (gửi bạn cùng nhóm) đề xuất thêm `item_key` vào `common/interfaces/packaging.interface.ts` — **rà lại, đây là phương án rủi ro hơn cần thiết**. Lý do: `PackableItem` đang dùng chung cho 2 mục đích khác nhau — `packaging/` cần instance-level, nhưng `warehouse.service.ts` dòng 18 (`PickingListItem extends PackableItem`) TÁI DÙNG đúng `getPackableItemsForGroup()` cho **Picking List** (nhân viên lấy hàng theo SKU+số lượng, không cần biết đơn vị nào ở tọa độ nào). Đổi `PackableItem` sang instance-level sẽ bắt `warehouse/` phải viết lại logic gộp hiển thị — không cần thiết.

**Phương án đúng hơn**: giữ nguyên `PackableItem` dùng chung, thêm 1 hàm `expandToPackingUnits()` MỚI HOÀN TOÀN, chỉ nằm nội bộ trong `packaging/domain/` — "nở" `PackableItem[]` (aggregate) thành `PackingUnit[]` (instance-level, có `item_key = "${sku}#${ordinal}"`) NGAY TRONG packaging, không đụng interface chung, không đụng `warehouse/`. Nhờ vậy bạn cùng nhóm có thể tự làm phần này, **không cần đợi buổi họp thống nhất interface** như đã nói trước — giảm từ 3 việc cần bàn trực tiếp xuống còn 2 (đơn vị đo + có cần route readiness riêng hay không).

### Đã giao thêm 2 file mới cho bạn cùng nhóm

1. **`FEEDBACK_GUI_BAN_CUNG_NHOM.md`** — feedback tổng quan: trạng thái hiện tại, việc cần làm theo M2→M3→M4, 2 công nghệ đề xuất (`piscina`, `binpackingjs` để benchmark), việc mình tự làm bên phần mình để tránh trùng.
2. **`HUONG_DI_KY_THUAT_CHI_TIET.md`** — sơ đồ luồng chính xác map 1-1 vào file/hàm/route THẬT đang chạy (không phải sơ đồ chung chung): (a) luồng as-is hiện tại từng bước có số dòng code, (b) luồng đích chỉ chèn engine vào ĐÚNG 1 điểm trong `packaging.service.ts`, giữ nguyên `computeFallbackPackaging()` làm lưới an toàn thật (không xóa), (c) bảng map tên route roadmap đề xuất → route thật đang chạy (tránh tạo route `/confirm` trùng với `approve()` đã có sẵn đúng ý nghĩa đó), (d) cách mở rộng schema `PackagingRecommendationDoc` bằng field optional, không phá dữ liệu cũ.

**Phát hiện phụ khi đọc lại roadmap §8.1**: `approve()` hiện tại (dòng 139) đã đúng ý nghĩa "confirm" mà roadmap mô tả (_"confirm là thời điểm nhận vật tư cho một lần đóng gói"_) — không cần code thêm endpoint `/confirm` riêng như roadmap đề xuất tên, chỉ cần thêm kiểm tra `input_revision` vào đúng hàm `approve()`/`adjust()` đã có.

## Hợp nhất feedback gửi bạn cùng nhóm thành 1 file duy nhất (13/09/2026, rà soát cuối)

2 file nháp gửi trước (`FEEDBACK_GUI_BAN_CUNG_NHOM.md`, `HUONG_DI_KY_THUAT_CHI_TIET.md`) có nội dung **mâu thuẫn nhau** (bản đầu đề xuất đổi interface `PackableItem`, bản sau tự sửa lại bỏ yêu cầu này) — gửi rời rạc 2 file kiểu vậy dễ gây hiểu lầm cho người nhận. Đã rà soát lại toàn bộ, hợp nhất thành **1 file duy nhất, tự đầy đủ**: `FEEDBACK_KY_THUAT_AI_PACKAGING_FINAL.md` — thay thế hẳn 2 file cũ (đã xóa khỏi outputs). File mới có 12 mục: bối cảnh, sơ đồ luồng hiện tại (trích dẫn đúng dòng code), đối chiếu tài liệu thiết kế, sơ đồ luồng đích, kế hoạch M2→M4, bộ ca nghiệp vụ lọc đúng phạm vi (bỏ phần thuộc về mình), bảng ánh xạ route, schema mở rộng, công nghệ đề xuất, việc cần thống nhất (còn 2, không phải 3), việc mình tự làm, tiêu chí hoàn thành MVP.

Từ nay khi cần gửi feedback/tài liệu kỹ thuật cho người khác đọc độc lập (không phải ghi chú nội bộ), làm đúng 1 file tổng hợp hoàn chỉnh ngay từ đầu, tránh chia nhỏ rồi phải hợp nhất lại sau.

## Rà soát toàn hệ thống BE (không chỉ Packaging) — 5 phát hiện mới (14/09/2026)

Rà lại toàn bộ `be.zip` đối chiếu `API_LIST.md`, `INTEGRATION_GUIDE.md`, `INTEGRATION_GUIDE_ORDERS.md`, `INTEGRATION_GUIDE_FULFILLMENT.md` — giao 3 file mới trong `BE_System_Audit/` (khác thư mục `AI_Packaging_Audit/` đã giao trước, không trùng phạm vi):

1. **`01_DIEM_YEU_TOAN_HE_THONG_THEO_MUC_DO.md`** — 8 điểm yếu toàn hệ thống, xếp mức độ 🔴🟠🟡🟢.
2. **`02_LO_HONG_NGHIEP_VU_LAZADA_CHI_TIET.md`** — rà riêng luồng Lazada theo từng khâu/role/API.
3. **`03_VIEC_CAN_GUI_DOC_LAZADA_DE_CUNG_CO.md`** — 6 mục cần tài liệu/gọi thử API Lazada thật để kiểm chứng.

### Phát hiện quan trọng nhất — 🔴 lỗ hổng bảo mật thật

`PATCH /notifications/:id/read` (`notifications.controller.ts:36`, `notifications.service.ts:120`) — **không có `@CurrentUser()`, không kiểm tra quyền sở hữu** — bất kỳ user nào cũng đánh dấu "đã đọc" được thông báo của người/role khác (kể cả thông báo `critical` gửi Store Owner). Cách sửa: thêm điều kiện `recipient_user_id`/`recipient_role` vào query `findOneAndUpdate`.

### Phát hiện quan trọng nhì — hệ thống hiện chỉ ĐỌC Lazada, không bao giờ GHI NGƯỢC

`lazada.adapter.ts` chỉ có `exchangeCodeForToken`/`refreshAccessToken`/`getOrders`/`getOrderItems`/`getProducts` — **0 method ghi** (`SetStatusToReadyToShip`/`SetInvoiceNumber`/`GetDocument` đều chưa có, kể cả hạ tầng `callSignedPost` cũng chưa tồn tại, chỉ có `callSignedGet`). Khi Shipping Coordinator bấm `ship` trong OptiPackAI, Lazada Seller Center thật **không hề biết** — rủi ro vi phạm SLA "Ready to Ship" thật của sàn, ảnh hưởng account health score thật ngoài đời. Đây là gap nghiệp vụ lớn nhất tìm được trong đợt rà này, đã ghi chi tiết route đề xuất trong file `02`.

### Các phát hiện khác (tóm tắt, xem file để có đầy đủ bằng chứng dòng code)

- `consolidation_key` (SHA-256 của phone+address+city) thiếu `platform` — đã tìm ra tận công thức hash, xác nhận đầy đủ chuỗi nguyên nhân của Điểm yếu #11 đã ghi trước đó.
- Bug đơn `canceled` vẫn bị tính (đã ghi trước) **lan sang cả Warehouse Picking List**, không chỉ Packaging — vì `warehouse.service.ts` tái dùng chung `getPackableItemsForGroup()`.
- Lazada OAuth callback (`marketplace-integration.controller.ts`) thiếu `@Redirect()` — đối chiếu trực tiếp với Google OAuth callback (`auth.controller.ts`, CÓ `@Redirect()` đúng) trong cùng codebase để chứng minh đây là thiếu sót thật, không phải thiết kế có chủ đích.
- `NotificationType.CONNECTION_LOST`/`SYNC_FAILED` đã định nghĩa trong enum nhưng **0 chỗ gọi `notify()`** với 2 loại này — Store Owner không thực sự nhận được cảnh báo "mất kết nối sàn" dù `API_LIST.md` hứa có.
- 2 chỗ tài liệu (`INTEGRATION_GUIDE_FULFILLMENT.md`, `INTEGRATION_GUIDE_ORDERS.md`) có nội dung lỗi thời/sai so với code thật (quy tắc tie-break auto-assign; cảnh báo "chưa test gộp 2 đơn" — đã có bằng chứng thật từ phiên trước xác nhận hoạt động đúng) — chỉ cần sửa doc, không cần sửa code.

## Sửa lại đánh giá "hệ thống không ghi ngược Lazada" — KHÔNG phải gap (14/09/2026, cùng ngày)

User xác nhận: shop demo là mô hình **seller tự lo khâu giao hàng** (không dùng dịch vụ logistics/fulfillment riêng của Lazada) — phạm vi OptiPackAI với Lazada chỉ cần **kéo đơn về (read-only)**, việc cập nhật "Ready to Ship"/mã vận đơn lên chính Lazada là seller tự thao tác tay bên ngoài hệ thống, không thuộc trách nhiệm BE.

Đã sửa lại `BE_System_Audit/02_LO_HONG_NGHIEP_VU_LAZADA_CHI_TIET.md` và `03_VIEC_CAN_GUI_DOC_LAZADA_DE_CUNG_CO.md` — bỏ "không ghi ngược Lazada" khỏi danh sách gap, đánh dấu rõ đây là phạm vi có chủ đích, không phải thiếu sót. 3 route từng đề xuất (`ready-to-ship`/`invoice`/`shipping-label`) và mục tài liệu Lazada Order API ghi (`SetStatusToReadyToShip`/`SetInvoiceNumber`/`GetDocument`) **không còn cần thiết** cho phạm vi dự án — giữ lại trong file kèm ghi chú "đã cân nhắc và loại bỏ có chủ đích" để không ai hiểu nhầm là bị bỏ sót.

> 🔄 **Phạm vi của quyết định "không ghi ngược Lazada" (làm rõ 30/09/2026):** quyết định này chỉ áp dụng cho **trạng thái đơn / vận đơn** (Ready to Ship, mã vận đơn, nhãn) — vẫn giữ nguyên. **Tồn kho khả dụng** là chủ đề khác: đang nghiên cứu ghi ngược lên Lazada, xem mục "🔬 Nghiên cứu đồng bộ tồn kho khả dụng lên Lazada" ở cuối file. Chưa code.

**Các phát hiện khác trong đợt rà soát 14/09 vẫn giữ nguyên, không đổi**: lỗ hổng `markAsRead` không kiểm tra quyền sở hữu (🔴), `consolidation_key` thiếu `platform`, bug đơn `canceled` lan sang Picking List, Lazada callback thiếu `@Redirect()`, Notification `CONNECTION_LOST`/`SYNC_FAILED` chưa kích hoạt — không liên quan gì tới mô hình giao hàng seller-tự-lo, không bị ảnh hưởng bởi lần sửa này.

## Đối chiếu file 03 với sidebar API Lazada thật (15/09/2026) — 1 phát hiện mới quan trọng

User chụp toàn bộ sidebar Lazada Open Platform thật (~30 nhóm API). Đối chiếu với `BE_System_Audit/03_VIEC_CAN_GUI_DOC_LAZADA_DE_CUNG_CO.md`:

- **Sửa tên API sai ở mục 1 (đã crossed-out, không còn cần dùng)**: tên đúng là `ReadyToShip`/`Pack` (không phải `SetStatusToReadyToShip`), nhóm đúng là **"Fulfillment API"** (không phải "Order API"). Xác nhận "DBS" trong tên 4 method `...ForDBS` khớp đúng mô hình đã hỏi lại — shop demo KHÔNG thuộc diện DBS.
- **`GetFailureReasons` không xuất hiện trong "Order API" thật** (8 method thật: `GetDocument, GetMultipleOrderItems, GetOrder, GetOrderItems, GetOrders, GetQVOOrders, OrderCancelValidate, SetInvoiceNumber`) — cần user mở thêm dropdown "Return and Refund API" để xác minh có nằm ở đó không.
- **Không thấy nhóm "Webhook" nào trong toàn bộ sidebar** — củng cố thêm cho khẳng định cũ trong `INTEGRATION_GUIDE_ORDERS.md` (Lazada không có webhook đáng tin cậy), dù chưa dứt điểm 100%.
- **Phát hiện mới, giá trị cao nhất**: `GetMultipleOrderItems` — API batch lấy items nhiều đơn 1 lần gọi. Đối chiếu `orders.service.ts` dòng 95-101: code hiện tại **tuần tự gọi `getOrderItems()` từng đơn một** (N request cho N đơn), có comment tự ghi "chuyển sang xử lý theo lô... khi đã xác nhận cần tăng thông lượng" — `GetMultipleOrderItems` chính là giải pháp cho đúng việc đó, giảm thẳng SỐ REQUEST (không chỉ tăng song song), trực tiếp phục vụ mục tiêu tối ưu tốc độ. Đã thêm thành mục 7 trong file `03`, đề xuất làm luôn không cần chờ "đo tải thật" như comment cũ dự tính.

Đã cập nhật file `03` với 3 sửa đổi trên.

## User gửi tài liệu chính thức Lazada (GetOrder/GetOrders/GetMultipleOrderItems) — giải quyết dứt điểm 2 mục treo + 2 phát hiện mới (15/09/2026)

Đối chiếu với `BE_System_Audit/03_VIEC_CAN_GUI_DOC_LAZADA_DE_CUNG_CO.md` — đã đánh dấu ✅ GIẢI QUYẾT mục 3 và mục 7, thêm 2 phát hiện mới vào `01_DIEM_YEU_TOAN_HE_THONG_THEO_MUC_DO.md` (O4, O5, O6):

### O4 — Xác nhận 19 giá trị status thật của Lazada (chỉ có 9 giá trị trong code hiện tại)

Nguồn: bảng mã lỗi chính thức `GetOrders` ("Invalid status filter") liệt kê nguyên văn 19 giá trị: `unpaid, pending, packed, canceled, ready_to_ship, delivered, returned, shipped, failed, topack, toship, lost, lost_by_3pl, damaged_by_3pl, failed_delivery, shipped_back, shipped_back_success, shipped_back_failed, package_scrapped`. **10 giá trị hoàn toàn chưa xử lý** trong `order-status.enum.ts`/`mapLazadaStatus()` — đặc biệt nhóm `lost*`/`damaged_by_3pl`/`shipped_back*`/`package_scrapped` (sự cố logistics thật) hiện bị âm thầm map về `PENDING`, che giấu vấn đề thật thay vì báo động.

### O5 — `mapLazadaStatus(raw.statuses[0] ?? 'pending')` lấy phần tử đầu mảng `statuses[]` làm đại diện cho cả đơn

`statuses[]` (theo tài liệu chính thức) là _"mảng các trạng thái DUY NHẤT của các item trong đơn"_ — không đảm bảo phần tử đầu là trạng thái quan trọng nhất. Đơn có 2 item (1 `delivered` + 1 `shipped_back`) có thể bị hiển thị sai thành `delivered` toàn bộ.

### O6 — Phát hiện mới: Lazada có luồng "chờ seller xác nhận hủy đơn" chưa được đọc/dùng

Response `GetOrder`/`GetOrders` có sẵn `need_cancel_confirm`/`is_cancel_pending`/`cancel_trigger_time`/`reverse_order_id` — dữ liệu ĐÃ CÓ SẴN trong response đang đọc (không cần API mới, không phải việc ghi ngược đã loại khỏi phạm vi) nhưng chưa được lưu/dùng. Khi buyer yêu cầu hủy, seller có 1 cửa sổ thời gian (`cancel_trigger_time`) phải phản hồi trước khi tự động hủy — nên lưu field + bắn Notification cho Store Owner, tái dùng cơ chế Notification đã có.

### File `03` — mục 3, 7 đã ✅ giải quyết; chỉ còn mục 2 (`GetFailureReasons`, cần mở "Return and Refund API") và mục 4 (rate limit, không nằm trong trang API cụ thể) là thật sự cần thêm tài liệu.

## PHÁT HIỆN LỚN NHẤT TOÀN BỘ ĐỢT AUDIT: Lazada CÓ webhook thật — đảo ngược giả định nền tảng của hệ thống (15/09/2026)

User tìm và gửi tài liệu "Webhook API" chính thức của Lazada — **6 loại webhook thật tồn tại** (Trade Order Notification, Product Update/Edited/Deleted, Category Update, Fulfillment Order Update, **Authorization Token Expiration Alert**), `Auth Required: true` (trừ Category Update), retry 12 lần/30 phút.

**Điều này đảo ngược giả định nền tảng mà toàn bộ module `orders/`/`marketplace-integration/` đang dựa vào**: `lazada.adapter.ts` dòng 469-479 (`verifyWebhookSignature()`) cố tình để trống, comment nguyên văn _"Lazada chưa xác nhận cơ chế webhook chính thức"_ — **SAI**, đã xác nhận. `orders.service.ts` dòng 51-52 và `lazada-order-sync.scheduler.ts` cũng dựa trên cùng giả định này để chọn polling 10 phút.

**Điểm mấu chốt — hạ tầng ĐÃ CÓ SẴN, không cần xây từ đầu**: `processed_webhook_events` schema (`common/schemas/`) + interface `verifyWebhookSignature()` trên `MarketplaceAdapter` đã tồn tại, đã dùng thật cho `tiktok-shop.adapter.ts`/`tiki.adapter.ts` — chỉ riêng Lazada bị tắt vì niềm tin sai. Chỉ cần: (1) tìm cách Lazada ký request webhook (chưa có trong tài liệu đã gửi), (2) tạo `LazadaWebhookController` (chưa có route nhận webhook cho platform nào), (3) xác nhận cách đăng ký subscribe, (4) ưu tiên xử lý `msg_type: 0` (đơn đổi trạng thái — có thể giảm độ trễ từ tối đa 10 phút xuống gần tức thời) và `msg_type: 8` (token sắp hết hạn — báo trước 48h, giải quyết tốt hơn hẳn gap O3 đã ghi trước đó). Giữ nguyên cron 10 phút làm lưới an toàn, không tắt hẳn — cùng tinh thần giữ `computeFallbackPackaging()` làm lưới an toàn cho AI Packaging.

Đã cập nhật cả 3 file: `03` mục 6 (đảo ngược kết luận), `02` (thêm mục "Phát hiện MỚI quan trọng nhất" ở đầu file), `01` mục O3 (đổi "Cách sửa" ưu tiên webhook thay vì chỉ nối `notify()` phản ứng).

**Việc còn thiếu để implement được**: cách Lazada ký webhook payload (HMAC? header nào?) và cách đăng ký subscribe — chưa có trong tài liệu đã gửi, cần tìm thêm phần "Security"/"Getting Started" của mục Webhook API.

## Tự rà lại toàn bộ, phát hiện 1 chỗ mình kết luận sai — đối chiếu thiếu với ghi chú có sẵn (15/09/2026)

User hỏi đã cập nhật hết mọi thứ vào `CLAUDE.md` chưa — nhân dịp rà lại, phát hiện: mục "Package 4 khung sườn" **đã có sẵn trong `CLAUDE.md` từ trước** (quyết định từ giảng viên hướng dẫn: Lazada không có sandbox, mọi lệnh ghi chạm production thật, nên các method `readyToShip`/`packOrders`/`printAWB`/nhóm DBS **vẫn nên code đủ trong `LazadaAdapter` theo spec, chỉ không invoke trong luồng demo**) — nhưng ở 2 lượt cập nhật `BE_System_Audit/02` và `03` trước đó (14/09, 15/09), mình lại kết luận theo hướng khác: "seller tự giao hàng nên các API này KHÔNG CẦN" — không sai hoàn toàn nhưng lệch trọng tâm (lý do thật là rủi ro không-sandbox, không phải chọn mô hình vận hành; và kế hoạch là "code nhưng không gọi", không phải "không cần code").

**Đã sửa lại cả 2 file** (`02` mục đầu + Khâu 5 + bảng route đề xuất, `03` mục 1) — đổi đúng theo tinh thần: vẫn implement đủ method trong Adapter, chỉ không tạo route/không invoke trong luồng demo.

**Bài học rút ra**: trước khi kết luận 1 quyết định phạm vi là "đúng"/"đủ", cần chủ động grep/đọc lại `CLAUDE.md` xem đã có ghi chú liên quan từ trước chưa, không chỉ dựa vào lời user xác nhận trong chat (lời user xác nhận "seller tự giao hàng" là đúng sự thật nghiệp vụ, nhưng không đồng nghĩa đó là toàn bộ lý do kỹ thuật/kế hoạch đã chốt — 2 việc khác nhau, cần đối chiếu cả 2 nguồn).

## Xác nhận: đã rà soát toàn bộ nội dung trao đổi, không còn phát hiện nào bị bỏ sót ngoài Lazada docs

Toàn bộ tài liệu/ảnh Lazada đã gửi trong phiên (GetOrder, GetOrders, GetMultipleOrderItems, GetCategoryTree, Webhook API, sidebar đầy đủ ~30 nhóm API) đều đã có mục tương ứng trong `CLAUDE.md` (các mục từ "Rút gọn mô hình vật liệu..." tới "PHÁT HIỆN LỚN NHẤT... webhook"), đồng thời phản ánh đầy đủ trong 2 file `BE_System_Audit/02` và `03` (không copy nguyên văn field-list vào `CLAUDE.md` — bảng chi tiết đầy đủ nằm trong 2 file đó, `CLAUDE.md` chỉ giữ phần tóm tắt + số dòng code liên quan, đúng nguyên tắc đã áp dụng xuyên suốt để tránh phình file).

## Giải thích chi tiết + file kế hoạch riêng cho việc implement Fulfillment API an toàn (15/09/2026)

User chưa hiểu tại sao vẫn nên code đủ các method Fulfillment API dù có rủi ro khi gọi thật (thay vì tự làm API giả demo) — đã giải thích: **viết code ≠ gọi API thật**. Rủi ro chỉ xảy ra khi có 1 route/cron/handler THẬT SỰ gọi tới hàm đó lúc app đang chạy — chỉ cần không có đường dẫn thực thi nào như vậy, việc code đầy đủ hoàn toàn an toàn (test bằng mock HTTP client, không chạm mạng thật). Không nên làm "API giả" vì sẽ phải viết lại từ đầu khi lên production thật, và không thể hiện đúng năng lực code theo spec thật.

Đã tạo file mới **`BE_System_Audit/04_KE_HOACH_FULFILLMENT_API_AN_TOAN.md`** — bảng xếp hạng rủi ro thấp→cao nếu lỡ bị gọi thật (🟢 `GetShipmentProvider`/`PrintAWB` chỉ đọc → 🟡 `SetInvoiceNumber`/`RecreatePackage` ghi dữ liệu chưa kích hoạt vật lý → 🔴 `Pack`/`ReadyToShip` kích hoạt điều phối shipper thật, Return/Refund API kích hoạt hoàn tiền thật — cao nhất), kèm 4 bước cụ thể: (1) code đủ method + JSDoc cảnh báo, (2) thêm "cầu dao" kỹ thuật `LAZADA_WRITE_APIS_ENABLED` chặn mặc định (không chỉ dựa vào "không viết code gọi nó"), (3) grep xác nhận không route nào wire vào luồng thật, (4) test bằng mock HTTP client. Kèm checklist an toàn cuối file.

## Tạo file tổng hợp duy nhất cho toàn bộ BE_System_Audit (15/09/2026)

Theo yêu cầu — gộp 4 file (`01`-`04`) thành **1 file tổng hợp**: `BE_System_Audit/00_TONG_HOP_VIEC_CAN_LAM_VA_NGHIEP_VU_CON_YEU.md`. Cấu trúc: Phần A — checklist việc cần làm xếp theo mức độ (A1 bảo mật → A2 dữ liệu/nghiệp vụ → A3 tốc độ/webhook → A4 Fulfillment API an toàn → A5 chỉ sửa doc → A6 cần tìm thêm tài liệu Lazada); Phần B — nghiệp vụ còn yếu/thiếu theo từng khâu (connect/sync/consolidation/packaging/ship) + theo role; Phần C — trỏ về 4 file gốc để xem bằng chứng chi tiết.

Dùng đúng bản MỚI NHẤT của cả 4 file (có O4/O5/O6, webhook, đã sửa lại phần Fulfillment API "code đủ không invoke demo") — không dùng bản user re-upload (là bản cũ hơn, trước khi sửa Fulfillment API và thêm webhook). File này là điểm vào (entry point) mới cho `BE_System_Audit/`, nên đọc trước, chỉ mở 4 file con khi cần bằng chứng chi tiết cho 1 mục cụ thể.

## Giải thích lại kỹ càng + cập nhật đầy đủ 3 file với phát hiện SOF (15/09/2026, cùng ngày)

Đã giải thích lại chi tiết trong chat (không lặp ở đây): mô phỏng từng bước "shipper tới lấy hàng không có thì sao" (kết thúc bằng trạng thái `INFO_ST_DOMESTIC_PICKUP_SIGN_IN_FAILURE`, ảnh hưởng thật lên tài khoản Lazada KYC thật); làm rõ "code đủ (A) vs chỉ TODO (B)" là **lựa chọn của nhóm, không phải quy tắc bắt buộc** — quyết định A trước đó là ý giảng viên hướng dẫn, không phải best-practice tuyệt đối; giải thích ví dụ đời thường cho "ký webhook" (con dấu trên thư) và "subscribe webhook" (đăng ký nhận bản tin, làm ở Console quản lý app, không phải trang tài liệu API).

**2 phát hiện mới quan trọng, đã cập nhật vào cả 3 file (`00`, `03`, `04`)**:

1. **`GetFailureReasons` xác nhận DỨT ĐIỂM không tồn tại** — ảnh "Return and Refund API" đủ 8 method thật, không có method này. Đề xuất thay thế: đọc trực tiếp response lỗi của `GetOrders`/`GetOrder` thay vì gọi API riêng.
2. **Phát hiện SOF (Seller Own Fleet)** — bảng lỗi `GetDocument` xác nhận nguyên văn: _"Printing AWB is not supported for... SOF/DBS orders"_, _"SOF/DBS type orders do not support the call of this API... Lazada does not provide Shipping Label"_. Đây khớp đúng mô hình shop demo — và là **Lazada tự xác nhận không hỗ trợ**, không phải mình chủ động né. Đã bỏ hẳn `printAWB()`/`getDocument()` khỏi kế hoạch code (khác các method khác vẫn "code đủ không invoke", 2 method này không cần code luôn). Đồng thời xác nhận thêm tên thật 3 method rủi ro cao nhất trong Return/Refund API: `InitReverseOrderCancelDecide`, `ReverseOrderOnlyRefundDecide`, `ReverseOrderReturnUpdate`.

Cả 3 file audit đã cập nhật đầy đủ, đồng bộ ra `outputs/BE_System_Audit/`.

## Quyết định: bỏ hẳn kế hoạch implement Fulfillment API (không làm cả phương án A) — 15/09/2026

> 🔄 **ĐÃ THAY ĐỔI so với quyết định này (02/10/2026):** trong buổi meet, cô yêu cầu thêm nút cho Packaging Staff **xác nhận "đã đóng gói" lên Lazada**. FE không giữ `access_token` của shop nên BE phải gọi. Ánh xạ sang Fulfillment API **`Pack`** (có thể kèm `ReadyToShip`). Quyết định hoãn ngày 15/09 không còn hiệu lực với `Pack`/`GetShipmentProvider`/`ReadyToShip`; `PrintAWB` vẫn không dùng cho shop SOF. Tài liệu đầy đủ 4 API: mục "🔬 Nghiên cứu Lazada Fulfillment API — Pack / ReadyToShip / GetShipmentProvider / PrintAWB (02/10/2026)" ở cuối file. **Pack đã code ngày 02/10/2026** (nhật ký "📦 Nút pack báo đã đóng gói lên Lazada").

User quyết định: **không cần code các method Fulfillment API** (`Pack`/`ReadyToShip`/`SetInvoiceNumber`/`RecreatePackage`/`GetShipmentProvider`) nữa, kể cả theo phương án A ("code đủ, không invoke") đã đề xuất trong `04_KE_HOACH_FULFILLMENT_API_AN_TOAN.md` — để dành làm sau, không nằm trong phạm vi hiện tại. File `04` **vẫn giữ nguyên** trong `BE_System_Audit/` làm tài liệu tham khảo nếu sau này cần quay lại (không xóa), nhưng không còn là việc cần làm ngay — mục A4 trong `00_TONG_HOP...md` cần hiểu là "đã hoãn", không phải "đang làm".

`GetDocument`/`PrintAWB` càng không cần bàn tới nữa — đã xác nhận Lazada tự chặn API này cho đơn SOF (Seller Own Fleet), đúng mô hình shop demo.

**Việc tiếp theo đã xác nhận**: đọc tài liệu Lazada mục **Security Center → "Reverse API System Signature"** (không phải "Security Measures"/"Lazada Partner Application Security Guidelines"/"Security Review Process" — 3 mục đó không đúng trọng tâm) để biết cách Lazada ký request gửi webhook về server, phục vụ code `verifyWebhookSignature()` thật cho Lazada.

## Xác nhận thuật toán ký webhook Lazada (15/09/2026, cùng ngày)

Đã đọc trang "Reverse API System Signature" — xác nhận đầy đủ thuật toán `http_sign`: nằm trong **query string** (không phải header), thuật toán = sort tham số theo alphabet → ghép chuỗi `uri + key1value1 + key2value2 + ... + body` → HMAC-SHA256 bằng `app_secret` → hex hóa viết HOA. **Cùng cấu trúc với thuật toán ký outbound đã có sẵn** (`callSignedGet` trong `lazada.adapter.ts`) — `verifyWebhookSignature()` cho Lazada có thể tái dùng phần lớn code, chỉ đổi chiều (tính lại rồi so sánh, thay vì tính rồi gắn vào request gửi đi).

Còn thiếu đúng 1 việc để code webhook đầy đủ: cách đăng ký subscribe — nằm ở mục "Push Mechanism(WebHook) Application" trong sidebar tài liệu Lazada (khác "Security Center" vừa đọc xong).

Đã cập nhật `BE_System_Audit/00` và `03`.

## Đọc "Lazada Push Mechanism" (tài liệu chuyên biệt, chính xác nhất) — 3 phát hiện lớn, 1 có thể chặn cả kế hoạch webhook (15/09/2026)

### 🔴 Rào cản CA certificate — cần quyết định TRƯỚC KHI code webhook

Tài liệu chính thức: callback URL phải HTTPS với chứng chỉ **OV hoặc EV — DV KHÔNG được chấp nhận** (self-signed càng không). Domain ngrok hiện dùng cho OAuth callback nhiều khả năng chỉ có chứng chỉ DV (miễn phí) — **cần kiểm tra lại trước khi đầu tư code webhook**, vì nếu không đạt, bước "Verify URL" đầu tiên trong App Console sẽ fail ngay. Đây là rào cản thực tế, không phải lý thuyết — đưa lên đầu file `03` mục 6 và thành "Bước 0 bắt buộc" trong `00`.

### Thuật toán ký ĐÚNG — khác hẳn bản đã ghi trước đó (từ "Reverse API System Signature")

Tài liệu "Lazada Push Mechanism" (chuyên biệt cho webhook order, có ví dụ khớp payload thật) mô tả thuật toán khác: chữ ký nằm trong **header `Authorization`** (không phải query string), công thức `HEX_LOWERCASE(HMAC_SHA256(app_key + message_body_thô, app_secret))` — đơn giản hơn nhiều (không sort param, không cần uri) nhưng **không tái dùng trực tiếp được code `callSignedGet` outbound** (khác cấu trúc) — cần viết hàm `verifyWebhookSignature()` riêng cho Lazada.

### Xác nhận cách đăng ký subscribe — xong

Qua tab **"Message Service"** trong App Console (`open.lazada.com`) — điền URL → Verify → chọn loại message → Save. Không qua API riêng.

### Lưu ý phụ quan trọng

FAQ tài liệu (07/2024) ghi _"Only order message is online now... under developing"_ cho các loại khác — cần tự verify trong màn hình Message Service xem `msg_type: 8` (Token Expiration, giá trị cao nhất) có chọn được thật không, đừng giả định. Xác nhận thêm: ack 200 trong 500ms, retry 12 lần/30 phút, message có thể trùng ("at least once" — khớp đúng thiết kế `processed_webhook_events` đã có), và Lazada CHÍNH THỨC khuyến nghị chiến lược "giữ polling, thêm dần push, giảm dần polling sau" — đúng đề xuất đã đưa ra trước đó, nay có nguồn chính thức xác nhận.

Đã cập nhật đầy đủ `BE_System_Audit/00` và `03`.

## Quyết định: hoãn webhook tới lúc deploy có domain thật (15/09/2026, cùng ngày)

User quyết định để dành kế hoạch webhook Lazada tới giai đoạn chuẩn bị deploy (có domain/URL riêng) — hợp lý vì rào cản chính (cần chứng chỉ OV/EV) tự động hết vấn đề khi đó có domain production thật, không cần xử lý riêng cho giai đoạn demo/dev hiện tại. Đã cập nhật `00_TONG_HOP...md` — tách webhook ra khỏi A3 (việc nên làm sớm), tạo mục mới A4b "ĐÃ HOÃN" đặt cạnh A4 (Fulfillment API cũng đang hoãn) cho nhất quán. Toàn bộ nghiên cứu đã làm (thuật toán ký, cách subscribe, cơ chế ack/retry) giữ nguyên trong `03` mục 6, đọc lại khi tới lúc deploy, không mất công nghiên cứu lại. 3 việc còn lại trong A3 (Redirect callback, GetMultipleOrderItems, notify SYNC_FAILED) không bị ảnh hưởng, vẫn làm được ngay.

## Bắt đầu code thật các fix đã audit — Batch 1 (15/09/2026)

Theo yêu cầu, bắt đầu code thật (không chỉ audit) các mục A1-A3 trong `00_TONG_HOP...md`, làm từng phần, dừng hỏi ý kiến giữa chừng. **Batch 1 đã xong 4 mục, đánh dấu ✅ trong `00`:**

1. **A1 — `notifications markAsRead` thiếu kiểm tra sở hữu**: `notifications.controller.ts` thêm `@CurrentUser()`, `notifications.service.ts` đổi `findByIdAndUpdate` → `findOneAndUpdate` kèm điều kiện `$or:[{recipient_user_id},{recipient_role}]`, không khớp → 404 `NOTI_NOT_FOUND` (giữ nguyên mã lỗi cũ, không tạo mã mới — không khớp do sai ID hay do không phải chủ sở hữu đều trả về y hệt nhau, không lộ thông tin). Đã viết `notifications.service.spec.ts` mới (trước đây module này chưa có spec nào).
2. **T1 — Lazada OAuth callback thiếu `@Redirect()`**: đã sửa theo ĐÚNG spec bạn cùng nhóm chốt (ảnh chụp) — redirect về `http://localhost:5173/marketplace-oauth-success`, thành công kèm `shopId`/`shopName`/`connected=true`, thất bại kèm `error=<mã lỗi MKT_*>`. Thêm `SERVER_ERROR: 'MKT_SERVER_ERROR'` vào `marketplace-integration.errors.ts` làm fallback (trước đây không có mã fallback nào, khác Google OAuth đã có `server_error`). Config key mới: `CLIENT_MARKETPLACE_REDIRECT_CALLBACK` (mặc định đúng URL trên nếu chưa set env).
3. **A2#1 — `consolidation_key` thiếu `platform`**: `computeConsolidationKey()` thêm tham số `platform` (bắt buộc, đứng đầu), `lazada-order.mapper.ts` truyền `MarketplacePlatform.LAZADA`. **Lưu ý quan trọng chưa xử lý**: đây là thay đổi công thức hash — các `Order` ĐÃ CÓ trong DB (đơn Lazada thật đã sync trước đó) vẫn giữ `consolidation_key` theo công thức CŨ (không có platform), nên đơn MỚI sync sau khi deploy fix này sẽ KHÔNG match được với các group cũ của cùng khách hàng (băm ra key khác nhau) — cần quyết định có viết migration script tính lại `consolidation_key` cho dữ liệu cũ hay chấp nhận (dữ liệu demo, ảnh hưởng thấp).
4. **A2#2 — bug đơn `canceled` vẫn bị tính**: `getPackableItemsForGroup()` thêm `status: {$ne: OrderStatus.CANCELED}` vào query, thêm case biên (toàn bộ đơn trong group đã hủy → throw `ORD_GROUP_ALL_ORDERS_CANCELED` thay vì trả `items` rỗng âm thầm). Thêm mã lỗi mới vào `order-groups.errors.ts`. Viết spec test riêng (`order-groups.service.getPackableItemsForGroup.spec.ts`, module này trước đây chưa có spec nào dù đụng Order Consolidation — đúng yêu cầu bắt buộc trong CLAUDE.md).

**Còn lại trong A2 (chưa làm, có câu hỏi thiết kế thật cần bạn xác nhận trước khi code tiếp)**: 10 giá trị status thiếu (O4), cách tính status đại diện Order thay `statuses[0]` (O5), luồng lưu+báo "chờ xác nhận hủy đơn" (O6). Còn A3: `GetMultipleOrderItems` batch, `notify(SYNC_FAILED)`.

**Việc còn nợ**: kiểm tra 4 file Integration Guide (`INTEGRATION_GUIDE.md`, `INTEGRATION_GUIDE_ORDERS.md`, `INTEGRATION_GUIDE_FULFILLMENT.md`, `API_LIST.md`) xem có cần cập nhật theo các fix này không — chưa làm, sẽ làm sau khi xong toàn bộ code.

## Batch 2 (15/09/2026, cùng ngày) — hoàn thành nốt A2 (O4, O5, O6)

**Phát hiện quan trọng trước khi code**: enum `OrderStatus` **đã có sẵn đủ 19 giá trị** từ trước (comment "2026-09-10") — chỉ riêng `mapLazadaStatus()` chưa nối vào, vẫn rơi `default→PENDING`. Đảo ngược đề xuất "gộp về 1 giá trị EXCEPTION" đã đưa trước đó — hoàn thiện theo hướng TÁCH RIÊNG (khớp đúng phần đã có sẵn, ít việc hơn gộp).

1. **O4 — 10 case còn thiếu**: thêm đủ vào `mapLazadaStatus()` (`lazada-order.mapper.ts`), map 1:1 vào đúng enum values đã có sẵn.
2. **O5 — `statuses[0]` không đáng tin**: thêm `pickRepresentativeStatus()` — ưu tiên trạng thái "xấu nhất" theo bảng `STATUS_PRIORITY` (sự cố > hủy/hoàn > luồng bình thường tính theo tiến độ) thay vì lấy mù phần tử đầu mảng.
3. **O6 — luồng chờ xác nhận hủy đơn**: thêm 4 field vào `LazadaOrderRaw` (adapter) + `Order` schema + `MappedOrderFields` (`need_cancel_confirm`, `is_cancel_pending`, `cancel_trigger_time`, `reverse_order_id`). Thêm `NotificationType.CANCEL_CONFIRMATION_REQUIRED` mới (ban đầu định dùng nhầm `SYNC_FAILED`, đã tự sửa lại đúng ý nghĩa). `orders.service.ts` inject thêm `NotificationsService`, đọc trạng thái TRƯỚC khi update để chỉ bắn đúng 1 lần lúc chuyển false→true (tránh spam mỗi 10 phút cron chạy lại), báo cả Store Owner lẫn Admin, mức `critical`.

Viết thêm `lazada-order.mapper.spec.ts` (module này trước đây chưa có spec nào dù đụng Order Consolidation, đúng yêu cầu bắt buộc CLAUDE.md) — test đủ 19 giá trị status + test đúng ví dụ "delivered + shipped_back → phải ra shipped_back" đã nêu trong audit.

**Viết thêm `scripts/migrate-consolidation-key.ts`** — tính lại `consolidation_key` cho `Order` đã có trong DB (đọc field `recipient` đã lưu sẵn, không cần gọi lại Lazada), chạy 1 lần sau khi deploy, trước lần cron sync kế tiếp.

Còn lại: **A3** (`GetMultipleOrderItems` batch, `notify(SYNC_FAILED)` cho lỗi sync thường), sau đó rà 4 file Integration Guide.

## Batch 3 (15/09/2026, cùng ngày) — mở rộng filter + sửa lint script migration

**Phát sinh khi giải thích lại luồng status cho user**: bug `canceled` đã fix trước đó chỉ lọc đúng `CANCELED`, chưa lọc nhóm "sự cố logistics thật" (`LOST`/`DAMAGED_BY_3PL`/`PACKAGE_SCRAPPED`...) — hàng báo mất/hỏng vẫn xuất hiện trong Picking List. User xác nhận: nhóm sự cố này khó xảy ra trong demo nhưng vẫn muốn lọc luôn cho đúng.

**Đã làm**: thêm `NOT_PACKABLE_ORDER_STATUSES` (`order-status.enum.ts`, cùng chỗ với `UNFULFILLED_ORDER_STATUSES` đã có, theo đúng convention cũ) = CANCELED + FAILED + LOST + LOST_BY_3PL + DAMAGED_BY_3PL + FAILED_DELIVERY + SHIPPED_BACK_FAILED + PACKAGE_SCRAPPED. Đổi query `getPackableItemsForGroup()` từ `$ne: CANCELED` sang `$nin: NOT_PACKABLE_ORDER_STATUSES`. **Cố ý CHƯA gộp** `RETURNED`/`SHIPPED_BACK`/`SHIPPED_BACK_SUCCESS` vào danh sách này — case hoàn hàng cần xem xét riêng, tránh mở rộng phạm vi fix ngoài yêu cầu, đã báo user biết. Cập nhật lại spec test cho khớp query mới.

**Sửa lỗi ESLint** trong `scripts/migrate-consolidation-key.ts` — `order.recipient?.phone` bị báo "Unnecessary optional chain on a non-nullish value" vì `recipient` là field `required: true` trên schema (TypeScript biết chắc không null) — bỏ `?.` thành `order.recipient.phone`.

## Batch 4 (16/09/2026) — hoàn thành A3, TOÀN BỘ A1-A3 đã xong

1. **`GetMultipleOrderItems` batch**: thêm method vào `lazada.adapter.ts` (trả `Map<order_id, items[]>` để tra O(1)), `orders.service.ts` đổi sang chia lô ≤50 đơn/lần gọi. **Có fallback**: nếu 1 lô batch lỗi, fallback về gọi tuần tự từng đơn CHO RIÊNG lô đó (giữ nguyên độ an toàn cũ — 1 đơn lỗi không hỏng đơn khác — không đánh đổi robustness lấy tốc độ).
2. **`notify(SYNC_FAILED)` cho lỗi sync cron**: thêm vào `LazadaOrderSyncScheduler` (không phải `orders.service.ts` — vì controller gọi tay đã tự thấy lỗi ngay trong response, không cần thêm Notification; chỉ cron tự động chạy nền mới cần báo chủ động). Cơ chế chống spam: `Map<shop_id, lastNotifiedAt>` trong bộ nhớ, cooldown **20 phút** (user điều chỉnh từ đề xuất ban đầu 1 giờ). Mức `warning` (khác `critical` của cancel-confirm — không có hạn chót cứng).

Viết `lazada-order-sync.scheduler.spec.ts` mới (dùng `jest.useFakeTimers()` test đúng 3 case: lần đầu bắn ngay, lặp lại trong cooldown không bắn, qua cooldown bắn lại).

**TOÀN BỘ A1, A2, A3 trong `00_TONG_HOP...md` đã hoàn thành.** Còn lại: A5 (sửa 2 câu trong Integration Guide, không đụng code) + rà 4 file Integration Guide xem có cần cập nhật gì thêm theo các fix đã làm không.

## 2 lỗi ESLint thật gặp phải + cách sửa — ghi lại để tránh lặp lại (16/09/2026)

Sau khi thêm các file test mới (batch 4), `npm run lint` báo 2 lỗi thật (không phải nghi ngờ, có log đầy đủ từ user):

1. **`notifications.service.spec.ts`** — import `NotificationType` nhưng không dùng tới (import thừa từ lúc soạn test, quên xóa). **Cách sửa**: xóa dòng import không dùng.
2. **`order-groups.service.getPackableItemsForGroup.spec.ts`** — import `AppException` chỉ để ép kiểu (`as Partial<AppException>`), không có chỗ nào dùng làm giá trị runtime thật trong file này. **Thử `import type { AppException }` KHÔNG giải quyết được** — ESLint config của dự án này không công nhận cách dùng "chỉ trong vị trí generic" (`Partial<AppException>`) là "đã dùng", dù đó đúng là type-only usage hợp lệ về mặt TypeScript. **Cách sửa chắc ăn**: bỏ hẳn phần ép kiểu `as Partial<AppException>` lẫn import — `toMatchObject` của Jest không cần ép kiểu này để chạy đúng.

**Quy tắc rút ra cho các file test sau này trong dự án này**: chỉ import `AppException` (hay bất kỳ type nào tương tự) nếu có **ít nhất 1 chỗ dùng làm giá trị runtime thật** trong file đó (VD `toBeInstanceOf(AppException)`, `expect(error).toBeInstanceOf(X)`) — nếu chỉ cần ép kiểu cho TypeScript đọc hiểu, bỏ hẳn phần ép kiểu đó thay vì cố giữ lại bằng `import type`.

## Hạ tầng triển khai — Docker, Kubernetes, CI/CD (16/09/2026)

Trước đợt này hạ tầng chỉ có 3 file rời rạc và **có lỗi thật chặn deploy**, không phải chỉ thiếu tiện nghi. Đã sửa/bổ sung, chi tiết vận hành nằm ở [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) + [`k8s/README.md`](k8s/README.md) (không copy nguyên văn vào đây, tránh phình file).

### 1. `be/Dockerfile` cũ KHÔNG build được — lỗi thật, không phải chỉnh cho đẹp

Bản cũ `COPY package*.json ./` rồi `npm ci` với build context là `be/` — nhưng repo là **npm workspaces**, `be/package-lock.json` **không tồn tại** (chỉ có lockfile ở gốc), nên `npm ci` luôn fail. Nghĩa là image backend chưa từng build được kể từ khi chuyển sang workspaces.

**Cách sửa đã chốt, áp dụng cho CẢ 3 Dockerfile**: build context là **THƯ MỤC GỐC repo**, cài bằng `npm ci --workspace <ws> --include-workspace-root --ignore-scripts`. 2 chi tiết bắt buộc, đã kiểm chứng bằng cách chạy thật:

- `--ignore-scripts` + `HUSKY=0`: script `"prepare": "husky"` ở root package.json sẽ fail trong image (husky là devDependency của môi trường dev). Không có cờ này thì `npm ci --omit=dev` chết ngay.
- npm hoist **toàn bộ** package lên `/repo/node_modules`, KHÔNG sinh `be/node_modules` riêng (đã verify) → image runtime phải `WORKDIR /repo/be` để Node resolve ngược lên gốc. Entry đúng là `dist/src/main.js` (không phải `dist/main.js`) vì tsconfig gồm cả `scripts/` ngoài `src/`.
- Thiếu workspace nào trong `package.json` mà thư mục chưa tồn tại (`storefront/` hiện chưa commit) thì `npm ci` **vẫn chạy bình thường**, chỉ bỏ qua — đã test, nên CI không đỏ vì lý do này.

Thêm mới: `fe/Dockerfile` (Vite build → `nginxinc/nginx-unprivileged`, có SPA fallback + `/healthz` cho probe) và `storefront/Dockerfile` (Next `output: 'standalone'` + `outputFileTracingRoot` trỏ về gốc repo vì node_modules bị hoist). `.dockerignore` chuyển từ `be/` lên **gốc repo** (cùng lý do build context).

**`VITE_API_URL`/`NEXT_PUBLIC_API_URL` bị nhúng vào bundle LÚC BUILD** — đổi địa chỉ backend là phải build lại image, không restart được. Đây là ràng buộc cần nhớ khi deploy, không phải bug.

### 2. `docker-compose.yml` — nay chạy đủ redis + be + fe + storefront

Bản cũ chỉ có hạ tầng (mongo/mongo-express/redis), không đóng gói app. Bản mới theo đúng phạm vi đã chốt với user: **MongoDB vẫn dùng Atlas**, compose không chạy Mongo mặc định.

MongoDB local chuyển vào profile `local-db` (`docker compose --profile local-db up -d`) và **bắt buộc chạy `mongod --replSet rs0` + tự `rs.initiate()` trong healthcheck** — vì `packaging.service.ts` dùng `session.withTransaction()`, Mongo standalone sẽ lỗi ngay lúc approve packaging. Điều này KHÔNG mâu thuẫn với kết luận cũ ở mục "Đối chiếu 3 tài liệu thuật toán AI Packaging → Vấn đề 4" (Atlas đã là replica set, không cần làm gì): nhận định đó áp dụng cho Atlas, còn đây là vá cho đúng nhánh chạy Mongo local.

### 3. Kubernetes — `k8s/` (mới, user muốn chạy thử)

`k8s/base` (namespace, configmap, redis, be, fe, storefront, ingress) + 2 overlay kustomize: `local` (image `:local` build ở máy) và `ghcr` (image do CI đẩy lên). Quyết định thiết kế:

- **Secret KHÔNG commit** — nạp từ chính `be/.env` bằng `kubectl create secret generic optipackai-be-env --from-env-file=be/.env`. ConfigMap đứng SAU secret trong `envFrom` để ghi đè được `REDIS_HOST=localhost` trong `.env`.
- **Ingress 3 host riêng** (`app/api/shop.optipackai.local`) thay vì 1 host + path `/api`: backend đặt route ở gốc (`/auth`, `/orders`...), gom vào `/api` sẽ phải rewrite path, dễ sai.
- Redis dùng `emptyDir` (cache trạng thái auth, mất thì tự dựng lại từ Mongo), không cần PVC.

### 4. CI/CD — 2 workflow

`ci.yml`: thêm job `fe` (build = `tsc -b` + vite), `storefront` (tự bỏ qua nếu chưa commit), `docker` (build cả 3 image, không push), `k8s` (`kustomize` + `kubeconform -strict`). **Sửa 1 lỗi thật**: job backend gọi `npm run lint` mà script đó có `--fix` → trong CI nó tự sửa file rồi báo xanh, che mất lỗi. Đã thêm script `lint:ci` (eslint không `--fix`) và dùng nó trong CI.

`release.yml` (mới): build & push 3 image lên GHCR khi push `main`/tag `v*`/bấm tay. **Cố ý KHÔNG tự `kubectl apply`** lên cụm nào — CI chỉ tạo image, deploy do người chạy.

Lint FE hiện để `continue-on-error: true` vì bản UI vừa merge từ `feature/viet_ui` còn 9 lỗi + 3 cảnh báo có sẵn (`set-state-in-effect`, `react-refresh`) — đây là nợ đã biết, bỏ cờ đó ngay khi dọn xong, không để lâu thành lint FE vô hiệu vĩnh viễn.

### 4b. ✅ ĐÃ CHẠY THẬT TRÊN KUBERNETES (16/09/2026) — không còn là kế hoạch trên giấy

Toàn bộ chuỗi đã chạy thành công trên máy user: `docker compose build` (3 image build sạch, xác nhận Dockerfile mới đúng) → `scripts/k8s-create-secret.sh` (29 biến) → `kubectl apply -k k8s/overlays/local` → **4 pod `Running`**, BE trả `Hello World!` + `/api/docs` 200, FE trả `index.html` + `/healthz`, storefront 200.

3 điều học được từ lần chạy thật, đã cập nhật vào `k8s/README.md`:

1. **Rào cản thật trên Windows 11 Home là WSL2, không phải Docker/k8s**: bản Home không có Hyper-V, thiếu WSL thì Docker Desktop báo `hasNoVirtualization: true`, engine không bao giờ start. Phải `wsl --install --no-distribution` bằng quyền Admin **rồi reboot** (2 thành phần Windows chỉ có hiệu lực sau khởi động lại). BIOS không liên quan — `systeminfo` báo "A hypervisor has been detected" là đủ.
2. **Docker Desktop bản hiện tại dựng k8s bằng `kind` bên trong** (log: `kubernetes starting: {"mode":"kind"}`, node `desktop-control-plane`) — **nhưng image build ở máy VẪN dùng được ngay**, pod chạy với `imagePullPolicy: IfNotPresent`, không cần registry/`kind load`. Đã kiểm chứng, không phải suy đoán.
3. **`ioredis ECONNREFUSED` lúc mới deploy là bình thường** — pod `be` lên trước pod `redis` vài giây, ioredis tự kết nối lại, log tự dứt. Chỉ đáng lo nếu lỗi còn tiếp diễn SAU khi `redis` đã `Running`.

Cần tạo Secret bằng `scripts/k8s-create-secret.sh` (mới), KHÔNG gọi thẳng `kubectl create secret --from-env-file=be/.env`: file `.env` thật của dự án có 6 dòng key thụt đầu dòng (kubectl từ chối: "not a valid key name") và 3 dòng value bọc nháy (`JWT_SECRET="..."` — dotenv bỏ nháy, kubectl giữ nguyên → token trong cụm ký bằng chuỗi khác local, lỗi rất khó truy). Script chuẩn hoá đúng 2 điểm đó.

### 5. 🔴 Bí mật thật bị commit vào git — cần ĐỔI MẬT KHẨU, không chỉ xóa file

Khi sửa `.env.example` ở gốc phát hiện file này (tracked, có từ commit `faaea86`) chứa **chuỗi kết nối Atlas thật kèm mật khẩu** (user `nhoxmymap74_db_user`, cluster `capstoneproject.o62tptf`) và một `JWT_SECRET`. Nội dung mới đã thay bằng biến cho docker compose, **nhưng mật khẩu vẫn nằm vĩnh viễn trong lịch sử git** (kể cả sau khi sửa file) và repo đang ở GitHub.

**Việc phải làm, theo thứ tự**: (1) đổi mật khẩu user đó trong Atlas → (2) đổi `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (mọi token cũ sẽ mất hiệu lực, user phải đăng nhập lại) → (3) chỉ khi cần mới tính tới việc xoá lịch sử (`git filter-repo`) vì thao tác đó viết lại toàn bộ hash, cả nhóm phải clone lại. Xoá file mà không đổi mật khẩu là **không có tác dụng bảo mật**.

Quy tắc từ nay: `.env.example` chỉ chứa **placeholder** (`<user>`, `<password>`), không bao giờ chứa giá trị thật — kể cả "tạm để cho tiện".

## Rút kinh nghiệm debug thật — "đã gửi file đúng" không có nghĩa là "đã chạy đúng" (16/09/2026)

Sự cố: test `lazada-order-sync.scheduler.spec.ts` fail liên tục 3 lần dù code/test đã đúng (đã tự xác nhận bằng cách chạy thật trong sandbox: `npm install` + `npx jest` + `npx eslint` trên chính `be.zip` user upload — 2 giả thuyết đầu sai (tương tác `jest.useFakeTimers()`, rồi `git diff` không phát hiện khác biệt) trước khi tìm ra nguyên nhân thật.

**Nguyên nhân thật**: file nguồn `lazada-order-sync.scheduler.ts` trên máy user vẫn là **bản CŨ** (constructor 2 tham số, không có `notify()`) — chỉ file test mới được thay, file nguồn thì không. `git diff` (không kèm cờ) chỉ so sánh working-tree với staging/HEAD — **không** chứng minh được file có khớp với file Claude gửi hay không, vì cả 2 phía đều là bản cũ.

**Quy tắc rút ra — áp dụng cho mọi lần sau khi user báo "vẫn lỗi" dù đã làm theo hướng dẫn**:

1. KHÔNG chỉ đọc log/đoán nguyên nhân qua suy luận — **tự trích xuất `be.zip` mới nhất user gửi, chạy thật** `npm install` + `npx jest <file>` + `npx eslint` trong sandbox để có bằng chứng chắc chắn.
2. KHÔNG dùng `git diff` làm bằng chứng "file đã đúng" — chỉ chứng minh được "không có gì đang sửa dở", không chứng minh nội dung khớp với bản đã gửi.
3. Nếu 1 file cần thay, kiểm tra kỹ cả file NGUỒN lẫn file TEST đi kèm đều đã update — dễ sót 1 trong 2 nếu chỉ đưa lại đúng file vừa sửa lỗi lint mà quên các file khác thuộc cùng tính năng.

**Lỗi lặp lại khác (3 lần trong phiên này)**: file có dấu gạch ngang trong tên (VD `lazada-order-sync.scheduler.spec.ts`) liên tục bị lưu thành tên có dấu cách + viết hoa chữ đầu khi user tự gõ/tạo file mới thay vì mở file cũ có sẵn rồi ghi đè nội dung — nhắc lại cách làm đúng: mở file cũ, Ctrl+A xóa, dán nội dung mới, giữ nguyên tên file gốc.

## CI fail dù local lint pass — `tsc --noEmit` là bước RIÊNG, không nằm trong `npm run lint` (16/09/2026)

**Hiện tượng**: local chạy `npm run lint` sạch, test pass 153/153, push lên GitHub xong CI vẫn báo lỗi đỏ ở bước **"Type check (tsc --noEmit)"** — khác hẳn bước "Lint" (2 bước riêng biệt trong workflow CI, xem ảnh Actions: `Type check → Lint → Unit tests`).

**Lý do lỗi trốn được ở máy local**: `npm run lint` (ESLint) chỉ kiểm tra style/quy tắc code (unused vars, format...) — **không kiểm tra type**. `tsc --noEmit` là **công cụ khác hẳn** (TypeScript compiler, chỉ kiểm tra kiểu dữ liệu, không build ra file). Husky pre-commit ở máy hiện chỉ chạy `test`, không chạy `tsc --noEmit` lẫn `lint` trước khi cho phép commit — nên lỗi type chỉ lộ ra khi CI trên GitHub chạy đủ cả 3 bước.

**Lỗi cụ thể gặp phải**: `TS2532: Object is possibly 'undefined'` ở `result.items[0].sku` — đúng vì tsconfig dự án đã bật `noUncheckedIndexedAccess: true` (quy tắc đã ghi từ trước) — truy cập mảng theo index (`arr[0]`) LUÔN được TypeScript coi là `T | undefined`, không tự suy luận từ `expect(...).toHaveLength(1)` lúc runtime.

**Cách sửa chuẩn cho pattern này trong test** (áp dụng mọi lần sau viết test đụng `arr[0]`):

```ts
const [first] = result.items;
expect(first).toBeDefined();
expect(first?.sku).toBe('SKU-A'); // optional chaining, không lỗi TS2532
```

Không dùng `result.items[0].sku` trực tiếp, cũng không dùng `!` non-null assertion (dự án không khuyến khích unsafe assertion, kể cả trong file test).

**Quy tắc rút ra — áp dụng từ giờ cho MỌI lần sửa code trong dự án này**: trước khi coi 1 file đã "xong", chạy đủ 3 lệnh theo đúng thứ tự CI chạy, không chỉ chạy `test`:

```bash
cd be
npx tsc --noEmit   # bước hay bị bỏ sót nhất — không nằm trong npm run lint
npm run lint
npm run test
```

Đã tự xác nhận bằng cách chạy thật cả 3 lệnh trong sandbox trước khi gửi lại file cho user — không chỉ đọc log đoán nữa (đúng bài học đã ghi ở mục trước).

## Rà + viết lại 4 file Integration Guide theo đúng code thật (16/09/2026)

**Đánh giá chất lượng trước khi sửa**: cấu trúc/văn phong cả 4 file **đã chuyên nghiệp từ trước** (đặc biệt `INTEGRATION_GUIDE_FULFILLMENT.md` — có bối cảnh nghiệp vụ, bảng actor, sơ đồ trạng thái, checklist test) — KHÔNG viết lại từ đầu, chỉ sửa đúng các đoạn nội dung đã lỗi thời so với code sau các batch fix.

**`INTEGRATION_GUIDE.md` (Auth)** — không đụng gì trong các batch, đối chiếu lại vẫn đúng, không sửa.

**`INTEGRATION_GUIDE_ORDERS.md`** — viết lại mục callback OAuth (JSON thô → redirect thật `/marketplace-oauth-success?shopId&shopName&connected` hoặc `?error=`), xóa cảnh báo "chưa test gộp 2 đơn" đã lỗi thời, thêm mục 7b (19 giá trị status, chia 3 nhóm: luồng bình thường/hủy bình thường/sự cố logistics cần badge đỏ riêng), thêm mã lỗi `MKT_SERVER_ERROR`. **Flag 1 gap mới phát hiện, chưa quyết định**: field `need_cancel_confirm`/`cancel_trigger_time` có lưu DB, dùng bắn Notification, nhưng KHÔNG trả qua `GET /orders`/`GET /orders/:id` — FE chỉ biết qua Notification, không thấy trực tiếp trên trang chi tiết đơn. Chưa quyết định có cần bổ sung vào response hay không.

**`INTEGRATION_GUIDE_FULFILLMENT.md`** — sửa 1 bug tài liệu CŨ phát hiện thêm lần này (Nghiệp vụ 2 vẫn ghi sai tie-break "theo `_id`", chưa từng được sửa từ lần audit trước dù đã ghi nhận): sửa đúng thành "ai được gán lần gần nhất lâu hơn". Thêm 2 sự kiện Notification mới vào bảng Nghiệp vụ 6 (chờ xác nhận hủy đơn — critical, cả Store Owner+Admin; sync thất bại liên tục — warning, chống spam 20 phút). Thêm ghi chú hành vi đổi của `markAsRead` (404 nếu không phải chủ sở hữu). Thêm mã lỗi `ORD_GROUP_ALL_ORDERS_CANCELED` vào bảng D.3.

**`API_LIST.md`** — sửa 1 link tham chiếu chết ("mục 7" → "PHẦN D.3", do file Fulfillment đã đổi cấu trúc từ bản v3 nhưng link chưa cập nhật theo).

Cả 4 file đã cập nhật `00_TONG_HOP...md` đánh dấu hoàn thành A5.

## Cách 2 đã chọn: bổ sung field cancel-confirm vào GET /orders/:id (16/09/2026)

User quyết định làm "cách 2" thay vì chỉ dựa vào Notification — `orders.controller.ts` (`OrderDetailResponse` + `findOne()`) giờ trả thêm 4 field: `needCancelConfirm`, `isCancelPending`, `cancelTriggerTime`, `reverseOrderId`. Chỉ thêm vào **`GET /orders/:id`** (trang chi tiết), KHÔNG thêm vào `GET /orders` (danh sách) — đúng phạm vi yêu cầu ("badge ngay trên trang chi tiết"), không mở rộng thêm. Đã cập nhật `INTEGRATION_GUIDE_ORDERS.md` — đổi mục "gap đang chờ quyết định" thành bảng field đầy đủ + khuyến nghị FE dùng cả 2 cách (Notification + field trực tiếp) thay vì chỉ 1.

## Phủ kín tag "đã đổi/mới" trong 2 file guide — trả lời câu hỏi FE có dễ đối chiếu bản cũ không (16/09/2026)

User hỏi: các file guide viết lại có đánh dấu rõ chỗ nào MỚI/ĐÃ ĐỔI để FE cầm bản cũ dễ đối chiếu không, hay chỉ viết lại im lặng? Kiểm tra lại: **đa số** đã có tag (`MỚI (ngày)`/`✅ Đã...`/`⚠️ Hành vi đổi` + đoạn "Cập nhật ngày..." đầu file) nhưng **sót vài chỗ**: tiêu đề mục 7b (section hoàn toàn mới) chưa gắn tag, 2 dòng checklist đã đổi nội dung nhưng không có prefix báo hiệu, checklist D.5 (Fulfillment) chưa có dòng nào nhắc riêng 2 việc mới (Notification 2 loại mới, `markAsRead` 404). Đã bổ sung đủ — quy ước dùng thống nhất: `🆕 MỚI` (hoàn toàn mới) và `🔄 ĐÃ ĐỔI` (thay đổi nội dung cũ) làm prefix, ngoài các tag ngày tháng đã có.

## File 00 đã cập nhật đủ — user hỏi "đúng chưa" phát hiện 2 việc chưa ghi (16/09/2026)

User hỏi file 00 đã phản ánh đúng/đủ mọi việc đã làm chưa — kiểm tra phát hiện 2 việc mới nhất CHƯA được ghi vào file 00: (1) follow-up bổ sung `needCancelConfirm`/`cancelTriggerTime`... vào `GET /orders/:id` (mục A2, dưới dòng O6 gốc), (2) follow-up phủ tag `🆕 MỚI`/`🔄 ĐÃ ĐỔI` đầy đủ trong 2 file guide (mục A5). Đã bổ sung cả 2 + sửa lại dòng cũ trong A5 (không còn ghi "flag gap chưa expose" — gap đã hết).

**Bài học quy trình**: mỗi khi làm xong 1 việc phát sinh (không nằm sẵn trong A1-A6 ban đầu), phải NGAY LẬP TỨC thêm dòng vào file 00, không đợi user hỏi lại mới cập nhật — đúng tinh thần standing rule đã đặt từ 09/09 (tự động ghi, không cần hỏi mỗi lần).

## Rà lại LẦN NỮA toàn bộ marker "mới/đã đổi" xuyên suốt cả phiên — 2 chỗ sót thêm (16/09/2026)

User hỏi lại rộng hơn: đã note hết mọi thay đổi so với doc cũ CHƯA (không chỉ 2 lượt gần nhất). Rà lại toàn bộ danh sách FE-facing changes cả phiên, tìm thêm 2 chỗ sót: (1) đoạn giải thích logic chọn `status` đại diện cho Order (O5 — ưu tiên trạng thái xấu nhất thay vì lấy phần tử đầu mảng) nằm trong mục 7b nhưng thiếu tag riêng của chính đoạn đó; (2) danh sách trạng thái đủ điều kiện gộp đơn (mục 7) thêm `to_pack`/`to_ship` so với doc cũ (chỉ có 4 giá trị) nhưng chưa đánh dấu. Đã bổ sung `🔄 ĐÃ ĐỔI (ngày)` cho cả 2. `INTEGRATION_GUIDE_ORDERS.md` giờ có 10 chỗ đánh dấu ngày 15-16/09, `INTEGRATION_GUIDE_FULFILLMENT.md` có 7 chỗ — đã rà đủ 2 lượt liên tiếp, tự tin khẳng định phủ kín.

## User hỏi "warehouse có đổi gì không" — xác nhận không đụng code trực tiếp, phát hiện thêm 1 chỗ doc sót (16/09/2026)

`diff -rq` xác nhận: **chưa từng sửa trực tiếp file nào trong `src/modules/warehouse/`** suốt cả phiên. Nhưng **Warehouse Picking List bị ảnh hưởng gián tiếp** — `warehouse.service.ts` tái dùng `getPackableItemsForGroup()` (đã fix ở `order-groups.service.ts`), nên tự động ăn theo fix lọc canceled/sự cố logistics mà không cần đụng code Warehouse.

Phát hiện thêm khi trả lời: điều này trước đó chỉ được nhắc ở bảng mã lỗi D.3 (`INTEGRATION_GUIDE_FULFILLMENT.md`), **chưa được nói rõ ngay trong Nghiệp vụ 3 (Lấy hàng/Picking)** — nơi FE dễ tìm thấy hơn khi build màn hình Picking/Warehouse. Đã bổ sung đoạn `🔄 ĐÃ ĐỔI (15/09/2026)` ngay sau sơ đồ 4 bước picking, giải thích rõ: cả `GET /order-groups/:id/picking-list` lẫn `GET /warehouse/:warehouseId/picking-list/:groupId` đều lọc, và case group rỗng hoàn toàn trả `ORD_GROUP_ALL_ORDERS_CANCELED` (409) thay vì mảng rỗng.

## Tạo tài liệu giảng giải toàn bộ hệ thống — HE_THONG_OPTIPACKAI_GIANG_GIAI.md (16/09/2026)

Theo yêu cầu "giảng như giảng viên" — đã đọc lại TOÀN BỘ code thật (17 schema, 9 module, 53 API endpoint, các thuật toán cốt lõi: consolidation, pick-item atomic, staff auto-assign, Wave Picking, HMAC signing Lazada, refresh token rotation, packaging transaction...) rồi viết 1 file duy nhất ~10.900 từ, 5 phần:

- Phần I: kiến trúc tổng thể (vì sao Modular Monolith, không Microservices)
- Phần II: 17 bảng DB đầy đủ — mục đích, field, index, LÝ DO tối ưu (6 nguyên tắc: Embed/Reference, Denormalization, ESR, Partial Index, TTL Index, Optimistic Concurrency)
- Phần III: 9 module — nghiệp vụ, API, kỹ thuật code cụ thể (kèm đoạn code thật + giải thích)
- Phần IV: demo theo 5 role, có nói rõ "role khác thấy gì" sau mỗi hành động
- Phần V: 1 ví dụ xuyên suốt A-Z (dùng đúng group thật `6a9de19a3acf2dd473960e7a`) + tổng kết trung thực việc đã xong/chưa xong (fallback packaging chưa phải AI thật, không ghi ngược Lazada, webhook hoãn, đa sàn chưa xong)

File này là tài liệu TĨNH (chụp đúng trạng thái code 16/09/2026), không tự động cập nhật — nếu code đổi thêm, cần đối chiếu lại trước khi coi là còn chính xác.

## Báo cáo lỗi thật từ Hải Phượng (teammate) — warehouse module thiếu GET + nghi ngờ ObjectId cast (16/09/2026)

Đối chiếu code thật: (1) xác nhận đúng — thiếu 3 API GET để xem lại bin-locations/sku-bin-assignments đã tạo (trước đây chỉ có POST tạo, không có GET liệt kê) — đã thêm đủ 3 route + service method + response DTO (`toBinLocationResponse`). (2) Về nghi ngờ `warehouse_id` cần ép ObjectId tường minh trong `listZones()` — đã thêm ép kiểu (an toàn dù đúng hay không phải nguyên nhân thật), nhưng lưu ý: Mongoose chuẩn tự cast string→ObjectId trong query filter, nên nhiều khả năng nguyên nhân thật là code server đang chạy chưa phải bản mới nhất (đã lặp lại nhiều lần trong dự án này).

**Sự cố phụ trong lúc verify**: lần đầu chạy `tsc --noEmit` báo lỗi giả (do tự mình copy `node_modules` bị thiếu sót vì hạn chế dung lượng sandbox, không phải lỗi code thật) — đã tự phát hiện bằng cách so sánh với bản gốc chưa sửa (cũng lỗi y hệt dù code không đổi = môi trường, không phải code), cài lại `node_modules` sạch bằng `npm install` trực tiếp thay vì `cp -r`, xác nhận lại đúng: `tsc`/`eslint`/`jest` (153/153) đều sạch. Bài học: khi cần xác minh code bằng cách chạy thật, ưu tiên `npm install` sạch trong đúng thư mục thay vì copy `node_modules` giữa các bản sao — tránh copy thiếu sót gây báo lỗi giả.

## Cập nhật tài liệu giảng giải (HE_THONG_OPTIPACKAI_GIANG_GIAI.md) — thêm phần warehouse mới (16/09/2026)

Theo yêu cầu, cập nhật mục III.6 (`warehouse/`) trong tài liệu giảng giải: bảng API từ 8 → 11 route (đánh dấu 🆕 3 route mới), thêm 2 đoạn giải thích mới — "vì sao cần 3 GET này" (bài học CRUD không đối xứng — hay quên luồng Read khi code nhanh theo happy-path Create) và "sửa ObjectId cast" (kèm bài học thứ tự ưu tiên nghi ngờ khi debug: code-chưa-cập-nhật-trên-server > môi trường/config > logic code). Số đếm API tổng ở đầu file cập nhật 53→56.

## Cập nhật API_LIST.md với 3 GET + fix warehouse (16/09/2026)

Rà cả 4 file guide, xác định CHỈ `API_LIST.md` liên quan (mục 9 — Warehouse) — 3 file còn lại (`INTEGRATION_GUIDE.md`, `INTEGRATION_GUIDE_ORDERS.md`, `INTEGRATION_GUIDE_FULFILLMENT.md`) không đụng gì tới các route Admin CRUD kho này (chỉ nhắc tên role "Warehouse Staff" ngẫu nhiên hoặc bàn về luồng Picking — không phải luồng setup kho), giữ nguyên theo đúng yêu cầu "không liên quan thì không đụng". Đã thêm 3 route mới vào bảng mục 9, đánh dấu 🆕, kèm 1 dòng 🔄 sửa lỗi cho `GET .../zones`. Cập nhật dòng "Cập nhật lần cuối" ở đầu file (2026-09-11 → 2026-09-16).

## Sửa lại đánh giá trước đó — INTEGRATION_GUIDE_FULFILLMENT.md THỰC RA cần sửa (16/09/2026)

User phản biện đúng: đánh giá trước ("chỉ API_LIST.md liên quan") CHƯA ĐỦ — phát hiện thêm: toàn bộ luồng "thiết lập kho" (Admin tạo kho→khu→kệ→gán SKU, 4 bước) **chưa từng có hướng dẫn narrative** trong `INTEGRATION_GUIDE_FULFILLMENT.md` dù tên file có "Warehouse" — trước giờ file chỉ nói tới việc DÙNG dữ liệu kho (Picking đọc dữ liệu có sẵn), không nói tới việc TẠO RA dữ liệu đó. Đây là gap có từ trước, không phải riêng 3 API mới.

Đã thêm hẳn mục mới **"Nghiệp vụ 2b — Thiết lập kho"** (chèn giữa Nghiệp vụ 2 và 3, không đánh số lại toàn bộ để tránh phá vỡ tham chiếu chỗ khác) — đủ cả 4 bước với request/response mẫu thật (lấy đúng field từ DTO), giải thích thứ tự bắt buộc, phân biệt rõ `unassigned` (SKU CHƯA gán) vs route MỚI (SKU ĐÃ gán, dễ nhầm), bảng mã lỗi riêng.

**Bài học quy trình**: khi rà "file nào liên quan" cho 1 thay đổi code, không chỉ tìm theo TÊN ROUTE cụ thể vừa đổi — phải tự hỏi thêm "toàn bộ LUỒNG NGHIỆP VỤ chứa route đó đã có tài liệu đầy đủ chưa", vì có thể phát hiện gap RỘNG hơn phạm vi thay đổi vừa làm.

## QUY TẮC CHUẨN — cập nhật tài liệu hướng dẫn FE khi có luồng/code mới (đọc kỹ, áp dụng MỌI lần sau này)

**Lỗi đã mắc phải (16/09/2026)**: khi thêm 3 API GET mới cho `warehouse/`, chỉ nghĩ tới việc cập nhật `API_LIST.md` (bảng tra cứu route) — bỏ sót hoàn toàn việc **TOÀN BỘ luồng nghiệp vụ "thiết lập kho"** (Admin tạo kho→khu→kệ→gán SKU, 4 bước) **chưa từng có tài liệu narrative nào** hướng dẫn FE cách nối luồng — dù `INTEGRATION_GUIDE_FULFILLMENT.md` có chữ "Warehouse" ngay trên tên file. User phải hỏi lại ("các file còn lại không chỗ nào có hướng dẫn à") mới phát hiện ra — đáng lẽ phải tự nhận ra ngay từ đầu.

**Nguyên nhân gốc của lỗi**: khi rà "file nào cần cập nhật", chỉ tìm theo **TÊN ROUTE/FIELD vừa đổi** (tìm chữ "zones", "bin-locations" trong các file guide) — không tự hỏi thêm câu hỏi rộng hơn: "cả LUỒNG NGHIỆP VỤ chứa route này đã có tài liệu đầy đủ (narrative, không chỉ liệt kê route) chưa?".

### Quy tắc bắt buộc từ nay — checklist 3 bước mỗi khi code BE có gì mới

1. **Cập nhật `API_LIST.md`** — MỌI route mới/đổi đều phải xuất hiện ở đây, không có ngoại lệ. Đây là bước cơ giới, dễ nhớ, ít khi bỏ sót.
2. **Tự hỏi: route này thuộc LUỒNG NGHIỆP VỤ nào** (không phải "route này liên quan file nào theo tên") — rồi kiểm tra ĐÚNG file guide narrative phụ trách luồng đó (`INTEGRATION_GUIDE.md`=Auth/Users, `INTEGRATION_GUIDE_ORDERS.md`=Orders+Marketplace, `INTEGRATION_GUIDE_FULFILLMENT.md`=Order Groups+Packaging+Warehouse+Notifications) đã có phần giải thích luồng đó CHƯA — không chỉ kiểm tra "đã nhắc tên route chưa", mà kiểm tra "FE đọc xong có biết cách GỌI ĐÚNG THỨ TỰ, XỬ LÝ ĐÚNG RESPONSE, và HIỂU VÌ SAO thiết kế vậy không".
3. **Nếu là LUỒNG HOÀN TOÀN MỚI** (không phải mở rộng luồng đã có tài liệu) — **tạo file guide MỚI riêng**, viết đúng văn phong/cấu trúc đã dùng nhất quán trong 3 file hiện có: có "Bối cảnh xảy ra", có ví dụ request/response THẬT (lấy đúng field từ DTO, không bịa), có bảng mã lỗi riêng, có ghi chú 🆕/🔄 kèm ngày khi sửa sau này. KHÔNG nhét luồng hoàn toàn khác biệt vào file đang có nếu không cùng nhóm nghiệp vụ (sẽ làm file đó phình to, lạc chủ đề).

**Việc luôn làm sau khi sửa bất kỳ file guide nào**: đồng bộ file `HE_THONG_OPTIPACKAI_GIANG_GIAI.md` (tài liệu giảng giải nội bộ) nếu thay đổi đủ lớn — 2 tài liệu phục vụ 2 đối tượng khác nhau (guide = cho FE tích hợp, giảng giải = cho leader hiểu sâu kỹ thuật) nhưng cùng phải phản ánh đúng code thật, không để 1 trong 2 bị lạc hậu.

## QUY TẮC CHUẨN — nhịp độ commit (16/09/2026, theo yêu cầu cải thiện contribution graph)

**Từ giờ áp dụng cho MỌI phiên làm việc**: chia công việc thành các **checkpoint tự nhiên** trong lúc làm, mỗi checkpoint đưa 1 lần commit — KHÔNG dồn hết tới cuối phiên mới đưa 1 cục để commit 1 lần. Nhưng cũng KHÔNG tách vụn tới mức mỗi sửa nhỏ là 1 commit riêng (tránh "commit rác").

**Cách xác định 1 checkpoint hợp lý** (đã áp dụng đúng tinh thần này qua các Batch 1-5 trong đợt audit vừa rồi — tiếp tục làm y hệt vậy):

- Xong 1 nhóm việc LIÊN QUAN NHAU (VD: 1 bug + test đi kèm, hoặc 2-3 fix cùng chủ đề) → 1 commit.
- Đừng gộp 2 việc KHÔNG liên quan vào 1 commit (VD: sửa bug Orders + thêm tính năng Warehouse → tách 2 commit).
- Đừng tách 1 việc DUY NHẤT (VD: 1 fix + test của chính fix đó) thành 2 commit riêng.
- Mỗi khi đưa xong 1 checkpoint, LUÔN kèm lệnh git đầy đủ (`add` + `commit -m "type(AOFP-XX): mô tả"` + `push`) để user chạy ngay, không đợi gom nhiều checkpoint rồi mới đưa lệnh 1 lần.

## Lỗi cron múi giờ — báo cáo thật từ đồng đội (Thuận chuyển lại, 16/09/2026)

Đồng đội (qua AI assistant khác) phát hiện đúng 2 việc: (1) "SKU chưa gán kệ" chỉ hiện SKU ĐÃ TỪNG có đơn — đúng thiết kế có chủ đích của `product_master` (chỉ cache SKU thật sự cần, không đồng bộ cả catalog), không phải bug. (2) **Lỗi thật**: `@Cron('0 3 * * *', {...})` ở `product-master-sync.scheduler.ts` KHÔNG khai `timeZone` — mặc định chạy theo múi giờ SERVER (biến `TZ`), không phải giờ VN cố định. Trên máy dev Windows hiện tại "đúng giờ" chỉ do trùng hợp; deploy lên cloud thật (thường mặc định UTC) sẽ chạy sai lệch 7 tiếng (3h sáng VN dự định → thực chạy 10h sáng VN).

Đã sửa: thêm `timeZone: 'Asia/Ho_Chi_Minh'` vào đúng cron đó. Đã rà toàn bộ 4 cron khác trong hệ thống (`lazada-order-auto-sync`, `order-group-backfill`, `express-order-sla-check`) — cả 3 đều chạy theo KHOẢNG CÁCH (mỗi N phút), không phụ thuộc múi giờ, không cần sửa — chỉ cron chạy giờ CỐ ĐỊNH (`0 3 * * *`) mới bị ảnh hưởng.

## Cập nhật doc theo 2 mã lỗi mới thêm (WH_WAREHOUSE_CODE_IN_USE, WH_ZONE_CODE_IN_USE) — 16/09/2026

Đúng quy tắc chuẩn đã đặt trước đó — sau khi thêm 2 mã lỗi vào code (`warehouse.errors.ts`), cập nhật `INTEGRATION_GUIDE_FULFILLMENT.md` ở CẢ 2 chỗ: bảng mã lỗi cục bộ trong "Nghiệp vụ 2b" và dòng tổng hợp ở D.3. `API_LIST.md` không cần sửa (chỉ trỏ sang FULFILLMENT guide, không tự liệt kê mã lỗi).

## Cập nhật tài liệu giảng giải — lần 3 (16/09/2026)

Đã bổ sung vào `HE_THONG_OPTIPACKAI_GIANG_GIAI.md`: (1) mục III.6 thêm kỹ thuật "dịch E11000 sang lỗi nghiệp vụ" + bài học tổng quát (rà lại các unique index khác chưa chắc đã xử lý tương tự); (2) mục III.7 viết lại hoàn toàn — thêm lỗi múi giờ cron đã sửa, thêm lưu ý giới hạn thực tế môi trường dev (cron cần app sống đúng 3h sáng), thêm bảng 2 script hỗ trợ vận hành mới. Đúng quy tắc chuẩn: mỗi khi sửa file guide FE, đồng bộ luôn cả tài liệu giảng giải nếu đủ lớn.

## LỖI GHI NGÀY SAI — 16/09 thay vì 19/09 (phát hiện 19/09/2026)

User chỉ ra: nhiều nội dung ghi ngày "16/09/2026" thực ra làm vào **19/09/2026** (cron timezone fix, E11000 fix, 2 script mới, các đoạn doc/tài liệu giảng giải liên quan) — do lặp lại "quán tính" ngày đã dùng từ đầu phiên làm việc dài, không kiểm tra lại ngày thật mỗi lần ghi. Đã sửa lại toàn bộ trước khi user kịp commit (kiểm tra `git status` thấy các file này còn ở "Changes not staged" — chưa lên git, sửa tại gốc không để lại vết sai trong lịch sử).

**Quy tắc rút ra — áp dụng mọi lần ghi ngày vào comment code/doc/CLAUDE.md từ giờ**: trong phiên làm việc kéo dài NHIỀU NGÀY THẬT (không phải 1 buổi), **không mặc định dùng lại ngày đã ghi trước đó trong cùng phiên chat** — luôn đối chiếu bằng chứng thật gần nhất (timestamp trong log terminal user vừa dán, ngày hệ thống hiện tại) trước khi ghi ngày vào bất kỳ đâu.

## Sửa lỗi tự nhắc nhở: câu chốt trước đó viết sai ("Đã cập nhật... sau" — mâu thuẫn), chưa thực làm (19/09/2026)

Viết câu kết luận không rõ ràng khiến tưởng đã cập nhật `INTEGRATION_GUIDE_FULFILLMENT.md`/`API_LIST.md`/tài liệu giảng giải cho 2 fix (mở role Warehouse Staff cho GET warehouses, validate SKU trước khi trừ tồn ở pick-item) — thực ra CHƯA làm. User hỏi lại mới phát hiện, đã làm bù đủ cả 3 file ngay. **Bài học**: không viết câu tổng kết kiểu "đã X" nếu chưa thực sự gọi tool chỉnh sửa file đó trong lượt trả lời — dễ gây hiểu nhầm đã xong việc.

## Gộp `main` vào `thi_dev` — 2 conflict tài liệu + 1 xung đột NGỮ NGHĨA chỉ jest bắt được (20/09/2026)

`git pull origin main` báo conflict ở `API_LIST.md` và `INTEGRATION_GUIDE_FULFILLMENT.md`. Cả 2 bên đều mô tả ĐÚNG code (đã grep xác nhận từng claim), chỉ là 2 nhánh sửa song song:

- **`INTEGRATION_GUIDE_FULFILLMENT.md`**: git tự gộp được phần lớn, còn 3 chỗ — đã gộp UNION (giữ cả "Nghiệp vụ 2b — Thiết lập kho" + 19/09 pick-item validate từ `main`, lẫn A.3/A.4/C.2/D.6 "flow mục tiêu" + dòng `ORD_GROUP_PACKAGING_PROFILE_NOT_READY` từ `thi_dev`). Sắp lại changelog đầu file theo đúng thứ tự thời gian.
- **`API_LIST.md`**: xung đột thật — `thi_dev` (commit `223ae75`, 14/09) đã VIẾT LẠI thành kiểu "API contract hiện trạng" (có bảng DTO/field), trong khi `main` vẫn là bản "Danh sách API theo Role" và được Thuận cập nhật tiếp tới 20/09. **User chốt: lấy bản `main` làm khung** (bản cả team đang cập nhật, chứa fact mới nhất 19-20/09), bổ sung phần chỉ `thi_dev` có: mục **Quy ước** + error response mẫu, mục **0. System**, bảng **DTO/field chi tiết** cho từng module, mục **11. Collection nội bộ và planned**, bảng **mã lỗi theo module** (đã tự thêm 2 mã `WH_WAREHOUSE_CODE_IN_USE`/`WH_ZONE_CODE_IN_USE` mà bản `thi_dev` viết trước khi 2 mã này ra đời). Không bên nào bị mất nội dung.

**Xung đột NGỮ NGHĨA `tsc`/`eslint` KHÔNG bắt được, chỉ `jest` bắt** — bài học chính của lượt này: `order-groups.service.ts` git auto-merge SẠCH (không conflict marker), nhưng 2 thay đổi của 2 nhánh tương tác với nhau: `pickItem()` (từ `main`) gọi `getPackableItemDetail()` → `getPackableItemsForGroup()`, mà hàm này vừa bị BE-1 (từ `thi_dev`) siết lại — ném `ORD_GROUP_PACKAGING_PROFILE_NOT_READY` nếu SKU chưa có hồ sơ kho `ready`. Hệ quả: `order-groups.service.pickItem.spec.ts` (mock `productMasterModel.find` trả `[]`, viết TRƯỚC khi có BE-1) fail 2/2 — readiness chặn trước, không bao giờ tới bước kiểm tra SKU thuộc group.

- **Cách sửa đã chọn**: sửa MOCK trong spec (trả hồ sơ `ready` đủ số đo + `is_fragile`), KHÔNG đổi thứ tự kiểm tra trong `pickItem()` — mục đích test là bước validate SKU thuộc group, readiness chặn sớm chỉ là nhiễu do mock cũ; đổi code production để test xanh sẽ là sửa sai chỗ.
- **Quy tắc rút ra**: sau MỌI lần merge/rebase có auto-merge file service (kể cả khi git báo sạch, kể cả khi `tsc` + `eslint` 0 lỗi), BẮT BUỘC chạy `jest` toàn bộ — 2 nhánh sửa 2 hàm gọi nhau là lớp lỗi duy nhất chỉ test runtime mới lộ ra.

**Verify sau khi gộp**: `tsc --noEmit` 0 lỗi, `npm run lint:ci` 0 lỗi (43 warning `explicit-function-return-type` đều nằm trong `src/modules/storefront/` — nợ có sẵn từ commit storefront `3c0291c` trên `thi_dev`, không phải phát sinh từ lượt gộp này), `jest` **19/19 suite, 164/164 test pass**.

**Lần gộp thứ 2 (21/09/2026, commit `5b6c15d` AOFP-35 — đảo luồng: lấy hàng trước, quyết định đóng gói sau)**: `main` tách logic tra Product Master thành `mapSkuQuantitiesToPackableItems()` (dùng chung cho `getPackableItemsForGroup()` và `getActuallyPickedItemsForGroup()`), nhưng lại đưa số đo mặc định 20 cm / 0,5 kg / `is_fragile=false` trở lại. Cách gộp: giữ cấu trúc hàm mới của `main`, áp lại kiểm tra hồ sơ `ready` của BE-1 bên trong hàm dùng chung (nên cả 2 nguồn gọi đều bị chặn), sửa test `dimension bị thiếu` của `main` sang kỳ vọng `ORD_GROUP_PACKAGING_PROFILE_NOT_READY` (vẫn là 422 rõ ràng, không phải 500). Verify: `tsc` 0 lỗi, eslint `order-groups`/`packaging` 0 lỗi, `jest` 19/19 suite, 170/170 test.

### Lần gộp thứ 3 (23/09/2026, `main` commit `68c1e4b` + `021c6a3` — sửa 18 mục FE báo)

11 file conflict. Cách giải quyết: **giữ luồng mới của `thi_dev`** (engine 3D, mỗi đơn một kiện, lấy hàng đối soát theo lượt), **ghép thêm tính năng thật của `main`**:

- `rejection_reason` bắt buộc khi `reject` → lưu trên bản bị từ chối, trả ra `rejectionReason`, thông báo Admin (`packaging_rejected`).
- `generate` thông báo Packaging Staff (`pending_approval`) — viết lại cho nhiều đơn (`notifyPendingPlan`), không dùng `box_size` của bản cũ.
- `pack` mở thêm role `PACKAGING_STAFF` (route nằm ở `PackagingPackController` của nhánh mình, không phải `order-groups.controller.ts` như `main`).
- Enum notification: giữ cả `MFA_DISABLED`, `LOW_BOX_STOCK` (của mình) lẫn `PACKAGING_REJECTED` (của `main`); `recipient_role` đổi sang `type: Number` + script `migrate-notification-role-types.ts` của `main` giữ nguyên.

**KHÔNG lấy `resolveItemsForPackaging()` (fallback khi group không có `pick_events`)** — BE-4a đã đổi `pick` thành `confirmPicked()` đối soát đủ số đã quét, nên group **không thể** vào `picked` mà không có event; fallback đó giờ chỉ che lỗi dữ liệu. Nếu sau này mở lại nút "xác nhận hàng loạt", phải thêm lại đường này cùng một quyết định rõ ràng.

**Lỗi thật trên `main` phát hiện khi gộp**: commit `021c6a3` **ghi đè `INTEGRATION_GUIDE_ORDERS.md` bằng nội dung của `INTEGRATION_GUIDE_FULFILLMENT.md`** (2 file giống hệt nhau, 582 dòng, cùng tiêu đề "Fulfillment & Warehouse"). Bản gộp giữ lại file Orders đúng của `thi_dev` — cần báo team để không ghi đè lại lần nữa.

**2 lỗi tự gây ra khi gộp, tự phát hiện + sửa** (ghi lại để không lặp):
1. Regex `<<<<<<< HEAD(.*?)=======` không neo đầu dòng → khớp nhầm vào **dòng kẻ banner comment** `* ====...====` trong chính file service, nuốt mất phần khai báo `async getOrCreatePackingGuide(...)`, `tsc` mới báo "Property does not exist". **Quy tắc**: khi giải conflict bằng script, luôn neo `^<<<<<<< HEAD$` / `^=======$` / `^>>>>>>>` theo chế độ multiline, và chạy `tsc` ngay sau đó.
2. Auto-merge để lại **2 dòng `NotificationsModule` trùng nhau** trong `packaging.module.ts` và **2 khối gán `notificationsService`** trong spec — cả hai đều hợp lệ về cú pháp, chỉ `tsc`/đọc lại mới thấy.

**Verify sau gộp**: `tsc --noEmit` 0 lỗi, `lint:ci` 0 lỗi (43 warning storefront có sẵn), `jest` **23/23 suite, 250/250 test**.

## Rà logic AI Packaging + đồng bộ docs theo luồng lấy hàng trước (21/09/2026)

Rà toàn bộ code packaging/order-groups + 3 docs thuật toán. User chốt: (1) luồng **lấy hàng trước** là chính thức; (2) phạm vi kiện **mỗi đơn một kiện**; (3) đợt code tới gồm sửa lỗi logic + validator hình học + greedy 3D cơ bản (BE-3a/BE-4a, ghi trong roadmap mục 5–6).

**Điểm yếu xác nhận bằng code (chưa sửa code, đợt này chỉ sửa docs):**

- `fallback-packaging.util.ts` chỉ so tổng thể tích +10% với 3 thùng cố định, comment cũ gọi sai là FFD; món 100×1×1 cm vẫn vào thùng 20 cm; quá cỡ vẫn trả Large, không tầng nào xử lý "multi-package".
- `approve()/adjust()` bắt nhập cân thật trước khi đóng, so với cân hàng thuần (không cộng bì/vật tư) → đơn quần áo nhẹ gần như luôn `is_abnormal`; `is_abnormal` chỉ log, không notify.
- `getActuallyPickedItemsForGroup()` cộng mọi `pick_events` của group (không theo lượt) → sau `decidePartial(false)` lấy lại sẽ đếm gấp đôi; không lọc lại đơn bị hủy sau khi đã quét; `pickItem()` không chặn quét vượt số đặt; trừ tồn và ghi event không cùng transaction.
- Endpoint `pick` chỉ đổi trạng thái, không đối soát đủ hàng; group `picked` không có event → lỗi `ALL_ORDERS_CANCELED` (sai nghĩa).
- `generate` không transaction (deactivate → create → transition); `approve/adjust/reject` cập nhật thẳng theo `__v`, không qua `isValidStatusTransition()`.
- `adjust` không kiểm tra thùng nhập tay có chứa vừa hàng, không tính lại phí/vật tư, không lưu `adjustment_reason`.
- Phí ship = cân hàng × 15.000 đ/kg, bỏ khối lượng quy đổi và bì.
- Tính gợi ý cho cả group thành một thùng — mâu thuẫn quyết định mỗi đơn một kiện.

**Docs đã sửa (21/09):** roadmap (mục 1, 2, 5 BE-3a, 6 BE-4a, 7), `AI_3D_PACKAGING_OPTIMIZATION.md` (flow + hiện trạng), `INTEGRATION_GUIDE_FULFILLMENT.md` (v3.4: thứ tự A.1, A.4, Nghiệp vụ 1/2/3, sơ đồ C.1/C.2), `API_LIST.md` (mục 6, 8; `be/API_LIST.md` chỉ là file trỏ, không cần sửa), Swagger summary của `pick`/`pack`/`generate`/`approve`/`reject`/list, comment đầu `fallback-packaging.util.ts`. Kế hoạch implement tiếp theo (mỗi bước 1 commit): A — sửa luồng lấy hàng (round, chặn vượt số đặt, transaction, `pick` đối soát đủ); B — `packaging/engine/` validator + greedy 3D mm/g, không trả Large khi quá cỡ; C — recommendation theo từng đơn (`order_id`), adjust qua validator, cân kiện tại `pack`; D — cập nhật docs theo code mới.

## Engine đóng gói 3D + animation — ĐÃ TRIỂN KHAI (21/09/2026, BE-3a/BE-4a)

Theo plan đã duyệt (user: 3D hiển thị trên web ở màn duyệt + màn đóng gói; user sẽ gửi danh mục thùng thật). "AI" ở giai đoạn này = **thuật toán tìm kiếm heuristic có validator**, không phải ML (ML ranker cần lịch sử approve/adjust thật, để sau).

**Backend**
- **Bước 0 — mở khóa dữ liệu**: trước đợt này KHÔNG có API nào đặt `packaging_profile_status = ready` → mọi `generate` đều 422. Thêm `product-master.controller.ts` (`GET /product-master?status=`, `PUT /product-master/:id/packaging-profile`), field mới `orientation_rule`, `max_stack_load_kg`, `profile_confirmed_by/at`. **Bug thật đã sửa**: `syncProductsForShop()` `$set` status `needs_measurement` ở MỌI lượt sync → reset hồ sơ đã xác nhận mỗi ngày; chuyển sang `$setOnInsert`. Danh mục thùng `packaging_boxes` (mm/g, `is_sample`) + `GET/POST/PATCH /packaging/boxes` + `scripts/seed-packaging-boxes.ts` (không tham số = 3 thùng mẫu; có CSV cm/g = nhập thùng thật). `PackableItem` chỉ THÊM 2 field optional.
- **Bước A — lấy hàng (BE-4a)**: `pick_round` trên group + pick_event; `decidePartial(false)` mở lượt mới; `pickItem()` chỉ khi `picking`, không đi qua Product Master (lấy hàng không cần hồ sơ đóng gói), chặn quét vượt số đặt, trừ tồn + ghi event trong 1 transaction (chạm `last_picked_at` của group để 2 lần quét đồng thời xung đột ghi → withTransaction chạy lại); `confirmPicked()` cho route `pick` đối soát đủ. 4 mã lỗi mới `ORD_GROUP_PICK_*`/`NO_PICK_EVENTS`.
- **Bước B — engine** `packaging/engine/` (hàm thuần): `units.ts` (cm→mm làm tròn lên, nở `item_key`), `validator.ts` (đủ món, biên, AABB, hướng, đỡ toàn đáy, tải chồng chia theo diện tích tiếp xúc, tải thùng), `greedy-packer.ts` (điểm thử = tích Descartes tọa độ, z→y→x, thùng theo thể tích ngoài tăng dần, deadline 2 s, ≤30 món, không thùng hợp lệ → `no_fit`). Benchmark: 30 món ≤10 ms. Fixture docs §7 (A1/A2/B1 → thùng M, tọa độ đúng tính tay, 53,03%) và §7.5 (áo trên hộp giày z=120) đều khớp.
- **Bước C — mỗi đơn một kiện**: `allocatePickedItemsToOrders()` chia số đã quét về từng đơn (đơn tạo trước ưu tiên); recommendation có `order_id`, `placements[]`, `solution_status`, cân ước tính hàng + bì, phí ship `null` (bỏ 15.000 đ/kg); generate/approve/reject/pack đều transaction + `isValidStatusTransition()`; adjust = chọn `box_code` trong danh mục, phải qua validator; `pack` (chuyển sang `PackagingPackController`, giữ URL cũ) nhận cân từng kiện, lệch >20% → `is_abnormal` + notify Store Owner. Đã XÓA `fallback-packaging.util.ts` (chỉ so thể tích, không có tọa độ nên không thể qua validator). Index mới `uniq_active_per_order`; **phải chạy 1 lần** `scripts/migrate-packaging-recommendation-index.ts` để drop index cũ `order_group_id_1`.

**Frontend** (`fe/`): `types/packaging.ts`, `api/packaging.api.ts`, `hooks/usePackagingPlan.ts`, `components/packing/PackingAnimation3D.tsx` (R3F, món rơi theo `step`, Play/Pause/Bước trước-sau/tốc độ/xoay camera, danh sách bước bấm để nhảy), trang `/app/packing/groups` + `/app/packing/groups/:groupId` (tab mỗi đơn, duyệt/đổi thùng/từ chối, nhập cân từng kiện). RBAC thêm prefix `/app/packing/groups` cho Warehouse Staff; sidebar thêm mục "Kế hoạch đóng gói 3D". `PackingDashboard.tsx` (mock) giữ nguyên.

**Verify**: BE `tsc` 0 lỗi, `lint:ci` 0 lỗi (43 warning storefront có sẵn), `jest` 21/21 suite 200/200 test. FE `npm run build` (tsc -b + vite) sạch, eslint file mới 0 lỗi. **Chưa** chạy thử end-to-end trên trình duyệt với dữ liệu thật.

**Tồn kho thùng + chọn thùng tối ưu — ĐÃ TRIỂN KHAI (22/09/2026)**. [stated] User chốt: (1) gộp tồn kho vào `packaging_boxes` và **gỡ module `materials`** (`carton_materials` trống, không màn hình nào dùng — tránh 2 danh mục thùng lệch nhau); (2) trừ tồn **lúc `pack`**, lúc chờ duyệt chỉ **giữ chỗ mềm**; (3) thùng vừa nhất hết hàng → **tự chọn thùng còn hàng kế tiếp** và ghi lý do; (4) mục tiêu tối ưu = **thùng nhỏ nhất** (thể tích ngoài), hòa thì rẻ hơn.
- `packaging_boxes` thêm `quantity_on_hand`/`reorder_level`/`storage_location`; collection mới `packaging_stock_movements` (sổ xuất/nhập, index `{box_id, created_at:-1}`). Tồn CHỈ đổi qua `POST /packaging/boxes/:id/stock-in` hoặc `pack` (mỗi lần 1 dòng sổ, cùng transaction), PATCH không sửa tồn.
- `PackagingBoxService.listAvailability({groupId?|recommendationId?})`: `available = tồn − số recommendation active, ok, pending/approved/adjusted, chưa packed`; loại trừ group đang generate lại / phương án đang adjust. Thùng cũ chưa có field tồn → `.lean()` không điền default → coi là 0 (đã chặn NaN lọt thành "còn hàng"); `seed-packaging-boxes.ts` backfill field + nhập 50 thùng mẫu qua `stockIn`.
- Engine: `packOrder(..., { availability })` chỉ chọn thùng `available > 0`, thùng nhỏ hơn vừa mà hết → `preferred_box_out_of_stock`; **multi-start** 4 thứ tự xếp mỗi thùng (thể tích, diện tích đáy, cạnh dài, chiều cao). Đã dò được ca thật (thùng 40×40×50, 4 món đặt đứng) mà thứ tự thể tích hụt còn multi-start xếp vừa — có test.
- `generate` xếp tuần tự từng đơn, trừ dần map còn trống (2 đơn không giành 1 thùng cuối). `adjust` sang thùng hết → 409 `PKG_BOX_OUT_OF_STOCK`. `pack` gọi `consumeForPack` trong transaction (thiếu → rollback, không `packed`); vượt ngưỡng `reorder_level` lần đầu → Notification `low_box_stock` cho Admin + Store Owner.
- FE: `/app/admin/boxes` có cột tồn (trống/tồn/giữ chỗ, badge sắp hết/hết), panel nhập thùng + sổ (`BoxStockPanel`), form mức cảnh báo/vị trí; trang kế hoạch hiện tồn thùng đang dùng, cảnh báo thùng vừa hơn đã hết, khóa thùng hết hàng khi adjust.
- Verify: BE `tsc` 0 lỗi, `lint:ci` 0 lỗi, `jest` 23/23 suite 236/236; FE `tsc -b` + eslint sạch. Chạy `seed-ai-guide-demo.ts` thật (SAMPLE-M = 0, L = 11): đơn DEMO-AI-22 vừa M nhưng M hết → sang L, ghi đúng "SAMPLE-M vừa hơn nhưng hết hàng". **Chưa gọi `pack` thật** để thấy trừ tồn/thông báo trên DB (chỉ có unit test).

**Còn thiếu / cần user cung cấp**: danh mục thùng thật (trong/ngoài cm, bì g, tải g, giá), số đo từng SKU sau gấp/bọc + quy cách xếp, danh mục vật tư (g, giá), đơn vị vận chuyển + hệ số quy đổi + bảng cước. Giới hạn còn lại: chưa có nhánh túi mailer, chia nhiều kiện, snapshot/version hồ sơ, job tự động (BE-5). ✅ Đợt tiếp theo cùng ngày đã sửa: `picking-list` không còn bắt hồ sơ đóng gói (`PickableItem`/`getPickableItemsForGroup()`, có `picked_quantity`); thêm FE `/app/admin/boxes` (danh mục thùng thật — trang "Templates đóng gói" cũ vẫn là mock, chưa gộp) và `/app/inventory/packaging-profiles` (kho đo SKU).

## Hướng dẫn đóng gói từng bước bằng AI cho animation 3D (21/09/2026)

**[stated] Quyết định của user**: animation 3D ở FE phải hướng dẫn từng bước và "bắt buộc dùng AI". Đã hỏi lại, user chọn **cả hai**: thuật toán quyết định hình học, mô hình ngôn ngữ viết lời. **ĐÃ THAY ĐỔI cùng ngày**: ban đầu chọn OpenAI, sau đó user thấy tốn tiền (gói ChatGPT Plus KHÔNG kèm API, API tính tiền riêng theo token) → chuyển sang Gemini miễn phí + Ollama dự phòng, rồi **user chốt lần cuối: bỏ cả Gemini lẫn Ollama, chỉ dùng Groq** (bậc miễn phí). Ollama cài thử lên máy dev trong lúc đó đã được gỡ.

**Ranh giới trách nhiệm (không được đảo)**: engine greedy 3D + validator quyết định thùng/vị trí/xoay/thứ tự. `engine/packing-guide.ts` (hàm thuần) đổi toạ độ thành dữ kiện dạng chữ (góc nào, đặt lên món nào, cách xoay, dễ vỡ, cấm chồng) và dựng câu mẫu. `PackingGuideAiService` gửi dữ kiện đó cho mô hình ngôn ngữ để viết lại lời — **không gửi thông tin khách hàng**, mô hình không tính cách xếp.

**Gọi AI**: `config/ai.config.ts` trả `ai.provider` = Groq khi `AI_API_KEY` khác rỗng, ngược lại `null` → câu mẫu. Mặc định `AI_BASE_URL=https://api.groq.com/openai/v1`, `AI_MODEL=openai/gpt-oss-120b` (**ĐÃ THAY ĐỔI lần 2, 21/09/2026**: user yêu cầu đổi khỏi qwen; gọi thật ~4,6 s, qua `parseGuide()`, đủ ý bọc xốp/sát đáy). **ĐÃ THAY ĐỔI lần 1**: mặc định ban đầu `llama-3.3-70b-versatile` bị Groq ngừng (gọi thật trả HTTP 404); tra `GET /openai/v1/models` bằng key thật, thử `openai/gpt-oss-120b` (~3 s) và `qwen/qwen3.8-27b` (~0,9 s) — cả hai qua `parseGuide()`, chọn qwen vì nhanh hơn và câu tiếng Việt tự nhiên hơn. Lần đầu cả hai bỏ sót "bọc xốp hơi"/"sát đáy thùng" → đã thêm 2 quy tắc vào SYSTEM_PROMPT, chạy lại đều đủ ý. Model Groq thay đổi theo thời gian: gặp 404 thì tra lại `/models`. Gọi chuẩn Chat Completions bằng `axios` có sẵn — **không thêm SDK**. Gửi `response_format: json_schema`; HTTP 400 thì thử lại 1 lần với `json_object`. `extractContent()` chịu được khối ```json bao quanh. Schema để `tip` là string, chuỗi rỗng → null.

**Chốt an toàn**: `parseGuide()` bắt buộc đủ số bước, đúng thứ tự, mỗi câu chứa nguyên văn SKU của bước; sai → câu mẫu. `model` lưu dạng `nhà-cung-cấp/model`. `fallback_reason`: `no_api_key` | `ai_error` | `ai_invalid_output`.

**Lưu trữ**: sub-schema `packing_guide` trên `packaging_recommendations`, bị đặt `null` trong `resultToFields()` mỗi khi `generate`/`adjust` đổi phương án. Endpoint `POST /order-groups/:groupId/packaging/:recommendationId/guide` (Packaging/Warehouse/Admin, `@Throttle` 10/phút, `regenerate` tuỳ chọn), lỗi mới `PKG_GUIDE_NOT_AVAILABLE` (409, đơn `no_fit`).

**FE**: `PackagingPlanPage` tự tạo hướng dẫn lần đầu khi mở đơn, nhãn "AI · nhà-cung-cấp/model" hoặc "Câu mẫu", nút viết lại; `PackingAnimation3D` nhận `guideSteps`, hiện câu + lưu ý của bước hiện tại dưới khung 3D, làm nổi món vừa đặt và làm mờ món các bước trước.

**Khi trình bày**: nói đúng — "thuật toán tối ưu xếp hộp + mô hình ngôn ngữ viết hướng dẫn", không nói AI tự tính cách xếp.

Verify: BE `tsc` 0 lỗi, eslint `packaging`/`config` 0 lỗi, `jest` 23/23 suite, 215/215 test. FE `tsc -b` + eslint 0 lỗi trên các file đã sửa. **Đã gọi thử Groq thật (21/09/2026)** với đơn mẫu 2 hộp giày + 1 áo qua engine thật: `source: 'ai'` với cả qwen (~0,9 s) và gpt-oss-120b (~4,6 s, model hiện dùng).

**Đã dọn máy dev (21/09/2026)**: theo yêu cầu user, đã xóa model `qwen2.5:7b`, gỡ Ollama (winget) và xóa thư mục `~/.ollama` cài trong lượt thử trước.

## Túi zip bọc hàng + hình 3D theo loại sản phẩm (21/09/2026)

**[stated] Quyết định của user (đã hỏi lại trước khi code)**: (1) kích thước gói sau khi cho vào túi zip và gập đôi do **kho đo trực tiếp** (không suy ra từ kích thước túi) — đúng roadmap 12/09 "không đoán số đo"; (2) túi zip có **danh mục riêng** như thùng carton; (3) danh sách loại sản phẩm: áo thun, áo sơ mi, áo khoác, quần đùi/short, quần dài/jean, váy/đầm, giày (hộp), dép/sandal, phụ kiện, khác; (4) hình 3D dùng **file mô hình có sẵn** (không tự vẽ bằng code).

**Backend**: collection mới `packaging_bags` (`code`, `name`, `width_mm`, `length_mm` trải phẳng, `price_vnd`, `is_sample`, `is_active`; unique `code`) + `/packaging/bags` (GET Packaging/Warehouse/Store Owner/Admin; POST/PATCH Admin). Enum dùng chung `common/enums/product-category.enum.ts` (+ nhãn tiếng Việt). `ProductMaster` thêm `product_category`, `zip_bag_code`, `zip_bag_folded`; `PUT /product-master/:id/packaging-profile` bắt buộc `product_category`, kiểm tra túi đang dùng (`PM_ZIP_BAG_NOT_FOUND` 422). `ProductMasterModule` chỉ đăng ký model `PackagingBag` để đọc — **không import PackagingModule** (tránh vòng phụ thuộc). `PackableItem` thêm 3 field optional; recommendation chụp `item_profiles[]` lúc generate/adjust (engine KHÔNG dùng — hình học vẫn theo `dimension` đã đo). Hướng dẫn: dữ kiện thêm `product_type` + `zip_bag`; câu mẫu và lời nhắc AI bắt đầu bằng "Cho … vào túi zip …, gập đôi túi".

**Frontend**: form hồ sơ SKU thêm loại/túi/gập đôi; `ZipBagCatalog` gắn vào `/app/admin/boxes`; `PackingAnimation3D` nhận `itemProfiles`, `ProductModel3D` tải GLB theo loại, thử 6 hướng xoay vuông góc chọn hướng vừa khối nhất, thu phóng ĐỀU (không méo); túi zip = lớp nhựa trong + đường khoá kéo (+ nếp gập), giày = hộp carton; tải lỗi → khối màu (ErrorBoundary). Bảng loại → file ở `components/packing/product-models.ts`.

**Mô hình 3D**: GLB từ Poly Pizza trong `fe/public/models/` — giấy phép **CC-BY 3.0** (bắt buộc ghi công; màn hình có dòng ghi công trỏ `fe/public/models/CREDITS.md`), áo khoác Public Domain. **ĐÃ THAY ĐỔI 22/09/2026**: `jeans.glb` thực chất là **xe Jeep "Mom's Wrangler"** (nhận nhầm là quần jean chỉ vì tên file) → đã xóa; quần dài/quần đùi giờ **vẽ bằng code** (`FoldedPants3D.tsx`, 3 lớp vải so le + cạp + túi + đường gập). Bài học: chọn mô hình 3D phải xem hình/vật liệu, không tin tên file. Hàng mềm (áo) kéo giãn theo từng trục cho khít khối engine tính (`stretch: true` ở `product-models.ts`); hàng cứng (giày, sandal, kính) thu phóng đều. Sơ mi dùng áo gấp đổi màu; váy/khác là khối hộp. 5 file GLB có sẵn trước đó (`shirt/trousers/backpack/hat/glasses.glb`) thuộc Hero 3D landing page, không đụng tới, giấy phép chưa rõ.

**Quần áo luôn nằm phẳng + gập đôi khi cần (22/09/2026, user chốt — thay câu hỏi còn treo về `orientation_rule: any` dựng đứng)**:
- `engine/units.ts` `FLAT_CATEGORIES` (`t_shirt`, `shirt`, `jacket`, `shorts`, `trousers`, `dress`) luôn dùng `UPRIGHT_ORIENTATIONS`, bỏ qua `orientation_rule` đã lưu — không cần migration.
- Cờ `can_fold_in_half` trên `ProductMaster` (DTO optional, response `canFoldInHalf`; bật cho `shoes` → 422 `PM_FOLD_NOT_ALLOWED`). Số đo gập do **hệ thống tự tính** (`foldUnit()`: cạnh dài hơn trong dài/rộng ÷ 2 làm tròn lên, độ dày × 2, cân giữ nguyên).
- `packOrder()`: mỗi thùng (nhỏ → lớn) thử bộ món nguyên trạng trước, hụt mới thử `foldVariants()` (gập dần món gập được, lớn trước). Nghĩa là **chỉ gập khi nhờ đó dùng được thùng nhỏ hơn**. `adjust` cũng đi qua `packOrder` với 1 thùng nên cũng được gập.
- `placements[].folded` (schema + response); hướng dẫn: `folded_in_half` trong dữ kiện, câu mẫu/lời nhắc AI "gập đôi … theo chiều dài trước khi đặt".

**Trang đóng gói từng bước** `/app/packing/groups/:groupId/orders/:recommendationId` (`PackingWizardPage.tsx`, toàn màn hình, user chốt "mỗi bước một màn hình"): màn Chuẩn bị → mỗi bước một màn (`PackingStepView` — 3D tới bước đó, món mới nổi bật; câu chữ to; nhãn loại/túi zip/Gập đôi) → màn cuối checklist + nhập cân mọi đơn của group, gọi `pack` khi `approved_for_packing` và role Admin/Warehouse. Nút Trước/Sau, chấm tiến độ, phím ←/→. Nút mở ở `PackagingPlanPage`. Form hồ sơ SKU có checkbox "Có thể gập đôi" (khóa với giày).

**Dữ liệu demo** (`scripts/seed-ai-guide-demo.ts`, shop `DEMO-AI-GUIDE`, 4 group): group 1 = 1 quần jean → gập đôi vừa thùng M (tồn M = 1, group này giữ chỗ nên các group sau thấy M hết → "thùng vừa hơn đã hết").

Verify (22/09/2026, sau đợt nằm phẳng/gập đôi/trang từng bước): BE `tsc` 0 lỗi, `lint:ci` 0 lỗi, `jest` 23/23 suite, 245/245 test; FE `tsc -b` + eslint 0 lỗi. Đã kiểm tra DB: mọi placement quần áo có `dz` = độ dày, đơn jean `SAMPLE-M` 300×190×120 `folded: true`. Lượt 21/09: `jest` 23/23 suite, 221/221 test đạt (thêm test hồ sơ túi zip, dữ kiện/câu mẫu túi zip, `item_profiles`). FE `tsc -b` + eslint 0 lỗi. Đã gọi Groq thật với group toàn quần áo đóng túi: `source: 'ai'`, câu nhắc đúng túi + gập đôi. **Chưa xem animation bằng mắt** (không có trình duyệt trong phiên) — user cần kiểm tra hình hiển thị.
## 📋 TỔNG KẾT — Toàn bộ lỗ hổng phát hiện khi đảo luồng Picking/Packaging (20-21/09/2026) + QUY TRÌNH TỐT HƠN cho lần sau

### Danh sách đầy đủ — lỗi gì, ai/khi nào phát hiện, đã sửa chưa

| #   | Lỗi                                                                                                                                          | Nguồn gốc                                                                                                  | Ai phát hiện                       | Trạng thái                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| 1   | `recipient_role` schema `type: String`, giá trị luôn là số → Packaging Staff không thấy chuông                                               | **Có TỪ TRƯỚC**, không phải do đảo luồng gây ra                                                            | FE test thật, không phải unit test | ⏸️ Chưa sửa                                           |
| 2   | `generate()` không `notify()` Packaging Staff                                                                                                | Chưa từng làm                                                                                              | FE đối chiếu                       | ⏸️ Chưa sửa                                           |
| 3   | `getActuallyPickedItemsForGroup()` throw cứng nếu không có `pick_events` → `generate()` luôn 409 nếu Warehouse dùng nút "xác nhận hàng loạt" | **Tự mình gây ra** khi đảo luồng 20/09                                                                     | FE test thật                       | ✅ **Đã sửa** (`resolveItemsForPackaging()` fallback) |
| 4   | `RejectPackagingDto` thiếu `rejection_reason` bắt buộc + không notify Admin                                                                  | Chưa từng làm                                                                                              | FE đối chiếu                       | ⏸️ Chưa sửa                                           |
| 5   | `pack()` chưa cho `PACKAGING_STAFF` (chỉ Warehouse+Admin)                                                                                    | **Sót khi đảo luồng** — luồng mới có ý Packaging Staff tự đóng gói sau khi duyệt, nhưng quên cập nhật role | FE test thật                       | ⏸️ Chưa sửa                                           |
| 6   | `OrdersModule` chưa import `OrderGroupsModule` → group tạo trễ tới 15 phút (chờ cron backfill)                                               | Thiết kế cũ (đã tự dự đoán trước trong comment, nhưng chưa làm)                                            | FE test thật                       | ⏸️ Chưa sửa                                           |
| 7   | `PackagingModule` chưa import `NotificationsModule`                                                                                          | Sẽ crash DI ngay khi thêm `notify()` vào `packaging.service.ts` nếu quên dòng này                          | FE tự soát trước khi báo (rất tốt) | ⏸️ Chưa sửa                                           |
| 8   | Schema `packaging-recommendation` thiếu field `rejection_reason`                                                                             | Chưa từng làm                                                                                              | FE đối chiếu                       | ⏸️ Chưa sửa                                           |

**Điểm đáng chú ý**: KHÔNG phải mọi báo cáo của FE đều là lỗi — mục "GET packaging trả null (không 404) khi chưa generate, role xem đủ 4" **ĐÃ ĐÚNG SẴN 100%** khi đối chiếu code thật — FE chỉ đang XÁC NHẬN LẠI, không phải báo lỗi. Bài học: **luôn đối chiếu TỪNG claim với code thật trước khi tin/sửa** — báo cáo dài, chi tiết, có vẻ đúng vẫn có thể lẫn 1 vài điểm đã đúng sẵn.

### 🎯 QUY TRÌNH TỐT HƠN — áp dụng bắt buộc từ giờ mỗi khi đổi STATE MACHINE hoặc thêm phụ thuộc CROSS-MODULE

Nhìn lại, cả 8 lỗi trên rơi vào ĐÚNG 3 nhóm nguyên nhân gốc — quy trình dưới đây map trực tiếp từng nhóm với 1 bước kiểm tra cụ thể, không phải lời khuyên chung chung:

**Nhóm A — Thêm ĐIỀU KIỆN BẮT BUỘC mới (như "phải có pick_events") mà quên liệt kê HẾT các đường dẫn hợp lệ tới điều kiện đó (lỗi #3)**
→ Quy tắc: mỗi khi thêm 1 precondition mới cho 1 hàm, viết ra GIẤY (hoặc comment code) **TẤT CẢ các đường** hệ thống cho phép đi tới trạng thái đó — không chỉ đường "happy path" đang nghĩ tới. VD "group ở PICKED" có 2 đường: quét từng SKU (`pick-item` nhiều lần) HOẶC xác nhận hàng loạt (`pick` 1 lần) — đường thứ 2 dễ bị quên vì không "trực quan" bằng đường 1.

**Nhóm B — Đổi Ý NGHIÊM NGHIỆP VỤ của 1 trạng thái mà quên rà lại TOÀN BỘ nơi đang check role/quyền dựa trên trạng thái đó (lỗi #5)**
→ Quy tắc: mỗi khi sửa `allowed-status-transitions.ts`, **grep lại TOÀN BỘ** `@Roles(...)` của MỌI endpoint liên quan tới trạng thái vừa đổi ý nghĩa — không chỉ sửa đúng bảng transition rồi coi là xong. Luồng mới coi "đóng gói vật lý" là việc CỦA Packaging Staff (trước là Warehouse) — nhưng route `pack()` vẫn giữ nguyên role cũ vì không ai đi rà lại.

**Nhóm C — Thêm cross-module/cross-service call mới mà quên wiring (lỗi #7, và suýt xảy ra với #6)**
→ Quy tắc: mỗi khi thêm `private readonly xService: XService` vào constructor 1 service, **NGAY LẬP TỨC** kiểm tra `<module>.module.ts` của service ĐANG SỬA có `imports: [XModule]` chưa — đừng đợi tới lúc chạy `npm run start` mới phát hiện crash DI (mà `tsc`/`eslint`/`jest` unit test **KHÔNG hề bắt được lỗi này** — chỉ app thật khởi động mới lộ).

**Checklist tổng hợp — chạy qua đủ 3 mục này TRƯỚC KHI báo "xong" cho bất kỳ thay đổi nào đụng tới state machine hoặc thêm dependency mới:**

- [ ] Đã liệt kê hết MỌI đường hợp lệ dẫn tới trạng thái tiền đề mới thêm chưa (không chỉ đường đang nghĩ tới)?
- [ ] Đã grep lại toàn bộ `@Roles()` của các endpoint liên quan tới trạng thái vừa đổi ý nghĩa chưa?
- [ ] Mọi service mới inject vào constructor đã kiểm tra `module.ts` có import đúng module chưa?
- [ ] Có transition/hành động nào MỚI cần `notify()` không — hỏi "ai cần biết chuyện này vừa xảy ra" cho MỌI trạng thái mới/đổi, không chỉ trạng thái "chính".
- [ ] Đã tự chạy thử (không chỉ đọc code) ít nhất 1 lần theo ĐÚNG luồng FE sẽ dùng thật (VD nút "xác nhận hàng loạt", không chỉ luồng quét từng cái) trước khi coi là xong?

**Cập nhật (21-22/09/2026) — TOÀN BỘ 18 mục trong "bản chốt" của FE đã code xong, xác nhận `tsc`/`eslint`/`jest` sạch (17/17 suite, 167/167 test), đã chạy migration DB thật (13 bản ghi `recipient_role` string→number đã sửa), đã commit/push.** Chi tiết đầy đủ từng mục xem `git log` các commit `AOFP-36`/`AOFP-37` — không lặp lại ở đây, chỉ giữ bảng lỗi + quy trình bên trên làm tài liệu tham khảo cho lần sau.

## Hoàn thiện AI Packaging + Shipping + Tài liệu in — kế hoạch 28/09/2026, P1 (vật tư chèn) ĐÃ XONG

Khảo sát 28/09 xác nhận 4 khoảng trống so với đề bài: vật tư chèn, số kiện, phí ship/hãng/ETA, tài liệu in (slip/label/QR/manifest). User chốt: làm cả 4 mảng theo thứ tự **P1 vật tư → P2 nhiều kiện → P3 phí ship + hãng → P4 tài liệu in → P5 đồng bộ docs**; nhiều kiện = *đề xuất + xử lý tay* (🔄 ĐÃ THAY ĐỔI quyết định 12/09 "mỗi đơn một kiện" thành "mỗi đơn N kiện", N ≤ 5, khi đến P2 — **chưa áp dụng ở code**, hiện vẫn mỗi đơn một kiện); dữ liệu vật tư/bảng cước dùng **số mẫu `is_sample`**. Kế hoạch chi tiết: `C:\Users\Admin\.claude\plans\c-nghi-n-c-u-v-adaptive-cat.md`.

**P1 — ĐÃ TRIỂN KHAI (28/09/2026):**
- Collection mới `packaging_materials` (5 loại: `foam_corner`, `corrugated_divider`, `air_pillow`, `bubble_wrap`, `fragile_tape`; tồn + `reorder_level`), `packaging_material_movements` (sổ riêng, không đụng sổ thùng), `packaging_material_rules` (bộ luật có version, mỗi lần lưu = document mới, bản cũ tắt; chưa có → dùng `DEFAULT_MATERIAL_RULES` trong code). Routes `/packaging/materials` (+ `/rules` GET/PUT) — chi tiết `API_LIST.md` mục 8e.
- Engine: `engine/material-selector.ts` (`selectMaterials`, hàm thuần) — luật gồm `applies_to` (fragile/shoes/fragile_or_shoes/any) × `basis` (per_unit/per_extra_unit/per_carton/void_band). `packOrder` nhận `options.materials`; `buildOk` cộng khối lượng vật tư vào `estimated_package_weight_g`, trả `materials_weight_g/materials_cost_vnd`. `PackingUnit.product_category` (mới) để luật nhận ra giày.
- **Vật tư là ƯỚC LƯỢNG THEO LUẬT, không vào hình học** (không chiếm thể tích trong validator, chưa mô hình hóa khoảng đệm) — khi trình bày phải nói đúng như vậy; các dải `void_band` (50%→2, 70%→4) và số lượng mặc định là số khởi đầu chưa hiệu chỉnh.
- **Thiếu vật tư KHÔNG chặn `pack`** (khác thùng hết → 409 `PKG_BOX_OUT_OF_STOCK`): trừ `min(cần, tồn)`, ghi `materials_shortfall` trên recommendation + Notification `low_material_stock` (Admin + Store Owner; cũng báo khi tồn rơi xuống ≤ ngưỡng, đúng 1 lần). Vật tư **không giữ chỗ mềm**.
- Hướng dẫn đóng gói: `buildTemplateGuide`/`PackingGuideInput` nhận `materials[]` thay `bubble_wrap_count`; AI được nhắc liệt kê đúng vật tư trong `summary`.
- FE: `MaterialCatalog` (trong `/app/admin/boxes`, gồm xem luật), `StockPanel` (dùng chung với `BoxStockPanel`), bảng vật tư + chi phí ở `PackagingPlanPage`, danh sách vật tư ở màn Chuẩn bị của wizard. **Chưa vẽ vật tư trong animation 3D.**
- Seed: `npx ts-node scripts/seed-packaging-materials.ts` (chưa chạy trên DB thật; chỉ tạo mã chưa có, an toàn chạy lại).
- Verify: BE `tsc` 0 lỗi, `eslint` module packaging/notifications 0 lỗi, `jest` 25/25 suite 276/276 test; FE `tsc -b` + `npm run build` + eslint file đã sửa sạch. **Chưa** chạy end-to-end với DB thật, chưa xem giao diện bằng mắt, chưa boot thử Nest app (wiring module chỉ kiểm bằng đọc code).
- Bài học lặp lại: thêm dependency `PackagingMaterialService` vào constructor `PackagingService` làm 21 test cũ fail vì spec thiếu mock provider — đúng cảnh báo "thêm dependency thì rà spec ngay". Lint `no-unnecessary-condition` bắt `?? 0` trên field schema không-null (document hydrate đã tự áp default).

## Tích hợp sàn thứ 2 — AURELLE (29/09/2026, Giai đoạn 2 theo `AURELLE_MARKETPLACE_DESIGN.md`)

**[stated] Bối cảnh**: nhóm đối tác AURELLE giao tài liệu thiết kế `AURELLE_MARKETPLACE_DESIGN.md` (v2.2, gốc để ở `C:\Users\Admin\Desktop\Mao\OptiPackAI\`, chưa copy vào repo) — Open API của AURELLE **cố ý dựng byte-for-byte tương thích Lazada Open Platform** (cùng thuật toán ký HMAC-SHA256, cùng vỏ response, cùng tên field đơn/dòng hàng/sản phẩm) để OptiPack tái dùng gần như nguyên vẹn code Lazada đang chạy sống, không viết lại từ đầu. Tài liệu tự chia 5 giai đoạn (Mục 12): (1) AURELLE dựng BE, (2) AURELLE làm OAuth+API đọc / OptiPack tách adapter dùng chung, (3) webhook+outbox, (4) API ghi trạng thái+tồn, (5) liên kết cùng người nhận (độc lập AURELLE, làm song song được). **Đã làm xong Giai đoạn 2 phía OptiPack** (Mục 9.3 — 11 file đổi + `AurelleAdapter` mới) và cả 2 script Mục 14. **CHƯA làm Giai đoạn 3-5** — webhook cần AURELLE BE thật tồn tại trước (Giai đoạn 1 bên AURELLE chưa xong theo tài liệu), liên kết cùng người nhận (Mục 9.5, field `recipient_key` mới trên `OrderGroup`, khái niệm `shipments`/`delivery_trip` hoàn toàn chưa tồn tại trong code) là 1 tính năng lớn riêng, để làm đợt sau.

### Kiến trúc tái dùng — composition, không kế thừa

Tách `LazadaProtocolClient` (file mới `marketplace-integration/adapters/lazada-protocol.client.ts`, class thuần, KHÔNG `@Injectable()`) khỏi `LazadaAdapter` — chứa toàn bộ "giao thức dây" dùng chung: `generateSign()`, `callSignedGet()` (retry backoff cũ), `callSignedPost()` (POST tới `authBaseUrl` — đổi/làm mới token), **`callSignedApiPost()` MỚI** (POST tới `apiBaseUrl` — cần cho các API ghi của AURELLE, Lazada hiện chưa dùng), `getOrders/getOrderItems/getProducts`, `mapTokenResponse()`. `LazadaAdapter` (`@Injectable()`) giờ **compose** 1 instance `LazadaProtocolClient` cấu hình theo host/key Lazada; `AurelleAdapter` (file mới `aurelle.adapter.ts`) compose 1 instance KHÁC cấu hình theo host/key AURELLE (`config/marketplace.config.ts` thêm block `aurelle`). Chọn composition thay vì kế thừa vì 2 adapter có method RIÊNG không dùng chung (`AurelleAdapter` có thêm `acknowledgeOrder/updateOrderStatus/updateSellableQuantity/verifyWebhookSignature` — Lazada không có các method ghi này).

### Registry thay vì inject thẳng — đúng thiết kế Adapter Registry đã có sẵn từ 2026-09-09

`MarketplaceAdapter` interface (`marketplace-adapter.interface.ts`) thêm các method **optional** (`getOrders?/getOrderItems?/getProducts?/acknowledgeOrder?/updateOrderStatus?/updateSellableQuantity?`) — optional để adapter TikTok/Tiki cũ (hiện đang tắt, không đăng ký trong module) không bị lỗi biên dịch khi bật lại. `MarketplaceIntegrationModule` đăng ký `AurelleAdapter`, thêm vào factory map `MARKETPLACE_ADAPTERS`, và **lần đầu tiên export `MARKETPLACE_ADAPTERS`** (trước đây chỉ dùng nội bộ module) — để `orders.service.ts`/`product-master.service.ts` inject registry thay vì class cụ thể `LazadaAdapter`. `enums/platform.enum.ts` thêm `AURELLE = 'aurelle'`. Method nghiệp vụ dùng `adapter.getOrders(...)` gọi trực tiếp qua biến `const adapter` (không destructure ra biến rời — tránh lỗi `@typescript-eslint/unbound-method`).

### `orders.service.ts`/`product-master.service.ts` — tổng quát hóa đúng theo mục "Kiến trúc mở rộng đa sàn" đã thiết kế từ 2026-09-09

`syncLazadaOrders(shopId)` đổi thành `syncShopOrders(platform, shopId)` tổng quát, giữ `syncLazadaOrders` làm wrapper 1 dòng gọi `syncShopOrders(LAZADA, shopId)` (không phá route `POST /orders/lazada/sync` cũ) — thêm route mới `POST /orders/:platform/sync` (đăng ký SAU route literal `lazada/sync` để Nest match đúng thứ tự). Thêm `syncSingleOrder(platform, shopId, orderId)` — cho webhook tương lai gọi, hiện chỉ delegate lại `syncShopOrders` đầy đủ (AURELLE không có API lọc theo 1 order_id, dựa vào `last_polled_at`/`update_after` để đơn vừa đổi tự nằm trong lượt sync). `mapLazadaOrder()` thêm tham số `platform` (không đổi tên hàm — hàm này vẫn CHỈ áp dụng cho sàn tương thích khung Lazada, không phải mapper phổ quát). `LazadaOrderSyncScheduler` đổi vòng lặp 1 sàn → lặp `[LAZADA, AURELLE]`, cooldown chống spam Notification giờ khóa theo `platform+shop_id` (trước chỉ `shop_id`). `ProductMasterSyncScheduler` tương tự — **tiện tay vá luôn thiếu `timeZone` đã ghi nợ từ 19/09** (nay đã có từ trước, chỉ audit lại xác nhận đúng, không cần sửa lần nữa). `product-master.errors.ts` thêm `PM_UNSUPPORTED_PLATFORM` — sàn chưa implement `getProducts` (adapter thiếu method optional) bị chặn rõ ràng thay vì lỗi ngầm.

### 2 script Mục 14 — đã giao đủ, đã tự chạy thử thật (không chỉ đọc code)

- **`scripts/aurelle-conformance.ts`** (đứng độc lập, không NestFactory/Mongo — chỉ import thẳng `LazadaProtocolClient`/`mapLazadaOrder` từ `src/`) — ký request đúng thuật toán OptiPack đang dùng, gọi Open API AURELLE thật, kiểm từng field/kiểu dữ liệu theo đúng bảng Mục 14.2, chạy response qua CHÍNH `mapLazadaOrder()` thật (không phải bản rút gọn) để chắc chắn "đọc được" = "OptiPack dùng được ngay", không phải chỉ đúng hình thức JSON. PASS/WARN/FAIL, có FAIL → exit code 1 (dùng được trong CI của AURELLE nếu họ muốn).
- **`scripts/aurelle-mock-server.ts`** (Express, cổng mặc định 4000 qua `AURELLE_MOCK_PORT`, dữ liệu mẫu cố định trong bộ nhớ — 1 shop/1 đơn/2 dòng hàng/1 sản phẩm) — bản tham chiếu chạy được đúng Mục 7-8, verify chữ ký bằng cách tự khởi tạo `LazadaProtocolClient` với app_key/secret CỦA CHÍNH MOCK rồi gọi `generateSign()` public — **cố ý dùng lại đúng 1 công thức với client thật**, không viết lại HMAC lần 2 (tránh 2 bản có thể lệch nhau nếu chỉ sửa 1 chỗ).
- **Đã tự chạy thật, không chỉ tin đọc code**: khởi động `aurelle-mock-server.ts` (nền, cổng 4321), chạy `aurelle-conformance.ts` nhắm vào chính server này với `AURELLE_TEST_WRITE=true` → **25 PASS · 0 WARN · 0 FAIL**, bao gồm cả case "ký sai bị từ chối HTTP 400" và cập nhật tồn bán được. Đóng script mock ngay sau khi test xong (đã xác nhận cổng 4321 giải phóng, không để lại process nền).

### Xác nhận phạm vi CHƯA làm, tránh hiểu nhầm "đã xong hết Mục 9.3"

`acknowledgeOrder/updateOrderStatus/updateSellableQuantity` trên `AurelleAdapter` đã VIẾT ĐỦ theo đúng spec Mục 7.6-7.8 (dùng `callSignedApiPost` mới) nhưng **CHƯA có route/service nào gọi tới** — đúng tinh thần "code đủ, không invoke" đã áp dụng cho Fulfillment API Lazada trước đây (`BE_System_Audit/04...md`), vì Giai đoạn 4 (outbox ghi ngược + đối soát) chưa tới lượt theo Mục 12. `verifyWebhookSignature()` trên `AurelleAdapter` đã cài đúng công thức HMAC Mục 8.1 nhưng **chưa có controller webhook nào gọi** — `ProcessedWebhookEvent` (schema có sẵn từ lâu, đã ghi nợ "chưa đăng ký/chưa dùng" trong CLAUDE.md nhiều lần) vẫn ở trạng thái y hệt, chưa đổi.

**Verify cuối**: `tsc --noEmit` 0 lỗi, `npm run lint:ci` toàn `src` 0 lỗi (43 warning `storefront/` có sẵn, không liên quan), `jest` **25/25 suite, 276/276 test pass** — đã chạy trên TOÀN BỘ backend (không chỉ module đụng tới), đúng nguyên tắc "chạy jest sau mỗi lần đổi cross-module/dependency mới" đã rút ra 20/09. **Chưa làm**: đồng bộ `API_LIST.md`/`INTEGRATION_GUIDE_ORDERS.md` (route mới `POST /orders/:platform/sync`, platform `aurelle` trong response `GET /orders`) — để đợt sau cùng lúc với việc quyết định có làm Giai đoạn 3 (webhook) ngay hay đợi AURELLE có BE thật.

**Còn lại:** P2 (nhiều kiện — nhúng `cartons[]` vào recommendation, `packOrderMulti`, xác nhận bắt buộc), P3 (module `shipping/`: hãng, bảng cước, `ship` yêu cầu chọn hãng — 🔄 **ĐÃ THAY ĐỔI 29/09/2026**: collection `shipments` tối giản đã tạo TRƯỚC ở mục dưới đây cho Mục 9.5, P3 sẽ THÊM field carrier/cost/eta/pickup vào ĐÚNG collection này, không tạo mới), P4 (`documents/`: pdfkit + qrcode + bwip-js, font tiếng Việt nhúng), P5 (guide mới `INTEGRATION_GUIDE_SHIPPING.md`, sửa roadmap/`AI_3D_PACKAGING_OPTIMIZATION.md`, giảng giải, dọn interface `PackagingRecommendation` cũ).

## Webhook AURELLE (Giai đoạn 3) + Liên kết cùng người nhận & giao chung chuyến (Mục 9.5) + hủy nhóm tự động N1 (29/09/2026)

Tiếp nối mục "Tích hợp sàn thứ 2 — AURELLE" ở trên (Giai đoạn 2 đã xong) — user yêu cầu thẳng "làm đi giúp tôi" cho 2 phần còn treo: Giai đoạn 3 (webhook) và Giai đoạn 5/Mục 9.5 (liên kết cùng người nhận). Đọc kỹ Mục 12 phát hiện N1 (Mục 9.6 — trạng thái hủy nhóm) là phụ thuộc CHÍNH THỨC của Giai đoạn 5, không phải việc tự thêm ngoài phạm vi: `GroupFulfillmentStatus` trước đó không có đường nào để 1 nhóm "chết hẳn" khi mọi đơn bên trong bị hủy/thất lạc — nếu không có, nhóm treo mãi ở trạng thái cũ dù không còn gì để xử lý.

**[stated] 2 quyết định đã hỏi lại và user xác nhận trước khi code**: (1) nhóm hết đơn fulfill được → **tự động** chuyển `CANCELED` + tự nhả giữ chỗ đóng gói, KHÔNG chờ người xác nhận riêng (ngoại lệ có chủ đích so với nguyên tắc "1 người xác nhận thay đổi quan trọng" — hợp lý vì N1 chỉ tác động nhóm CHƯA đóng gói, rủi ro thấp). (2) Collection `shipments` mới làm **tối giản trước** (`order_group_id`, `trip_code`, `tracking_code`) — khi làm P3 sẽ THÊM field carrier/cost/eta vào ĐÚNG collection này (additive), không tạo 2 collection trùng khái niệm.

### Phần B — N1 (trạng thái `CANCELED`)

`GroupFulfillmentStatus` thêm `CANCELED`; `allowed-status-transitions.ts` cho phép từ MỌI trạng thái trước `PACKED` (`AWAITING_PACKAGING, PICKING, PICKED, PARTIAL_NEEDS_REVIEW, PENDING_APPROVAL, APPROVED_FOR_PACKING`) đi tới `CANCELED` (trạng thái cuối, `[]`) — KHÔNG có đường từ `PACKED/SHIPPED/DELIVERED` (hàng đã đóng/giao vật lý không tự hủy ngầm, cần `return` thủ công).

`OrderGroupsService.cancelIfAllOrdersUnfulfillable(groupId)` (method mới): no-op nếu group đã ở `PACKED/SHIPPED/DELIVERED/RETURNED/CANCELED`; đếm `orderModel.countDocuments({consolidated_group_id, status: {$nin: NOT_PACKABLE_ORDER_STATUSES}})` (tái dùng đúng constant đã có, không định nghĩa lại tập trạng thái); còn ≥1 đơn fulfill được → không làm gì; = 0 → gọi `transitionFulfillmentStatus(groupId, CANCELED, group.__v)` (TÁI DÙNG đúng choke-point đã dùng cho cả 5 endpoint fulfillment, không viết logic update riêng), nhả giữ chỗ (`packagingRecommendationModel.findByIdAndUpdate(id, {is_active:false})` nếu có `active_packaging_recommendation`), bắn Notification `GROUP_AUTO_CANCELED` (warning) cho Store Owner + Admin + `assigned_staff_id` (nếu có).

Để inject `PackagingRecommendationDoc` model vào `OrderGroupsService` mà KHÔNG tạo vòng lặp import `PackagingModule ↔ OrderGroupsModule`: đăng ký lại CÙNG schema đó qua `MongooseModule.forFeature()` trong `order-groups.module.ts` — đúng pattern đã dùng sẵn cho `Order`/`ProductMaster` trong chính file này.

Hook gọi: `orders.service.ts` → `syncShopOrders()`, ngay sau `getOrCreateGroupForOrder()` — nếu đơn vừa sync rơi vào `NOT_PACKABLE_ORDER_STATUSES`, gọi `cancelIfAllOrdersUnfulfillable()` (best-effort, `.catch()` log lỗi, không làm hỏng cả lượt sync). Vì `syncShopOrders()` dùng chung cho CẢ cron lẫn webhook (`syncSingleOrder()` gọi lại nó), fix này tự động áp dụng cho cả 2 đường mà không cần sửa 2 nơi.

### Phần A — Webhook receiver (đúng phạm vi Giai đoạn 3: endpoint + rawBody + dedupe, KHÔNG làm outbox Giai đoạn 4)

Hạ tầng đã có sẵn từ trước nhưng chưa ai gọi tới (xác nhận qua đọc code, không suy đoán): `ProcessedWebhookEvent` schema (unique `{platform,event_id}`, TTL 7 ngày), `AurelleAdapter.verifyWebhookSignature()` (đúng công thức `UPPER(HEX(HMAC_SHA256(app_secret, app_key+raw_body)))`, so `timingSafeEqual`), `OrdersService.syncSingleOrder(platform, shopId, orderId)`. Việc làm là NỐI các mảnh có sẵn, không viết lại từ đầu.

Module nhỏ, để phẳng `marketplace-webhooks/`: `marketplace-webhooks.controller.ts` (`POST /marketplace/webhooks/:platform`, PUBLIC — không `JwtAuthGuard`, bảo mật bằng chữ ký thay vì JWT, giống triết lý OAuth callback; `@ApiExcludeController()` không lộ Swagger; `@SkipThrottle()` vì `ThrottlerGuard` gắn global; dùng `@Req() req: RawBodyRequest<Request>` lấy `req.rawBody`). `main.ts` bật `NestFactory.create(AppModule, { rawBody: true })` (trước đó chưa bật).

`MarketplaceWebhooksService.handleWebhook()`: (1) parse `platform` param, 400 nếu không hợp lệ; (2) tra adapter qua `MARKETPLACE_ADAPTERS` registry, `verifyWebhookSignature()` sai/thiếu → `AppException(MKT_WEBHOOK_SIGNATURE_INVALID, 401)`; (3) chống replay `|Date.now() - timestamp| > 5 phút` → cũng 401 cùng mã; (4) chống trùng theo Rule #17 (tạo record TRƯỚC — bắt E11000 — không phải kiểm tra rồi tạo): `try { await processedEventModel.create({platform, event_id: message_id}) } catch(e) { if (isDuplicateKeyError(e)) return {received:true}; throw e; }`; (5) dispatch theo `message_type`: `order_status_changed`/`order_updated` → `getConnectedShop()` (bắt `MKT_SHOP_NOT_CONNECTED` → ack, không throw) rồi `syncSingleOrder()`; `authorization_revoked` → `notify()` 2 lần (`CONNECTION_LOST`, Store Owner + Admin — tái dùng type đã có, KHÔNG thêm type mới); giá trị lạ khác → vẫn ack 200 (tương thích ngược).

`marketplace-webhooks.module.ts` đăng ký `ProcessedWebhookEvent` schema **lần đầu tiên trong toàn bộ codebase** (schema đã tồn tại từ lâu, ghi nợ "chưa ai dùng" nhiều lần trong lịch sử file này — nay hết nợ).

### Phần C — `recipient_key` (Mục 9.5, liên kết cùng người nhận)

`consolidation-key.util.ts` thêm `computeRecipientKey(name, phone, addressLine1, city)` — công thức `sha256(tên|SĐT|địa chỉ|tỉnh đã chuẩn hóa)`, tái dùng NGUYÊN `normalizePhoneNumber()`/`normalizeAddressFragment()` đã có, **KHÔNG kèm platform** (khác hẳn `computeConsolidationKey()`) — cố ý, vì mục đích là liên kết XUYÊN SÀN (1 khách mua cả Lazada lẫn AURELLE phải ra CÙNG 1 `recipient_key`), khác hẳn mục đích gộp đơn CÙNG SÀN của `consolidation_key`.

`OrderGroup` thêm field `recipient_key: string | null` (default `null`, index thường — không unique, nhiều group được phép trùng key) — set 1 LẦN lúc `getOrCreateGroupForOrder()` tạo group mới (ở CẢ 2 code path tạo mới trong hàm này), KHÔNG đổi lại sau. `findLinkedGroups(groupId)`: `recipient_key` null → `[]` ngay; khác null → `find({recipient_key, _id:{$ne}, fulfillment_status:{$nin:[DELIVERED,RETURNED,CANCELED]}}).lean()`.

`order-groups.controller.ts`: `GET :id` thêm `linkedGroupCount` (đếm qua `findLinkedGroups().length`); route mới `GET :id/linked` trả `{linkedGroups: OrderGroupResponse[]}`; `ship()` thêm `linkedPending: {id, fulfillmentStatus}[]` (lọc các group liên kết CHƯA tới `packed` trở lên) — CHỈ cảnh báo, KHÔNG chặn hành động ship.

Script `scripts/backfill-order-group-recipient-key.ts` (mirror `migrate-consolidation-key.ts` đã có) — set `recipient_key` cho `OrderGroup` cũ (`recipient_key: null`) dựa vào 1 `Order` đại diện trong group, chạy 1 lần sau deploy.

**Chuẩn hóa Đ/đ — giới hạn đã biết, không phải bug**: `normalizeAddressFragment()` (NFD + strip combining marks) KHÔNG gập "Đường"→"duong" vì Đ/đ (U+0110/U+0111) là 1 CHỮ CÁI RIÊNG trong Unicode, không phải "D" + dấu kết hợp qua NFD — phát hiện khi viết test (test ban đầu SAI giả định, đã tự sửa lại test, không sửa helper — đây là đặc tính CÓ SẴN của hàm dùng chung, không phải lỗi mới).

### Phần D — Giao chung chuyến (Mục 9.5, module `shipments/` mới)

Schema `Shipment`: `order_group_id` (unique — 1 group chỉ tạo được 1 shipment), `trip_code`, `tracking_code`, `note`, `created_by`, `created_at`. `ShipmentsService.createBatch(orderGroupIds, note, userId)`: rỗng → `SHP_EMPTY_GROUP_LIST`; mỗi group phải `PACKED` (khác → `SHP_GROUP_NOT_PACKED`); ≥2 group phải cùng `recipient_key` khác null (khác/thiếu → `SHP_RECIPIENT_MISMATCH` — an toàn, không tự đoán liên kết); sinh `tripCode` (`TRIP-yymmdd-XXXX`, chung cho cả lô) + `trackingCode` riêng từng shipment (`OPK-XXXXXXXXXX`); trong 1 `session.withTransaction()` (Rule #6): tạo `Shipment` (bắt E11000 → `SHP_GROUP_ALREADY_SHIPPED`) rồi `transitionFulfillmentStatus(id, SHIPPED, group.__v, session)`.

`transitionFulfillmentStatus()` (đã có từ lâu) thêm tham số cuối `session?: ClientSession` (optional, additive — 4 chỗ gọi cũ không đổi hành vi) để tham gia được transaction ngoài của `ShipmentsService`, tránh viết lại logic optimistic-concurrency + validate transition lần 2. Route `POST /shipments/batch` (`SHIPPING_COORDINATOR, ADMIN`) — **KHÔNG thay thế** `POST .../fulfillment/ship` hiện có, là lựa chọn CỘNG THÊM khi cần vận đơn thật/giao chung chuyến.

### Phần E — Picking list gộp nhiều nhóm (Mục 9.5)

`WarehouseService.getEnrichedPickingListForGroups(warehouseId, groupIds[])` (method mới) — với mỗi `groupId` gọi `getPackableItemsForGroup()` (TÁI DÙNG), gắn `order_group_id` vào mỗi dòng, rồi join bin/zone **1 LẦN DUY NHẤT** trên UNION toàn bộ SKU của mọi group (Rule #16 — không N+1 dù nhiều group). Route mới `GET :warehouseId/picking-list?group_ids=G1,G2` (khác pattern path `.../picking-list/:groupId` đã có — không đụng nhau); sai/rỗng `group_ids` → `WH_INVALID_GROUP_IDS` (400, mới thêm vào `warehouse.errors.ts`).

### Phát hiện + xử lý phụ trong lúc làm (không nằm trong plan ban đầu, ghi lại để không lặp lại)

- **Đã vô tình grep in ra chuỗi kết nối MongoDB Atlas kèm mật khẩu thật vào output** khi tìm biến môi trường bằng pattern quá rộng (`grep "MARKETPLACE\|MONGODB" .env`) — đã báo ngay cho user, không ghi/lặp lại chuỗi đó ở bất kỳ đâu khác, đề xuất cân nhắc đổi mật khẩu Atlas. Bài học: khi cần đọc `.env` để lấy 1-2 biến cụ thể, dùng pattern hẹp đúng tên biến cần, không dùng regex rộng dễ dính cả `MONGODB_URI`.
- **Smoke-test webhook thật đã tạo 2 bản ghi Notification `CONNECTION_LOST` THẬT** trong Atlas dev DB (case `authorization_revoked`, seller giả `200000000101`) — email gửi lỗi do SMTP dev sai cấu hình (không tới hộp thư ai), nhưng bản ghi in-app là thật. Đã báo user, chưa xóa (chờ xác nhận có cần dọn không) — đây là dữ liệu test tự nhận diện được (tiêu đề nhắc `aurelle`, seller_id giả), không lẫn với dữ liệu thật.
- **🔴 Phát hiện lỗi thật, không liên quan việc đang làm — `INTEGRATION_GUIDE_ORDERS.md` bị merge SAI từ trước**: khi định thêm mục webhook vào file này, phát hiện nội dung file KHÔNG PHẢI guide Orders/Marketplace như tên gọi — mà là 1 bản CŨ của `INTEGRATION_GUIDE_FULFILLMENT.md` (tiêu đề "Fulfillment & Warehouse", cắt ở mốc 16/09/2026). Đây chính là hệ quả thật của commit `021c6a3` mà mục "Đối chiếu 3 tài liệu thuật toán AI Packaging"/lịch sử merge 23/09/2026 đã CẢNH BÁO trước ("021c6a3 ghi đè `INTEGRATION_GUIDE_ORDERS.md` bằng nội dung của `INTEGRATION_GUIDE_FULFILLMENT.md`") — dù ghi chú lúc đó khẳng định "bản gộp giữ lại file Orders đúng của `thi_dev`", thực tế merge `81198b5` đã lấy NHẦM phía (giữ bản sai của `main`). Đã khôi phục lại đúng nội dung từ `git show c96cab0:INTEGRATION_GUIDE_ORDERS.md` (commit `thi_dev` ngay trước merge lỗi, 404 dòng, tiêu đề đúng "Orders & Marketplace Integration") rồi mới thêm mục webhook mới vào bản đã khôi phục — không viết đè lần 2 lên bản sai. **Bài học nhắc lại lần nữa**: trước khi sửa 1 file guide, LUÔN đọc lướt qua tiêu đề/vài dòng đầu xác nhận đúng file, không tin tên file — lịch sử dự án đã có ít nhất 2 lần file bị lệch nội dung so với tên (lần trước là `packaging`/`warehouse` module dùng response snake_case, lần này là cả 1 file bị tráo nội dung).

**1 bug thật phát hiện lúc smoke test SỐNG (không phải unit test mock) — đã tự sửa**: case replay (timestamp lệch >5 phút) trả **400**, khác case chữ ký sai/thiếu trả **401** — dù cả 2 đều dùng chung `error_code: MKT_WEBHOOK_SIGNATURE_INVALID`, cùng ý nghĩa "không tin request này". Unit test (`marketplace-webhooks.service.spec.ts`) chỉ assert `errorCode`, không assert HTTP status nên không bắt được lệch này — chỉ lộ ra khi POST thật qua HTTP và đọc status code trả về. Đã sửa `marketplace-webhooks.service.ts` đổi case replay sang `HttpStatus.UNAUTHORIZED` (401) cho nhất quán với tài liệu đã viết (CLAUDE.md/2 guide đều ghi "cũng 401") — đúng bài học đã có: **HTTP status code là 1 lớp không được unit test mock che phủ, chỉ verify được qua gọi HTTP thật**.

**Sự cố phụ trong lúc live-boot smoke test — dọn tiến trình `node` rác tồn đọng từ các lượt live-boot TRƯỚC ĐÓ trong CÙNG phiên này** (Phần A, Phần D): phát hiện port 3000 bị 1 tiến trình `node` khởi động từ ~45 phút trước (dùng credential AURELLE giả KHÁC lần này) chiếm giữ, khiến lần khởi động server mới nhất bind thất bại ÂM THẦM (Nest không crash, không log lỗi rõ ràng — chỉ dừng lại ở "Found 0 errors. Watching for file changes." của tsc-watch, không có dòng "Nest application successfully started") — smoke test cứ 401 dù ký đúng công thức, vì đang gọi nhầm vào server CŨ với secret cũ. Dùng `Get-CimInstance Win32_Process` (PowerShell) lọc đúng `CommandLine` chứa `be\node_modules...nest.js`/`be\dist\src\main` để nhận diện ĐÚNG các tiến trình backend rác (tránh nhầm sang tiến trình `vite`/`dev:fe` của chính user đang chạy dở, không được đụng) — `taskkill //F` từng PID, khởi động lại DUY NHẤT 1 instance, chờ đúng dòng log `"Nest application successfully started"` (không chỉ tin `curl` trả 200, vì 200 có thể tới từ instance CŨ vẫn còn treo) rồi mới tin tưởng chạy smoke test. **Bài học mới, bổ sung cho nguyên tắc "chạy thử thật" đã có**: trong 1 phiên làm việc dài lặp lại nhiều lần `npm run start:dev` để live-boot-test, LUÔN kill sạch tiến trình cũ (theo đúng `CommandLine`, không đoán qua PID) và chờ dòng log khởi động THÀNH CÔNG rõ ràng trước khi tin tưởng bất kỳ phép thử `curl`/HTTP nào tiếp theo — `curl` trả 200 chỉ chứng minh "CÓ AI ĐÓ đang nghe cổng này", không chứng minh "ĐÚNG code/config mới nhất đang chạy".

**Verify**: `tsc --noEmit` 0 lỗi, `npx eslint <module đã sửa>` 0 lỗi, `npm run test` (toàn bộ, không chỉ module đụng) — **29/29 suite, 314/314 test pass** (tăng từ 25/25 suite, 276/276 test trước lượt này — 4 suite mới: `marketplace-webhooks.service.spec.ts`, `shipments.service.spec.ts`, `order-groups.service.recipientKeyAndCancel.spec.ts`, `consolidation-key.util.spec.ts` mở rộng; các suite cũ như `allowed-status-transitions.spec.ts` mở rộng thêm case N1). Đã live-boot app thật (`npm run start:dev` với env giả cho AURELLE/Lazada) xác nhận không có circular-dependency giữa `MarketplaceWebhooksModule`/`ShipmentsModule` và các module đã có — `curl /api/docs` trả 200 sau khi thêm cả 2 module mới. Đã tự chạy smoke test webhook thật (5 case: chữ ký sai, replay, dedupe, sync thành công, authorization_revoked) — toàn bộ đúng thiết kế.

**Còn lại (ngoài phạm vi việc này, ghi lại để không quên)**: Giai đoạn 4 (outbox ghi ngược trạng thái/tồn kho về AURELLE) — vẫn "code đủ, không invoke" như đã chốt cho Fulfillment API Lazada. N2 (nới rate-limit cho các API khác ngoài webhook) — không đụng.


## Rà business rule sau review (30/09/2026) — Phase 1–3 đã sửa, Phase 4–5 còn lại

Review ngoài chỉ ra 6 lỗi nghiệp vụ; đã sửa và có test:
1. **Tồn kho sai phạm vi**: `pickItem()` và 2 picking list của `warehouse.service.ts` giờ lọc đủ `warehouse + platform + shop_id + seller_sku` (khớp unique index của `SkuBinAssignment`).
2. **Bypass duyệt partial**: `confirmPicked()` chỉ chạy từ `picking`; `partial_needs_review → picked` chỉ đi qua `decidePartial(true)`.
3. **Hủy đơn**: hủy nhóm nhả MỌI recommendation active (`updateMany` theo `order_group_id`, không dựa con trỏ `active_packaging_recommendation`); mới có `handleOrderBecameUnfulfillable()` — đơn hủy mà nhóm còn đơn khác và đã có phương án thì vô hiệu phương án, `approved_for_packing → picked` (cạnh mới), notify `packaging_plan_invalidated`.
4. **Khóa nhóm**: `tryConsolidate()` chỉ gộp cùng platform + shop, chỉ vào nhóm `awaiting_packaging`/`picking` (`isGroupOpenForNewOrders()`), không chuyển nhóm cho đơn đã có nhóm.
5. **Nhánh partial**: `decidePartial(false)` vào thẳng `picking` lượt mới (trước đây kẹt ở `awaiting_packaging`, không API nào đưa đi tiếp). Vẫn chưa tự nhập lại tồn của lượt bị hủy: `pick_events` không lưu `warehouse_id` nên không restock tự động được — cần thêm field đó ở Phase 4.
6. **Khóa đồng thời**: `adjust()` ghi trong transaction, khóa lạc quan `__v` của recommendation và tăng `__v` của nhóm (FE `run()` đã tải lại sau mỗi thao tác nên không đổi FE).

**Bài học**: unit test mock không thấy được lỗi phạm vi truy vấn (filter thiếu trường vẫn "đúng" với mock) — test mới assert thẳng filter được truyền vào Mongo.

**Còn lại**: hoàn hàng nhận + kiểm chất lượng + nhập lại tồn, lưu `warehouse_id` trên `pick_events` (restock lượt lấy bị hủy), duyệt kiện bất thường, shipping/carrier/ETA/phí, chứng từ in, nối màn mock FE với API. ✅ Đa kiện trong generate/approve/pack ĐÃ LÀM ở mục "Engine đóng gói 3D mới + đa kiện thật (30/09/2026)" bên dưới (user chọn tập trung thuật toán/hình dạng đơn hàng trước phần còn lại).

## Engine đóng gói 3D mới + đa kiện thật (30/09/2026)

**[stated] Quyết định của user (30/09/2026):** tập trung sâu vào thuật toán và "một tỉ tình huống" hình dạng đơn; (1) **đa kiện thật** vào generate/approve/adjust/pack — 🔄 **ĐÃ THAY ĐỔI** quyết định "mỗi đơn một kiện" (12/09, 21/09): mỗi đơn có N kiện; (2) giữ mọi món là khối hộp, làm thật sâu (shop chỉ bán giày dép + quần áo); (3) kiểm chứng bằng cả 3: bộ kịch bản đơn, benchmark, property test. Hoàn hàng/Phase 5 để sau.

### M1 — bộ kịch bản + benchmark (làm TRƯỚC để chứng minh cải tiến)
`engine/scenarios/order-scenarios.ts` (~40 kịch bản có tên: số lượng 1→120 món, tải, cỡ + dung sai làm tròn, giày, dễ vỡ, quần áo/gập, kho, biên) + `scenario-runner.spec.ts` (mọi kết quả ok qua `validateCandidate`, không mất/không trùng món giữa các kiện; kịch bản chưa đạt đánh dấu `knownGap` chạy bằng `it.failing` — hết lỗi thì jest báo đỏ để gỡ cờ) + `engine-property.spec.ts` (80 đơn ngẫu nhiên ≤ ~24 món, validator là nguồn sự thật) + `scripts/pack-benchmark.ts` (300 đơn seed cố định; `--out`/`--compare`, kết quả lưu `scripts/benchmark-results/`). **Baseline lộ đúng điểm yếu thật:** 2 hộp giày không xếp cạnh nhau được trong thùng L dù xoay 1 hộp thì vừa (first-fit chọn hướng đầu), dễ vỡ luôn xếp trước nên không bao giờ nằm trên áo, `packIntoMultipleCartons` chậm (60 món ~5 s, 120 món ~10 s và hụt).

### M2 — lõi thuật toán (`engine/ep-packer.ts`, `greedy-packer.ts`)
Packer extreme-point có chấm điểm (điểm thử ~O(n) thay tích Descartes ~O(n³)); tải chồng cập nhật **tăng dần** (vật đỡ cố định lúc đặt vì luôn đỡ 100% đáy); vị trí chọn theo (z thấp → nhiều tiếp xúc → góc) hoặc theo chính sách `narrow-x`/`narrow-y`; món được nén về -x, -y. 7 thứ tự xếp (thêm: nền chịu tải trước – dễ vỡ cuối, nặng trước, đáy lớn + dễ vỡ cuối) × 3 chính sách; first-fit gốc giữ làm 4 lượt thử đầu cho đơn ≤ 24 món (fixture tính tay §7 vẫn xanh). Bỏ trần 30 món (200). Gập đôi theo **nhóm SKU, ít món gập nhất trước** (≤ 48 phương án) thay tiền tố "lớn nhất trước". `analyzeUnfittable`/`classifyUnfittable`: món không vào được thùng nào (quá cỡ mọi hướng kể cả sau gập, hoặc nặng hơn mọi thùng) báo ngay có mã, không lặp lại từng thùng. `NoFitCode` + `suggest` (`multi_carton|bigger_box|manual`). Ngân sách thời gian chia theo thùng còn lại (thùng nhỏ thất bại lâu không ăn hết giờ của thùng lớn). **Không làm** `min_support_ratio` (nới đỡ đáy cho hàng mềm): benchmark không chứng minh cần, và nới phải đồng thời sửa validator — ghi vào giới hạn.

### M3 — đa kiện (`engine/multi-carton-packer.ts`, viết lại)
Tách món không thể đóng → thử 1 kiện → điền từng thùng bằng `createEPPacker` có trạng thái (món nào vừa thì đặt, món giống hệt chia sẻ kết quả thất bại tới khi thùng thay đổi) → chọn thùng nhỏ nhất chứa được toàn bộ phần còn lại, nếu không có thì thùng xếp được nhiều thể tích nhất → đóng lại kiện bằng `packOrder` (thùng nhỏ nhất vừa đúng nhóm món, có validator + vật tư), không tái lập được thì dùng kết quả điền nhưng **vẫn phải qua validator độc lập**. Trừ tồn thùng theo từng kiện. `status: ok|partial|no_fit` + `unplaced[]` có mã (`ITEM_TOO_LARGE/ITEM_TOO_HEAVY/OUT_OF_STOCK/NO_ARRANGEMENT/TIMEOUT`).

### M4 — tích hợp
Schema `cartons: CartonEntry[]` + `carton_count` (sub-schema; field cấp phương án **phản chiếu kiện 0** → luồng/FE 1 kiện chạy nguyên; bản ghi cũ suy ra 1 kiện qua `cartonsOf()`); `no_fit_reasons` thêm `code`, `item_key`. `generateRecommendations` gọi packer đa kiện, lưu N kiện, đơn không đóng hết được = `no_fit` (không lưu kiện dở dang). `listAvailability` giữ chỗ **theo kiện** (pipeline `$unwind` cartons; bản ghi cũ dùng `box_code` cấp trên). `adjust` nhận `carton_index` (đóng lại đúng các món của kiện đó; trừ chỗ các kiện khác đang dùng cùng thùng khi kiểm tồn; đơn no_fit thì đóng toàn bộ đơn). `pack` nhận cân **từng kiện** (`carton_index` bắt buộc khi đơn nhiều kiện; khóa `recommendationId:index`), trừ 1 thùng/kiện, `isAbnormal` cấp kiện + cấp phương án, thông báo riêng từng kiện bất thường. Hướng dẫn đóng gói theo kiện (`cartons.<i>.packing_guide`; kiện 0 còn ghi guide cấp trên; bản ghi cũ chưa có mảng `cartons` chỉ ghi guide cấp trên vì `$set` đường dẫn mảng chưa tồn tại sẽ lỗi). `ENGINE_VERSION = 'ep-3d-v2'`. Mã lỗi mới `PKG_CARTON_NOT_FOUND`. FE: `viewOfCarton()` nhìn phương án như đang xem 1 kiện nên các màn cũ dùng lại; trang kế hoạch có tab kiện + cân từng kiện, wizard nhận `?carton=`. Seed demo `scripts/seed-ai-guide-demo.ts` thêm 3 nhóm đa kiện (đã chạy thật: đơn sỉ 52 món → 5 kiện L, 8 hộp giày → 2 kiện, đơn hỗn hợp → 2 kiện).

### Kết quả đo (300 → 150 đơn ngẫu nhiên seed 20260930, `pack-benchmark.ts`; baseline = engine cũ)
| Chỉ số | Baseline | Sau M3 |
|---|---|---|
| Số kiện TB / đơn | 1,84 | **1,48** |
| % đơn phải nhiều kiện | 32,7 | **25,3** |
| Đơn 9–20 món: kiện TB | 3,59 | **2,76** |
| Đơn 21+ món: kiện TB | 8,00 | **5,75** |
| Chi phí thùng+vật tư / đơn (VND, baseline suy ra 1,84×5.781) | ~10.600 | **10.003** |
| Thời gian p95 | 10 ms | 17 ms |
Kịch bản: 34/34 suite, **414 test** (từ 316 đầu đợt) đạt; 2 hộp giày cùng thùng, dễ vỡ nằm trên áo, 60 món 5,1 s → 0,15 s, 120 món hụt → đóng đủ 8 kiện 0,3 s. Độ lấp đầy TB giảm (0,39 → 0,34) vì ít kiện hơn nhưng dùng thùng lớn hơn — chấp nhận, vì mục tiêu là ít kiện/chi phí đơn thấp hơn, không phải lấp đầy.

### Bài học + giới hạn còn lại
- **Test mock không thấy được bao nhiêu thứ bằng chạy thật:** kịch bản có hình dạng thật (hộp giày 33×21×12 upright) lộ điểm yếu first-fit mà 40 vòng ngẫu nhiên ≤ 6 món cũ không bao giờ chạm; seed thật lộ đường dẫn `$set` vào mảng chưa tồn tại (bản ghi cũ) mà mock không lỗi.
- `it.failing` dùng làm "hàng rào tiến độ" cho `knownGap` rất hiệu quả: mỗi milestone chỉ cần chạy jest là biết kịch bản nào đã được cứu (10/10 gap của baseline được cứu bởi M2+M3).
- Giới hạn: heuristic, không chứng minh tối ưu — `no_fit` có thể do thời gian; multi-carton là greedy theo thể tích, chưa cân bằng tải giữa kiện; vật tư vẫn là ước lượng theo luật (không chiếm thể tích); nhiều kiện chưa có chứng từ in/vận đơn theo kiện; chưa xem animation nhiều kiện bằng mắt trên trình duyệt (chỉ tsc/eslint/build FE).
- Multi-carton dùng đồng hồ tường (`Date.now`) cho ngân sách thời gian nên kịch bản sát trần có thể lệch giữa 2 lần chạy khi máy bận — test xác định chỉ dùng kịch bản nhanh.
- Chạy `scripts/seed-ai-guide-demo.ts` gọi `notify()` thật → tạo thông báo in-app cho user thật (email lỗi vì SMTP dev sai cấu hình, không tới ai); cần biết khi chạy lại.

## Hoàn thiện engine đa kiện, hoàn hàng/nhập lại tồn, vận chuyển thật, chứng từ PDF (30/09/2026)

**Đã làm (backend, có test; `tsc` 0 lỗi, `lint:ci` 0 lỗi, jest 38 suite / 464 test):**
- 🔄 **ĐÃ THAY ĐỔI quyết định 12/09 + 21/09 "mỗi đơn một kiện"**: mỗi đơn N kiện (đa kiện thật, `cartons[]`; đơn vừa 1 thùng vẫn 1 kiện). Chia kiện theo tải + **cân bằng tải giữa các kiện** (`balanceLoad`, LPT + `rebalanceCartons`); `no_fit` có mã lý do (`ITEM_TOO_LARGE`, `ITEM_TOO_HEAVY`, `OUT_OF_STOCK`, `TIMEOUT`…).
- Sửa 6 lỗ hổng business rule: tồn kho quét theo đúng sàn+shop, `pick` chỉ từ `picking`, hủy đơn làm vô hiệu phương án đóng gói, `tryConsolidate` khóa nhóm đã vào giai đoạn đóng/giao, khóa lạc quan ở adjust.
- **Hoàn hàng nhận lại kho**: `POST /order-groups/:id/fulfillment/return-receive` (collection `return_receipts`, unique theo nhóm), đạt → nhập lại tồn, hỏng → chỉ ghi nhận.
- **Nhập lại tồn khi hủy lượt lấy** (`decidePartial(false)`): `pick_events` thêm `warehouse_id` + `restocked_at`. Sự kiện cũ không có `warehouse_id` **không** tự nhập được → log để kho đối soát tay. Giả định: nhân viên đã trả hàng về kệ.
- **Module `shipping/`**: hãng + bảng cước theo bậc (`shipping_carriers`), chiến lược `cheapest/fastest/fixed` (`shipping_settings`), báo giá theo kiện (cân tính cước = max(thực, thể tích ngoài ÷ hệ số hãng)). **Số cước là MẪU** (`is_sample`, seed `scripts/seed-shipping-carriers.ts`) — không phải cước thật.
- **`shipments/`**: `POST /shipments/batch` giờ **bắt buộc** hãng + dịch vụ, lưu cước/ETA/lịch lấy hàng, ghi cước lên phương án đóng gói; thêm GET list/theo nhóm, `PATCH :id/pickup`.
- **Module `documents/`**: phiếu đóng gói, nhãn từng kiện (Code128 + QR), bảng kê chuyến — pdfkit + bwip-js + qrcode, font DejaVu nhúng (gói `dejavu-fonts-ttf`).
- FE: `api/shipping.api.ts` + trang `/app/shipping/dispatch` (báo giá → chọn hãng → tạo vận đơn → in nhãn/bảng kê/phiếu → hẹn lấy hàng).

**Chưa làm / giới hạn thật (không được tuyên bố ngược lại khi trình bày):**
- Trang `/app/shipping` cũ (`ShippingPage.tsx`), `PackingDashboard` và các trang warehouse mock **vẫn là mock**; chưa có FE cho nhận hàng hoàn, quản lý hãng vận chuyển, cấu hình chiến lược.
- Chưa gọi API hãng vận chuyển thật, chưa có tracking trạng thái từ hãng; `trackingCode` là mã nội bộ.
- Vật tư chèn chỉ là **ước lượng theo luật**, không vào hình học; thuật toán là heuristic, không chứng minh tối ưu, `no_fit` có thể do hết ngân sách thời gian.
- Chưa chạy end-to-end với DB thật + xem PDF/giao diện bằng mắt.

**Bài học kỹ thuật:** heredoc bash chứa tiếng Việt bị cắt → viết file bằng công cụ Write (kể cả script python sửa docs); ESLint `react-hooks/set-state-in-effect` bắt cả `void reload()` gọi trong effect → dùng chuỗi `.then` trong effect + biến `version` để tải lại.

## Engine đóng gói — Bước 1 "độ tin cậy kết quả" (04/10/2026) — ĐÃ TRIỂN KHAI

Theo kế hoạch 4 bước khắc phục hạn chế engine (độ tin cậy → chất lượng xếp → hình dạng thật → kiểm chứng trực quan). **Mới xong Bước 1**; Bước 2–4 chưa làm.

- **Xác định hóa** (`engine/budget.ts`): ngân sách giờ là SỐ LẦN KIỂM TRA VỊ TRÍ (`CheckBudget`; mặc định 3M cho 1 thùng, 15M cho đa kiện ≈ 2 s / 10 s trên máy dev, đo ~1.400 lần/ms; ca hợp lệ nặng nhất ~420k). Đồng hồ tường (`timeBudgetMs`, mặc định 60 s) chỉ còn là chốt chặn chống treo → cùng đầu vào luôn ra cùng kết quả, kể cả khi máy bận. Test dùng `maxChecks`; test cũ dùng `timeBudgetMs`+`now` giả vẫn chạy.
- **Phân loại no_fit**: mã mới `BUDGET_EXHAUSTED` ("chưa tìm được", không phải vô nghiệm; `TIMEOUT` chỉ còn cho chốt chặn đồng hồ). `PackNoFit.proven_infeasible` = true chỉ khi MỌI lý do là bằng chứng (`ITEM_TOO_LARGE/HEAVY`, `TOTAL_VOLUME/WEIGHT`, `NO_ITEMS/NO_BOXES`) — `isProvenInfeasible()`. Lưu vào `packaging_recommendations.proven_infeasible`, trả `provenInfeasible`; FE hiện "Không thể xếp" vs "Chưa tìm được cách xếp tự động".
- **Cận dưới số kiện** (`engine/lower-bound.ts`, `lowerBoundCartons`): max(⌈tổng thể tích ÷ lòng thùng lớn nhất⌉, ⌈tổng cân ÷ tải lớn nhất⌉). Lưu `lower_bound_cartons`, trả `lowerBoundCartons`, FE hiện "đã đạt mức tối thiểu". Benchmark 300 đơn (seed 20260930, `scripts/benchmark-results/step1.json`): **76,7% đơn đạt đúng cận dưới** (tối ưu số kiện có chứng minh), khoảng cách TB 0,37 kiện, 1,45 kiện/đơn, 9.677 đ/đơn, p95 7 ms — không hồi quy so với m3. Bin packing 3D là NP-khó: cận dưới KHÔNG phải tối ưu tuyệt đối, chỉ là mức không thể thấp hơn.
- Verify: `tsc` 0 lỗi, eslint engine/scripts 0 lỗi, jest 39 suite / 474 test. Chưa chạy e2e với DB thật (bản ghi cũ không có 2 field mới → null, FE đã xử lý).
- Bài học: KHÔNG dùng `git stash` để "so sánh trước/sau" trong repo có hàng trăm thay đổi chưa commit của người khác — suýt cất mất toàn bộ (đã `pop` khôi phục đủ). Muốn so sánh thì đọc `git diff`/`git show HEAD:file`.

## Engine đóng gói — Bước 2 "chất lượng xếp" (04/10/2026) — ĐÃ TRIỂN KHAI MỘT PHẦN

Tiếp Bước 1. Làm theo kiểu **đo trước, giữ cái có tác dụng, gỡ cái không** (benchmark 300 đơn, seed 20260930, `scripts/benchmark-results/step2.json`). `ENGINE_VERSION` = `ep-3d-v3`.

**Đã giữ (có số đo):**
- **Giải thể kiện nhỏ** (`engine/improve.ts`, `consolidateCartons`): thử nhét từng món của kiện ít món nhất vào kiện khác (đóng lại bằng `packOrder` nên mọi kiện mới đều qua validator), chỉ nhận khi tổng chi phí thùng+vật tư không tăng. Ca thật 3 kiện (14u + 4u lấp 0,20 + 1 giày nặng) → 2 kiện, 20.500 → 16.000 đ. Ngân sách xác định, **co theo số món** (`16M / n`, tối đa 800k lần kiểm tra) vì chi phí mỗi lần kiểm tra tăng theo số món đã đặt; không co thì đơn 250 món chậm 2,9 s (test cũ `< 15 s` trong jest rớt, jest chậm hơn node ~30×).
- **Cân bằng cả cân lẫn thể tích** (`rebalanceCartons`): LPT trên tải chuẩn hóa (cân/tổng cân + thể tích/tổng thể tích); chỉ nhận khi độ lệch chuẩn hóa giảm và chi phí không tăng.
- **Đệm cho hàng dễ vỡ vào hình học** (`expandToUnits(items, { fragileCushionMm })`, `DEFAULT_FRAGILE_CUSHION_MM = 5`): món dễ vỡ chiếm 2×5 mm thêm theo mỗi chiều (chừa chỗ bọc xốp). Production bật qua `UNIT_OPTIONS` trong `packaging.service.ts` — **mọi đường dựng units (generate/adjust/hướng dẫn) phải dùng chung `UNIT_OPTIONS`**, lệch là số đo kiện đã lưu không khớp lúc validate. Mặc định hàm = 0 để test hình học thuần không đổi. Chi phí/đơn chỉ +0,4%. Placement của bản ghi `ep-3d-v2` cũ không có đệm, vẫn hợp lệ (adjust luôn đóng lại từ đầu).
- **Siết cận dưới**: khi mọi món không chịu được tải đè (dễ vỡ / không cho chồng / sức chịu < món nhẹ nhất) thì tất cả phải nằm sát sàn → thêm cận theo diện tích đáy (`lower-bound.ts`). Vật tư vẫn là ước lượng theo luật cho số lượng; chỉ phần đệm dễ vỡ đã vào hình học.

**Đã thử và GỠ (không có tác dụng thật):**
- **Thứ tự ngẫu nhiên có seed** khi thứ tự cố định hụt: kết quả y hệt (kể cả khi tăng lên 40 lượt × 48 phương án gập), chỉ chậm hơn → 21 thứ tự × 3 chính sách đã bão hòa.
- **Nới đỡ đáy 0,8 cho quần áo** (kèm điều kiện tâm đáy nằm trên vật đỡ): không giảm số kiện. Mức giảm 1,42→1,38 thấy ở thử nghiệm chỉ xuất hiện khi nới cho **cả hộp giày** — là giả định vật lý rủi ro (hộp cứng thò 20% ra ngoài), chưa áp dụng; nếu cần thì phải hỏi kho/đóng gói trước.

**Kết quả (300 đơn):** kiện TB 1,45 → 1,43; chi phí/đơn 9.677 → 9.575 đ (đã gồm đệm dễ vỡ); khoảng cách tới cận dưới 0,37 → 0,32; 78,7% đơn đạt cận dưới; p95 43 ms, tối đa 292 ms. Phần lớn đơn còn xa cận dưới có hộp giày (không chồng được) nên một phần khoảng cách là do cận chưa chặt, không hẳn do thuật toán.
Verify: `tsc` 0 lỗi, eslint packaging/scripts 0 lỗi, jest 40 suite / 488 test. Chưa chạy e2e với DB thật, chưa xem 3D bằng mắt với đệm dễ vỡ (kích thước món dễ vỡ hiển thị lớn hơn số đo thật 10 mm).
Bước 3 (hình dạng thật — cần số đo từ kho) và Bước 4 (kiểm chứng trực quan) chưa làm.

## Làm lại đóng gói 3D — Đợt 1: bộ giải BRKGA + EMS (04/10/2026) — ĐÃ TRIỂN KHAI

**[stated] Quyết định của user (04/10/2026):** không hài lòng cả 4 mặt (hình 3D, kết quả xếp, luồng thao tác, khó bảo vệ) → **làm lại tất cả**: thuật toán lai **BRKGA (TypeScript) + CP-SAT (microservice Python OR-Tools)**, 3D kiểu render sạch (khối bo góc + nhãn, có công tắc bật mô hình sản phẩm), mô hình dữ liệu mới `packing_plans` (1 kế hoạch/nhóm), **tự tính khi lấy hàng xong**, bỏ "Từ chối, tính lại" → chỉnh tay (đổi thùng, chuyển món giữa kiện) + tính lại có điều kiện, **một màn hình làm việc**. Kế hoạch 5 đợt: `C:\Users\Admin\.claude\plans\v-y-nh-ng-h-n-ch-hashed-koala.md`. Đợt 1 đã xong; đợt 2–5 chưa làm. Engine cũ (`packaging/engine/`) vẫn đang chạy production cho tới đợt 3.

**Bộ giải mới `be/src/modules/packing/solver/`** (hàm thuần, chưa nối vào service/API):
- `solve-order.ts` (`solveOrder`): tách món không xếp được (`ITEM_TOO_LARGE/HEAVY`, `OUT_OF_STOCK`) → n ≤ 3 **vét cạn không gian giải mã**, n > 3 **BRKGA** (quần thể clamp(10n,40,120), elite 15%, đột biến 15%, ρe 0,7, ngân sách theo số lần giải mã — xác định, seed băm từ item_key) → **gộp cặp kiện** (giải lại hợp 2 kiện bằng BRKGA nhỏ) → `validatePlan` (validator cũ từng kiện + mỗi món đúng 1 lần + không vượt tồn; sai = ném lỗi) → nhãn chứng minh.
- `decoder.ts` + `parcel-state.ts`: khóa = thứ tự + chọn biến thể + thiên lệch thùng; **Empty Maximal Spaces** + luật **DFTRC** (Gonçalves & Resende 2013); gen chọn trong **4 vị trí DFTRC tốt nhất** (chỉ chọn biến thể trong 1 EMS cố định đã làm sót bố cục 2 đôi dép đặt cạnh nhau); **gập chỉ khi dạng gốc không còn chỗ** (đúng quy tắc 22/09); mở kiện bằng thùng lớn nhất còn tồn rồi **co thùng**.
- `proof.ts`: nhãn `optimal_global` = số kiện bằng cận dưới VÀ mọi tổ hợp thùng rẻ hơn bị loại bằng điều kiện cần (vừa cỡ, thể tích, cân, diện tích sàn khi mọi món không chịu tải), kèm lời giải thích từng tổ hợp ("SAMPLE-S: không thể — món JEAN không vừa…"). Tổ hợp chưa loại được → `heuristic`, giữ lại `openCandidates` cho CP-SAT ở đợt 2. Giá vật tư không thuộc phần chứng minh.
- Tái dùng từ engine cũ: `validator.ts`, `units.ts`, `lower-bound.ts`, `material-selector.ts`, `orderUnits` (gieo quần thể đầu).
- Benchmark mới `scripts/solver-benchmark.ts` (so từng đơn với engine cũ: thắng/hòa/thua, nhãn, độ trễ theo cỡ, kiểm tra xác định, bộ ca đối kháng); bộ sinh đơn tách ra `scripts/benchmark-orders.ts` (dùng chung với `pack-benchmark.ts`, kết quả không đổi).

**Kết quả** (đệm dễ vỡ 5 mm, không vật tư): 300 đơn — 20 thắng / 280 hòa / **0 thua**, kiện TB 1,43 → 1,41, giá thùng 9.575 → 9.287 đ (−3,0%), 68% `optimal_global`, p95 229 ms. Phân tầng 1.094 đơn (≥100 đơn 9–20 và 21+) — 125 thắng / 969 hòa / **0 thua**, kiện 1,815 → 1,757, giá thùng 12.771 → 12.137 đ (−5,0%), 63% `optimal_global`, p95 472 ms (đơn 21+ p95 885 ms; 200 món 1,3 s), chạy 2 lần giống hệt. Kết quả lưu `scripts/benchmark-results/solver-v1*.json`. Lợi ích chủ yếu ở chi phí và chứng minh, số kiện chỉ giảm nhẹ (đúng kỳ vọng đã nói với user).
**Bài học:** (1) quy tắc chọn vị trí "EMS đáy-sâu-trái đầu tiên" xếp kém chặt → đơn 3 kiện; DFTRC sửa được. (2) Cho gen chọn biến thể trong 1 EMS là chưa đủ — phải cho chọn trong vài vị trí tốt nhất. (3) Viết test "quần không gập" sai vì jean rộng 26 cm > lòng M 25 cm — kiểm số đo trước khi kết luận bộ giải sai.
Verify: `tsc` 0 lỗi, `lint:ci` 0 lỗi, jest 41 suite / 509 test (21 test mới ở `packing/solver/solver.spec.ts`).

## Làm lại đóng gói 3D — Đợt 2: microservice CP-SAT `packer/` (04/10/2026) — ĐÃ TRIỂN KHAI

- **Service mới `packer/`** (Python 3.12+, FastAPI, OR-Tools 9.15, pydantic 2.13 — bản cũ hơn không có wheel cho Python 3.14 trên máy dev): `GET /healthz`, `POST /v1/check-combos` (hợp đồng `schema_version: 1`, mm/g, biến thể món đã nở sẵn từ backend). Trả lời từng tổ hợp thùng **theo thứ tự backend gửi**, dừng ở tổ hợp đầu tiên không bị chứng minh "infeasible" (phần còn lại `skipped`).
- **Mô hình CP-SAT (`packer/packer/feasibility.py`) CHẶT HƠN validator TS**: đỡ đáy = sàn / 1 vật chứa trọn đáy / **2 vật phủ trọn** (chia theo x hoặc y — áo vắt qua 2 hộp giày được); tải chồng tính **toàn bộ** trọng lượng phía trên cho mỗi vật đỡ; món không chịu tải không có gì chạm mặt trên. Phá đối xứng: thùng giống nhau điền theo thứ tự chỉ số; **món giống hệt nhau xếp theo (thùng, z, y, x)** — thêm cái này nâng tỷ lệ chứng minh 93,8% → 97,8%. `interleave_search=True` + seed + `max_deterministic_time` → **cùng request luôn cùng kết quả** (đã kiểm 40/40 đơn).
- **Backend**: `proof.ts` giờ liệt kê mọi tổ hợp **ít kiện hơn** (từ cận dưới, bất kể giá) + tổ hợp cùng số kiện rẻ hơn → `open_candidates` trên `SolveResult`; chế độ `prefer: 'cheapest'` không chạy chứng minh. `cp-sat.ts` (`upgradeWithCpSat`, `httpCpSatChecker`): mọi tổ hợp infeasible → `optimal_in_model`; CP-SAT tìm được tổ hợp tốt hơn → nhận **chỉ khi qua `validatePlan`** (hai ngôn ngữ kiểm nhau); `unknown`/lỗi mạng → giữ `heuristic` kèm lời giải thích. Config `config/packer.config.ts` (`PACKER_URL`, `PACKER_ENABLED`, `PACKER_TIMEOUT_MS`, `PACKER_MAX_UNITS=12`, `PACKER_DET_TIME_PER_COMBO=1`, `PACKER_WALL_TIME_S=6`); thiếu URL → `packer: null`, hệ thống vẫn chạy bằng BRKGA. **Chưa nối vào service/API** — đợt 3 sẽ gọi trong job nền sau khi BRKGA đã có kết quả.
- **Kết quả** (`be/scripts/cpsat-benchmark.ts`, 300 đơn, service chạy local): đơn ≤ 12 món **97,8% có nhãn tối ưu** (203 `optimal_global` + 66 `optimal_in_model`), toàn bộ 300 đơn: 204 global + 66 in-model + 30 heuristic; CP-SAT tìm được 1 đơn rẻ hơn BRKGA; p95 cả pipeline 2,5 s (riêng nhóm ≤ 12 món p95 3,9 s, tối đa 6,3 s = trần thời gian), xác định. Lưu `be/scripts/benchmark-results/cpsat-v1.json`. Đơn còn `heuristic` chủ yếu là chứng minh "không vừa 1 thùng L" khó.
- **Hạ tầng**: `packer/Dockerfile` (python:3.12-slim, user `app` uid 1001, healthcheck; image 522 MB, đã build + chạy thử healthy); docker-compose service `packer` + `be` có `PACKER_URL=http://packer:8000` và chờ `packer` healthy; k8s `base/packer.yaml` (Service nội bộ, không Ingress) + ConfigMap `PACKER_URL` + 2 overlay; CI job `packer` (ruff, ruff format, mypy strict, pytest) + build image trong job `docker`; release matrix thêm `packer`; `.dockerignore`/`.gitignore` thêm mục Python. Docs `docs/DEPLOYMENT.md`, `k8s/README.md` đã cập nhật.
- **Chạy local**: `cd packer && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"` rồi `.venv/Scripts/python -m uvicorn packer.main:app --port 8000`. Thêm `PACKER_URL=http://127.0.0.1:8000` vào `be/.env` (file thật không commit — chưa tự sửa).
- **Bài học**: (1) sửa CI bằng `str.replace` theo tên bước đã chèn nhầm vào job `storefront` vì job đó có bước cùng tên — luôn grep lại cấu trúc job sau khi sửa workflow. (2) mypy bắt được biến `box_index` bị đặt trùng tên ở hai nghĩa khác nhau trong cùng hàm.
Verify: packer — ruff, ruff format, mypy strict, pytest 11/11; backend — `tsc` 0 lỗi, `lint:ci` 0 lỗi (43 cảnh báo storefront có sẵn), jest 42 suite / 514 test; `docker compose config` hợp lệ; `kubectl kustomize` 2 overlay render đúng image packer; YAML workflow hợp lệ.

## Làm lại đóng gói 3D — Đợt 3: `packing_plans` + API mới + tự tính (04/10/2026) — ĐÃ TRIỂN KHAI (backend)

- **Collection mới `packing_plans`** (`be/src/modules/packing/schemas/packing-plan.schema.ts`): **1 kế hoạch/nhóm** chứa mọi đơn (`orders[]`: trạng thái ok/partial/no_fit, món chưa xếp, **nhãn chứng minh riêng từng đơn**, lời giải thích, trạng thái CP-SAT) và mọi kiện (`parcels[]`, `parcel_no` 1..N trong cả nhóm, thùng chụp đủ inner/outer/bì/tải/giá, toạ độ, vật tư, hướng dẫn, cân thật, bất thường, thiếu vật tư, cước). Trạng thái `computing | ready | approved | packed | rejected | failed | superseded`. **Khoá lạc quan bằng field `version` tường minh** (không dùng `__v`). Chỉ mục duy nhất 1 kế hoạch hoạt động/nhóm — đồng thời là khoá chống 2 job cùng tính. Tất cả field enum đã khai `type: String` (đúng Rule #23 — lần đầu quên, app hỏng lúc nạp schema trong jest).
- **API mới** `order-groups/:groupId/packing-plan` (`packing-plan.controller.ts`): `GET` (PKG/WH/SHIP/OWNER/ADMIN), `POST recompute` (loại trừ thùng / ưu tiên rẻ), `POST approve`, `POST reject` (chuyển xử lý ngoài hệ thống — kế hoạch `rejected` VẪN hoạt động để cron không tự tính lại, báo Admin), `POST parcels/:no/change-box`, `POST parcels/:no/move-item` (chỉ trong cùng đơn hoặc tách kiện mới), `POST parcels/:no/guide` (throttle), `POST pack` (cân đủ mọi kiện). Mọi thay đổi gửi `expected_version`. Response camelCase, có `proof` = nhãn yếu nhất các đơn, `cpSatPending`, `totals`.
- **ĐÃ GỠ luồng cũ**: `PackagingService`/`PackagingController`/`PackagingPackController`, route `order-groups/:id/packaging/*` + `order-groups/:id/fulfillment/pack`, DTO approve/adjust/reject/pack-group/packing-guide, `cartonsOf()`, script `migrate-packaging-recommendation-index.ts`, field chết `order_groups.active_packaging_recommendation`. **FE cũ (trang kế hoạch + wizard) sẽ gọi hỏng cho tới Đợt 4** — đã biết, có chủ đích. Collection `packaging_recommendations` + schema cũ giữ nguyên làm lịch sử (chỉ script migrate đọc).
- **Tự tính** (`packing-job.service.ts`): cron **mỗi 10 giây** tìm nhóm `picked` chưa có kế hoạch hoạt động → `compute()` (BRKGA đồng bộ, ghi kế hoạch `ready` + nhóm `pending_approval` trong 1 transaction, báo Packaging Staff) → **CP-SAT chạy nền** (`runCpSatInBackground`) nâng nhãn; chỉ thay kiện khi kế hoạch còn `ready` và `version` chưa đổi, đã duyệt thì chỉ ghi chú. Dùng quét định kỳ thay vì gọi từ order-groups để không vòng phụ thuộc module và tự chữa khi app khởi động lại. Lỗi dữ liệu (vd hồ sơ SKU chưa sẵn sàng) → kế hoạch `failed` + lý do, KHÔNG tự tính lặp; sửa xong bấm "Tính lại".
- **Module khác đã chuyển sang `packing_plans`** qua hợp đồng duy nhất `parcelsOfPlan()` (`packing/utils/parcels.util.ts`): shipping (`parcelsOfGroup` đọc kế hoạch `approved|packed`; `persistCosts` ghi `shipping_cost_vnd` lên TỪNG kiện), documents (phiếu đóng gói, nhãn — nhãn dùng cân thật nếu đã đóng), order-groups (hủy nhóm / đơn bị hủy → kế hoạch `superseded`, nhóm về `picked` → cron tự tính lại). Giữ chỗ thùng (`listAvailability`) đếm kiện của kế hoạch `ready|approved`; sổ xuất thùng/vật tư thêm `packing_plan_id` + `parcel_no` (giữ `recommendation_id` cho bản ghi cũ).
- **Script**: `scripts/migrate-to-packing-plans.ts` (mặc định chạy thử, `--apply` mới ghi; bỏ qua nhóm đã có kế hoạch mới; nhãn luôn `heuristic`; không sửa collection cũ) — **CHƯA chạy trên DB thật**. `seed-ai-guide-demo.ts` viết lại: tắt cron tự tính trong script rồi gọi `compute()` + chờ CP-SAT; in link `/app/packing/:groupId` (route FE của Đợt 4).
- **Verify**: `tsc` 0 lỗi trong phần của đợt này, `lint:ci` 0 lỗi, jest 42 suite / 496 test (gỡ spec của service cũ, thêm 23 test `packing-plan.service.spec.ts` dùng bộ giải thật + kho dữ liệu giả: tính, khoá chống tính trùng, failed, loại trừ thùng, duyệt/xung đột version/còn món chưa xếp, tính lại, từ chối, đổi thùng, chuyển món, cấm chuyển khác đơn, đóng gói + bất thường + thiếu cân, hướng dẫn lưu lại, CP-SAT vắng mặt, job cron). **Đã khởi động backend thật** (cổng 3100, Atlas thật): Nest khởi động thành công, route mới đăng ký, trả 401 khi thiếu token; cron không ghi gì (DB không có nhóm `picked` nào chưa có kế hoạch).
- **Lưu ý ngoài phạm vi**: lúc làm đợt này, `be/scripts/aurelle-developer-portal.ts` + `aurelle-mock-server.ts` đang được sửa ở nơi khác (không phải đợt này) và có lỗi `tsc` riêng — không đụng, không commit cùng.
- Docs FE (`API_LIST.md`, `INTEGRATION_GUIDE_FULFILLMENT.md`) chưa cập nhật — để Đợt 5.

## Làm lại đóng gói 3D — Đợt 4: giao diện mới (04/10/2026) — ĐÃ TRIỂN KHAI (frontend)

> 🔄 **ĐÃ THAY ĐỔI 05/10/2026:** toàn bộ FE trên `thi_dev` đã khôi phục về bản `main` (Thuận chốt: FE do nhóm FE làm, Claude chỉ làm backend). Các màn mô tả ở mục này và mục "Khung 3D đóng gói từng thao tác" không còn trên `thi_dev`; code lưu ở nhánh `backup/fe-packing-3d`. Xem mục "Khôi phục FE về main + phiên đóng gói (05/10/2026)" cuối file.

- **Backend phụ**: `GET /packing-plans/summary?group_ids=` (`PackingPlansController`, `listActiveByGroupIds`) — tóm tắt kế hoạch cho bảng hàng chờ (trạng thái, số kiện, chi phí, nhãn chứng minh, CP-SAT đang chạy).
- **`/app/packing` = `PackingQueuePage`**: 4 cột Đang tính / Chờ duyệt / Chờ đóng / Đã đóng (12 nhóm gần nhất) + dải "Cần xử lý" (kế hoạch `failed`/`rejected`). Hỏa tốc lên đầu, rồi hạn chót. Tự làm mới 10 s.
- **`/app/packing/:groupId` = `PackingWorkspacePage`** (1 màn hình thay trang kế hoạch + wizard): trái danh sách kiện theo đơn (cảnh báo đơn chưa xếp hết), giữa khung 3D, phải theo trạng thái: chờ duyệt → Duyệt / Đổi thùng / Tính lại có điều kiện (ưu tiên ít kiện/rẻ, loại thùng) / chuyển xử lý tay; mỗi món có nút chuyển sang kiện khác (cùng đơn hoặc kiện mới); "Vì sao phương án này?" (nhãn chứng minh, cận dưới, lời giải thích từng đơn); lịch sử chỉnh tay. Đang tính / lỗi / bị từ chối → màn trạng thái, thăm dò 3 s tới khi có kết quả. Link cũ `/app/packing/groups/:id(/orders/:x)` tự chuyển hướng.
- **Chế độ đóng gói toàn màn hình** (`components/packing-workspace/PackingMode.tsx`): mỗi kiện = chuẩn bị (thùng, hàng, vật tư, tóm tắt hướng dẫn AI — tự xin khi chưa có) → từng món (3D món rơi xuống + câu chữ to + lưu ý) → cân kiện (cảnh báo lệch >20% ngay trên màn) → xác nhận cả nhóm gọi `POST pack`. Phím ←/→, Esc.
- **Khung 3D mới `components/packing3d/`** (R3F + drei + `@react-three/postprocessing`): thùng carton mở 4 nắp, vách quay về camera tự mờ, công tắc X-ray / Tách lớp / Mô hình sản phẩm (dùng lại GLB + `FoldedPants3D`) / Chất lượng (Đẹp = AO N8AO + viền sáng Outline + SMAA + ContactShadows; Nhẹ = tắt hậu kỳ, lưu `localStorage`); món là khối bo góc màu theo loại hàng, nhãn SKU khi chọn/rê chuột; thanh lọc lớp theo độ cao; `CameraControls` tự đóng khung; `frameloop="demand"` (chỉ vẽ lại khi đang chuyển động); tôn trọng `prefers-reduced-motion`. Ánh sáng dựng bằng `Lightformer` (không tải HDRI qua mạng). Không dùng `maath` trực tiếp (chỉ là phụ thuộc gián tiếp của drei) — damping bằng `MathUtils.damp` của three.
- **Đã xoá**: `PackagingPlanPage`, `PackingWizardPage`, `PackagingGroupsPage`, `PackingAnimation3D`, `PackingDashboard` (mock chết), `Packing3DBoxViewer`, `usePackagingPlan`, `data/packing-dashboard-mock.ts`, các hàm API/kiểu của phương án cũ trong `api/packaging.api.ts` + `types/packaging.ts`. Giữ `ProductModel3D`, `product-models.ts`, `FoldedPants3D` (dùng cho công tắc mô hình).
- **Verify**: `tsc -b` 0 lỗi, eslint các file mới/đã sửa 0 lỗi, `npm run build` thành công (cảnh báo chunk >500 kB có từ trước). **Chưa xem bằng mắt trên trình duyệt** và chưa đi trọn luồng với dữ liệu thật — để Đợt 5 (script chụp màn hình user chạy với tài khoản của mình).

## Làm lại đóng gói 3D — Đợt 5: tài liệu + dọn dẹp (04/10/2026) — ĐÃ TRIỂN KHAI

- **Tài liệu FE**: `API_LIST.md` mục 8 viết lại cho `/order-groups/:groupId/packing-plan` + `/packing-plans/summary` (route, role, body, response, khoá `version` của kế hoạch), gạch dòng `fulfillment/pack`, gỡ `PackGroupDto`/`activePackagingRecommendationId`, cập nhật ma trận role và bảng mã lỗi (`PACKING_*` kèm HTTP thật đối chiếu code). `INTEGRATION_GUIDE_FULFILLMENT.md` v6.0: Nghiệp vụ 1 viết lại (tự tính, nhãn chứng minh, chỉnh tay thay cho "từ chối tính lại", hướng dẫn theo kiện, màn FE mới, bảng DB `packing_plans`), Nghiệp vụ 4 (pack theo `parcel_no`), A.4, sơ đồ C.1, D.2 (version riêng của kế hoạch), D.3 (mã lỗi mới, gỡ `PKG_*` cũ), D.4 checklist. `docs/BE_PACKAGING_IMPLEMENTATION_ROADMAP.md` + `docs/AI_3D_PACKAGING_OPTIMIZATION.md` có ghi chú đầu file: phần engine/route cũ là lịch sử.
- **Dọn code chết**: gỡ các mã lỗi `PKG_*` của luồng phương án cũ (`packaging.errors.ts` chỉ còn danh mục thùng/túi/vật tư) và interface `PackagingRecommendation` cũ trong `common/interfaces/packaging.interface.ts` (không còn ai dùng). Schema `packaging_recommendations` vẫn giữ cho script migrate đọc lịch sử.
- **Test thời gian engine cũ**: `multi-carton-packer.spec.ts` ca 250 món bỏ phần đo đồng hồ (< 15 s) — engine cũ dùng ngân sách theo số lần kiểm tra nên kết quả xác định, thời gian chỉ phản ánh tải máy; ca này từng làm hook pre-commit trượt (22 s khi máy bận, qua khi máy rảnh). Vẫn giữ kiểm tra kết quả. Engine cũ giờ chỉ là mốc so sánh trong benchmark.
- **Verify**: `tsc` 0 lỗi (ngoài 2 script aurelle đang sửa ở nơi khác), `lint:ci` 0 lỗi, jest 42 suite / 496 test.
- **Chưa làm (cần user)**: (1) xem giao diện mới bằng mắt — script chụp màn hình puppeteer chạy bằng tài khoản của user; (2) `scripts/migrate-to-packing-plans.ts` chưa chạy trên DB thật — chạy thử (không ghi) rồi `--apply` khi user đồng ý; lưu ý script khởi động cả AppModule nên các cron khác (sync Lazada…) có thể chạy nếu trùng giờ; (3) thêm `PACKER_URL=http://127.0.0.1:8000` vào `be/.env` và chạy service `packer/` nếu muốn có nhãn `optimal_in_model`.
- **Sửa trang trắng (04/10/2026, commit `50c193c`)**: user mở trang đóng gói mới thấy trắng toàn bộ. Tái hiện bằng trình duyệt không giao diện + dữ liệu kế hoạch thật xuất từ DB (giả lập API, không cần mật khẩu): code vẽ được bình thường, nhưng **máy không có WebGL thì cả app sập** vì chưa có lớp bắt lỗi. Đã thêm `components/ErrorBoundary.tsx` quanh mọi trang trong `AppLayout` (hiện lỗi + nút tải lại, tự xoá khi đổi trang) và quanh khung 3D (kiểm tra WebGL trước khi vẽ; lỗi chỉ làm mất khung 3D). Camera mặc định lùi ra cho thùng nằm trọn khung. Nguyên nhân trắng trên máy user chưa xác định chắc (tab Vite cũ sau khi cài thư viện mới, hoặc WebGL) — cần user Ctrl+F5 rồi báo lại.

## Màn "Kết nối sàn" hiện trạng thái AURELLE thật (04/10/2026)

User hỏi vì sao đã kết nối storefront bằng app key mà màn Kết nối sàn vẫn ghi "Kênh nội bộ". Nguyên nhân: thẻ AURELLE trên `AdminMarketplacePage` lấy từ `GET /storefront/settings`, endpoint trả cứng `connected: true, connection_type: 'internal', shop_id: 'storefront-main'` (luồng storefront chạy chung backend, commit `3c0291c`). Luồng Open API bằng app key (platform `aurelle`, mock server cổng 4000) chưa có chỗ nào trên FE.

Đã sửa: (1) BE `GET /marketplace/:platform/shops` (Admin, Store Owner) đọc `marketplace_shops`, không kèm token, gồm shop đã ngắt; schema `MarketplaceShop` khai kiểu `created_at/updated_at` (Rule #7). (2) Callback OAuth redirect kèm `platform`. (3) FE `AurelleConnectPanel`: nút kết nối OAuth, trạng thái thật (đã kết nối / hết hạn refresh token / đã ngắt), lần đồng bộ gần nhất, nút "Đồng bộ ngay" (`POST /orders/aurelle/sync`). (4) `MarketplaceOAuthSuccessPage` chỉ lưu `localStorage` khi `platform=lazada` — trước đây shop AURELLE sẽ bị ghi nhầm vào danh sách Lazada. (5) Thẻ storefront nội bộ giữ lại nhưng ghi rõ "không qua app key".

Không trùng đơn: Open API AURELLE hiện là mock dữ liệu mẫu riêng, không đọc đơn storefront. Nếu sau này Open API AURELLE thật trả chính đơn storefront thì phải chọn 1 trong 2 luồng, nếu không sẽ có 2 bản đơn khác `shop_id`.

Verify: BE `tsc` 0 lỗi, lint 0 lỗi, jest 43 suite / 502 test; FE `tsc -b` + eslint file đã sửa sạch. Chưa bấm thử kết nối thật trên trình duyệt (cần chạy mock `aurelle-mock-server.ts` cổng 4000).

## Tăng lấp đầy đơn nhiều kiện — gợi ý kho thùng, thùng L thấp, chia đều (04/10/2026) — ĐÃ TRIỂN KHAI

**Bối cảnh**: user hỏi vì sao đơn sỉ DEMO-AI-51 (40 áo + 12 quần jean) ra 5 kiện L lấp 54–79% và có tối ưu thêm được không. Đã đo trước khi code (chạy trong bộ nhớ, không sửa file):
- **Thuật toán không phải nút thắt**: 24 lần chạy (gập theo luật / gập tự do × có/không gập × 6 seed, ngân sách lớn) đều 5 kiện. 5 thùng L thì lấp TB bắt buộc 63% (220 L hàng ÷ 350 L).
- **Nút thắt là kho/danh mục thùng**: thùng M duy nhất bị nhóm khác giữ chỗ. Có M → 74%; thêm cỡ L thấp 50×40×20 → 76%.
- **[stated] Bỏ phần chứng minh 5 kiện là tối thiểu**: đã thử cận DFF Fekete–Schepers (gộp và theo mẫu thùng) — yếu hơn thực tế vì hàng gập/xoay (DFF cho 1 thùng chứa 20 áo, thật chỉ 16); muốn chứng minh phải hỏi CP-SAT từng mẫu thùng 13–17 món, không chắc ra. User chọn ghi rõ lý do trên UI thay vì làm.

**Đã làm** (commit `cf771c5`, `0008b9e` + docs):
- **Bộ giải v2** (`brkga-ems-v2`, `solve-order.ts`): bước 2c `balanceParcels` — giải lại cặp kiện lệch tải nhất CHỈ với đúng các thùng cặp đó đang dùng, nhận khi cả kế hoạch tốt hơn theo mục tiêu bậc ⇒ không bao giờ thêm kiện/đổi thùng đắt hơn/gập thêm. Tách helper `resolveSubset()` dùng chung với `mergeParcels`. Tuỳ chọn `SolveOptions.balance` (mặc định bật) để so có/không. Đo 300 đơn: 0 đơn đổi số kiện/tiền; chênh cân TB kiện nặng–nhẹ 1,40 → 1,30 kg (9 đơn đều hơn, 63 giữ nguyên, 2 lệch cân hơn chút vì thước đo gồm cả thể tích). Kết quả benchmark so engine cũ vẫn 0 thua: `scripts/benchmark-results/solver-v2.json`.
- **Gợi ý kho thùng** (`packing/utils/stock-suggestion.util.ts` `suggestStock`): khi có thùng tồn trống < số món của đơn, giải thêm 1 lần "giả định đủ tồn" (cùng seed); chỉ ghi khi tốt hơn và có thùng thật sự thiếu. Lưu `packing_plans.orders[].stock_suggestion` (sub-schema `PlanStockSuggestion`/`PlanMissingBox`, default null), response `stockSuggestion`, `totals.avgFill`, thêm 1 dòng `explanation`. FE thẻ "Gợi ý kho thùng" + "lấp đầy x%" ở header màn làm việc. Gợi ý chụp LÚC TÍNH; đổi thùng/chuyển món không tính lại.
- **Giải thích đơn lớn**: đơn > `PACKER_MAX_UNITS` mà `heuristic` → dòng nói rõ cận dưới chỉ theo thể tích/cân/đáy; CP-SAT chưa bật → dòng báo. FE đổi hint nhãn `heuristic`.
- **Dữ liệu mẫu**: `SAMPLE-LT` (lòng 500×400×200, ngoài 506×406×206, bì 260 g, tải 15 kg, 6.000 đ) trong `seed-ai-guide-demo.ts` (tồn 20) và `seed-packaging-boxes.ts`. Giữ M = 1 để demo có ví dụ gợi ý. `sampleBoxes()` của test KHÔNG thêm LT (giữ benchmark cũ so sánh được).
- **Seed lại DB demo** (04/10): DEMO-AI-51 → 3 L + 2 L thấp, lấp TB 63% → 76%, 40.000 → 36.000 đ, chênh cân vẫn 2,2–4,8 kg (chia đều hạn chế vì không được đổi thùng/gập). Nhóm 3 (DEMO-AI-32) có gợi ý "thiếu SAMPLE-M: 23% → 54%, rẻ hơn 3.100 đ".
- Verify: `tsc` 0 lỗi (ngoài 2 script aurelle của phiên khác), `lint:ci` 0 lỗi, jest 42 suite / 505 test; FE `tsc -b` + eslint; chụp màn headless (giả lập API bằng dữ liệu DB) thấy thẻ gợi ý + lấp đầy TB.

**⚠️ Sự cố commit — bài học**: cùng lúc có PHIÊN KHÁC làm việc trên repo (commit Aurelle `9b4ddd3`) và đã `git add` sẵn file của họ. `git add <file của mình> && git commit` đã gom luôn file họ đang stage (Aurelle connect panel FE, `listShops` marketplace, vài dòng CLAUDE.md/API_LIST/INTEGRATION_GUIDE_ORDERS) vào commit `cf771c5` mang tên việc của mình; git báo `cannot lock ref 'HEAD'`. Không mất code, KHÔNG viết lại lịch sử (phiên kia đang chạy). **Quy tắc**: khi repo có thể có phiên khác, commit bằng pathspec `git commit -m ... -- <đúng các file của mình>` (chỉ lấy đúng các file đó, bỏ qua phần khác đang stage) và kiểm `git show --stat` sau mỗi commit.

## Gỡ kênh nội bộ website AURELLE — chỉ còn kết nối bằng app key (04/10/2026)

**[stated] User chốt**: bỏ kênh nội bộ (storefront ghi thẳng `orders`, shop `storefront-main`), đơn website chỉ về qua Open API bằng app key. Ba quyết định đã hỏi lại: (1) mock cổng 4000 đọc dữ liệu THẬT của website từ MongoDB, không dùng dữ liệu mẫu nữa; (2) đơn cũ của kênh nội bộ giữ làm lịch sử, không xoá/không chuyển; (3) webhook + cron 10 phút dự phòng.

- **Gỡ**: `StorefrontCanonicalOrderService` (+ spec), cron `storefront-order-sync.scheduler` (1 phút), các field kết nối của `GET /storefront/settings`, `fe/src/api/storefront.api.ts`, thẻ "Kênh nội bộ" trên `AdminMarketplacePage`. Field `canonical_*` trên `storefront_orders` giữ lại làm dấu lịch sử (mock dùng `canonical_order_id` để loại đơn cũ).
- **Website**: `storefront_orders.public_order_id` (số, kiểu `order_id` Lazada) cấp lúc checkout từ bộ đếm atomic `storefront_counters` (`nextPublicOrderId`, bắt đầu 710.000.000). Checkout xong gọi `AurelleWebhookPublisher.notifyOrderChanged()` (fire-and-forget) — POST `AURELLE_WEBHOOK_URL` (mặc định `http://localhost:$PORT/marketplace/webhooks/aurelle`), header `Authorization = UPPER(HEX(HMAC_SHA256(app_secret, app_key + body)))` bằng `AURELLE_APP_KEY/SECRET`, `seller_id = AURELLE_SELLER_ID` (mặc định `200000000101`, khớp mock).
- **Mock 4000**: `scripts/aurelle-portal/storefront-store.ts` đọc `storefront_orders/order_items/products/product_variants/inventory_stocks`; hàm thuần chuyển định dạng ở `src/modules/storefront/aurelle-open-api.mapper.ts` (mỗi đơn vị 1 dòng, `order_item_id = public_order_id × 1000 + stt`, tối đa 999 đơn vị/đơn; tồn bán được = tồn − giữ chỗ). `GetOrders` lọc `update_after`, có offset/limit; bỏ đơn có `canonical_order_id`; đơn chưa có `public_order_id` được cấp bù. `/product/stock/sellable/update` ghi thật vào `storefront_inventory_stocks`. Mock cần `MONGODB_URI` (chạy với `-r dotenv/config`).
- **FE**: `MarketplaceOrdersScreen` chỉ đưa shop `platform === 'lazada'` vào danh sách Lazada localStorage (trước đây shop AURELLE lấy từ đơn cũng bị đưa vào).
- README portal: ví dụ Redirect URI sửa `3003` → `3000` (nguồn của redirect 3003 trong Developer Console).

Verify: BE `tsc` 0 lỗi, lint 0 lỗi, jest 43 suite / 510 test (test mới: mapper qua đúng `mapLazadaOrder`, bộ đếm, chữ ký website được `AurelleAdapter.verifyWebhookSignature` chấp nhận); FE `tsc -b` + eslint sạch; storefront `tsc` sạch. Chạy thử mock mới ở cổng 4100 với Atlas thật + client ký thật: `GetProducts` trả 9 sản phẩm thật; `GetOrders` trả 0 vì mọi đơn website hiện có đều đã vào qua kênh nội bộ. **Chưa thử trọn luồng đặt đơn mới → webhook → OptiPack** (cần khởi động lại backend 3000 + mock 4000, kết nối shop AURELLE, rồi đặt 1 đơn trên website).
## 📋 RÀ SOÁT CRUD TOÀN BE + VÌ SAO LẠI THIẾU CHỨC NĂNG CƠ BẢN (25/09/2026)

**Bối cảnh**: user phát hiện module `warehouse/` chỉ có Tạo + Xem, không sửa/xóa được kho đã tạo. Rà lại toàn bộ 10 module bằng cách liệt kê mọi route trong các controller.

### Kết quả rà soát

| Module                        | Thiếu                                                                                 | Mức độ                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `warehouse/` — Kho            | Xem chi tiết, Sửa, Vô hiệu hóa                                                        | Cao                                                                                                                  |
| `warehouse/` — Khu            | Sửa, Vô hiệu hóa                                                                      | Cao                                                                                                                  |
| `warehouse/` — Kệ             | Sửa (từng kệ), Vô hiệu hóa                                                            | Cao                                                                                                                  |
| `warehouse/` — Gán SKU vào kệ | Chuyển SKU sang kệ khác, Điều chỉnh giảm tồn (kiểm kê), Bỏ gán                        | Cao — hiện chỉ cộng được tồn (restock), không trừ tay được khi kiểm kê lệch                                          |
| `product-master/`             | **KHÔNG CÓ CONTROLLER NÀO** — không xem, không sửa tay được kích thước/cân nặng/dễ vỡ | Cao — dữ liệu sai thì chỉ sửa được bằng cách vào thẳng MongoDB (đúng lỗi thiếu `dimension` gây 500 trước đây)        |
| `marketplace-integration/`    | Danh sách shop đã kết nối, Ngắt kết nối                                               | Trung bình (bản code đang có trong sandbox; FE hiện màn hình có nút "Ẩn" → cần kiểm tra nhánh đồng đội có thêm chưa) |
| `notifications/`              | Đánh dấu tất cả đã đọc                                                                | Thấp                                                                                                                 |
| `packaging/`                  | Lịch sử các lần gợi ý (kể cả bản bị reject)                                           | Thấp                                                                                                                 |

**KHÔNG thiếu — cố ý không có Sửa/Xóa, đúng thiết kế**: `orders/` (bản sao dữ liệu từ sàn, sàn là nguồn sự thật), `order_groups` (hệ thống tự sinh), `pick_events` (nhật ký kiểm toán, chỉ được thêm), `users/` (đã đủ).

### Vì sao lỗi cơ bản này xảy ra — nguyên nhân gốc

1. **Code được viết theo Use Case, mà Use Case chỉ mô tả NGHIỆP VỤ VẬN HÀNH** (đồng bộ, gộp, lấy hàng, đóng gói) — không có Use Case nào tên "Admin sửa thông tin kho" hay "Admin xóa khu". Dữ liệu nền (master data: kho, khu, kệ, danh mục sản phẩm, shop) có vòng đời riêng nhưng không nằm trong tài liệu nghiệp vụ nào → không ai viết.
2. **Bài học ngày 16/09 ("CRUD không đối xứng") bị rút ra quá hẹp** — lúc đó chỉ sửa đúng TRIỆU CHỨNG (thiếu GET), bổ sung 3 API xem lại, mà không tự hỏi tiếp "vậy Sửa/Xóa thì sao". Sửa triệu chứng thay vì sửa cả LỚP lỗi.
3. **Xóa đòi hỏi quyết định nghiệp vụ** (kho còn hàng thì sao? khu có kệ đang chứa hàng thì sao?) — những câu hỏi này khó nên bị hoãn một cách âm thầm, không ghi lại là "chưa làm".

### Quy tắc bắt buộc từ giờ — "Bảng vòng đời" cho mọi collection mới

Mỗi khi thêm 1 collection, phải điền bảng sau NGAY LÚC THIẾT KẾ (trước khi code), mỗi ô ghi Có/Không + LÝ DO:

| Tạo | Xem danh sách | Xem chi tiết | Sửa | Vô hiệu hóa (xóa mềm) | Xóa cứng |

Phân loại trước khi điền:

- **Dữ liệu nền** (kho, khu, kệ, danh mục, vật liệu đóng gói, SKU nội bộ): mặc định cần ĐỦ vòng đời. Xóa luôn là xóa mềm (`is_active: false`), chặn nếu còn tồn kho/đang được tham chiếu.
- **Dữ liệu giao dịch/nhật ký** (pick_events, shipment_events, movements): chỉ Tạo + Xem — cố ý, ghi rõ lý do.
- **Dữ liệu sao chép từ sàn** (orders): chỉ Xem — cố ý.

Mã định danh đã in ra giấy dán lên kệ thật (`zone_code`, `bin_code`) **không cho sửa** sau khi tạo — đổi mã trên hệ thống mà nhãn trên kệ vẫn là mã cũ sẽ làm nhân viên đi nhầm chỗ. Muốn đổi thì vô hiệu hóa cái cũ, tạo cái mới.

---

# 🗺️ ĐỊNH HƯỚNG GIAI ĐOẠN TIẾP THEO — KHO + SKU NỘI BỘ + GIAO HÀNG TỰ THÂN (25-26/09/2026)

> Mục này ghi lại TOÀN BỘ kết quả nghiên cứu, quyết định nghiệp vụ và hướng giải quyết đã thống nhất với Thuận trong 2 ngày 25-26/09/2026. CHƯA CODE dòng nào — đây là bản thiết kế. Mỗi mục đánh dấu rõ **[ĐÃ CHỐT]** (user đã xác nhận) hoặc **[ĐỀ XUẤT]** (Claude đề xuất, chờ user chốt). Khi bắt tay code, đọc mục này trước, KHÔNG thiết kế lại từ đầu.

## PHẦN I — KHO HÀNG

### I.1. Hiện trạng code (đã rà thật ngày 25/09)

- Cấu trúc hiện tại: `Kho → Khu → Dãy → Kệ (rack, đánh số) → Tầng (level)`, mã ô dạng `A-03-01-01` (`{zone_code}-{aisle}-{rack:02}-{level:02}`), sinh bằng `generateBinLocations()` dùng `bulkWrite`.
- Picking List sắp xếp bằng `bin_code.localeCompare()` (so sánh chuỗi).
- `sku_bin_assignments` có index duy nhất `{warehouse_id, platform, shop_id, seller_sku}` → **1 SKU sàn chỉ nằm ở đúng 1 ô / 1 kho**, và tồn kho TÁCH RIÊNG theo từng sàn.
- Thiếu CRUD: Kho/Khu/Kệ không Sửa/Xóa được; gán SKU không chuyển ô được, không trừ tồn tay được (chỉ `restock` cộng thêm); `product-master` không có controller (xem mục "RÀ SOÁT CRUD" ngay phía trên).
- Chỉ `warehouses` có field `is_active`; `warehouse_zones`, `bin_locations` chưa có.
- Dữ liệu kệ hiện có trong DB chỉ là dữ liệu thử nghiệm.

### I.2. Mã vị trí mới — 5 phần **[ĐỀ XUẤT, chờ chốt ký hiệu bên kệ]**

User đề xuất ban đầu 4 phần `KA-D1-T01-P` (Khu-Dãy-Tầng-bên Trái/Phải). Claude chỉ ra điểm yếu: mỗi dãy mỗi tầng chỉ có 2 ô (Trái/Phải) → mỗi size chứa tối đa 2 màu, và ngoài đời mỗi bên của 1 dãy có NHIỀU kệ đặt nối nhau nên mã 4 phần không phân biệt được. Đề xuất 5 phần:

```
KA - D1 - PH02 - T03 - 1
│    │    │      │     └ Ô (thùng nhựa trên tầng)  → 1 MÀU
│    │    │      └────── Tầng                       → 1 SIZE
│    │    └───────────── Bên (TR/PH) + số kệ        → 1 MẪU sản phẩm (thuộc 1 danh mục cấp 2)
│    └────────────────── Dãy                         → 1 DANH MỤC cấp 1 (Áo/Quần/Giày/Dép)
└─────────────────────── Khu (KA, KB, KC, KD)
```

- Ký hiệu bên: user đề xuất `T`/`P`; Claude đề xuất `TR`/`PH` vì `T` trùng với tiền tố Tầng (`...-T02-T03-...` dễ đọc nhầm). Máy parse theo vị trí nên cách nào cũng chạy được — **CHỜ USER CHỐT**.
- Quy cách kệ tham chiếu (nghiên cứu kệ trung tải/V lỗ ở VN): cao ~2m (không cần thang), **5 tầng**, mỗi tầng dài 1.2-1.5m chứa **3 thùng nhựa ~40cm = 3 ô**. → 1 kệ = 15 ô. Số ô mỗi tầng KHAI BÁO lúc tạo kệ, không hardcode.
- Quy mô demo đủ dùng: 1 khu × 2 dãy × 2 bên × 2 kệ × 5 tầng × 3 ô = 120 ô.
- Dữ liệu kệ thử nghiệm hiện tại: XÓA LÀM LẠI theo mã mới, không viết script chuyển đổi.

### I.3. Quy tắc xếp hàng (slotting) — tầng = size, ô = màu **[ĐÃ CHỐT ý tưởng, ĐỀ XUẤT cách làm]**

Ý tưởng của user: mỗi tầng 1 size, mỗi ô 1 màu, mỗi dãy 1 danh mục. Claude nghiên cứu chuẩn ngành (golden zone, fixed vs dynamic slotting) và điều chỉnh:

1. **Quy tắc là GỢI Ý, không phải ràng buộc cứng.** Mỗi ô có `designated {category_code, size, color_code}`. Khi gán hàng, hệ thống sắp ô ứng viên theo mức khớp: đủ 3 thuộc tính → khớp danh mục+size → ô trống bất kỳ trong dãy cùng danh mục. Chọn ô không khớp hoàn toàn → BẮT NHẬP LÝ DO, lưu lịch sử. Lý do: quy tắc cứng vỡ ngay khi hết chỗ hoặc mẫu có nhiều màu hơn số ô.
2. **Size bán chạy đặt ở tầng giữa, không xếp theo thứ tự lớn→nhỏ.** User ban đầu muốn "càng xuống tầng size càng nhỏ". Chuẩn ngành: vùng dễ lấy nhất là giữa đùi → giữa ngực (tầng T02-T03, ~40-120cm). Đề xuất: T01 sát sàn = hàng nặng/size bán chậm; T02-T03 = size bán chạy (M, L); T04 = size bán vừa; T05 = size bán chậm (XS, XXL)/dự trữ. Việc gán size↔tầng là CẤU HÌNH theo từng kệ, không hardcode.
3. **Mẫu nhiều màu hơn số ô / danh mục nhiều size hơn 5 tầng (giày 35-44)** → tràn sang kệ kế bên. Đây là lý do quy tắc phải là gợi ý.

### I.4. Danh mục sản phẩm — cây 2 cấp + thuộc tính **[ĐỀ XUẤT]**

User hỏi có nên phân loại tiếp (giày nữ → guốc, đế bằng; áo → sơ mi nam, áo thun, áo nữ). Kết luận: CÓ, nhưng TÁCH 2 thứ đang bị trộn:

- **Loại sản phẩm** (guốc, đế bằng, áo thun, sơ mi) → **cây danh mục**, tối đa 2 cấp (3 là giới hạn cứng). Cây sâu khó duy trì, kho vật lý chỉ có khu/dãy/kệ.
- **Giới tính** (nam/nữ/unisex) → **THUỘC TÍNH của mẫu**, KHÔNG phải cấp danh mục. Lý do: áo thun có cả nam/nữ/unisex → làm danh mục thì cây nhân ba, báo cáo "bán bao nhiêu áo thun" phải cộng 3 nhánh.

Cây mẫu:

```
Áo    → Áo thun · Áo sơ mi · Áo kiểu · Áo khoác
Quần  → Quần jean · Quần tây · Quần short · Chân váy
Giày  → Guốc · Đế bằng · Cao gót · Sneaker
Dép   → Sandal · Dép lê · Dép quai hậu
```

- **Thang size gắn ở cấp 2** (áo thun S/M/L..., quần jean 28/29/30..., guốc 35-40). Cùng danh mục mà nam/nữ khác dải size (sneaker) → thang size lấy dải gộp, mỗi mẫu dùng phần của nó.
- **KHÔNG sao chép cây danh mục của Lazada** (quá sâu, chỉ phục vụ hiển thị trên sàn, Tiki khác hẳn). Cây nội bộ phục vụ vận hành kho.

### I.5. SKU nội bộ (Master SKU) — tách khỏi mã vị trí và SKU sàn **[ĐỀ XUẤT, đã thống nhất hướng]**

**Vấn đề gốc (user phát hiện)**: 2 sàn cùng bán 1 sản phẩm vật lý → hiện hệ thống đếm thành 2 tồn kho riêng (do index có `platform`), Admin phải gán kệ 2 lần, có thể bán lố.

**Nguyên tắc (đã nghiên cứu nhiều nguồn WMS)**: mã SẢN PHẨM và mã VỊ TRÍ phải tách riêng. `KA-D1-PH02-T03-1` là mã VỊ TRÍ, không phải SKU. Vị trí đổi được (dọn kho, chuyển ô), sản phẩm thì không.

```
SKU Lazada "ABC123" ─┐
                      ├──► SKU nội bộ "GUOC-005-DEN-37" ──► nằm ở 1 hoặc nhiều ô
SKU Tiki   "XYZ-9"  ─┘         (1 số tồn chung cho mọi sàn)
```

- Định dạng: `{mã danh mục cấp 2}-{mẫu}-{màu}-{size}`, VD `GUOC-005-DEN-37`, `ATHUN-012-TRA-L`. Giới tính KHÔNG vào mã vì đã nằm trong mẫu (mẫu 005 vốn là guốc nữ).
- Quy tắc đặt: chỉ CHỮ HOA + SỐ + gạch ngang, không ký tự đặc biệt, 8-15 ký tự.
- Admin KHÔNG gõ tay SKU sàn nữa: chọn từ danh sách SKU sàn đã đồng bộ về rồi nối vào SKU nội bộ. Mọi SKU sàn chuẩn hóa `trim()` + chữ hoa ngay lúc đồng bộ (chống lỗi lệch hoa/thường, dư dấu cách — Shopee/Lazada coi `SHOE-BLK-8` và `shoe-blk-8` là 2 SKU khác nhau).
- Seller đổi SKU trên Lazada Seller Center → đơn mới mang SKU sàn mới → hệ thống báo "SKU sàn chưa được nối" cho Admin nối lại. SKU nội bộ và tồn kho không bị ảnh hưởng.

### I.6. Quy tắc KHÓA / SỬA SKU nội bộ **[ĐÃ THỐNG NHẤT]**

| Thông tin                   | Sửa được? | Lý do                                                                                   |
| --------------------------- | --------- | --------------------------------------------------------------------------------------- |
| Mã SKU                      | ❌ Khóa   | Nằm ở tồn kho, sổ cái, lịch sử quét, bảng nối sàn, báo cáo, NHÃN IN DÁN TRÊN THÙNG THẬT |
| Mẫu, màu, size              | ❌ Khóa   | Chính 3 thứ này tạo nên mã — đổi màu mà mã vẫn ghi `DEN` là sai lệch                    |
| Tên, mô tả                  | ✅        | Chỉ để đọc                                                                              |
| Kích thước, cân nặng, dễ vỡ | ✅        | Đo lại chính xác hơn là bình thường                                                     |
| Trạng thái                  | ✅        | Vô hiệu hóa thay cho xóa                                                                |

- **Ngoại lệ**: SKU vừa tạo, CHƯA phát sinh gì (chưa tồn kho, chưa nối sàn, chưa lịch sử) → cho sửa tự do.
- **Lỡ đặt sai → thao tác "Thay thế SKU"** (1 transaction): (1) tạo SKU mới; (2) chuyển toàn bộ tồn sang SKU mới, ghi sổ cái lý do "thay thế SKU"; (3) chuyển các liên kết SKU sàn sang SKU mới; (4) vô hiệu hóa SKU cũ, lưu `replaced_by`. Lịch sử cũ nguyên vẹn, truy vết được. Kho in lại nhãn.
- Cùng nguyên tắc áp dụng cho `zone_code`, `bin_code`, mã danh mục: khóa sau khi tạo vì đã in nhãn dán lên kệ thật.

### I.7. Khắc phục các điểm yếu kho — tổng hợp theo 4 mục tiêu **[ĐỀ XUẤT]**

**Linh hoạt**

- Số ô/tầng khai báo khi tạo kệ (không hardcode).
- Danh mục có thang size riêng.
- Quy tắc slotting là gợi ý + bắt lý do khi lệch.
- **1 SKU nằm ở NHIỀU ô** (bỏ ràng buộc 1 SKU 1 ô): tồn SKU = tổng các ô. Picking List chỉ rõ ô nào lấy bao nhiêu, ưu tiên ô tầng dễ lấy + ô sắp hết (để giải phóng chỗ).
- Mỗi ô có `capacity` (sửa được) → vượt sức chứa thì cảnh báo + gợi ý ô tiếp theo.

**Logic**

- SKU nội bộ + bảng nối sàn (I.5).
- Mã khóa, xóa = vô hiệu hóa, chặn vô hiệu hóa khi còn hàng; vô hiệu hóa khu → tự vô hiệu hóa kệ/ô bên dưới (chỉ khi tất cả trống).
- **Sổ cái biến động kho** (`inventory_movements`, append-only) — MỌI thay đổi tồn phải đi qua: nhập, lấy hàng, điều chỉnh kiểm kê, chuyển ô, hoàn về, thay thế SKU. Kể cả Admin không có đường nào đổi số tồn mà không ghi sổ.
- **Điều chỉnh kiểm kê**: nhập số đếm thực tế → hệ thống tự tính chênh lệch → BẮT BUỘC chọn lý do (hư hỏng, thất lạc, đếm sai lần trước).
- **Chuyển ô**: trừ nguồn + cộng đích trong 1 transaction.

**Nhanh**

- `pick_sequence` (số nguyên) tính sẵn lúc tạo kệ theo **lộ trình hình rắn** (xuống dãy 1, lên dãy 2...) thay cho sắp chuỗi `bin_code` — sắp chuỗi hiện tại đi hết bên phải rồi mới quay lại bên trái, đi hết dãy rồi vòng về đầu dãy sau.
- Index đúng truy vấn:
  - `{warehouse_id, bin_code}` unique — quét tìm ô
  - `{warehouse_id, designated.category_code, designated.size, designated.color_code, is_active}` — gợi ý ô
  - `{master_sku, warehouse_id}` — SKU đang ở những ô nào
  - `{platform, shop_id, seller_sku}` unique trên bảng nối — dịch SKU sàn → nội bộ lúc quét
  - `{warehouse_id, pick_sequence}` — Picking List
- Sinh ô hàng loạt giữ `bulkWrite`.

**Vững nghiệp vụ**

- **Chống bán lố giữa các sàn**: tách **tồn thực** (hàng trên kệ) và **tồn khả dụng** (= tồn thực − đã giữ chỗ). Giữ chỗ lúc tạo nhóm đơn; không đủ tồn khả dụng → gắn cờ thiếu hàng NGAY từ đầu, không để nhân viên đi tới kệ mới phát hiện. Hiện tại tồn chỉ bị trừ LÚC QUÉT → 2 đơn 2 sàn tranh nhau món cuối. Đây là thay đổi giá trị nhất nhưng rủi ro cao nhất (động vào tạo nhóm đơn) → làm cuối, test kỹ.
- Hàng hoàn luôn vào khu `RETURN-QC` trước, kiểm đạt mới chuyển ô sang ô bán.

### I.8. Thiết kế DB kho mới **[ĐỀ XUẤT]**

```
categories             code (unique, khóa), name, parent_code (null = cấp 1), level: 1|2,
                       size_scale[] (chỉ cấp 2), is_active
product_models         model_code (unique), category_code (BẮT BUỘC cấp 2), name,
                       gender: nam|nu|unisex, is_active
master_skus            master_sku (unique, khóa), model_code, color_code, size (thuộc size_scale),
                       name, dimension{...}, weight_kg, is_fragile, is_active, replaced_by
marketplace_sku_mappings  platform, shop_id, seller_sku (unique bộ 3, đã chuẩn hóa) → master_sku
warehouse_zones        zone_code dạng ^K[A-Z]$ (khóa), name, description, is_active
bin_locations          bin_code (khóa), zone/aisle/side/bay/tier/cell, capacity,
                       designated{category_code, size, color_code}, pick_sequence, is_active
sku_bin_assignments    ĐỔI KHÓA: {warehouse_id, bin_location_id, master_sku} — 1 SKU nhiều ô
                       quantity_on_hand, quantity_reserved
inventory_movements    master_sku, bin_location_id, delta (+/-), type (receive|pick|adjust|
                       transfer|return_restock|quarantine|sku_replace), reason_code, ref_type,
                       ref_id, actor_id, created_at   ← append-only
```

### I.9. Ảnh hưởng tới code hiện có — nói trước để không bị bất ngờ

Đổi khóa tồn kho sang `master_sku` chạm vào: `pick-item` (phải dịch SKU sàn → nội bộ trước khi trừ), Picking List (1 SKU nhiều ô), `findUnassignedSkus` (thành "SKU sàn chưa nối"), `product_master` (kích thước chuyển sang `master_skus`), gợi ý đóng gói. Toàn bộ test liên quan phải viết lại.

### I.10. Thứ tự triển khai kho **[ĐỀ XUẤT]** — mỗi bước 1 commit, đủ tsc/eslint/jest

| Bước | Nội dung                                                                                                            | Rủi ro     |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| K1   | Sửa/vô hiệu hóa Kho-Khu-Kệ + API Product Master (xem/sửa tay kích thước, cờ `manual_override` để cron không ghi đè) | Thấp       |
| K2   | Mã vị trí 5 phần, capacity, `pick_sequence` hình rắn, danh mục 2 cấp + thang size, `designated` của ô               | Trung bình |
| K3   | Sổ cái kho, điều chỉnh kiểm kê, chuyển ô, 1 SKU nhiều ô                                                             | Trung bình |
| K4   | SKU nội bộ + mẫu + bảng nối sàn, đổi khóa tồn kho, thao tác Thay thế SKU                                            | Cao        |
| K5   | Tồn khả dụng + giữ chỗ chống bán lố                                                                                 | Cao        |

---

## PHẦN II — GIAO HÀNG TỰ THÂN (OWN FLEET) + HOÀN/ĐỔI HÀNG + TÁI SỬ DỤNG BAO BÌ

### II.1. Hiện trạng code

Giao hàng hiện chỉ là 3 nút đổi trạng thái trên `order_groups` (`ship`, `deliver`, `return`). Chưa có collection vận đơn, tracking, lần giao thất bại, hoàn/đổi. Có sẵn dùng được: `reverse_order_id` trên Order, 19 trạng thái Lazada đã map, `addBusinessHours()`, mẫu cron SLA, mẫu `client_event_id` (idempotency) từ `pick-item`.

### II.2. Quyết định phạm vi **[ĐÃ CHỐT]**

- **Toàn bộ là giả lập trong hệ thống.** Trả/hoàn/đổi hàng tạo bằng NÚT BẤM, KHÔNG gọi Lazada reverse-order API, KHÔNG cần shop là DBS, KHÔNG đẩy trạng thái lên Lazada. Demo được trọn vẹn không chờ bên ngoài.
- Có tái sử dụng vật liệu đóng gói (thùng, xốp, bubble wrap) từ kiện hoàn về để giảm chi phí.
- Nghiên cứu Lazada DBS (ConfirmDeliveryForDBS, FailedDeliveryForDBS, PackageStatusUpdateForDBS, tối thiểu 2 lần giao, hạn 3-5 ngày làm việc) chỉ dùng làm CHUẨN NGHIỆP VỤ tham khảo, không tích hợp.

### II.3. Nguyên tắc thiết kế

1. Tách **vận đơn** (`shipments`) khỏi nhóm đơn — 1 nhóm đơn có nhiều chặng (giao đi, hoàn về, khách trả, giao hàng đổi). `order_groups.fulfillment_status` giữ mức thô (`shipped/delivered/returned`), KHÔNG thêm trạng thái mới.
2. Lịch sử tracking **append-only**, có người làm + giờ + vị trí + lý do + bằng chứng. Trạng thái trên vận đơn chỉ là bản chụp của sự kiện mới nhất, cập nhật cùng transaction.
3. Tái dùng: bảng luật chuyển trạng thái, `__v`, transaction, `client_event_id`.
4. Hệ thống quản lý HÀNG VẬT LÝ; tiền (hoàn tiền) không tự quyết.

### II.4. Tự đánh giá bản thiết kế giao hàng đầu tiên — điểm yếu đã phát hiện và cách sửa

| #   | Điểm yếu                                                                                                                                                  | Cách sửa                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Thiếu "chuyến giao"** — gắn GPS theo từng vận đơn, trong khi 1 shipper chở 10-20 kiện/chuyến → 20 chấm chồng nhau, không tính được ETA theo thứ tự điểm | Thêm `delivery_trips` (stops có thứ tự, route_polyline, vị trí XE). GPS thuộc chuyến, không thuộc kiện                                                                                                                   |
| 2   | Không có tọa độ điểm đích (đơn chỉ có địa chỉ chữ)                                                                                                        | Coordinator **ghim vị trí trên bản đồ** (`source: pinned`); dữ liệu demo có tọa độ sẵn (`seeded`). KHÔNG dùng Nominatim công khai — chính sách ghi rõ ứng dụng theo dõi kiện hàng/phương tiện phải tự dựng máy chủ riêng |
| 3   | Quy tắc "2 lần giao" có kẽ hở (bấm thất bại 2 lần trong 1 phút)                                                                                           | Lần 2 cách lần 1 tối thiểu 2 giờ (cấu hình) hoặc theo giờ khách hẹn; Coordinator được ghi đè nhưng BẮT BUỘC lý do                                                                                                        |
| 4   | COD làm nửa vời (có field, không đối soát)                                                                                                                | **Đưa ra khỏi phạm vi**, ghi rõ trong báo cáo (chính sách COD đơn tự giao của Lazada VN chưa xác minh)                                                                                                                   |
| 5   | Nhóm đơn thay thế (đổi hàng) không có đơn Lazada → có thể bị gộp nhầm/bị cron chạm                                                                        | `origin: marketplace                                                                                                                                                                                                     | replacement`+`source_rma_id`; loại khỏi logic gộp đơn và cron đồng bộ |
| 6   | Dùng "xe tải" — sai thực tế giao chặng cuối VN (xe máy)                                                                                                   | Biểu tượng xe máy, lưu `vehicle_type`                                                                                                                                                                                    |
| 7   | Không kiểm tra vị trí khi bấm giao → gian lận                                                                                                             | Cách điểm đích > 300m → VẪN LƯU (GPS có sai số) nhưng gắn cờ "nghi vấn" cho Coordinator                                                                                                                                  |
| 8   | Giờ điện thoại không có quy tắc                                                                                                                           | `occurred_at` ở tương lai → từ chối; lệch > 30 phút → chấp nhận + gắn cờ                                                                                                                                                 |
| 9   | Polling làm xe "nhảy cóc"                                                                                                                                 | FE nội suy mượt giữa 2 điểm + xoay theo hướng; luôn hiện "cập nhật cách đây X giây", > 60s đổi màu                                                                                                                       |
| 10  | Chưa có hạ tầng lưu ảnh bằng chứng                                                                                                                        | **CHỜ CHỐT**: dịch vụ lưu file ngoài (gói miễn phí) hoặc tạm lưu ổ đĩa + ghi rõ giới hạn                                                                                                                                 |
| 11  | Giả định 1 nhóm đơn = 1 kiện                                                                                                                              | `packages[]`, shipper quét đủ kiện mới được "Nhận hàng rời kho"                                                                                                                                                          |
| 12  | Giả lập chạy tọa độ cố định không khớp địa chỉ trên màn hình                                                                                              | Tọa độ ghim/seed khớp đúng khách; tuyến OSRM tính 1 lần lúc bắt đầu chuyến, lưu DB (OSRM demo cấm dùng quá mức, bắt ghi nguồn)                                                                                           |
| 13  | Người thuyết trình đổi tài khoản liên tục                                                                                                                 | Màn hình demo 3 khung, đổi vai 1 cú bấm (vẫn gọi API thật đúng quyền)                                                                                                                                                    |
| 14  | Chuyến thật 20-40 phút                                                                                                                                    | Nút "Tua nhanh ×20" có nhãn rõ                                                                                                                                                                                           |
| 15  | Mất mạng lúc bảo vệ                                                                                                                                       | Tuyến đường tính sẵn trong dữ liệu demo + video dự phòng + nút "Đặt lại dữ liệu demo"                                                                                                                                    |

### II.5. Ai bấm nút gì **[ĐÃ THỐNG NHẤT]**

Giao xuôi: Packaging Staff _Đóng gói xong_ → **hệ thống tự tạo vận đơn** → **Shipping Coordinator** _Gán shipper / tạo chuyến_ (mở màn khâu giao) → **Shipper** _Nhận hàng rời kho_ → _Giao thành công_ (ảnh) hoặc _Giao thất bại_ (lý do + ảnh) → _Giao lại_ → thất bại lần 2 **hệ thống tự chuyển hoàn về** (shipper KHÔNG có nút hoàn) → **Warehouse Staff** _Quét nhận hàng hoàn_ → _Lưu kết quả kiểm hàng_.

Trả/đổi: **Admin** đóng vai khách (chỉ khi `DEMO_MODE=true`) _Giả lập khách yêu cầu trả/đổi_ → **Store Owner** _Duyệt/Từ chối_ (tách người tạo và người duyệt) → hệ thống tự tạo vận đơn chiều ngược → Coordinator gán → Shipper lấy hàng từ khách → Warehouse nhận + kiểm → đổi hàng thì hệ thống tự sinh nhóm đơn thay thế đi lại Mainflow 2. Nếu storefront được làm tiếp, nút yêu cầu trả/đổi chuyển cho chính khách hàng.

Hệ thống tự làm (không có nút): tạo vận đơn, hoàn về sau lần thất bại 2, tạo phiếu hoàn khi kiện thất bại về kho, tạo vận đơn chiều ngược khi duyệt, sinh nhóm đơn thay thế, cập nhật trạng thái nhóm đơn.

### II.6. Máy trạng thái vận đơn

```
ready_to_dispatch → assigned → out_for_delivery → delivered (KẾT THÚC)
                                     ↓
                               attempt_failed → (lần 1) out_for_delivery
                                     ↓ (lần 2, hệ thống tự)
                          returning_to_warehouse → returned_to_warehouse → phiếu hoàn → QC → closed
```

### II.7. Hoàn/trả/đổi — 3 loại KHÔNG gộp chung

- (a) **Giao thất bại → hoàn kho**: do mình vận hành, không có hoàn tiền.
- (b) **Khách trả hàng**: `refund_only` → chỉ ghi nhận, không có kiện, không đụng kho; `return_refund` → lấy hàng về → QC: đạt → nhập lại kho; lỗi → khu cách ly; sai/thiếu → khiếu nại. Hạn khiếu nại tính từ lúc quét nhận, cảnh báo Store Owner (tham chiếu Shopee VN: seller chỉ có 2 ngày khiếu nại sau khi hàng hoàn về; khách được trả trong 15 ngày sau khi nhận).
- (c) **Đổi hàng** = 1 chặng thu hồi + 1 chặng giao thay thế, cùng 1 phiếu. Chặng giao thay thế = nhóm đơn nội bộ mới đi lại ĐÚNG Mainflow 2 (lấy hàng → AI đóng gói → giao), trừ tồn qua cơ chế atomic sẵn có.

### II.8. Tái sử dụng vật liệu đóng gói

**Phát hiện**: thùng/vật liệu hiện CHƯA được quản lý như tồn kho — `fallback-packaging.util.ts` hardcode 3 cỡ (Small 20×15×10, Medium 35×25×20, Large 50×40×35), không đơn giá, không trừ số lượng khi đóng gói → phải quản lý vật liệu như tồn kho trước thì mới chứng minh được tiết kiệm.

**Nghiên cứu**: thùng sóng đơn dùng lại 2-4 lần (hàng nhẹ); có đơn vị giới hạn tối đa 3 lần + đánh mã lô mỗi lần; túi khí/bubble wrap dùng lại được nếu nguyên vẹn; giấy vụn thường 1 lần.

**Quy trình** (gắn vào bước QC hàng hoàn):

- Checklist thùng: góc không móp/nứt, vách không rách, không ẩm/mốc/mùi, nắp đóng khít, băng keo cũ gỡ được.
- Hạng **A** (giao được) / **B** (dùng nội bộ) / **C** (tái chế/bán giấy vụn).
- Đánh dấu R1/R2/R3 lên nắp mỗi lần dùng lại; nhân viên nhập số thấy trên thùng; **đạt R3 → hệ thống tự hạ hạng C**.
- **BẮT BUỘC gỡ/che nhãn cũ** (nhãn có tên/SĐT/địa chỉ khách trước — dữ liệu cá nhân, Nghị định 13/2023/NĐ-CP). Chưa tick "đã gỡ nhãn" → hệ thống không cho nhập hạng A.
- Nguồn vật liệu tốt nhất: kiện giao thất bại hoàn về (thường còn niêm phong).

**Tích hợp gợi ý đóng gói**: chọn xong cỡ thùng → còn thùng cùng cỡ hạng A thì ưu tiên dùng, ghi rõ trên gợi ý + `estimated_saving_vnd`. Loại trừ: hàng dễ vỡ chỉ dùng thùng mới hoặc hạng A mức R1; đơn hỏa tốc có công tắc bật/tắt dùng thùng tái sử dụng. `pack` trừ đúng loại vật liệu đã dùng. KHÔNG đổi thuật toán chọn cỡ thùng.

**DB**: `packaging_materials` (code, type, dimensions, `unit_cost_new_vnd`, is_reusable, `max_reuse_cycles` — cấu hình, mặc định 3), `packaging_stock` (qty_new / qty_reused_grade_a / qty_grade_b, $inc atomic + $gte), `packaging_movements` (append-only), thêm `packaging_inspection[]` vào phiếu hoàn, thêm `uses_reused_material` + `estimated_saving_vnd` vào gợi ý đóng gói. Dashboard: tỷ lệ tái sử dụng, **tiền tiết kiệm = tổng đơn giá thùng mới của mọi lần dùng thùng tái sử dụng**.

**Lưu ý trung thực**: đơn giá vật liệu chưa có → phải nhập giá thật/giá tham khảo, nếu không số tiết kiệm là số ảo; giới hạn 3 lần là mức suy ra từ nghiên cứu, để là tham số.

### II.9. Thiết kế DB giao hàng **[ĐỀ XUẤT]**

```
delivery_trips      trip_code, driver_id, vehicle_type, status (planned|in_progress|completed),
                    stops[{shipment_id, sequence, destination{lat,lng,source}, eta, status}],
                    route_polyline, last_location{lat,lng}, last_location_at, __v
shipments           shipment_code (unique, SHP-260925-000123), order_group_id, rma_id, trip_id,
                    direction (forward|reverse), leg_type (delivery|failed_return|customer_return|
                    exchange_out), status, attempt_count, max_attempts (=2), next_attempt_not_before,
                    packages[], destination{lat,lng,source}, due_at, flags[] (location_suspicious,
                    clock_skew), __v
                    Index: {shipment_code} unique · {order_group_id} · {trip_id} · {status, due_at}
shipment_events     append-only: shipment_id, event_type, status_after, attempt_no, occurred_at,
                    recorded_at, actor_id, source, location, reason_code, note, proof{photo_urls,
                    otp_verified}, client_event_id (unique sparse) · Index {shipment_id, occurred_at}
driver_locations    driver_id, trip_id, lat, lng, recorded_at — TTL 7 ngày (không nhét GPS vào events)
return_requests     rma_code, type (return_refund|refund_only|exchange|failed_delivery),
                    source (simulated|failed_delivery), order_group_id, items[], status,
                    reverse_shipment_id, exchange_group_id, inspection[], packaging_inspection[],
                    dispute_deadline_at, __v
```

### II.10. API cho FE (tóm tắt)

- Coordinator: `GET /shipments?status=ready_to_dispatch`, `GET /shipments/drivers`, tạo chuyến + ghim điểm đích, `POST /shipments/:id/assign`.
- Shipper: `GET /shipments/my`, `POST .../pickup`, `POST /trips/:id/location`, `POST .../deliver`, `POST .../fail`, `POST .../retry`, `POST /uploads/proof`, `GET /shipments/reason-codes`.
- Theo dõi: `GET /shipments/:id`, `GET /shipments/:id/events`, `GET /trips/:id/track` (FE poll 3s khi đang giao, dừng ở trạng thái cuối).
- Kho: `POST .../receive-at-warehouse`, `POST /return-requests/:id/inspect` (hàng + vật liệu trong 1 transaction).
- Trả/đổi: `POST /return-requests`, `.../approve`, `.../reject`.
- Demo (chỉ `DEMO_MODE=true`, chỉ Admin, tắt thì 404): `POST /demo/trips/:id/simulate-route {speed}`, `POST /demo/packaging-stock/seed`, `POST /demo/reset`.
- Mã lỗi: `SHP_INVALID_TRANSITION`, `SHP_STATE_CONFLICT`, `SHP_NOT_YOUR_SHIPMENT`, `SHP_PROOF_REQUIRED`, `SHP_RETRY_TOO_EARLY`, `RMA_ORDER_NOT_DELIVERED`, `RMA_WINDOW_EXPIRED` (mặc định 15 ngày, cấu hình), `PKG_OLD_LABEL_NOT_REMOVED`.

### II.11. Màn hình bản đồ + kịch bản demo

- Leaflet + ô bản đồ OSM (bắt buộc ghi công bản quyền) + OSRM (1 lần/chuyến, lưu lại) + vị trí từ `driver_locations`. Hiện: xe máy chạy mượt dọc tuyến, các điểm giao đánh số, ETA "ước tính", "cập nhật cách đây X giây", dòng thời gian bên dưới.
- Màn hình demo 3 khung: **Vai trò** (đổi vai 1 cú bấm) | **Bản đồ** | **Hệ thống đang nghĩ gì** (timeline, trạng thái vận đơn + nhóm đơn, tồn kho, kho vật liệu).
- Kịch bản ~8-10 phút: mở đầu chiếu sơ đồ trạng thái (30s) → **Màn 1**: 1 chuyến 3 điểm (giao thành công; thất bại "khách hẹn 17h" rồi thử _Giao lại_ ngay → hệ thống TỪ CHỐI; cố bấm giao khi xe còn xa → cờ nghi vấn) → **Màn 2**: thất bại 2 lần → tự hoàn về → QC → nhập lại kho + thùng hạng A → đơn mới dùng thùng tái sử dụng, hiện tiền tiết kiệm → **Màn 3** (tùy giờ): đổi hàng → nhóm đơn thay thế có nhãn → **Kết**: dashboard tỷ lệ giao thành công lần đầu, số vận đơn nghi vấn, tổng tiết kiệm bao bì.
- Câu hỏi hội đồng cần chuẩn bị: vì sao ghim tay điểm đích (chính sách Nominatim + địa chỉ VN không chuẩn); vì sao gắn cờ mà không chặn khi sai vị trí (sai số GPS); vì sao không làm COD.

### II.12. Lộ trình giao hàng **[ĐỀ XUẤT]**

| Giai đoạn | Nội dung                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| G1        | Chuyến giao + vận đơn + events + giao xuôi + bằng chứng + geofence/clock-skew flags                        |
| G2        | Giao thất bại, giao lại có khoảng cách tối thiểu, hoàn về, cron cảnh báo trễ hạn (dùng `addBusinessHours`) |
| G3        | Phiếu trả/đổi bằng nút bấm + QC + khu cách ly + sổ cái + đổi hàng (tái dùng Mainflow 2)                    |
| G4        | Vật liệu đóng gói: danh mục + tồn + QC vật liệu + ưu tiên thùng tái sử dụng + trừ khi `pack`               |
| G5        | Script giả lập + bản đồ + màn hình demo 3 khung + reset                                                    |

Phụ thuộc: G3 dùng sổ cái kho (K3); G4 độc lập, có thể làm sớm.

---

## PHẦN III — CÁC QUYẾT ĐỊNH CÒN CHỜ USER CHỐT (đọc trước khi code)

1. **Role cho shipper**: dùng chung `SHIPPING_COORDINATOR` (ít thay đổi, không sửa báo cáo) hay thêm `DELIVERY_STAFF = 5` (đúng nghiệp vụ hơn, phải sửa Report 1, RACI, phân quyền).
2. **Ký hiệu bên kệ**: `T`/`P` (user) hay `TR`/`PH` (Claude, tránh trùng `T` của Tầng).
3. **Mã vị trí 5 phần** `KA-D1-PH02-T03-1` — chưa được user xác nhận chính thức.
4. **Nơi lưu ảnh bằng chứng giao hàng**: dịch vụ ngoài hay tạm lưu ổ đĩa.
5. **Thứ tự gán size ↔ tầng**: theo thứ tự lớn→nhỏ (ý user ban đầu) hay size bán chạy ở tầng giữa (đề xuất theo chuẩn golden zone).
6. **Cây danh mục chi tiết + thang size từng danh mục** để làm dữ liệu mẫu — Claude đã đề nghị soạn, chưa được trả lời.
7. **Thứ tự ưu tiên giữa 2 mảng**: làm Kho (K1→K5) trước hay Giao hàng (G1→G5) trước. Gợi ý: K1 trước (rủi ro thấp, lấp lỗ CRUD), sau đó G4 (độc lập), rồi K2-K3, G1-G3, K4-K5, G5.

---

## ⚙️ QUY TẮC BẮT BUỘC — MỖI THAY ĐỔI PHẦN KHO (và mọi module có dữ liệu cũ) PHẢI KÈM "TÁC ĐỘNG & XỬ LÝ XUNG ĐỘT" (26/09/2026, theo yêu cầu Thuận)

Mỗi lần sửa cấu trúc dữ liệu hoặc hành vi của module đã có dữ liệu thật/luồng đang chạy, TRƯỚC KHI báo xong phải trả lời đủ 5 câu và ghi vào (1) guide FE tương ứng — mục "Tác động tới dữ liệu và luồng đã có", (2) CLAUDE.md — nhật ký bước đó:

1. **Dữ liệu cũ trong DB có còn đọc đúng không?** Thêm field mới → document cũ không có field → truy vấn phải chịu được (VD lọc `$ne: false` thay vì `=== true`), kiểu TypeScript khai optional cho trung thực. Có cần migration không; nếu có, script nằm đâu, chạy lúc nào, chạy lại có an toàn không.
2. **Route cũ nào đổi hành vi?** Liệt kê từng route + lỗi mới có thể trả → FE phải bắt thêm gì.
3. **Luồng nào ĐỌC dữ liệu này bị ảnh hưởng?** (VD: tắt kho → Picking List, pick-item, restock). Luồng nào GHI đè dữ liệu này (VD: cron đồng bộ ghi đè Product Master) → xung đột với thao tác tay → phải có cơ chế ưu tiên rõ ràng (cờ `manual_override`).
4. **Luồng nào KHÔNG bị ảnh hưởng** — ghi rõ để FE không phải kiểm tra lại vô ích.
5. **Lỗi có sẵn phát hiện trong lúc làm** — sửa luôn hay để bước sau, và vì sao.

### Nhật ký K1 (26/09/2026) — vòng đời kho/khu/kệ + API Product Master

**Code**: `warehouse-zone.schema.ts`, `bin-location.schema.ts` (+`is_active?`), `product-master.schema.ts` (+`manual_override?`, `_at`, `_by`), `warehouse.errors.ts` (+7 mã), DTO mới `update-warehouse`, `update-zone`, `update-product-master`, `warehouse.service.ts` (getWarehouse, update/deactivate/reactivate kho-khu-kệ, `assertWarehouseActive` thay `assertWarehouseExists`, `countStockUnits` aggregate, transaction dây chuyền, vá `assignSkuToBin`), `warehouse.controller.ts` (+9 route, `include_inactive`, `isActive` trong response), `product-master.service.ts` (list/get/update + cron tôn trọng `manual_override`), `product-master.controller.ts` + `product-master.errors.ts` (MỚI), `product-master.module.ts` (đăng ký controller). Test mới: `warehouse.service.lifecycle.spec.ts` (9 test), `product-master.service.spec.ts` (3 test). Kết quả: tsc 0 lỗi, eslint 0 lỗi, jest 19/19 suite — 179/179 test.

**Tác động & xử lý xung đột:**

1. Dữ liệu cũ: khu/kệ cũ không có `is_active` → lọc `$ne: false`, response `isActive: doc.is_active !== false`; Product Master cũ không có `manual_override` → coi là chưa sửa tay. KHÔNG cần migration.
2. Route đổi hành vi: tạo khu, sinh kệ, gán SKU, restock, Picking List → 409 khi kho/khu/kệ tắt; gán SKU kiểm tra kệ (404/400/409); GET danh sách mặc định ẩn mục đã tắt.
3. Xung đột ghi đè: cron Product Master 3h sáng vs Admin sửa tay → SKU có `manual_override` chỉ cập nhật `last_synced_at`.
4. Không ảnh hưởng: sync đơn, gộp đơn, pick-item, report-missing, packaging, notifications.
5. Lỗi có sẵn: (a) `assignSkuToBin` không kiểm tra kệ → ĐÃ SỬA; (b) `pick-item` và Picking List lọc tồn theo `warehouse_id + seller_sku`, KHÔNG lọc platform/shop → trừ nhầm tồn sàn khác nếu trùng chuỗi SKU → CHƯA SỬA, chưa xảy ra (1 shop Lazada), K4 xử lý tận gốc.

**Quyết định thiết kế K1**: xóa = vô hiệu hóa; chặn khi còn hàng; tắt dây chuyền trong 1 transaction; bật kho CHỈ bật kho (tránh sống lại khu đã bỏ), bật khu bật cả kệ; thao tác lặp lại trả trạng thái hiện tại không lỗi; mã khóa, `forbidNonWhitelisted` trả 400 nếu gửi mã; generate lại không tự bật kệ đã tắt; chỉ Admin thấy kho đã tắt.

**Bài học kỹ thuật K1**: eslint `no-unnecessary-condition` báo `=== false` là thừa vì type khai `is_active!: boolean` — đó là DẤU HIỆU type đang nói dối (document cũ thật sự thiếu field). Sửa đúng là khai type optional, KHÔNG tắt lint. Cũng không spread DTO class instance (`{...dto}` — rule `no-misused-spread`), liệt kê field tường minh.

### Điểm yếu còn lại sau K1 (đã ghi trong guide Phần E)

Chưa có nhật ký ai tắt/bật; khe thời gian hẹp giữa kiểm tồn và tắt kho (xử lý ở K3); chưa có nút bỏ sửa tay Product Master; nhập hàng chỉ là 1 con số (không phiếu nhập/nhà cung cấp); chưa cảnh báo tồn thấp; Product Master chỉ có SKU đã từng có đơn.

### Nghiệp vụ còn mỏng ở mức toàn hệ thống (rà thêm trong lúc làm K1)

- **Không có nhật ký thao tác quản trị** (ai sửa cấu hình gì, lúc nào) ở mọi module dữ liệu nền — chỉ các luồng giao dịch (pick_events) có lịch sử.
- **Nhập kho không có chứng từ**: không lô hàng, không nhà cung cấp, không người nhận — không đối chiếu được khi lệch tồn.
- **Không có kiểm kê định kỳ** (cycle count) — tồn trên hệ thống lệch tồn thật dần theo thời gian mà không có quy trình phát hiện.
- **Không có cảnh báo tồn thấp / hết hàng** dù hệ thống thông báo đã sẵn.
- **Bán lố giữa các sàn** (đã nêu ở I.7 — K5).

### Nhật ký K2 (26/09/2026) — danh mục 2 cấp, kệ chuẩn mới 5 phần, sức chứa, gợi ý ô, lộ trình hình rắn

**Quyết định còn treo đã xử lý để không chặn việc**: ký hiệu bên kệ dùng `T`/`P` như user đặt ban đầu, gom vào 1 hằng số `SIDE_LABELS` trong `warehouse-layout.ts` (đổi sang `TR`/`PH` chỉ sửa 1 dòng); thứ tự size theo tầng KHÔNG hardcode — Admin khai `tiers[{tier, size}]` khi tạo kệ, guide khuyến nghị size bán chạy ở tầng 2-3.

**Code**: module MỚI `categories/` (schema, 2 DTO, errors, service, controller, module — đủ vòng đời ngay từ đầu; đăng ký lại schema BinLocation thay vì import WarehouseModule để tránh vòng phụ thuộc). `warehouse/warehouse-layout.ts` MỚI (hằng số + `buildBinCodeV2` + `computePickSequence`). `bin-location.schema.ts` (+6 field optional v2, +2 index; sửa lại chú thích `// tầng/ngăn` bị K1 đẩy lệch dòng). DTO mới `create-rack`, `update-bin`; `create-zone` bắt `^K[A-Z]$`; `assign-sku-bin` + `restock-sku` thêm `force`. `warehouse.errors.ts` +5 mã. `warehouse.service.ts`: `createRack` (transaction, tất cả hoặc không), `updateBin`, `suggestBins`, kiểm tra sức chứa trong assign/restock, Picking List sắp theo `pick_sequence` với kệ cũ đi sau, inject `CategoriesService`. Controller +3 route, response kệ +6 trường, đánh dấu `generate` deprecated. `app.module.ts`, `warehouse.module.ts` đăng ký CategoriesModule. Test mới: `warehouse-layout.spec.ts` (4), `categories.service.spec.ts` (7), `warehouse.service.k2.spec.ts` (8). Kết quả: tsc 0, eslint 0, jest 22/22 suite — 198/198.

**Tác động & xử lý xung đột (5 câu):**

1. Dữ liệu cũ: kệ v1 không có field v2 → `layoutVersion: 1`, field v2 = null; kệ v2 vẫn ghi `rack`/`level` để code cũ không vỡ. Không migration.
2. Route đổi: tạo khu (định dạng mã), gán SKU/restock (409 sức chứa + `force`), Picking List (thứ tự + `pick_sequence`), GET kệ (+6 trường), generate (deprecated).
3. Xung đột: danh mục bị kệ tham chiếu → chặn bỏ size/tắt danh mục khi còn ô đăng ký (409 CAT_SIZE_IN_USE / CAT_IN_USE). Kho có cả kệ v1 + v2 → Picking List v2 trước theo lộ trình, v1 sau theo chuỗi.
4. Không ảnh hưởng: sync đơn, gộp đơn, pick-item, report-missing, packaging, notifications, product-master.
5. Lỗi có sẵn phát hiện: (a) chú thích lệch dòng do K1 → đã sửa; (b) nhân viên + nhóm đơn KHÔNG gắn kho, autoAssign chọn trong toàn bộ Warehouse Staff → CHƯA sửa (đề xuất cùng K5); (c) `findUnassignedSkus` không theo kho + tải hết vào bộ nhớ → sửa cùng K4.

**Bài học quy trình K2**: (1) `mkdir -p dir/{a,b}` và `cp dir/{a,b}` KHÔNG chạy dưới `/bin/sh` của sandbox — luôn `mkdir` từng thư mục hoặc gọi `bash -c`. (2) Script Python sửa file PHẢI có lệnh ghi ở cuối — đã có 1 lần script chạy "thành công" mà không lưu, `tsc` vẫn sạch vì code cũ vẫn hợp lệ → luôn `grep` xác nhận thay đổi thật sự có trong file sau khi sửa, không tin vào "tsc sạch". (3) `str.replace()` của Python không báo lỗi khi không tìm thấy chỗ thay → với tài liệu dài, đếm marker sau khi chèn.

**Điểm yếu còn lại sau K2** (chi tiết Phần E guide, mục 7-14): nhân viên/nhóm đơn không gắn kho; kiểm tra sức chứa chưa atomic khi nhập đồng thời; sức chứa theo số cái không theo thể tích; màu là chữ tự do; gán SKU chưa đối chiếu danh mục/size/màu; gợi ý ô chưa ưu tiên ô SKU đang nằm; "SKU chưa gán kệ" không theo kho; lộ trình hình rắn giả định 1 lối đi/dãy.

### Rà soát K2 (26/09/2026, lượt sau) — review lại code K2 trước khi cho là xong

**Bối cảnh quan trọng:** khi bắt đầu lượt này, sandbox ĐÃ CÓ phần lớn code + tài liệu K2 (module `categories/`, `warehouse-layout.ts`, `POST zones/:zoneId/racks`, sửa ô, gợi ý ô, sức chứa, Picking List theo `pick_sequence`, 3 file test, mục B2 trong guide) — từ 1 phiên làm việc bị ngắt, CHƯA từng được báo cáo/kiểm chứng với user. Bài học: **thấy code "có sẵn" không được coi là đúng** — chạy lại đủ tsc/eslint/jest rồi đọc từng hàm như review code người khác. Có 1 thư mục rác `categories/{schemas,dto}` (sh không hiểu brace expansion — lệnh `mkdir -p a/{b,c}` phải chạy bằng `bash -c`) → đã xóa.

**2 lỗ hổng tìm ra khi review — ĐÃ SỬA:**

1. `updateBin` cho đổi danh mục/size/màu đăng ký của ô ĐANG CÓ HÀNG → nhãn và hàng thật lệch → chặn `409 WH_BIN_HAS_STOCK_DESIGNATION`. Đổi sức chứa vẫn cho.
2. `generateBinLocations` (route cũ, deprecated) vẫn sinh kệ mã cũ trong khu chuẩn mới `KA..KZ` → 1 khu lẫn 2 kiểu mã → chặn `409 WH_ZONE_V2_USE_RACKS`; khu mã cũ vẫn dùng được.

**Bổ sung:** `DELETE /product-master/:id/manual-override` (đã hứa làm cùng K2).

**Kết quả:** tsc 0 lỗi, eslint 0 lỗi, jest 23/23 suite — 204/204 test (+6: `warehouse.service.k2-review.spec.ts` 5 test, product-master 1 test).

**Tác động & xử lý xung đột (5 câu):**

1. Dữ liệu cũ: kệ cũ (layout 1) không có trường mới → response `layoutVersion: 1`, trường mới `null`; vẫn gán/nhập/lấy hàng bình thường. Không migration.
2. Route đổi hành vi: tạo khu bắt `KA..KZ`; generate cũ bị chặn ở khu mới; gán/nhập hàng có thể `409 WH_BIN_OVER_CAPACITY` (bỏ qua bằng `force`); PATCH ô chặn đổi đăng ký khi còn hàng; Picking List sắp theo lộ trình, thêm `pick_sequence`.
3. Luồng đọc/ghi chồng: Picking List trong kho đang chuyển đổi — kệ mới đi trước theo lộ trình, kệ cũ đi sau theo chuỗi mã (ổn định, không vỡ luồng cũ). Danh mục bị tham chiếu bởi ô kệ → chặn bỏ size/tắt danh mục đang dùng.
4. Không ảnh hưởng: sync đơn, gộp đơn, pick-item, report-missing, packaging, notifications.
5. Lỗi có sẵn còn treo: pick-item/Picking List không lọc platform/shop (K4); gán SKU sang kệ khác = chuyển hàng không sổ cái (K3).

**Điểm yếu còn lại sau K2** (ghi trong guide Phần E): không mở rộng được kệ (thêm tầng/ô); không tắt cả kệ 1 lần; mã màu gõ tự do (cần danh mục màu — K4); gợi ý ô chưa biết SKU (K3/K4); lộ trình giả định mặt bằng cố định; kiểm sức chứa không nguyên tử (K3); tối đa 26 khu/kho; kho đang chuyển đổi đi đường chưa tối ưu.

---

## 📦 Nhật ký G1 + K3 + G3 (27/09/2026)

### ⚠️ Sự cố môi trường — sandbox bị xóa sạch giữa 2 lượt

Thư mục làm việc (`/home/claude/...`) mất hoàn toàn. Khôi phục bằng: `be.zip` (upload 20/09) + chồng các đợt đã xuất ra `/mnt/user-data/outputs` theo đúng thứ tự thời gian (flow-reversal → urgent-fix-fe → checklist-fe-full → K1 → K2), đợt dạng phẳng thì dò đúng vị trí theo tên file. **Kiểm chứng khôi phục bằng số test**: phải ra đúng 23 suite / 204 test như sau K2 — khớp tuyệt đối.
**Quy tắc mới:** sau MỖI bước xong, xuất ngay bản đầy đủ source (không node_modules) ra outputs: `be_full_after_<bước>.zip`. Lần sau khôi phục chỉ cần giải nén 1 file + `npm ci`.

### G1 — Giao hàng bản gọn (bấm nút)

- Module mới `shipments/`: `shipments` + `shipment_events` (append-only = tracking dòng thời gian). Trạng thái: out_for_delivery → delivered | delivery_failed → (retry) | returning_to_warehouse → returned_to_warehouse.
- Quy tắc: tối đa 2 lần giao, lần 2 thất bại HOẶC `customer_refused` → hệ thống TỰ chuyển hoàn về (không có nút hoàn sớm); `other` bắt ghi chú; 1 nhóm đơn 1 vận đơn chiều đi (unique index).
- Mọi nút đi qua `applyTransition()`: kiểm luật → cập nhật vận đơn có khóa `__v` → ghi event → đổi trạng thái nhóm đơn, **1 transaction**. `OrderGroupsService.transitionFulfillmentStatus` thêm tham số `session?` (tương thích ngược).
- Tạm thời Shipping Coordinator bấm toàn bộ nút giao (chưa có role shipper) — gỡ được 2 quyết định treo (role shipper, lưu ảnh).

### K3 — Sổ cái kho

- `inventory_movements` (append-only): assign_initial, receive, pick, adjust, transfer_out/in, return_restock. Ghi cùng transaction với thay đổi tồn (trừ `pick` — xem điểm yếu).
- 1 SKU nhiều ô: unique index `sku_bin_assignments` thêm `bin_location_id`. **Script bắt buộc** `scripts/migrate-sku-bin-assignment-multibin.ts` (Mongoose không tự xóa index cũ).
- Kiểm kê (số đếm thực tế, chống ghi đè bằng điều kiện `quantity_on_hand == số đã đọc`), chuyển ô (trừ có điều kiện + upsert đích), bỏ gán (tồn = 0), xem sổ cái.
- Picking List: ô chính + `other_bins`; `pick-item` nhận `bin_location_id` để trừ đúng ô; `pick_events` thêm `bin_location_id`.

### G3 — Trả / hoàn hàng bản gọn

- `return_requests` (trong module shipments). 3 loại: `failed_delivery` (HỆ THỐNG tự tạo khi kho nhận kiện hoàn — cả qua route cũ `fulfillment/return`), `return_refund`, `refund_only` (Admin đóng vai khách).
- Quy tắc: chỉ khi nhóm đơn `delivered`, ≤15 ngày, không vượt số đã mua, 1 phiếu mở/nhóm đơn; người tạo không tự duyệt; từ chối bắt lý do; kiểm hàng: tổng mỗi SKU phải khớp số trả; `restock` nhập lại ô qua `WarehouseService.restockReturnedItem` (sổ cái `return_restock`) cùng transaction.
- Phụ thuộc 1 chiều: shipments → order-groups, warehouse. Không vòng.

### Tác động & xử lý xung đột (5 câu)

1. **Dữ liệu cũ**: nhóm đơn `shipped` trước G1 → vận đơn tạo bù tự động (`legacy_backfill`) khi bấm nút; `pick_events` cũ không có `bin_location_id` (null). Index kho: PHẢI chạy script multibin.
2. **Route đổi hành vi**: 3 route `fulfillment/ship|deliver|return` CHUYỂN sang `shipments/legacy-fulfillment.controller.ts` — giữ nguyên URL/body/response/role nhưng đi qua vận đơn; `deliver` khi vận đơn `delivery_failed` → 409. Gán SKU ô khác = THÊM ô (không còn dời). Picking List thêm field. `pick-item` thêm field tùy chọn.
3. **Xung đột ghi chồng**: 2 nơi cùng đổi trạng thái giao hàng → gỡ bằng cách chỉ còn 1 đường (vận đơn). Kiểm kê vs lấy hàng cùng lúc → điều kiện `quantity_on_hand == before` → 409 `WH_STOCK_CHANGED`. Chuyển ô vs lấy hàng → trừ nguồn có điều kiện `$gte`.
4. **Không ảnh hưởng**: sync, gộp đơn, packaging, `pack`, notifications.
5. **Lỗi có sẵn phát hiện**: route cũ `return` cho nhóm đơn đã giao chuyển thẳng `returned` không kiểm hàng — GIỮ để không gãy FE, ghi rõ trong guide khuyên chuyển sang `/returns`.

### Điểm yếu còn lại (ghi đủ trong 2 guide, Phần E)

- Kho: sổ cái `pick` ghi SAU khi trừ tồn, không transaction (cùng mức với `pick_events` có sẵn) — nếu ghi sổ lỗi sau khi đã trừ thì tồn đổi mà không có dòng sổ; `pick-item` không gửi `bin_location_id` thì vẫn trừ ô bất kỳ; tồn đủ tổng nhiều ô nhưng không ô nào đủ 1 lần quét → INSUFFICIENT_STOCK (nhân viên phải quét tách theo ô); pick-item/Picking List vẫn chưa lọc platform/shop (K4).
- Giao hàng: không có khoảng cách tối thiểu giữa 2 lần giao; chưa thông báo; chưa hạn giao/cảnh báo trễ; chưa đổi hàng; chưa đi lấy hàng trả; hàng cách ly chưa có màn hình xử lý; phiếu `failed_delivery` lấy theo số lượng đặt thay vì số đã quét thật.

**Kết quả:** tsc 0, eslint 0 (1 cảnh báo có sẵn ở seed-admin), jest 26/26 suite — 239/239 test (G1 +13, K3 +9, G3 +13).

---

## 📦 Nhật ký G4 + K4a (27/09/2026)

### G4 — Vật liệu đóng gói + tái sử dụng

- Module mới `packaging-materials/` (không import module nào → order-groups, shipments import được, không vòng): `packaging_materials` (danh mục + qty_new/qty_reused, đơn giá, max_reuse_cycles), `packaging_movements` (append-only: purchase/consume/recover, saving_vnd).
- `pack` tự trừ theo gợi ý đóng gói đang hiệu lực: thùng khớp 3 kích thước, đệm khớp `match_material_type`; ưu tiên reused (ghi tiết kiệm), hàng dễ vỡ thùng chỉ dùng mới; idempotent; KHÔNG chặn pack khi thiếu (trả `warnings`). Response pack THÊM `packagingConsumption`.
- Kiểm hàng hoàn nhận `packaging[]`: A + gỡ nhãn + chưa quá số lần → qty_reused (cùng transaction phiếu); A chưa gỡ nhãn → 400; quá số lần → tự hạ C.
- **Sửa điểm yếu G3**: phiếu `failed_delivery` lấy số lượng ĐÃ QUÉT THẬT từ sổ cái K3 (type pick), fallback số đặt cho nhóm đơn trước K3.
- Lưu ý: tên lớp schema gợi ý đóng gói là `PackagingRecommendationDoc` (không phải `PackagingRecommendation`) — forFeature phải dùng đúng `.name` để trỏ cùng collection.

### K4a — SKU nội bộ (chia K4 thành K4a/K4b do rủi ro)

- Module mới `master-skus/`: `colors`, `master_skus` (mã do hệ thống ghép `{cat}-{model 3 số}-{màu}-{size}`, khóa mã + 4 thành phần), `marketplace_sku_mappings` (unique platform+shop+seller_sku_normalized; chỉ nối SKU có trong product_master).
- Thay thế SKU: tạo mới + chuyển mọi mapping + khóa cũ `replaced_by`, 1 transaction.
- **Sửa 2 điểm yếu có sẵn**: pick-item + Picking List lọc thêm platform/shop_id; pick-item gói trừ tồn + sổ cái + pick_event trong 1 transaction (session lấy từ `skuBinAssignmentModel.db.startSession()` để KHÔNG phải đổi constructor).
- Tồn kho VẪN theo SKU sàn — K4b mới chuyển.

### Tác động & xử lý xung đột (5 câu)

1. Dữ liệu cũ: không migration. Vật liệu phải khai danh mục trước khi có số liệu; trước đó pack vẫn chạy (chỉ cảnh báo). SKU sàn cũ chưa nối vẫn lấy hàng bình thường (K4a không đụng tồn).
2. Route đổi hành vi: `pack` response thêm field; `returns/:id/inspect` thêm field tùy chọn; `pick-item`/Picking List lọc thêm sàn/shop (không đổi request/response).
3. Xung đột: pick-item giờ trong transaction → 2 lần quét cùng lúc vẫn an toàn nhờ điều kiện `$gte`; pack bấm lại không trừ vật liệu 2 lần (kiểm movement consume theo ref).
4. Không ảnh hưởng: sync, gộp đơn, gợi ý/duyệt đóng gói, giao hàng.
5. Lỗi có sẵn phát hiện: spread DTO class (`{...dto}`) lặp lại lần 2 — đã có quy tắc nhưng vẫn quên → lint bắt được, sửa liệt kê field.

### Điểm yếu còn lại

- G4: 1 tồn vật liệu chung cả shop; chưa kiểm kê vật liệu; trừ vật liệu sau `packed` không chung transaction; nhân viên dùng thùng khác gợi ý thì hệ thống không biết; hạng B chỉ ghi nhận; gợi ý chưa báo trước có thùng tái sử dụng.
- K4a: màu trên kệ (K2 `cell_colors`, đăng ký ô) CHƯA bị kiểm theo danh mục màu (chỉ SKU nội bộ bị kiểm) — FE phải dùng dropdown `/colors`; K4b sẽ ép kiểm. Tồn chưa chung giữa các sàn (K4b). Chống bán lố (K5).
- Giao hàng (chưa làm, gom 1 đợt riêng): khoảng cách tối thiểu giữa 2 lần giao, thông báo, hạn giao/cảnh báo trễ, đổi hàng, màn hình hàng cách ly.

**Kết quả:** tsc 0, eslint 0 (1 cảnh báo có sẵn seed-admin), jest 28/28 suite — 263/263 test (G4 +12, K4a +12 kể cả test sửa lọc sàn/shop).

---

## 📦 Nhật ký K4b + K5 (27/09/2026)

### K4b — Tồn chung theo SKU nội bộ, có "đường lùi"

- `sku_bin_assignments.master_sku` (null = chưa nối). Partial unique `{warehouse_id, master_sku, bin_location_id}` chỉ áp khi master_sku là string.
- `master-skus/stock-key.util.ts`: `resolveMasterSkus()` + `stockFilterFor()` + `stockKeyOf()` — HÀM THUẦN nhận model, dùng chung ở warehouse và order-groups mà không import module của nhau (tránh vòng). Mọi chỗ đụng tồn đi qua đây: pick-item, Picking List, assign, transfer, restockReturnedItem, findUnassignedSkus.
- Nối SKU sàn (createMapping) → cùng transaction: gắn nhãn dòng tồn của SKU sàn đó; ô đã có dòng của SKU nội bộ → GỘP (2 dòng sổ cái `sku_merge`, xóa dòng cũ). Bỏ nối: chặn khi tồn gộp > 0 (`MAP_HAS_POOLED_STOCK`); bỏ liên kết cuối cùng → gỡ nhãn. Thay thế SKU → chuyển nhãn tồn. `POST /master-skus/sync-stock` cho liên kết tạo trước K4b; `GET /master-skus/unpooled-stock` báo còn sót.
- Kiểm chứng đường lùi: TOÀN BỘ 263 test cũ xanh ngay sau khi gắn K4b (chưa nối = chạy như cũ).

### K5 — Chống bán lố

- `stock_reservations` (1 doc/nhóm đơn/khóa tồn: needed, picked, reserved, status) + `stock_reservation_totals` (_id = khóa tồn, reserved).
- **Chống write skew**: mọi giao dịch giữ chỗ GHI vào document tổng của khóa (`$set touched_at`) → 2 giao dịch đồng thời cùng khóa bị MongoDB báo WriteConflict, withTransaction tự chạy lại bên thua → đọc tổng mới → không giữ lố. (Chỉ đọc tổng thì 2 bên cùng thấy "còn 1" — đó là lỗi kinh điển.)
- Hook: tạo nhóm đơn (startPickingPhase) + đơn gộp đến muộn (order_count đổi) → reconcile; pick-item → consume trong CÙNG transaction; transition → PICKED (không session) → release. Tất cả best-effort, không chặn đồng bộ đơn.
- `StockReservationService` KHÔNG phụ thuộc `OrderGroupsService` (OrderGroupsService truyền items vào) → không vòng provider.
- Thiếu hàng là TRẠNG THÁI (`stock_shortage`, `stock_shortage_items` trên nhóm đơn), không phải lỗi.

### Tác động & xử lý xung đột (5 câu)

1. Dữ liệu cũ: dòng tồn cũ `master_sku` không có = null = đường lùi. Nhóm đơn trước K5 không có giữ chỗ → `recheck` tạo; pick-item của chúng không consume (bỏ qua an toàn). Không migration mới (vẫn cần script multibin K3).
2. Route đổi: response dòng tồn/sổ cái thêm `masterSku`; nhóm đơn thêm `stockShortage*`; Picking List thêm `master_sku`; bỏ nối có lỗi mới. Request không đổi.
3. Xung đột: gộp tồn trong cùng transaction với tạo liên kết; giữ chỗ đồng thời chống bằng document tổng; pick consume cùng transaction trừ tồn.
4. Không ảnh hưởng: đồng bộ đơn (hook best-effort), gộp đơn, đóng gói, giao hàng, trả hàng (restock hàng hoàn đã theo K4b).
5. Lỗi phát hiện khi làm: response dòng tồn chưa có `masterSku` → FE không thấy kết quả gộp → đã bổ sung trước khi viết guide (bài học: viết guide demo = cách kiểm tra "FE có nhìn thấy kết quả không").

### Điểm yếu còn lại (guide SKU_STOCK Phần 8.3)

Nhập hàng không tự tính lại nhóm đơn thiếu; đơn hủy trên Lazada không tự nhả giữ chỗ; giữ chỗ tính tổng mọi kho; không đẩy tồn khả dụng lên Lazada; chưa có thao tác tách tồn đã gộp; màu kệ K2 chưa ép danh mục màu; thiếu hàng chưa có thông báo chuông.

**Kết quả:** tsc 0, eslint 0 (1 cảnh báo có sẵn seed-admin), jest 30/30 suite — 276/276 test (K4b +6, K5 +7).

---

## ✍️ Quy ước văn phong tài liệu FE (27/09/2026)

- KHÔNG dùng văn nói trong tiêu đề/nội dung guide: "nói thẳng", "thẳng thắn", "nói trước"...
- Mục hạn chế đặt tên thống nhất: **"HẠN CHẾ HIỆN TẠI VÀ HƯỚNG KHẮC PHỤC"** (không dùng "Điểm còn yếu").
- Mỗi hạn chế viết theo cấu trúc: hạn chế là gì → ảnh hưởng thế nào → hướng khắc phục.

---

## 📦 Nhật ký đợt tiện ích vận hành (27/09/2026)

**Bối cảnh:** khi bắt đầu lượt, sandbox đã có phần lớn code của đợt này từ một phiên làm việc bị ngắt (lần thứ 2 sau K2). Đã đối chiếu với bản `be_full_after_K5.zip` bằng `diff -rq` để liệt kê chính xác phần chưa được kiểm chứng, chạy đủ tsc/eslint/jest rồi review từng phần trước khi xác nhận.

**Nội dung:**

- Giao hàng: `next_attempt_not_before` (mặc định +120 phút, `SHIPMENT_MIN_RETRY_GAP_MINUTES`; hoặc `reschedule_at`); giao sớm bắt buộc `override_reason`, ghi vào lịch sử. `due_at` = bắt đầu giao + `SHIPMENT_DUE_BUSINESS_HOURS` giờ làm việc; `shipment-sla.scheduler.ts` 15 phút/lần gắn `is_overdue` + thông báo 1 lần. Bổ sung trong lượt review: bộ lọc `GET /shipments?overdue=true` và `POST /shipments/overdue-scan` (Admin) phục vụ vận hành/demo.
- Thông báo Store Owner: `delivery_failed`, `delivery_returning`, `delivery_overdue`, `return_requested`, `stock_shortage` — best-effort, không chặn thao tác chính.
- Trả hàng: hàng cách ly (`GET /returns/quarantine`, resolve restock/discard qua sổ cái); đổi hàng (`type: exchange`, `exchange_items`; kiểm hàng xong tự tạo đơn `EXC-<rma>` + nhóm đơn `origin: replacement`, khóa gộp riêng `replacement:<id>` — không gộp nhầm, không bị đồng bộ Lazada ghi đè; lỗi tạo -> `replacement_status: failed`, tạo lại bằng route riêng).
- Vật liệu: `pack` + trừ vật liệu cùng transaction (`PackagingMaterialsService.withTransaction`); `materials_used` trừ đúng vật liệu/ngăn thực tế; `qty_internal` cho hạng B + `internal-use`; hạng C ghi `discard`.

**Tác động & xử lý xung đột (5 câu):**

1. Dữ liệu cũ: vận đơn không có `due_at`/`next_attempt_not_before` -> không giới hạn; vật liệu `qty_internal` mặc định 0; đơn/nhóm đơn `origin` mặc định `marketplace`. Không migration.
2. Route đổi hành vi: không có — chỉ thêm trường tùy chọn và route mới.
3. Xung đột: đơn thay thế tách khỏi gộp đơn/đồng bộ bằng khóa gộp riêng + mã `EXC-`; pack và trừ vật liệu cùng transaction.
4. Không ảnh hưởng: đồng bộ đơn, gộp đơn, gợi ý đóng gói, K4b/K5 (đơn thay thế tự được giữ chỗ vì đi qua `getOrCreateGroupForOrder`).
5. Phát hiện khi review: thiếu cách lọc vận đơn quá hạn và cách chạy quét tức thời -> đã bổ sung; tài liệu ghi sai tên trường thông báo (`related_entity_type`) -> đã sửa trước khi xuất.

**Tài liệu:** `INTEGRATION_GUIDE_OPERATIONS_UTILITIES.md` (mới), `DEMO_PLAYBOOK.md` (mới — sổ tay trình diễn toàn hệ thống), cập nhật `API_LIST.md` mục 15, dẫn chiếu trong guide giao hàng và vật liệu; chuẩn hóa văn phong các guide.

**Kết quả:** tsc 0, eslint 0 (1 cảnh báo có sẵn seed-admin), jest 31/31 suite — 292/292 test.

---

## 🔬 Nghiên cứu đồng bộ tồn kho khả dụng lên Lazada (29–30/09/2026) — CHƯA CODE, chờ test trên shop thật

**Mục tiêu:** chỉnh tồn trong kho OptiPack thì tồn trên shop Lazada cập nhật theo. Nguồn: tài liệu chính thức Lazada Open Platform do Thuận chụp gửi — AdjustSellableQuantity, UpdateSellableQuantity, UpdatePriceQuantity, UpdateProduct, GetProducts, GetProductItem, RemoveProduct, RemoveSku, ProductCheck, trang **Inventory Management API (cập nhật 07/07/2025)** và **Inventory calculation logic** (cây tài liệu: API Best Practice → Product operation → Product Inventory Management; bản sao: `developer.alibaba.com/docs/doc.htm?treeId=499&articleId=121233&docType=1`).

**1. Mô hình tồn của Lazada (5 loại, theo từng SKU/kho):**

| Loại                 | Ý nghĩa                                                                        | Ai sửa                                  |
| -------------------- | ------------------------------------------------------------------------------ | --------------------------------------- |
| `withholdQuantity`   | Đơn **unpaid**; quá 30 phút không trả tiền → trả về sellable                   | Không sửa được                          |
| `occupyQuantity`     | Đơn **pending → packed**; **rời occupy khi đơn sang RTS**, hủy thì về sellable | Không sửa được                          |
| `sellableQuantity`   | Số khách mua được, Seller Center hiển thị; **đã gồm** phần khóa chiến dịch     | Adjust / UpdateSellable / UpdateProduct |
| `totalQuantity`      | Tổng các loại trên; phải ≥ withhold + occupy + campaign                        | UpdatePriceQuantity                     |
| `channelInventories` | Phần khóa cho chiến dịch; hết chiến dịch → về sellable                         | Không sửa được                          |

Sơ đồ luồng: khi RTS thì `total` giảm hẳn. Hủy do **khách hủy / seller không giao được** → trả về sellable. Hủy do **seller hết hàng / sai giá** → sơ đồ cho thấy `total` và `sellable` về **0** (chưa rõ cả SKU hay chỉ phần của đơn — cần test).

**2. Chọn API (ĐÃ THAY ĐỔI so với ghi chú 27/09 "ưu tiên UpdateSellableQuantity hơn Adjust"):**

| API                                                                                                                                                   | Dùng  | Vai trò                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `POST /product/stock/sellable/adjust` (Adjust)                                                                                                        | Có    | Đẩy **chênh lệch** (+N/−N, được gửi số âm) cho biến động phát sinh trong kho OptiPack — không đè phần Lazada vừa tự trừ khi có đơn |
| `/product/stock/sellable/update` (UpdateSellable)                                                                                                     | Có    | **Ghi đè** sellable: đối soát định kỳ, lần đầu nối SKU, khôi phục sau khi Lazada đưa về 0                                          |
| GetProducts (`options=1`, `sku_seller_list`, cuộn `update_after`, limit ≤ 50) / GetProductItem (`item_id` bắt buộc; `seller_sku` ngừng từ 15/11/2023) | Có    | Lấy `item_id`/`SkuId`; đọc sellable/occupy/withhold/`channelInventories`                                                           |
| GetMultiWarehouseBySeller (`/seller/warehouse/get`, `addressTypes=["warehouse"]`)                                                                     | 1 lần | Xác định shop 1 kho (`dropshipping`) để dùng payload 1 kho                                                                         |
| UpdatePriceQuantity                                                                                                                                   | Không | Ghi **total** → trừ trùng occupy (kho mình trừ ở pick, Lazada giữ occupy tới RTS), có thể bị từ chối; payload kèm giá              |
| UpdateProduct                                                                                                                                         | Không | Lazada ghi rõ không khuyến nghị dùng để sửa tồn; ghi đè thuộc tính sản phẩm                                                        |
| RemoveProduct / RemoveSku / ProductCheck                                                                                                              | Không | Phá hủy dữ liệu / chỉ cho seller xuyên biên giới                                                                                   |

**3. Quy tắc đẩy — câu hỏi quyết định: "Lazada đã tự biết thay đổi này chưa?"** Chỉ đẩy biến động **không** bắt nguồn từ vòng đời đơn Lazada.

| Sự kiện OptiPack                                                                                                                             | Hành động                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Nhập hàng (`restock`), kiểm kê, loại bỏ/cách ly, restock hàng trả (RMA giả lập, giao thất bại), giữ hàng cho đơn kênh khác (AURELLE, `EXC-`) | Adjust ±N                                                                                 |
| Chuyển ô                                                                                                                                     | Không đẩy (tổng không đổi)                                                                |
| Đơn Lazada: giữ chỗ → pick → pack → giao                                                                                                     | Không đẩy (Lazada đã trừ)                                                                 |
| Đơn Lazada khách hủy / seller không giao được                                                                                                | Không đẩy; chỉ giải phóng giữ chỗ nội bộ; nếu đã pick thì restock nội bộ **không** Adjust |
| Seller hủy vì hết hàng                                                                                                                       | UpdateSellable khôi phục                                                                  |
| Seller hủy vì sai giá                                                                                                                        | Không đẩy; cảnh báo Store Owner                                                           |
| Nối SKU mới / đối soát đêm                                                                                                                   | UpdateSellable                                                                            |

Công thức ghi đè: `sellable = on_hand − reserved (mọi kênh) − chưa_sync`, với `chưa_sync = max(0, (withhold + occupy) − (đơn Lazada đã giữ chưa pick + đã pick chưa RTS))`; không thấp hơn `channelInventories` (thấp hơn → không đẩy, cảnh báo).

**4. Ràng buộc kỹ thuật:** ≤ 50 SKU/request (khuyến nghị 20; vượt → 4171/timeout, 513 gợi ý giảm về ≤ 20); 50 lần/giây/seller; kết quả không âm; ≥ campaign lock; seller 1 kho không dùng payload nhiều kho; không gửi khối pre-inventory (`BizType=2`). Lỗi: 901/6 → retry backoff; 4170 → hoãn tới hết chiến dịch; 212 → đọc lại rồi tính lại; 4137/207/`EDIT_ITEM_NOT_BELONG_SELLER` → làm mới mapping; 4155/4218 → sản phẩm bị khóa, ngừng đẩy, báo Store Owner; 501 → đọc `detail` theo từng SKU; `SellerNotActive` → dừng cả shop.

**5. Thiết kế đề xuất:** bảng mapping `lazada_item_id`/`lazada_sku_id` (gắn K4) → outbox ghi trong cùng transaction với `inventory_movements` → worker 1–2 phút gộp theo SKU, batch ≤ 20 → cron đối soát sau sync đơn → công tắc theo shop, mặc định tắt. Webhook "Shallow Stock" / "Product Update" có sẵn nhưng hoãn tới khi deploy (cùng lý do webhook đơn).

**6. Điều kiện trước khi code:** (1) kiểm tra quyền Product API trong App Console và test trên 1 sản phẩm thật (Adjust +1/−1, UpdateSellable, đọc lại); (2) làm trạng thái hủy cho order group (audit P1) — thiếu thì giữ chỗ của đơn hủy không giải phóng, số đẩy sai; (3) kiểm tra cron sync có lấy đơn `unpaid` không. Khi code xong: quyết định "chỉ đọc Lazada" đổi thành "đọc đơn, ghi tồn khả dụng" — sửa tại mục 14/09 ở trên.

**Cần xác nhận khi test:** hủy vì hết hàng làm cả SKU hay 1 đơn vị về 0; định dạng `detail` khi batch lỗi một phần; các trường `options=1` trên shop VN; 4155/4218 có xuất hiện ở API tồn không.

---

## 📦 Nhật ký 01/10/2026 — Mở quyền vận hành kho cho Warehouse Staff

**Bối cảnh:** FE (Việt) báo 3 route `GET .../bin-locations`, `GET .../sku-bin-assignments`, `POST .../restock` đã có nhưng chỉ `@Roles(ADMIN)` → Warehouse Staff bị 403, không có màn hình xem hàng nằm ở ô nào và không tự nhập hàng. Kiểm tra `be.zip`: đúng, cả 3 chỉ ADMIN, trong khi `adjust`/`transfer`/`bin-suggestions`/`movements` đã mở Warehouse Staff từ K2/K3 — không nhất quán. `DEMO_PLAYBOOK.md` bước B6 và guide SKU_STOCK 5.4 còn hướng dẫn Warehouse bấm nhập hàng → sẽ 403.

**Thay đổi code:** `warehouse.controller.ts` — thêm `UserRole.WAREHOUSE_STAFF` vào `@Roles` của 4 method: `listZones` (`GET warehouses/:id/zones` — mở thêm vì bin-locations chỉ trả `zoneId`, staff cần mã khu để hiển thị/lọc), `listBinLocationsByWarehouse`, `listSkuBinAssignmentsByWarehouse`, `restockSku`. Sửa comment đầu controller (ghi sai "toàn bộ route ADMIN trừ 2 route đọc"). Không đổi service/DTO/schema. `restock` đã lấy người thực hiện từ JWT (`user.userId`) → sổ cái `receive` ghi đúng nhân viên.

**Tác động & xử lý xung đột (5 câu):**

1. Dữ liệu cũ: không đổi schema, không migration.
2. Route đổi hành vi: không đổi request/response; chỉ thêm vai trò được gọi.
3. Luồng bị ảnh hưởng: nhập hàng có thể do Warehouse Staff làm → tồn khả dụng K5 tăng như Admin nhập; sổ cái ghi đúng người.
4. Không ảnh hưởng: cấu hình kho, gán SKU, K4a/K4b, giữ chỗ K5, Picking List, pick-item, trả/hoàn hàng.
5. Lỗi có sẵn phát hiện: (a) playbook/guide hướng dẫn Warehouse nhập hàng khi route chưa mở — khớp sau thay đổi; (b) restock không tự recheck nhóm đơn thiếu hàng (audit P1) — để commit riêng; (c) `include_inactive=true` ở zones/bin-locations có tác dụng với cả Warehouse Staff (danh sách kho thì không) — chỉ xem, ghi vào hạn chế; (d) "không tìm thấy dòng tồn" dùng chung mã `WH_WAREHOUSE_NOT_FOUND` — ghi vào hạn chế; (e) nhân viên chưa gắn kho làm việc (đã có ở guide PHẦN E mục 7).

**Tài liệu:** `INTEGRATION_GUIDE_WAREHOUSE.md` v1.4 (PHẦN B5 mới: bảng quyền, màn "Tồn kho theo vị trí" từng bước, request/response, mã lỗi, cách demo, tác động, hạn chế; B.3; F.1; F.5), `API_LIST.md` mục 9 + tóm tắt Warehouse Staff, `INTEGRATION_GUIDE_FULFILLMENT.md` Nghiệp vụ 2b, `DEMO_PLAYBOOK.md` (1.3, B6), `INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md` 5.4, ma trận role trong file này.

**Commit:** `feat(AOFP-50): allow warehouse staff to view bins, stock by bin, zones and restock` (code) và `docs(AOFP-50): document warehouse staff access to bin stock and restock` (tài liệu). Số ticket thay theo Jira nếu task có mã riêng.

**Kiểm chứng:** thay đổi chỉ ở decorator; trước khi push chạy `npx tsc --noEmit`, `npm run lint`, `npm run test`, và test tay bằng tài khoản Warehouse Staff (4 route → 200; `POST warehouses/:id/zones` → vẫn 403).

---

## 📦 Nhật ký 01/10/2026 — Nhóm đơn trả thêm số đơn còn hiệu lực / đã hủy (bước 1 xử lý hủy đơn)

**Bối cảnh:** FE (Việt) báo màn kho không phân biệt được nhóm đơn có đơn hủy: đơn có `status: canceled` ở collection `orders`, BE đã lọc đơn hủy ở tầng hàng cần lấy (`getPackableItemsForGroup`, dùng chung cho Picking List + gợi ý đóng gói), nhưng `OrderGroupResponse` chỉ có `orderCount` → trên danh sách nhóm bình thường / hủy một phần / hủy hết giống hệt nhau. Yêu cầu: thêm trường cho danh sách. User chốt: làm đúng yêu cầu này trước, phần xử lý nghiệp vụ hủy làm sau.

**Thay đổi code:**

- `order-groups.service.ts`: `interface GroupOrderCounts` + `getOrderCountsForGroups(groupIds)` — 1 aggregation trên `orders` cho cả danh sách (Rule #16). `activeOrderCount` = status KHÔNG thuộc `NOT_PACKABLE_ORDER_STATUSES` (đúng quy tắc Picking List); `canceledOrderCount` = status `canceled`. **Không** thêm `is_consolidated: true` vào `$match` dù index `consolidated_group_id` là partial theo field đó — nhóm 1 đơn có `consolidated_group_id` nhưng `is_consolidated` vẫn false (`getOrCreateGroupForOrder` chỉ `$set consolidated_group_id`), thêm vào sẽ đếm thiếu.
- `order-groups.controller.ts`: `OrderGroupResponse` thêm `activeOrderCount`, `canceledOrderCount`; `toResponse(group, counts)` bắt buộc tham số đếm (tránh âm thầm trả 0); thêm `buildOrderGroupResponse` / `buildOrderGroupResponses`; mọi route trả nhóm đơn (list, detail, report-missing, decide-partial, pick, pack, priority) đều có số đếm. `toOrderGroupResponse` (dùng ở `shipments/legacy-fulfillment.controller.ts`) đổi thành bản async nhận service — 3 route legacy cập nhật theo.
- Test mới `order-groups.service.getOrderCountsForGroups.spec.ts` (6 test).

**Tác động & xử lý xung đột (5 câu):**

1. Dữ liệu cũ: API đếm lúc đọc nên nhóm cũ có số đúng ngay. 🔄 Sau phần bổ sung bên dưới: schema có thêm 3 trường lưu sẵn (default null) — document cũ không có trường cho tới khi chạy `scripts/backfill-order-group-counts.ts` hoặc được đồng bộ lại; không ảnh hưởng API.
2. Route đổi hành vi: không đổi request; response chỉ THÊM 2 trường. Mỗi response nhóm đơn tốn thêm 1 truy vấn đếm (danh sách: 1 truy vấn cho cả trang).
3. Luồng bị ảnh hưởng: không luồng nào đổi hành vi — chỉ đọc.
4. Không ảnh hưởng: đồng bộ đơn, gộp đơn, Picking List, K5, giao hàng, trả hàng.
5. Phát hiện khi làm: (a) truy vấn theo `consolidated_group_id` không dùng được partial index (cả `getOrderCountsForGroups` lẫn `countDocuments` có sẵn trong `getOrCreateGroupForOrder` và `getPackableItemsForGroup`) → quét collection `orders`; ổn ở quy mô demo, nên thêm index thường `{ consolidated_group_id: 1 }` khi dữ liệu lớn; (b) nhóm hủy hết vẫn giữ chỗ K5 — `reconcileReservation` gọi `getPackableItemsForGroup` → ném `ALL_ORDERS_CANCELED` → bị nuốt trong try/catch, giữ chỗ không nhả; (c) hủy một phần không tự tính lại giữ chỗ. (b)(c) thuộc bước 2 bên dưới.

**Bước 2 (CHƯA LÀM, hướng đã thống nhất 01/10/2026 — xem phân tích trong chat):** tách "hủy nghiệp vụ" (tự động, 1 transaction lúc sync, idempotent) khỏi "xử lý hàng vật lý" (phiếu cất hàng `putaway_tasks`, nhân viên xác nhận mới cộng tồn, sổ cái `cancel_putaway`). Dùng `need_cancel_confirm`/`is_cancel_pending` (đã lưu từ 16/09) để TẠM GIỮ nhóm (chặn pack/ship) khi khách mới yêu cầu hủy; `status: canceled` thì hủy tự động — không cần Store Owner duyệt trong OptiPack. Nhóm hủy hết → `fulfillment_status: cancelled` (từ picking/picked/packed; không từ shipped trở đi), nhả giữ chỗ, gỡ phân công, chặn thao tác 409, tự tính lại nhóm thiếu cùng SKU; hủy một phần sau khi đóng gói → `needs_repack`. Khi làm: chuyển số đếm sang lưu sẵn trên nhóm để lọc được ở BE. Không đẩy gì lên Lazada (Lazada tự trả tồn khi đơn hủy).

**Tài liệu:** `INTEGRATION_GUIDE_FULFILLMENT.md` v4.2 (Nghiệp vụ 3 mục mới + checklist D.4), `API_LIST.md` mục 5.

**Kết quả kiểm chứng (sandbox, `npm install` mới trong `be/`):** tsc 0 lỗi; eslint 0 lỗi trên các file đã sửa; jest 32/32 suite — 298/298 test (trước: 31/292). Eslint toàn repo báo 3 lỗi `no-unsafe-enum-assignment` ở `notifications.service.ts` và `packaging.service.spec.ts` — file không đụng tới, xuất hiện do sandbox cài phiên bản `typescript-eslint` mới hơn lockfile của repo; kiểm tra lại bằng `npm run lint` trên máy.

**Bổ sung cùng ngày — bản lưu sẵn trong DB (theo yêu cầu Thuận: xem được số đếm trực tiếp trong Compass):**

- `order-group.schema.ts`: thêm `active_order_count`, `canceled_order_count` (`Number | null`, default null — Rule #23), `order_counts_refreshed_at`.
- `order-groups.service.ts`: `getOrCreateGroupForOrder` tách thân hàm thành `resolveGroupForOrder` (private, giữ nguyên logic) + gọi `refreshOrderCounts(group._id)` sau đó — mọi lần đồng bộ chạm tới nhóm (đơn mới, đổi trạng thái, gộp muộn, đơn `EXC-`) đều tính lại. `refreshOrderCounts` dùng `updateOne` (không `save`) để KHÔNG tăng `__v` (Rule #18), best-effort (lỗi chỉ log).
- Script `scripts/backfill-order-group-counts.ts`: điền cho mọi nhóm cũ, theo lô 200 (`_id` tăng dần) + `bulkWrite` (Rule #14), chạy lại an toàn. Đã thêm vào `DEMO_PLAYBOOK.md` mục 1.2.
- **Nguyên tắc:** API VẪN đếm lúc đọc từ `orders` (nguồn sự thật); bản lưu sẵn chỉ để xem trong DB và làm nền cho bộ lọc BE ở bước 2. Khi bước 2 chuyển API/bộ lọc sang đọc bản lưu sẵn, phải đảm bảo mọi đường đổi trạng thái đơn đều gọi `refreshOrderCounts` (hiện chỉ có đường đồng bộ + tạo đơn thay thế).
- Test: thêm 4 test (ghi đúng bằng `updateOne`; nhóm rỗng -> 0/0; lỗi DB không ném; `getOrCreateGroupForOrder` gọi tính lại). Kết quả: tsc 0, eslint sạch trên file đã sửa + script, jest 32 suite / 302 test.

**Commit (quy ước mới: code theo tính năng, tài liệu gộp 1 commit, số ticket tăng dần):** `feat(AOFP-51): add active and canceled order counts to order group responses`, `feat(AOFP-52): store order group cancel counts on sync and add backfill script`, tài liệu gộp `docs(AOFP-53)`.

---

## 🔬 Nghiên cứu Lazada Fulfillment API — Pack / ReadyToShip / GetShipmentProvider / PrintAWB (02/10/2026) — Pack ĐÃ CODE (xem nhật ký cuối file); ReadyToShip / GetShipmentProvider / PrintAWB chưa dùng

**Bối cảnh:** cô yêu cầu nút cho Packaging Staff xác nhận "đã đóng gói" trên Lazada ngay từ OptiPack; quay lại hệ thống thấy trạng thái đã đóng gói. Nguồn: ảnh chụp tài liệu chính thức Lazada Open Platform (bản cập nhật 09/08/2022) do Thuận gửi, kèm ghi chú trang Order Status Flow. Tất cả endpoint VN: `https://api.lazada.vn/rest`, ký như các API đọc đang dùng (app_key, timestamp, access_token, sign_method, sign). **Cả 4 API đều nhận tham số là 1 object JSON** (`packReq`, `readyToShipReq`, `getShipmentProvidersReq`, `getDocumentReq`) → adapter cần thêm hàm ký POST (`callSignedPost`), hiện chỉ có `callSignedGet`.

**Điều kiện trạng thái (trang Order Status Flow):** gọi `GetOrderItems` trước; chỉ order item `pending` hoặc `repacked` mới được `Pack`; chỉ item `packed` mới được `ReadyToShip`.

### 1. GetShipmentProvider — `GET/POST /order/shipment/providers/get`

- Tham số `getShipmentProvidersReq.orders[]` (tối đa 20 đơn): `order_id` (Number), `order_item_ids` (Number[]).
- Response `result.data`:
  - `platform_default`: **1** = seller không cần/không được chọn kho trung chuyển; **0** = seller **phải** chọn 1 mục trong `shipment_providers` và truyền vào Pack.
  - `shipment_providers[]`: `name`, `provider_code` (là danh sách **kho trung chuyển** — transferring warehouses).
  - `shipping_allocate_type`: `TFS` / `NTFS` — **truyền thẳng** vào Pack.
- `result.success`, `error_code`, `error_msg` (khi success = false). Bảng mã lỗi: trống.
- Vai trò: **luôn gọi trước Pack** để lấy `shipping_allocate_type` (bắt buộc ở Pack) và biết có phải chọn `shipment_provider_code` không.

### 2. Pack — `POST /order/fulfill/pack`

- Tham số `packReq`:
  - `pack_order_list[]` (bắt buộc, **tối đa 20 đơn**; các đơn con của cùng 1 đơn được xử lý cùng nhau): `order_id` (Number), `order_item_list` (Number[] — order_item_id cần đóng gói).
  - `delivery_type` (bắt buộc): `dropship`.
  - `shipping_allocate_type` (bắt buộc): lấy từ GetShipmentProvider.
  - `shipment_provider_code` (không bắt buộc): shop nội địa (TFS) **không được truyền**; shop xuyên biên giới (NTFS) **phải truyền**; **không được truyền cho đơn DBS**. Giá trị lấy từ GetShipmentProvider.
- Response `result.data.pack_order_list[]` → `order_id`, `order_item_list[]`: `order_item_id`, `msg`, **`item_err_code` ("0" = thành công)**, `tracking_number`, `shipment_provider`, **`package_id`**, `retry`. `result.success = true` **không có nghĩa** mọi item thành công — phải xét `item_err_code` từng item; `success = false` thì cả lô thất bại (`error_code`, `error_msg`). Mẫu response của Lazada có `error_msg: "order not found"` đi kèm item thành công → không dựa vào `error_msg` cấp lô khi `success = true`.
- Mã lỗi (gom nhóm để xử lý):

| Nhóm                                 | Mã                                                                                                                                                                 | Xử lý đề xuất                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Hệ thống bận, thử lại                | 6 `SYSTEM_ERROR`, 40011 `RPC_ERROR`, 700024 `GET_LOCK_FAILED`, 1003 `E1003_3PL_ALLOCATION_FAIL`                                                                    | Retry có backoff (xét thêm cờ `retry` của item)                                                                               |
| Trạng thái không cho đóng gói        | 700000 `PACKAGE_STATUS_NOT_ALLOW_TO_OP`, 700026 `FO_ITEM_NOT_ALLOW_TO_PACK`, 700031 `ITEM_NOT_READY_TO_FULFILL`                                                    | Đọc lại `GetOrderItems`: nếu item đã `packed` và có `package_id` → coi như đã đóng gói (idempotent); nếu đã hủy → bỏ qua item |
| Không tìm thấy                       | 700020, 700021 `ORDER_NOT_FOUND`, 700025 `ORDER_ITEM_NOT_FOUND`, 700032 `SELLER_NOT_FOUND`                                                                         | Lỗi dữ liệu/token, không retry, báo Admin                                                                                     |
| Sai tham số                          | 700004 `PARAM_ILLEGAL`, 700017 `PARAM_IS_NULL`, 700018 `PARAM_SIZE_ERROR`, 700019 `PARAM_MIN_ERROR`, 700022 `BATCH_SIZE_OUT_OF_LIMIT`                              | Lỗi code phía mình, không retry                                                                                               |
| Đơn vị vận chuyển / kho trung chuyển | 700001 `DBS_SHIPMENT_PROVIDER_CODE_NOT_EXITS`, 700016 `NOT_AVAILABLE_NTFS_3PL`, 700033 `TRANSFERRING_WAREHOUSE_PROVIDER`, 700029 `ITEM_MUST_BELONG_SAME_WAREHOUSE` | Kiểm tra lại kết quả GetShipmentProvider / tách lô theo kho                                                                   |
| Loại đơn không hỗ trợ                | 700013 `OP_NOT_SUPPORT`, 700023/700028 (nhận tại cửa hàng), 700027 (FBL), 700030 (hàng số/dịch vụ)                                                                 | Bỏ qua, đánh dấu "không đóng gói qua API"                                                                                     |

### 3. ReadyToShip — `POST /order/package/rts`

- Tham số `readyToShipReq.packages[]` (tối đa 20): `package_id` (String — lấy từ kết quả Pack).
- Response `result.data.packages[]`: `msg`, `item_err_code` ("0" = thành công), `package_id`, `retry`; quy tắc `success` giống Pack. Bảng mã lỗi: trống; mẫu có `600002 "package already cancelled"`.
- Theo trang Inventory calculation logic (29/09): **khi đơn sang RTS, Lazada mới trừ hẳn tổng tồn** (rời occupy). Gọi RTS là cam kết sẵn sàng bàn giao.

### 4. PrintAWB — `GET/POST /order/package/document/get`

- Tham số `getDocumentReq`: `doc_type` (`HTML`/`PDF`), `packages[]` (tối đa 20, `package_id`), `print_item_list` (Boolean, tùy chọn — in kèm danh sách hàng).
- Response `result.data`: `file` (nội dung PDF/HTML), `doc_type`, `pdf_url` (chỉ khi PDF). Chỉ dùng cho nhãn vận chuyển.
- **Không áp dụng cho shop demo:** đã xác nhận 15/09 qua bảng lỗi `GetDocument` — Lazada không cấp nhãn cho đơn SOF/DBS. Giữ nguyên quyết định không dùng.

### 5. Ánh xạ vào OptiPack (thiết kế đề xuất, chờ chốt)

- Dữ liệu cần có: `order_id` = `orders.platform_order_id`; `order_item_id` = `orders.items[].platform_order_item_id` (đã lưu khi sync). Cần lưu thêm kết quả Pack theo từng item: `package_id`, `tracking_number`, `shipment_provider`, trạng thái đồng bộ Lazada.
- Luồng nút "Đóng gói xong": lấy các đơn **còn hiệu lực** của nhóm (cùng quy tắc `activeOrderCount`) → `GetOrderItems` kiểm tra item `pending`/`repacked` → `GetShipmentProvider` → `Pack` (1 request cho cả nhóm, ≤ 20 đơn) → lưu `package_id` → nhóm OptiPack sang `packed`.
- **Một nhóm OptiPack (1 thùng) có thể gồm nhiều đơn Lazada → Lazada sinh nhiều package.** Cần chốt cách dán/quản lý nhiều mã package cho 1 thùng thật.
- `ReadyToShip`: gắn vào bước bàn giao/bắt đầu giao (Shipping Coordinator), không gắn vào nút đóng gói.
- Nguyên tắc an toàn (giữ từ kế hoạch 15/09): cầu dao `LAZADA_WRITE_APIS_ENABLED` (mặc định tắt); Pack/RTS là API ghi có hậu quả thật trên shop.

### 6. Việc cần chốt / cần test trước khi code

1. Lazada lỗi thì sao: chặn chuyển `packed` trong OptiPack, hay vẫn `packed` + trạng thái "chưa đồng bộ Lazada" + nút thử lại (đề xuất: cách sau — thùng đã đóng thật).
2. Shop demo là **SOF**: test thật 1 đơn — `GetShipmentProvider` trả `platform_default` / `shipping_allocate_type` gì; `Pack` có thành công với `delivery_type: dropship` không, có trả `tracking_number` không.
3. Ai gọi `ReadyToShip`, lúc nào; có cần không với SOF.
4. Nhiều package cho 1 thùng (mục 5).
5. Quan hệ với đồng bộ tồn kho (29/09): Pack/RTS là vòng đời đơn Lazada → **không** đẩy Adjust tồn.

---

## 📦 Nhật ký 02/10/2026 — Nút "pack" báo "đã đóng gói" lên Lazada (Fulfillment API Pack)

**Bối cảnh:** cô yêu cầu (buổi meet) nhân viên đóng gói bấm xác nhận đóng gói trên OptiPack thì đơn trên Lazada cũng chuyển "Đã đóng gói". FE không giữ token shop → BE làm. Chốt với Thuận: **không thêm nút mới**, nối vào nút `pack` hiện có; **giữ nguyên** bước OptiPack chuyển `packed` (G1 giao hàng và G4 trừ vật liệu dựa vào nó); **bỏ GetShipmentProvider** — `shipping_allocate_type` lấy từ env (`TFS`), đổi nếu Pack báo `700004`.

**Thay đổi code:**

- `config/marketplace.config.ts`: `lazada.writeApisEnabled` (env `LAZADA_WRITE_APIS_ENABLED`, chỉ `"true"` mới bật — cầu dao cho mọi API ghi), `lazada.shippingAllocateType` (env `LAZADA_SHIPPING_ALLOCATE_TYPE`, mặc định `TFS`). `.env.example` thêm 2 biến.
- `lazada.adapter.ts`: `callSignedPost()` (form-urlencoded, cùng cách 2 API token đang chạy thật; **không tự retry** vì là API ghi) + `packOrders()` + kiểu `LazadaPackRequest/Response` + `parseLazadaBoolean()` (Lazada trả `success` lúc boolean lúc chuỗi).
- `order-group.schema.ts`: `lazada_pack_status` (`disabled|skipped|success|partial|failed`, null = chưa từng), `lazada_pack_attempted_at`, `lazada_pack_error`, `lazada_pack_items[]` (order_id, order_item_id, ok, item_err_code, msg, package_id, tracking_number, shipment_provider). **Lưu trên nhóm đơn, KHÔNG lưu trong `orders.items[]`** — `orders.service` ghi đè toàn bộ `items` mỗi lần sync, trường thêm vào sẽ mất.
- `lazada-pack-sync.service.ts` (mới): `syncGroup()` không bao giờ ném lỗi; chỉ nhóm Lazada; bỏ đơn `NOT_PACKABLE_ORDER_STATUSES`, bỏ đơn đổi hàng (`origin: replacement` / `EXC-`); chỉ gửi món `pending`/`topack` (Lazada chỉ nhận pending/repacked; enum OptiPack không có `repacked`); món đã `packed` trở đi → ghi nhận xong, không gửi lại; lô ≤ 20 đơn; xét `item_err_code` từng món; ghi kết quả bằng `updateOne` (không tăng `__v`). `retryGroup()`: chỉ khi nhóm `packed` và status ≠ `success` (409 `ORD_GROUP_LAZADA_PACK_NOT_ALLOWED`).
- `order-groups.service.ts`: `assertHasActiveOrders()` — `pack` chặn nhóm hủy hết (409 `ORD_GROUP_ALL_ORDERS_CANCELED`) — vá một phần lỗ hổng "bước 2" xử lý hủy đơn.
- `order-groups.controller.ts`: `pack` gọi guard → transaction cũ → `syncGroup()` → trả thêm `lazadaPackSync`; route mới `POST /order-groups/:id/lazada-pack/retry`; `OrderGroupResponse` thêm `lazadaPack`. `order-groups.module.ts` import `MarketplaceIntegrationModule` (không vòng — module đó không import ngược).
- Test mới: `lazada.adapter.pack.spec.ts` (3 — endpoint, form body, **chữ ký tính lại độc lập**, không retry), `lazada-pack-sync.service.spec.ts` (12), thêm 2 test guard trong `order-groups.service.getOrderCountsForGroups.spec.ts`. Đây là test đầu tiên của module marketplace-integration (audit 27/09 ghi "0 test").

**Tác động & xử lý xung đột (5 câu):**

1. Dữ liệu cũ: chỉ thêm trường (mặc định null/rỗng), không migration; nhóm cũ `lazadaPack.status = null`; nhóm đã đóng gói trước đó không tự gửi.
2. Route đổi hành vi: `pack` — request giữ nguyên; response thêm `lazadaPackSync` + `lazadaPack`; **mới chặn 409 khi nhóm hủy hết** (trước đây cho qua). Mọi response nhóm đơn thêm `lazadaPack`.
3. Luồng bị ảnh hưởng: khi cầu dao bật, đơn trên shop Lazada thật chuyển "Đã đóng gói" — không hoàn tác bằng API. Sau đó sync kéo về `packed` (không thuộc NOT_PACKABLE → không ảnh hưởng số đếm hủy, Picking List, K5).
4. Không ảnh hưởng: trừ vật liệu (vẫn cùng transaction), G1 giao hàng, trả hàng, tồn kho Lazada (Pack không đổi tồn — hàng ở occupy tới RTS; đúng quy tắc "không đẩy Adjust cho vòng đời đơn Lazada").
5. Phát hiện khi làm: (a) `orders.items[]` bị ghi đè mỗi lần sync → không lưu kết quả sàn trong items; (b) `pack` trước đây không kiểm tra hủy — đã chặn; (c) id đơn/món Lazada gửi dạng Number (tài liệu ghi Number) — id 15 chữ số hiện nay nằm trong giới hạn số nguyên an toàn của JS; nếu Lazada dùng id > 2^53 cần đổi sang chuỗi; (d) chưa có thông báo khi gửi lỗi, gửi lại phải bấm tay.

**Việc phải làm trước demo:** test 1 đơn thật theo `INTEGRATION_GUIDE_FULFILLMENT.md` Nghiệp vụ 4 mục "Cách test lần đầu" (cầu dao bật trên đúng 1 máy). Ghi kết quả thật (status, `package_id`, có `tracking_number` không với shop SOF) vào đây.

**Tài liệu:** `INTEGRATION_GUIDE_FULFILLMENT.md` v4.3 (Nghiệp vụ 4 mục mới + checklist D.4), `API_LIST.md` mục fulfillment.

**Kiểm chứng (sandbox, trên `be.zip` 02/10):** tsc 0 lỗi; eslint sạch trên các file đã sửa/mới; jest 34 suite / 319 test (trước: 32 / 302).

---

## 📦 Nhật ký 04/10/2026 — Product Master đồng bộ theo danh sách sản phẩm của shop

**Bối cảnh:** FE (Việt) báo: đổi mã SKU trên Lazada, trang **cấu hình kho** và **tình trạng kho** reload vẫn hiện mã cũ, mã mới không xuất hiện. Nguyên nhân: (1) `sku_bin_assignments.seller_sku` do Admin gán tay, không bao giờ tự đổi; (2) danh sách "SKU chưa gán ô" lấy từ `product_master`, mà `product_master` chỉ đồng bộ **SKU đã có trong đơn** (`orders.items.sku` distinct) **1 lần lúc 3h sáng** → mã mới vô hình cho tới khi có người đặt; (3) đơn cũ giữ mã cũ là đúng (Lazada lưu mã tại thời điểm đặt, cron đơn chỉ kéo đơn có thay đổi). Chốt với Thuận: đồng bộ theo catalog + route đồng bộ ngay.

**Thay đổi code:**

- `lazada.adapter.ts`: `listProductsPage(token, { updatedAfter, offset, limit })` — GetProducts `filter=all`, không `sku_seller_list`, `update_after` ISO, chịu trang rỗng (Lazada bỏ `data`/`products`); export `LazadaProductRaw`, `LazadaProductSkuRaw`.
- `marketplace-shop.schema.ts`: `last_product_synced_at` (Date|null). `marketplace-integration.service.ts`: `markShopProductsSynced()` — module sở hữu collection tự ghi mốc.
- `product-master.service.ts`: `syncCatalogForShop(shopId, { full })` (tăng dần từ mốc − 10 phút; lần đầu/`full` lấy toàn bộ; trang 50, dừng ở offset 10.000 của Lazada và **không ghi mốc** nếu chưa quét hết), `syncCatalogAllShops()` (lỗi 1 shop không chặn shop khác); tách `upsertProducts()` dùng chung với `syncProductsForShop` cũ (giữ nguyên quy tắc `manual_override`, bỏ SKU thiếu `SellerSku`).
- `product-master-sync.scheduler.ts`: cron **mỗi giờ** (tăng dần) + **3h sáng** (toàn bộ) — **ĐÃ THAY ĐỔI** so với "1 lần/ngày theo SKU trong đơn".
- `product-master.controller.ts`: **`POST /product-master/sync`** (Admin; `?shop_id`, `?full=true`).
- `scripts/sync-product-master-now.ts`: dùng catalog (mặc định toàn bộ, `--incremental`).
- Test mới: `product-master.catalog-sync.spec.ts` (7), `lazada.adapter.catalog.spec.ts` (4).

**Tác động (5 câu):**

1. Dữ liệu cũ: không migration; shop cũ `last_product_synced_at` null → lần đầu lấy toàn bộ. SKU cũ không bị xóa.
2. Route đổi hành vi: không; thêm 1 route mới.
3. Luồng bị ảnh hưởng: `product_master` có thêm SKU chưa từng có đơn → danh sách "SKU chưa gán ô" dài hơn (chủ đích); gọi Lazada mỗi giờ thay vì mỗi ngày (trong giới hạn API).
4. Không ảnh hưởng: đơn hàng, nhóm đơn, tồn kho, giữ chỗ, đóng gói (dữ liệu kích thước giữ quy tắc sửa tay).
5. Phát hiện: `getProducts` cũ dùng `filter=live` → sản phẩm ẩn/hết hàng trước đây không đồng bộ được kích thước; catalog dùng `filter=all`. Chưa có cảnh báo "Lazada đổi mã SKU" — xử lý bằng nối 2 mã vào 1 SKU nội bộ.

**Kiểm chứng:** tsc 0; eslint sạch trên file đã sửa; jest 36 suite / 330 test (trước 34 / 319).

**Lỗi thật khi chạy (04/10, tối):** lượt tăng dần báo `E017 Invalid Date Format` — GetProducts **không nhận** `update_after` dạng `toISOString()` (`2026-10-04T15:26:51.619Z`), khác GetOrders (vẫn nhận). Sửa: `toLazadaProductDate()` trong `lazada.adapter.ts` định dạng `YYYY-MM-DDTHH:mm:ss+0000` (đúng mẫu tài liệu `2018-01-01T00:00:00+0800`). Lượt toàn bộ không gửi ngày nên không bị. Lượt lỗi không ghi mốc → chạy lại không mất dữ liệu. Thêm 1 test → 36 suite / 331 test. **Bài học:** cùng một sàn, mỗi API có thể đòi định dạng ngày khác nhau — đối chiếu mẫu request của từng API, không suy từ API khác.

**Commit:** `feat(AOFP-61)` code + `docs(AOFP-62)` tài liệu.

## 📦 Nhật ký 04/10/2026 (tối) — Lỗi "CHƯA GÁN VỊ TRÍ" do đặt SKU Lazada trùng mã ô; bổ sung quy trình cấu hình chuẩn vào tài liệu

**Bối cảnh:** FE (Việt) báo `pick-item` trả `409 ORD_GROUP_INSUFFICIENT_STOCK` với `sku: "KA-D1-P03-T01-3"`. Picking List: `bin_code: "CHƯA GÁN VỊ TRÍ"`, `bin_location_id: null`, `master_sku: null`. Nguyên nhân: nhóm đặt **SKU sản phẩm trên Lazada trùng mã ô** (và nghĩ trùng cả SKU nội bộ), tin rằng hệ thống tự nối theo tên — nên bỏ sót bước gán SKU vào ô / nối SKU nội bộ. BE báo đúng; không phải lỗi code. `pick-item` tìm dòng tồn theo kho + (`master_sku` hoặc platform/shop/seller_sku) + ô (nếu gửi) + đủ số lượng; thiếu `bin_location_id` trong body không phải nguyên nhân (trường tùy chọn).

**Quy tắc chốt (ghi vào tài liệu FE):** mã ô (hệ thống sinh khi tạo kệ), SKU nội bộ (hệ thống sinh `<DANHMỤC>-<MẪU 3 số>-<MÀU>-<SIZE>`), SKU sàn (người bán đặt) là 3 thứ khác nhau; **chỉ liên kết qua gán SKU vào ô hoặc nối SKU sàn → SKU nội bộ — không bao giờ tự nối theo tên** (cố ý, tránh nối nhầm). Khuyến nghị: SKU trên Lazada = SKU nội bộ, không đặt trùng mã ô.

**Tài liệu:** `INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md` v1.1 — thêm **Phần 0b** (3 loại mã, đặt SKU trên Seller Center, 8 bước cấu hình kèm ví dụ, bảng xử lý sự cố "CHƯA GÁN VỊ TRÍ" / `INSUFFICIENT_STOCK` / `MAP_SELLER_SKU_UNKNOWN` / đổi mã / trùng mã ô, việc FE: khóa nút quét khi `bin_location_id = null`); sửa bước 1.3 theo đồng bộ catalog (`POST /product-master/sync`, cron mỗi giờ). `INTEGRATION_GUIDE_WAREHOUSE.md` — A.3 thêm nguyên tắc 5 và liên kết sang Phần 0b.

**Điểm yếu ghi nhận:** chưa có cảnh báo khi SKU sàn trùng định dạng mã ô; FE chưa khóa quét khi dòng chưa có ô (đã ghi vào tài liệu).

## GỘP `main` vào `thi_dev` (05/10/2026) — quyết định và hiện trạng sau gộp

**Bối cảnh**: hai nhánh tách từ `021c6a3` (23/09) đi hai hướng lớn (main 101 commit: kho K1–K5, giao hàng G1, hoàn hàng G3, vật tư tái sử dụng G4, Lazada Pack, đồng bộ catalog; thi_dev 80 commit: `packing_plans` BRKGA + CP-SAT, vận chuyển có hãng/cước, chứng từ PDF, AURELLE). Ghép trong worktree riêng, nhánh `merge/main-into-thi_dev`.

**[stated] Quyết định của user**: ưu tiên thiết kế của main ở các mảng trùng, đưa phần riêng của thi_dev lên trên; cụ thể:
1. **Đóng gói**: giữ `packing_plans` (luồng `packaging` cũ trên main không có thay đổi chức năng nào). Gỡ `POST /order-groups/:id/fulfillment/pack`; đóng gói qua `POST /order-groups/:groupId/packing-plan/pack`, sau commit gọi `LazadaPackSyncService.syncGroup()` (response thêm `lazadaPackSync`) + chặn nhóm hủy hết (`assertHasActiveOrders`). Màn FE cũ của main (`PackingPage`, `PackagingWorkbench`, `Packing3DBoxViewer`) đã xóa; `ShippingPage` đọc kế hoạch mới, `AdminPackingPlansPage` gọi `packing-plan/recompute`.
2. **Kho vật tư chung**: `packaging_materials` của main là kho DUY NHẤT (thùng `kind: box` thêm `inner`/`outer` mm, `tare_g`, `max_load_g`; vật tư chèn `kind: cushioning` thêm `material_type`, `unit`, `weight_g_per_unit`; chung `reorder_level`, `storage_location`, `is_sample`). Tồn dùng được = `qty_new + qty_reused`; đóng gói trừ theo kiện qua `PackagingMaterialsService.consumeForParcels()` — ưu tiên hàng tái sử dụng (ghi tiết kiệm); thùng thiếu → 409 `PKG_BOX_OUT_OF_STOCK`, vật tư chèn thiếu → không chặn. Sổ chung `packaging_movements` (+ `packing_plan_id`, `parcel_no`, `balance_after`). Đã bỏ collection `packaging_boxes`, `packaging_stock_movements`, `packaging_material_movements` và schema riêng của thi_dev; route `/packaging/boxes`, `/packaging/materials` giữ hình dạng response nhưng đọc/ghi kho chung. Bỏ `consumeForPackedGroup` (đọc `packaging_recommendations`) của main. Chuyển dữ liệu: `scripts/migrate-unify-packaging-materials.ts` (chạy thử mặc định, `--apply` mới ghi; trùng mã thùng thì giữ tồn của main, chỉ bổ sung số đo) — **CHƯA chạy trên DB thật**.
3. **Lấy thiếu bị từ chối**: giữ cách thi_dev — `decide-partial(false)` vào lại `picking`, lượt mới, nhập lại hàng đã quét **đúng ô** (theo tồn gộp SKU nội bộ nếu đã nối), ghi sổ kho loại mới `pick_cancel`, rồi `reconcileReservation`.
4. **Số đo sản phẩm**: kho xác nhận là nguồn duy nhất của `dimension`; sync sàn (cả đồng bộ catalog theo giờ của main) chỉ ghi `marketplace_dimension` + `$setOnInsert` `needs_measurement`. Bỏ `manual_override` và `PATCH`/`DELETE manual-override` của main.

**Ưu tiên main (không hỏi lại)**: vận chuyển dùng `shipments` G1 làm gốc, thêm trường hãng/cước/ETA/`trip_code`/`pickup_at`, `POST /shipments/batch` (bắt buộc hãng + cùng `recipient_key`), `GET /shipments/group/:groupId`, `PATCH /shipments/:id/pickup`, `startDelivery` tùy chọn chọn hãng, `GET /shipments` lọc thêm `trip_code`/`carrier_code`; module `shipping/`, `documents/` của thi_dev giữ nguyên trên schema mới. Hoàn hàng dùng `/returns` G3 — bỏ `return-receive`/`return_receipts`. Kho dùng K1–K5; `pickItem` ghép: khung thi_dev (chống trùng trước, chỉ khi `picking`, chặn vượt số đặt, chạm group theo `pick_round`) + của main (SKU nội bộ, chọn ô, sổ kho, tiêu giữ chỗ); `reconcileReservation` tính theo **số lượng đặt** (không qua `getPackableItemsForGroup` vì hàm đó báo lỗi khi SKU chưa đo). Picking list gộp nhiều nhóm dựng lại trên hàm 1 nhóm của main. Product Master: đồng bộ catalog theo giờ của main chạy cho cả Lazada + AURELLE qua adapter registry (`listProductsPage` thêm vào `LazadaProtocolClient`/interface); `GET /product-master` giữ hình dạng thi_dev (mảng) + `search`; thêm `POST /product-master/sync`, `GET /product-master/:id`. Lazada adapter giữ cấu trúc client dùng chung, thêm `listProductsPage`, `packOrders` (không retry), `toLazadaProductDate`. Transition map theo thi_dev (có `CANCELED`). Loại thông báo: hợp hai bên, bỏ `RETURN_RECEIVED`.

**Tài liệu**: guide chuẩn nằm trong `GUIDE_DOC/` (main đã chuyển); `API_LIST.md` ở gốc chỉ còn trỏ tới `GUIDE_DOC/API_LIST.md` (đã gộp mục packing-plan, kho chung, AURELLE, vận chuyển, chứng từ). `AURELLE_MARKETPLACE_DESIGN.md` chuyển vào `GUIDE_DOC/Aurelle/` (bản thi_dev, mới hơn).

**FE**: thông báo lấy bản main (thăm dò 45 s); OAuth success lấy giao diện main + phân biệt `platform` (AURELLE không ghi danh sách Lazada); sửa luôn các lỗi tsc có sẵn trên main (FE main không build được) — `npm run build` FE đạt; lint FE còn 17 vấn đề có sẵn (main có 25).

**Verify**: BE `tsc` 0 lỗi, `lint:ci` 0 lỗi, jest 59 suite / 647 test; khởi động thử app context (không mở cổng, dừng cron ngay) → BOOT_OK, không lỗi đăng ký model. FE `tsc -b` + `vite build` đạt; storefront `tsc` đạt. **Chưa** chạy trọn luồng trên trình duyệt, **chưa** chạy migrate kho vật tư trên DB thật.

## Dọn menu "AI & Đóng gói" của Admin (05/10/2026)

User hỏi 4 mục menu là gì → đối chiếu code: "Tham số AI" (state React, F5 mất, backend không đọc) và "Templates đóng gói" (`data/admin-mock.ts`) là **giao diện giả**, không ảnh hưởng engine; "Chốt kế hoạch đóng gói" (trang của main) sau gộp chỉ gọi `packing-plan/recompute` — trùng màn `/app/packing` (đã có hàng chờ, "Cần xử lý", tính lại). User: "tối ưu đi" → **xóa** `AdminAiPage`, `AdminTemplatesPage`, `AdminPackingPlansPage`, `AiConfigPanel`, `usePackagingTemplates`, `aiParams` trong `useAdminUsers`, dữ liệu giả + type liên quan; menu chỉ còn "Kế hoạch đóng gói" (→ `/app/packing`) và "Danh mục thùng"; `/app/admin/packing-plans` chuyển hướng sang `/app/packing`; thông báo `pending_approval`/`abnormal_package`/`packaging_rejected` của Admin mở thẳng `/app/packing/:groupId`. FE `tsc -b` + build đạt, lint 15 vấn đề có sẵn (trước 17).

## Làm lại giao diện hàng chờ đóng gói `/app/packing` (05/10/2026)

- Bỏ 4 cột kanban (phần lớn trống) → **một danh sách theo bước**: tab Cần xử lý (chỉ hiện khi có lỗi) / Chờ duyệt / Chờ đóng / Đang tính / Đã đóng, có số đếm; tab mặc định = tab đầu tiên còn việc, lưu ở `?stage=`. Bảng 4 cột thẳng hàng: Đơn · Hàng · Kế hoạch (hoặc Vấn đề) · Hạn, nút hành động theo bước (Duyệt / Đóng gói / Xử lý / Xem).
- Mỗi dòng nhận diện bằng **mã đơn sàn + người nhận + sàn + SKU×số lượng**, không còn mã hex của nhóm. Nguồn: `GET /packing-plans/summary` trả thêm `groups[]` (`PackingQueueService.describeGroups()` đọc thẳng `orders`, bỏ đơn hủy/sự cố) — nhóm đang tính hoặc tính lỗi (chưa có kiện) vẫn có đủ thông tin. FE vẫn chịu được backend cũ không có `groups`.
- Lỗi tính phương án được diễn giải: "SKU X chưa có hồ sơ đóng gói" → "Thiếu hồ sơ đóng gói của X" + cách sửa + link `Mở hồ sơ SKU` (`/app/inventory/packaging-profiles?q=X`, trang hồ sơ tự mở đúng SKU; chỉ hiện với role vào được trang đó). Lỗi khác hiện "Không tính được phương án" kèm nguyên văn.
- Nhãn chứng minh không còn là badge xanh lặp lại: chỉ một dòng nhỏ "Tối ưu" (có chứng minh) hoặc "Đang kiểm chứng tối ưu" (CP-SAT chạy nền); heuristic không hiện gì.
- Verify: FE `tsc -b` + eslint sạch; BE `tsc` 0 lỗi, jest 59/59 suite, 647 test. Đã chụp màn hình (Edge headless + API giả lập) desktop/mobile — chưa xem với dữ liệu thật.

## Khung 3D đóng gói "từng thao tác": vải mô phỏng, túi zip, đóng thùng (05/10/2026)

> 🔄 **ĐÃ GỠ khỏi `thi_dev` cùng ngày** — FE khôi phục về `main`; code còn ở nhánh `backup/fe-packing-3d` (gồm 4 file đang sửa dở lúc gỡ).

**[stated] User chốt**: (1) có ở **cả hai nơi**: màn làm việc `/app/packing/:groupId` (tab "Xem từng bước", xem trước lúc duyệt) và chế độ đóng gói toàn màn hình; (2) **tách bước nhỏ**, mỗi thao tác 1 lần bấm Tiếp; (3) **mô phỏng vải thật**. Không đổi backend.

- **Dòng thời gian** `fe/src/components/packing3d/timeline.ts` (`buildPackingTimeline`, hàm thuần):
  - Hàng mềm (áo thun/sơ mi/khoác, quần dài/short, váy): trải phẳng → gấp hai bên → gấp thân → [cho vào túi → kéo khoá → gập túi nếu `zipBagFolded`] → [gập đôi nếu `placement.folded`] → đặt vào thùng.
  - Hàng cứng (giày, dép, phụ kiện, khác): lấy → đặt.
  - Cuối kiện: chèn vật tư → gập nắp → dán băng keo.
  - Bước "đặt" dùng lời AI `guide.steps`, các bước khác dùng câu mẫu. `ACTION_SECONDS` = thời lượng mỗi thao tác.
- **Vải** `cloth/shapes.ts` + `cloth/cloth-sim.ts`:
  - Lưới hạt theo mặt nạ hình (cổ áo, tay, đũng quần), có làm mượt mép.
  - `PackageModel` = động học có dẫn hướng: gấp kiểu cuộn trụ quanh bản lề; phần lật đáp lên đỉnh phần đứng yên trong vùng đáp + 1 lớp + 1 mm. Vị trí cuối mỗi pha tính sẵn, nên lùi/tiến dựng lại đúng hình.
  - `ClothSim` (Verlet + ràng buộc giãn/cắt/uốn + kéo về đích) làm vải rủ mềm.
  - Kích thước trải phẳng suy ngược từ ô trong thùng, giới hạn 62×72 cm. Độ dày lớp = độ cao ô ÷ 2^(số lần gấp). Đo bằng script: gói gấp xong cao 42/40 mm (áo), 54/60 (jean), 27/30 (short).
  - Bước đặt nhấc gói theo vòng cung và co cho khít đúng ô. Chế độ "Nhẹ" / `prefers-reduced-motion` bỏ vật lý.
- **Túi zip**: 2 lớp nhựa trong cũng là "vải" (cùng phép gấp). Miệng túi mở, khoá kéo chạy dọc mép, túi gập đôi được.
  - **Lỗi đã gặp**: lưới túi dựng theo ô đơn vị 1 m, quên tính lại chiều dài cạnh, nên mô phỏng làm túi "nổ". Đã tính lại theo kích thước túi thật.
- **Thùng/cảnh**:
  - `Carton` có vân giấy, 4 nắp đóng có animation (nắp ngắn trước), băng keo kéo dọc khe. Đọc tiến độ qua `FinishState` (không qua state React).
  - `PackingStage`: bàn gỗ + thảm gấp có lưới.
  - `Materials3D`: túi khí, góc xốp theo số lượng kế hoạch. **Vị trí chỉ để minh hoạ.**
  - Món đã vào thùng: lõi vải + vỏ túi trong suốt + đường khoá.
  - Camera tự bay tới thảm / thùng / nắp.
- **Trình phát**:
  - `usePackingPlayer`: chỉ số, phát/tạm dừng, ×0,5/×1/×2, phím ←/→/Space.
  - `PlayerBar`: thanh tiến trình chia đoạn theo từng món, bấm để nhảy.
  - Màn làm việc có tab "Kết quả xếp" / "Xem từng bước", lời hướng dẫn nổi góc trên. Bấm dòng "Thứ tự xếp" thì nhảy tới bước đặt món đó.
  - `PackingMode` thay bước "từng món" bằng từng thao tác (+ nút "Xem lại thao tác"). Màn Chuẩn bị hiện kết quả xếp, màn Cân hiện thùng đã dán.
- **Lỗi có sẵn đã sửa**: `teal-shell.css` ép `.owner-stage .bg-canvas` trong suốt, và khung có backdrop-filter làm `fixed` bị neo trong khung, nên chế độ đóng gói lộ trang bên dưới. Đã sửa: `PackingMode` portal ra `document.body` + nền `var(--app-canvas)`.
- **Bài học**:
  - `heredoc` bash bị cắt với khối TS dài có nhiều nháy, nên viết bằng công cụ Write rồi ghép.
  - Lint `react-hooks/immutability` cấm sửa ref/biến memo truyền qua props. Gói trạng thái mutable vào class có method (`FinishState`, `ModelCache`).
- **Verify**:
  - `tsc -b`, eslint các file đã sửa, `npm run build` đều đạt.
  - Script số kiểm tra gấp (không NaN, ~0,05 ms/khung).
  - Chụp Edge headless (SwiftShader) với kế hoạch giả lập 5 món: trải áo, gấp, túi, kéo khoá, gập túi, đặt, chèn vật tư, đóng nắp, băng keo. Chụp cả chế độ đóng gói.
  - **Chưa đo fps trên GPU thật.** Dựng hình phần mềm chậm nên animation trong ảnh chưa chạy hết. User cần xem trên máy thật.
- **Giới hạn**: nếp gấp do bản lề dẫn hướng, vật lý chỉ làm mềm (không phải mô phỏng vải tự do). Chưa có va chạm vải-với-vải; khe giữa các lớp do động học giữ.

## Khôi phục FE về main + phiên đóng gói backend (05/10/2026)

**[stated] Thuận chốt:** FE do nhóm FE làm → `fe/` trên `thi_dev` quay về đúng `origin/main`; Claude chỉ làm backend, đầu tư sâu nghiệp vụ đóng gói. Chọn: giữ `fe/Dockerfile` + `fe/nginx.conf` + sửa lỗi build; FE main gọi route cũ `/packaging/*` + `fulfillment/pack` (đã gỡ) sẽ 404, **FE tự chuyển** (bảng ánh xạ ở `GUIDE_DOC/API_LIST.md` mục 8a.7, BE không thêm route tương thích); lưu phần 3D sang nhánh `backup/fe-packing-3d`; làm cả 4 nhóm nghiệp vụ; kiện lệch cân phải do **người khác** người niêm phong chấp nhận; giữ `POST .../packing-plan/pack` làm lối tắt.

**FE (AOFP-67):** `git checkout origin/main -- fe`, xóa 43 file chỉ có trên thi_dev, `npm install` gỡ `postprocessing` khỏi lockfile. FE main **không build được** (lỗi tsc có sẵn) → sửa tối thiểu 6 file (`MarketplaceOrderDetailScreen` thu hẹp `id`, `PackagingWorkbench` thêm `pending_approval` vào `QueueTab`, `AdminPackingPlansPage` truyền `onClose` cho toast, bỏ biến thừa ở `AdminWarehousePage`/`ProfilePage`, `ReturnsPage` bỏ tham số không tồn tại). `npm run build -w fe` đạt. Kèm: jest backend `testTimeout` 30 s (bcrypt + PDF trượt 5 s khi hook pre-commit chạy song song).

**Backend (AOFP-68):**
- **Phiên đóng gói theo kiện** (`packing-session.service.ts`): plan thêm trạng thái `packing`; kiện có `status` `pending|sealed|held|to_unpack|voided`, `scans[]`, `box_consumed`, `weighings[]`, `reviews[]`, `unpack`. Route `start`, `parcels/:no/scan|unscan|seal|review|unpack`, `report-issue`, `finish`, `assign`. Quét nhận SKU sàn hoặc SKU nội bộ (không phân biệt hoa/thường), sai kiện trả `belongsToParcels`, idempotent theo `client_event_id`, không cần `expected_version` (retry 3 lần khi đụng version). Trừ thùng + vật tư **lúc niêm phong từng kiện**; kiện cuối → plan + nhóm `packed` cùng transaction → controller báo Lazada.
- **Kiện lệch cân bị giữ** (`held`) — thay hành vi cũ "vẫn packed, chỉ báo". `review accept` cấm người niêm phong tự duyệt (403), `reweigh`, `reopen` (không trừ thùng lần 2). Lối tắt `pack` ghi quét `bypass`, cũng giữ kiện lệch; `pack_mode` = `scan|quick`.
- **Sự cố lúc đóng:** `replace` = `adjustPickedUnits(restock:false)` + `takeReplacementUnit` (sổ kho `pack_replace`); `back_to_picking` = thay plan + nhóm `approved_for_packing → picking` (cạnh mới), chỉ khi chưa niêm phong kiện nào.
- **Đơn hủy sau khi bắt đầu đóng:** `handleOrderBecameUnfulfillable` → `markCanceledOrdersForUnpack` (plan `packing|packed`): đơn `canceled`, kiện của đơn `to_unpack`, KHÔNG thay plan; hủy hết thì nhóm `canceled` kể cả từ `packed` (cạnh mới), plan giữ tới khi tháo xong. `unpack` trả hàng về đúng ô (`adjustPickedUnits(restock:true)`, sổ kho `cancel_unpack`) + thu hồi thùng (`recoverFromUnpack`). `parcelsOfPlan` bỏ kiện `to_unpack/voided`; giao hàng chặn 409 `SHP_PARCELS_TO_UNPACK`. Plan `ready/approved` khi đơn hủy giữ cách cũ (thay plan, về picked).
- **pick_events điều chỉnh:** trường `kind` (`scan|pack_issue|pack_replace|unpack`); event âm mang kho + ô nguồn để `restockPickRound` cộng ròng đúng ô (đã thêm nhánh dòng ròng ≤ 0 chỉ đánh dấu). Mọi phép đếm "đã lấy" tự khớp hàng thật.
- **Cài đặt** `packing_settings` (có version, mặc định trong code): ngưỡng lệch cân, đệm dễ vỡ (chụp vào `solver.options.fragile_cushion_mm` — mọi lần dựng lại món dùng số đã chụp), mục tiêu mặc định, số kiện tối đa (vượt → `approve` cần `override_reason`), cho/không thùng tái sử dụng với hàng dễ vỡ, bắt buộc quét.
- **Luật dễ vỡ đã thực thi** (trước chỉ nằm trong comment): `consumeForParcels` nhận `allowReused` theo kiện; kiện `has_fragile` chỉ lấy `qty_new`.
- **Giữ chỗ thùng sửa:** kiện đã niêm phong (thùng đã trừ thật) và kiện đang/đã tháo không còn tính giữ chỗ — trước đây trong lúc đóng dở có thể bị tính 2 lần.
- **Giao người đóng** (`packer-assignment.service.ts`): Packaging Staff ít plan mở nhất, tính lại giữ người cũ; route `assign`. **Sửa lỗi có sẵn:** `staff-assignment.manualAssign` không kiểm vai trò → giờ chỉ Warehouse Staff (`ORD_GROUP_STAFF_WRONG_ROLE`).
- **Báo cáo** `GET /packing/reports/summary`: thời gian chờ/đóng, tỷ lệ lệch cân, duyệt nguyên vẹn, đạt cận dưới, quét kiểm, chi phí, sự cố (đếm theo thời điểm báo trên mọi plan), theo nhân viên. Tính trong bộ nhớ, tối đa 5.000 plan.
- 4 loại thông báo mới: `packing_assigned`, `packing_parcel_held`, `packing_issue`, `unpack_required`.

**Tác động (5 câu):** (1) không migration, mọi trường có mặc định; plan `packed` cũ trả kiện `sealed` (`effectiveParcelStatus`). (2) Đổi hành vi: `pack` giữ kiện lệch + thêm `completed`; `approve` vượt số kiện cần lý do; gán tay lấy hàng chỉ Warehouse Staff; giao hàng chặn khi còn kiện phải tháo; báo giá đọc cả plan `packing`. (3) Xung đột: quét đồng thời → khóa `version` + đọc lại; giữ chỗ không còn đếm trùng. (4) Không ảnh hưởng: tính plan, CP-SAT, chỉnh tay, hướng dẫn AI, lấy hàng thường. (5) Giới hạn: ~~hàng đã lấy của đơn hủy trước khi đóng không về kệ; giữ chỗ K5 sau `back_to_picking`; vật tư chèn không thu hồi~~ 🔄 đã sửa cùng ngày (AOFP-70..72, xem mục ngay dưới); còn lại: chưa có ảnh bằng chứng.

**Verify:** `tsc` 0 lỗi, `lint:ci` 0 lỗi (43 cảnh báo storefront có sẵn), jest 61 suite / 680 test (thêm test phiên đóng gói trong `packing-plan.service.spec.ts` dùng bộ giải thật, `order-groups.service.adjustPickedUnits.spec.ts`, `packing-settings-assignment-report.spec.ts`, luật dễ vỡ + thu hồi trong `packaging-material.service.spec.ts`, hủy khi đang đóng trong `recipientKeyAndCancel.spec.ts`). Khởi động app context thật (Atlas) → BOOT_OK (Mongoose tự tạo index mới trên DB dev). **Chưa** chạy luồng HTTP thật với dữ liệu thật.

**Tài liệu:** `GUIDE_DOC/API_LIST.md` mục 8a (route, cài đặt, báo cáo, bảng ánh xạ cho FE main), `INTEGRATION_GUIDE_FULFILLMENT.md` v7.1 (Nghiệp vụ 1b mới, Nghiệp vụ 4, 6, D.3, D.4), ghi chú ở `INTEGRATION_GUIDE_PACKAGING_MATERIALS.md` phần C và `DEMO_PLAYBOOK.md` C4'.

**Bài học:** (1) `git commit` ở repo này chạy jest toàn bộ trong hook — nhớ cho timeout dài; commitlint chặn header > 100 ký tự. (2) Viết sửa file bằng script Python trong scratchpad (heredoc bash với chuỗi tiếng Việt dài bị cắt). (3) Schema class (`PlanParcel`) spread bị lint `no-misused-spread` → dùng kiểu `Plain<T>` (`toObject<T>()`) hoặc `Object.assign`.

### Sửa 3 giới hạn của phiên đóng gói (05/10/2026 tối, AOFP-70..73)

**[stated] Thuận chốt:** hàng đã lấy của đơn hủy trước khi đóng → **tự cộng tồn đúng ô + báo kho** (không có bước xác nhận, giống decide-partial từ chối); làm luôn thu hồi vật tư chèn; ảnh bằng chứng để sau (chưa chọn nơi lưu file).

- **AOFP-70 — lỗi thật giữ chỗ K5:** `reconcile` tính `cần giữ = đặt − quantity_picked`, mà `quantity_picked` chỉ tăng. Loại món hỏng ("trả về lấy hàng") → giữ 0 cho món thay. Sửa: `StockReservationService.unconsume()` (pipeline `$max 0`, mọi status) gọi trong `adjustPickedUnits`; `recordPicked()` (giữ chỗ active → `consume`, đã nhả → chỉ cộng bộ đếm) gọi trong `takeReplacementUnit`.
- **AOFP-71 — trả kệ khi đơn hủy trước khi đóng:** `OrderGroupsService.returnSurplusPickedUnits()` — dư = đã lấy (lượt hiện tại, ròng) − đặt của đơn còn lại (hủy hết → tất cả); `adjustPickedUnits(restock, kind 'cancel_return')` cộng tồn ô lấy sau cùng trước, sổ kho `cancel_return`, pick_event âm; thông báo `return_to_shelf` (Warehouse Staff + người lấy được giao) có `SKU ×n → ô <bin_code>` (đăng ký thêm `BinLocation` vào order-groups module, tham số cuối constructor). Gọi trong `handleOrderBecameUnfulfillable` khi chưa có phiên đóng, nhóm `picking|picked|pending_approval|approved_for_packing`, best-effort, TRƯỚC khi thay kế hoạch. Gọi lặp không trả 2 lần.
- **AOFP-72 — thu hồi vật tư chèn:** `/packaging/materials` nhận `reusable` (mặc định false), response thêm `reusable`, `quantityNew`, `quantityReused`. `unpack` nhận `recovered_materials[{code, quantity}]` (≤ số trong kiện, mã phải có — `PACKING_RECOVER_MATERIAL_INVALID`; vật tư không tái sử dụng → `PKG_MATERIAL_NOT_REUSABLE`). `recoverFromUnpack` nhận nhiều dòng; kết quả lưu `parcels[].unpack.recovered_materials`.
- Verify: tsc 0, eslint 0 trên module đụng, jest 61 suite / 693 test, BOOT_OK. Chưa chạy HTTP thật.
- Bài học: sửa hàng loạt lời gọi constructor trong spec bằng script dễ chèn tham số SAU comment cuối dòng (`// x, {} as never`) — thêm tham số vị trí thì grep lại từng file, và cân nhắc đặt tham số mới ở cuối để giảm số chỗ phải sửa.
